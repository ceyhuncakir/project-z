import { createHash, randomBytes } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { type Executor, newId } from "@switchyard/db";
import { teamInvitation, teamMember } from "@switchyard/db/schema/app";
import { session, user } from "@switchyard/db/schema/auth";
import { and, asc, eq, gt, inArray } from "drizzle-orm";

import type { Actor, Role, Services } from "../context";
import { logActivity } from "./activity";

const INVITATION_DAYS = 7;
const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

/** Throws unless the actor's role in the account is at least `min`. */
export function requireRole(actor: Actor, min: Role, doing: string) {
	if (RANK[actor.role ?? "member"] >= RANK[min]) return;
	throw new ORPCError("FORBIDDEN", {
		message: `Only the account's ${min === "owner" ? "owner" : "owner or admins"} can ${doing}.`,
	});
}

/**
 * The account a dashboard session acts in. A session points at a team
 * account only while its user is still a member there; otherwise it's
 * back in the user's own account.
 */
export async function resolveAccount(
	db: Executor,
	userId: string,
	activeAccountId: string | null | undefined,
): Promise<{ accountId: string; role: Role }> {
	if (activeAccountId && activeAccountId !== userId) {
		const [membership] = await db
			.select({ role: teamMember.role })
			.from(teamMember)
			.where(
				and(
					eq(teamMember.accountId, activeAccountId),
					eq(teamMember.userId, userId),
				),
			);
		if (membership)
			return { accountId: activeAccountId, role: membership.role };
	}
	return { accountId: userId, role: "owner" };
}

/** The user's own account first, then every team they're in. */
export async function listAccounts(db: Executor, userId: string) {
	const [self] = await db
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId));
	const teams = await db
		.select({
			accountId: teamMember.accountId,
			role: teamMember.role,
			ownerName: user.name,
			ownerEmail: user.email,
		})
		.from(teamMember)
		.innerJoin(user, eq(user.id, teamMember.accountId))
		.where(eq(teamMember.userId, userId))
		.orderBy(asc(user.name));
	return [
		{
			accountId: userId,
			role: "owner" as Role,
			ownerName: self?.name ?? "",
			ownerEmail: self?.email ?? "",
			personal: true,
		},
		...teams.map((t) => ({ ...t, role: t.role as Role, personal: false })),
	];
}

export async function switchAccount(
	db: Executor,
	sessionId: string,
	userId: string,
	accountId: string,
) {
	const target = await resolveAccount(db, userId, accountId);
	if (target.accountId !== accountId) {
		throw new ORPCError("FORBIDDEN", {
			message: "You're not a member of that account.",
		});
	}
	await db
		.update(session)
		.set({ activeAccountId: accountId === userId ? null : accountId })
		.where(and(eq(session.id, sessionId), eq(session.userId, userId)));
	return target;
}

/** The owner, then members, then invitations still waiting. */
export async function listMembers(db: Executor, accountId: string) {
	const [owner] = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, accountId));
	const members = await db
		.select({
			id: teamMember.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			role: teamMember.role,
			joinedAt: teamMember.createdAt,
		})
		.from(teamMember)
		.innerJoin(user, eq(user.id, teamMember.userId))
		.where(eq(teamMember.accountId, accountId))
		.orderBy(asc(teamMember.createdAt));
	const invitations = await db
		.select({
			id: teamInvitation.id,
			email: teamInvitation.email,
			role: teamInvitation.role,
			expiresAt: teamInvitation.expiresAt,
			createdAt: teamInvitation.createdAt,
		})
		.from(teamInvitation)
		.where(
			and(
				eq(teamInvitation.accountId, accountId),
				gt(teamInvitation.expiresAt, new Date()),
			),
		)
		.orderBy(asc(teamInvitation.createdAt));
	return { owner, members, invitations };
}

export async function inviteMember(
	svc: Services,
	actor: Actor,
	inviter: { name: string; email: string },
	input: { email: string; role: "admin" | "member" },
) {
	requireRole(actor, "admin", "invite people");
	const email = input.email.trim().toLowerCase();
	const { owner, members } = await listMembers(svc.db, actor.userId);
	if (
		owner?.email.toLowerCase() === email ||
		members.some((m) => m.email.toLowerCase() === email)
	) {
		throw new ORPCError("CONFLICT", {
			message: `${email} is already in this account.`,
		});
	}

	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
	// Inviting the same address again replaces the old link.
	await svc.db
		.insert(teamInvitation)
		.values({
			id: newId("inv"),
			accountId: actor.userId,
			email,
			role: input.role,
			tokenHash: hashToken(token),
			invitedBy: actor.memberId ?? actor.userId,
			expiresAt,
		})
		.onConflictDoUpdate({
			target: [teamInvitation.accountId, teamInvitation.email],
			set: {
				role: input.role,
				tokenHash: hashToken(token),
				invitedBy: actor.memberId ?? actor.userId,
				expiresAt,
			},
		});
	const url = `${svc.config.webUrl}/invite/${token}`;
	await svc.mail({
		to: email,
		subject: `${inviter.name} invited you to their HessianLabs account`,
		text: `${inviter.name} (${inviter.email}) invited you to join ${owner?.name ?? "their"}'s HessianLabs account as ${input.role === "admin" ? "an admin" : "a member"}. You'll share its credits, cloud accounts, servers and API keys.\n\nAccept within ${INVITATION_DAYS} days, signed in as ${email}:\n\n${url}\n\nIf you weren't expecting this, ignore the email.`,
	});
	await logActivity(svc.db, actor, {
		action: "team.invite",
		message: `Invited ${email} as ${input.role}`,
	});
	return { email, expiresAt, url };
}

