import { referencePlans, referenceRegions } from "../reference-catalog";
import type {
	CreateServerInput,
	PowerAction,
	ProviderAdapter,
	ProviderId,
	ProviderInfo,
	ProviderServer,
	ProviderServerStatus,
} from "../types";
import { ProviderError } from "../types";

interface SandboxOptions {
	/** How long a sandbox server stays in `provisioning`. */
	bootMs?: number;
	/** Plans (slugs) that fail with a capacity error — used to exercise fallback. */
	outOfCapacity?: string[];
}

interface SandboxState {
	createdAt: number;
	status: ProviderServerStatus;
}

/**
 * Simulated provider used when no platform credentials are configured. It
 * serves the reference catalog and walks servers through a realistic
 * lifecycle so the whole product works end-to-end without a cloud bill.
 */
export function createSandboxAdapter(
	info: Omit<ProviderInfo, "mode">,
	opts: SandboxOptions = {},
): ProviderAdapter {
	const bootMs = opts.bootMs ?? 12_000;
	const state = new Map<string, SandboxState>();
	const provider = info.id;

	function current(id: string): ProviderServer {
		const s = state.get(id) ?? restore(id);
		if (!s)
			throw new ProviderError(provider, `server ${id} not found`, {
				status: 404,
			});
		if (s.status === "provisioning" && Date.now() - s.createdAt >= bootMs)
			s.status = "running";
		const ip = fakeIp(id);
		return {
			providerServerId: id,
			status: s.status,
			ipv4: s.status === "provisioning" ? null : ip.v4,
			ipv6: s.status === "provisioning" ? null : ip.v6,
		};
	}

	// Sandbox ids embed their creation time so state survives a process restart.
	function restore(id: string): SandboxState | undefined {
		const ts = Number.parseInt(id.split("-")[2] ?? "", 36);
		if (!id.startsWith(`sbx-${provider}-`) || Number.isNaN(ts))
			return undefined;
		const s: SandboxState = { createdAt: ts, status: "provisioning" };
		state.set(id, s);
		return s;
	}

	return {
		info: { ...info, mode: "sandbox" },
		verify: async () => {},
		listRegions: async () => referenceRegions(provider),
		listPlans: async () => referencePlans(provider),
		async createServer(input: CreateServerInput) {
			if (opts.outOfCapacity?.includes(input.planSlug)) {
				throw new ProviderError(
					provider,
					`${input.planSlug} is out of capacity in ${input.regionSlug}`,
					{
						retryable: true,
						status: 503,
					},
				);
			}
			const id = `sbx-${provider}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
			state.set(id, { createdAt: Date.now(), status: "provisioning" });
			return current(id);
		},
		getServer: async (id) => current(id),
		async deleteServer(id) {
			const s = state.get(id) ?? restore(id);
			if (s) s.status = "deleted";
		},
		async powerAction(id, action: PowerAction) {
			const s = state.get(id) ?? restore(id);
			if (!s)
				throw new ProviderError(provider, `server ${id} not found`, {
					status: 404,
				});
			s.status = action === "stop" ? "stopped" : "running";
		},
	};
}

function fakeIp(id: string) {
	let h = 0;
	for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	// RFC 5737 / RFC 3849 documentation ranges: never routable.
	return {
		v4: `203.0.113.${(h % 253) + 1}`,
		v6: `2001:db8:${(h & 0xffff).toString(16)}::1`,
	};
}

export type { SandboxOptions };
export const isSandboxId = (provider: ProviderId, id: string) =>
	id.startsWith(`sbx-${provider}-`);
