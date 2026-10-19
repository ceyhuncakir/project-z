import { ORPCError } from "@orpc/server";
import { parsePublicKey } from "@switchyard/cloud";
import { type Executor, newId } from "@switchyard/db";
import { sshKey } from "@switchyard/db/schema/app";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function addSshKey(
	db: Executor,
	userId: string,
	input: { name: string; publicKey: string },
) {
	const publicKey = input.publicKey.trim();
	const parsed = parsePublicKey(publicKey);
	if (!parsed) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"That doesn't look like an OpenSSH public key (e.g. `ssh-ed25519 AAAA… you@host`).",
		});
	}
	const [row] = await db
		.insert(sshKey)
		.values({
			id: newId("ssh"),
			userId,
			name: input.name,
			publicKey,
			fingerprint: parsed.fingerprint,
		})
		.onConflictDoNothing()
		.returning();
	if (!row)
		throw new ORPCError("CONFLICT", {
			message: "This key is already on your account.",
		});
	return row;
}

export async function listSshKeys(
	db: Executor,
	userId: string,
	ids?: string[],
) {
	return db
		.select()
		.from(sshKey)
		.where(
			and(eq(sshKey.userId, userId), ids ? inArray(sshKey.id, ids) : undefined),
		)
		.orderBy(desc(sshKey.createdAt));
}

export async function deleteSshKey(db: Executor, userId: string, id: string) {
	const rows = await db
		.delete(sshKey)
		.where(and(eq(sshKey.id, id), eq(sshKey.userId, userId)))
		.returning({ id: sshKey.id });
	if (!rows.length)
		throw new ORPCError("NOT_FOUND", { message: "SSH key not found" });
}