export async function revokeInvitation(
	svc: Services,
	actor: Actor,
	id: string,
) {
	requireRole(actor, "admin", "cancel invitations");
	const [removed] = await svc.db
		.delete(teamInvitation)
		.where(
			and(
				eq(teamInvitation.id, id),
				eq(teamInvitation.accountId, actor.userId),
			),
		)
		.returning();
	if (!removed) throw new ORPCError("NOT_FOUND");
	return { ok: true };
}

async function findInvitation(db: Executor, token: string) {
	const [row] = await db
		.select({
			id: teamInvitation.id,
			accountId: teamInvitation.accountId,
			email: teamInvitation.email,
			role: teamInvitation.role,
			expiresAt: teamInvitation.expiresAt,
			ownerName: user.name,
			ownerEmail: user.email,
		})
		.from(teamInvitation)
		.innerJoin(user, eq(user.id, teamInvitation.accountId))
		.where(eq(teamInvitation.tokenHash, hashToken(token)));
	return row;
}

/** What the invitation page shows before someone accepts. */
export async function describeInvitation(db: Executor, token: string) {
	const row = await findInvitation(db, token);
	if (!row) return null;
	return {
		email: row.email,
		role: row.role,
		ownerName: row.ownerName,
		ownerEmail: row.ownerEmail,
		expired: row.expiresAt <= new Date(),
	};
}

/** Joins the account and switches this session to it. */
export async function acceptInvitation(
	svc: Services,
	me: { id: string; email: string },
	sessionId: string,
	token: string,
) {
	const row = await findInvitation(svc.db, token);
	if (!row || row.expiresAt <= new Date()) {
		throw new ORPCError("NOT_FOUND", {
			message: "This invitation expired or was cancelled. Ask for a new one.",
		});
	}
	if (row.email !== me.email.toLowerCase()) {
		throw new ORPCError("FORBIDDEN", {
			message: `This invitation is for ${row.email}. Sign in with that email to accept it.`,
		});
	}
	if (row.accountId === me.id) {
		throw new ORPCError("BAD_REQUEST", {
			message: "That's your own account.",
		});
	}
	await svc.db.transaction(async (tx) => {
		await tx
			.insert(teamMember)
			.values({
				id: newId("mem"),
				accountId: row.accountId,
				userId: me.id,
				role: row.role,
			})
			.onConflictDoNothing();
		await tx.delete(teamInvitation).where(eq(teamInvitation.id, row.id));
	});
	await logActivity(
		svc.db,
		{
			userId: row.accountId,
			apiKeyId: null,
			via: "dashboard",
			memberId: me.id,
		},
		{ action: "team.join", message: `${me.email} joined as ${row.role}` },
	);
	await switchAccount(svc.db, sessionId, me.id, row.accountId);
	return { accountId: row.accountId, ownerName: row.ownerName };
}

async function loadMember(db: Executor, accountId: string, id: string) {
	const [row] = await db
		.select({
			id: teamMember.id,
			userId: teamMember.userId,
			role: teamMember.role,
			email: user.email,
		})
		.from(teamMember)
		.innerJoin(user, eq(user.id, teamMember.userId))
		.where(and(eq(teamMember.id, id), eq(teamMember.accountId, accountId)));
	if (!row) throw new ORPCError("NOT_FOUND", { message: "No such member." });
	return row;
}

export async function updateMemberRole(
	svc: Services,
	actor: Actor,
	id: string,
	role: "admin" | "member",
) {
	requireRole(actor, "admin", "change roles");
	const member = await loadMember(svc.db, actor.userId, id);
	await svc.db
		.update(teamMember)
		.set({ role })
		.where(eq(teamMember.id, member.id));
	await logActivity(svc.db, actor, {
		action: "team.role",
		message: `${member.email} is now ${role === "admin" ? "an admin" : "a member"}`,
	});
	return { ok: true };
}

/** Removes a member, signing their sessions out of this account. */
export async function removeMember(svc: Services, actor: Actor, id: string) {
	const member = await loadMember(svc.db, actor.userId, id);
	if (member.userId !== actor.memberId) {
		requireRole(actor, "admin", "remove people");
	}
	await svc.db.delete(teamMember).where(eq(teamMember.id, member.id));
	await svc.db
		.update(session)
		.set({ activeAccountId: null })
		.where(
			and(
				eq(session.userId, member.userId),
				eq(session.activeAccountId, actor.userId),
			),
		);
	await logActivity(svc.db, actor, {
		action: "team.remove",
		message:
			member.userId === actor.memberId
				? `${member.email} left the account`
				: `Removed ${member.email}`,
	});
	return { ok: true };
}

/** User ids that get the account's emails: the owner and its admins. */
export async function accountRecipients(db: Executor, accountId: string) {
	const admins = await db
		.select({ userId: teamMember.userId })
		.from(teamMember)
		.where(
			and(
				eq(teamMember.accountId, accountId),
				inArray(teamMember.role, ["admin"]),
			),
		);
	return [accountId, ...admins.map((a) => a.userId)];
}

/** The account's owner: whose Stripe customer and emails the account uses. */
export async function accountOwner(db: Executor, accountId: string) {
	const [owner] = await db
		.select({ id: user.id, email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, accountId));
	if (!owner) throw new ORPCError("NOT_FOUND", { message: "No such account." });
	return owner;
}
