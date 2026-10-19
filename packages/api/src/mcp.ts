import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
	CONTINENTS,
	formatUsd,
	IMAGE_IDS,
	LLM_MODELS,
	type PlanFilters,
	PROVIDER_IDS,
	PROVIDERS,
	type ProviderId,
} from "@switchyard/cloud";
import { wallet } from "@switchyard/db/schema/app";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor, ApiKeyRecord, Services } from "./context";
import { burnRate } from "./services/billing";
import {
	listImages,
	listProviders,
	listRegions,
	searchPlans,
	sizeLlm,
} from "./services/catalog";
import { workingAccounts } from "./services/connections";
import { getGuardrails, monthSpent } from "./services/guardrails";
import {
	createServer,
	deleteServer,
	getServer,
	keepServer,
	listServers,
	powerAction,
	type SerializedServer,
} from "./services/servers";
import { getBalance } from "./services/wallet";

function instructions(svc: Services) {
	const providers = PROVIDER_IDS.filter((id) => svc.cloud.connectable(id));
	const names = providers.map((id) => PROVIDERS[id].name).join(", ");
	const gpu = providers.some((id) => PROVIDERS[id].category === "gpu");
	return `HessianLabs provisions Linux servers in the cloud accounts this user has connected (available: ${names}). The provider bills the user for each server directly; HessianLabs charges a fee of ${svc.config.feeBps / 100}% of the server's list price from a prepaid balance.

Typical flow:
1. create_server with requirements (e.g. min_memory_gb: 4, continents: ["EU"]) — the router picks the cheapest matching plan on the connected accounts and falls back to the next one if a provider is out of capacity. Use search_plans first only if you want to compare options or pin an exact plan_id.
2. get_server with wait_for_running_seconds: 90 until status is "running" and ipv4 is set.
3. SSH in as root. If you passed no SSH key, create_server returns a one-time private key: save it to a file with mode 600.
4. delete_server as soon as the work is done. A server costs money for as long as it exists, stopped or not, with a one-hour minimum. For work with a known length, pass ttl_hours to create_server so the server deletes itself; keep_server extends it if you need longer.

The account may set guardrails for agents (allowed providers and regions, a price cap per server, a monthly spend limit, a server count, a time limit); get_balance lists them, and a create that breaks one fails with a message saying which. Don't try to work around a guardrail: tell the user.

If a tool says no account is connected, ask the user to connect one at ${svc.config.webUrl}/providers.
${gpu ? "\nFor GPUs / LLM serving: call size_llm with the model to get the VRAM it needs, then create_server with min_vram_gb (GPU plans default to Ubuntu 22.04 + CUDA).\n" : ""}
Prices are USD list prices. Check get_balance before large jobs.`;
}

const filterShape = {
	min_vcpu: z.number().positive().optional().describe("Minimum vCPUs"),
	min_memory_gb: z.number().positive().optional().describe("Minimum RAM in GB"),
	min_disk_gb: z.number().positive().optional().describe("Minimum disk in GB"),
	max_hourly_usd: z
		.number()
		.positive()
		.optional()
		.describe("Maximum price per hour in USD"),
	max_monthly_usd: z
		.number()
		.positive()
		.optional()
		.describe("Maximum price per month in USD"),
	providers: z
		.array(z.enum(PROVIDER_IDS))
		.optional()
		.describe("Only these providers"),
	regions: z
		.array(z.string())
		.optional()
		.describe('Region ids, e.g. ["hetzner:fsn1"]'),
	countries: z
		.array(z.string().length(2))
		.optional()
		.describe('ISO country codes, e.g. ["DE","NL"]'),
	continents: z
		.array(z.enum(CONTINENTS))
		.optional()
		.describe("EU, NA, SA, AS, OC, AF"),
	cpu_type: z.enum(["shared", "dedicated"]).optional(),
	arch: z.enum(["x86", "arm"]).optional(),
	kind: z
		.enum(["cpu", "gpu", "any"])
		.optional()
		.describe("cpu (default), gpu, or any. GPU filters below imply gpu."),
	gpu_models: z
		.array(z.string())
		.optional()
		.describe('GPU model substrings, e.g. ["H100","A100"]'),
	min_gpu_count: z.number().int().positive().optional(),
	min_vram_gb: z
		.number()
		.positive()
		.optional()
		.describe("Minimum total GPU memory in GB (use size_llm to estimate)"),
};

type FilterArgs = {
	[K in keyof typeof filterShape]?: z.infer<(typeof filterShape)[K]>;
};

const toFilters = (a: FilterArgs): PlanFilters => ({
	minVcpu: a.min_vcpu,
	minMemoryGb: a.min_memory_gb,
	minDiskGb: a.min_disk_gb,
	maxHourlyUsd: a.max_hourly_usd,
	maxMonthlyUsd: a.max_monthly_usd,
	providers: a.providers,
	regions: a.regions,
	countries: a.countries,
	continents: a.continents,
	cpuType: a.cpu_type,
	arch: a.arch,
	kind: a.kind,
	gpuModels: a.gpu_models,
	minGpuCount: a.min_gpu_count,
	minVramGb: a.min_vram_gb,
});

function agentServer(s: SerializedServer) {
	return {
		id: s.id,
		name: s.name,
		status: s.status,
		provider: s.provider,
		region: s.regionId,
		location: `${s.city}, ${s.country}`,
		plan: s.planId,
		specs: `${s.vcpu} vCPU · ${s.memoryGb} GB RAM · ${s.diskGb} GB disk`,
		gpu: s.gpu ?? undefined,
		image: s.image,
		ipv4: s.ipv4,
		ipv6: s.ipv6,
		ssh: s.ipv4 ? `ssh root@${s.ipv4}` : null,
		price_per_hour: formatUsd(s.priceHourlyMicros, { precise: true }),
		fee_per_hour: formatUsd(s.feeHourlyMicros, { precise: true }),
		cost_so_far: formatUsd(s.totalCostMicros, { precise: true }),
		fees_so_far: formatUsd(s.totalFeeMicros, { precise: true }),
		sandbox: s.sandbox || undefined,
		error: s.errorMessage ?? undefined,
		deletes_at: s.expiresAt ?? undefined,
		created_at: s.createdAt,
	};
}

const json = (value: unknown): CallToolResult => ({
	content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

/** Runs a tool body and turns thrown errors into MCP tool errors the agent can read. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
	try {
		return json(await fn());
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { isError: true, content: [{ type: "text", text: message }] };
	}
}

export function createMcpServer(svc: Services, key: ApiKeyRecord) {
	const actor: Actor = {
		userId: key.userId,
		apiKeyId: key.id,
		via: "mcp",
		memberId: null,
		role: "member",
	};
	const mcp = new McpServer(
		{ name: "hessianlabs", title: "HessianLabs", version: "1.0.0" },
		{ instructions: instructions(svc) },
	);

	/** Searches only cover providers this user can create servers on. */
	async function connectedProviders(requested?: ProviderId[]) {
		const connected = [...(await workingAccounts(svc.db, actor.userId)).keys()];
		if (!connected.length) {
			throw new Error(
				`No cloud account is connected yet. Ask the user to connect one at ${svc.config.webUrl}/providers.`,
			);
		}
		return requested
			? requested.filter((p) => connected.includes(p))
			: connected;
	}

	mcp.registerTool(
		"search_plans",
		{
			title: "Search server plans",
			description:
				"Search plans on the user's connected cloud accounts, cheapest first. Returns plan ids usable with create_server.",
			inputSchema: {
				...filterShape,
				sort: z.enum(["price", "vcpu", "memory"]).optional(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.optional()
					.describe("Default 10"),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		(args) =>
			run(async () => {
				const res = await searchPlans(svc, {
					filters: {
						...toFilters(args),
						providers: await connectedProviders(args.providers),
					},
					sort: args.sort,
					limit: args.limit ?? 10,
				});
				return {
					total_matches: res.total,
					plans: res.plans.map((p) => ({
						plan_id: p.id,
						provider: p.providerName,
						specs: `${p.vcpu} vCPU (${p.cpuType}, ${p.arch}) · ${p.memoryGb} GB RAM · ${p.diskGb} GB disk`,
						gpu: p.gpu
							? `${p.gpu.count}× ${p.gpu.model} · ${p.gpu.totalVramGb} GB VRAM`
							: undefined,
						price_per_hour: formatUsd(p.priceHourlyMicros, { precise: true }),
						price_per_month: formatUsd(p.priceMonthlyMicros),
						regions: p.regions.map(
							(r) =>
								`${r.id} (${r.city}, ${r.country})${
									r.priceHourlyMicros !== p.priceHourlyMicros
										? ` ${formatUsd(r.priceHourlyMicros, { precise: true })}/h`
										: ""
								}`,
						),
					})),
				};
			}),
	);

	mcp.registerTool(
		"size_llm",
		{
			title: "Size an LLM deployment",
			description:
				"Estimate the GPU memory needed to serve an open-weight model and list the cheapest GPU plans that fit. Then call create_server with min_vram_gb (or the plan_id).",
			inputSchema: {
				model: z
					.string()
					.optional()
					.describe(`Preset: ${LLM_MODELS.map((m) => m.id).join(", ")}`),
				params_b: z
					.number()
					.positive()
					.optional()
					.describe("Parameters in billions, if no preset"),
				precision: z
					.enum(["fp16", "fp8", "int8", "int4"])
					.optional()
					.describe("Defaults to the model's native precision"),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		(args) =>
			run(async () => {
				const res = await sizeLlm(
					svc,
					{
						model: args.model,
						paramsB: args.params_b,
						precision: args.precision,
					},
					5,
					await connectedProviders(),
				);
				return {
					model: res.model,
					precision: res.precision,
					vram_needed_gb: res.vramGb,
					note: "Weights × 1.2 for KV cache and activations at moderate context. Long contexts or large batches need more.",
					cheapest_fits: res.plans.map((p) => ({
						plan_id: p.id,
						provider: p.providerName,
						gpu: p.gpu
							? `${p.gpu.count}× ${p.gpu.model} · ${p.gpu.totalVramGb} GB VRAM`
							: null,
						price_per_hour: formatUsd(p.priceHourlyMicros, { precise: true }),
						regions: p.regions.map((r) => r.id),
					})),
				};
			}),
	);

	mcp.registerTool(
		"list_regions",
		{
			title: "List regions",
			description:
				"List data-center regions, optionally filtered by provider, country or continent.",
			inputSchema: {
				providers: filterShape.providers,
				countries: filterShape.countries,
				continents: filterShape.continents,
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		(args) =>
			run(async () =>
				(await listRegions(svc, args)).map((r) => ({
					region_id: r.id,
					location: `${r.city}, ${r.country}`,
					continent: r.continent,
				})),
			),
	);

	mcp.registerTool(
		"list_providers",
		{
			title: "List providers",
			description:
				"Providers HessianLabs supports, whether the user has connected an account for each, region/plan counts and starting price.",
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		() =>
			run(async () => {
				const accounts = await workingAccounts(svc.db, actor.userId);
				return (await listProviders(svc)).map((p) => ({
					provider: p.id,
					name: p.name,
					category: p.category,
					connected: accounts.has(p.id),
					available: p.connectable ? undefined : "coming soon",
					regions: p.regions,
					plans: p.plans,
					from_per_hour: p.fromHourlyMicros
						? formatUsd(p.fromHourlyMicros, { precise: true })
						: null,
				}));
			}),
	);

	mcp.registerTool(
		"list_images",
		{
			title: "List images",
			description: "Operating system images available on every provider.",
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		() => run(async () => listImages()),
	);

	mcp.registerTool(
		"create_server",
		{
			title: "Create server",
			description:
				"Provision a server in one of the user's connected cloud accounts. Give plan_id for an exact plan, or requirements (min_vcpu, min_memory_gb, continents, max_hourly_usd, …) and the cheapest match is chosen with automatic fallback across providers. The provider bills the server; HessianLabs's fee is charged per minute from the balance (one-hour minimum).",
			inputSchema: {
				plan_id: z
					.string()
					.optional()
					.describe('Exact plan, e.g. "hetzner:cx23"'),
				region_id: z
					.string()
					.optional()
					.describe('Exact region, e.g. "hetzner:fsn1"'),
				...filterShape,
				name: z
					.string()
					.optional()
					.describe("Hostname: letters, digits, dashes"),
				image: z.enum(IMAGE_IDS).optional().describe("Default ubuntu-24.04"),
				ssh_public_keys: z
					.array(z.string())
					.optional()
					.describe(
						"OpenSSH public keys. If omitted, saved account keys are used, else a key is generated.",
					),
				user_data: z
					.string()
					.optional()
					.describe("cloud-init config or shell script run on first boot"),
				labels: z.record(z.string(), z.string()).optional(),
				ttl_hours: z
					.number()
					.int()
					.min(1)
					.max(720)
					.optional()
					.describe(
						"Delete the server after this many hours unless keep_server extends it. Accounts may enforce a maximum.",
					),
				wait_for_running_seconds: z
					.number()
					.min(0)
					.max(90)
					.optional()
					.describe("Block until running (max 90s). Default 0."),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				openWorldHint: true,
			},
		},
		(args) =>
			run(async () => {
				const filters = toFilters(args);
				const hasRequirements = Object.values(filters).some(
					(v) => v !== undefined,
				);
				const res = await createServer(svc, actor, {
					planId: args.plan_id,
					regionId: args.region_id,
					requirements: hasRequirements ? filters : undefined,
					name: args.name,
					image: args.image,
					sshPublicKeys: args.ssh_public_keys,
					userData: args.user_data,
					labels: args.labels,
					ttlHours: args.ttl_hours,
				});
				const current = args.wait_for_running_seconds
					? await getServer(svc, actor.userId, res.server.id, {
							waitForRunningSeconds: args.wait_for_running_seconds,
						})
					: res.server;
				return {
					server: agentServer(current),
					fallbacks_tried: res.fallbacks.length ? res.fallbacks : undefined,
					ssh: res.ssh,
					next_step:
						current.status === "running"
							? `Server is up. Connect with: ssh root@${current.ipv4}`
							: "Call get_server with wait_for_running_seconds: 90 until status is running.",
				};
			}),
	);

	mcp.registerTool(
		"get_server",
		{
			title: "Get server",
			description:
				"Current status, IPs and cost of a server. Can wait until it is running.",
			inputSchema: {
				id: z.string().describe("Server id, e.g. srv_…"),
				wait_for_running_seconds: z.number().min(0).max(120).optional(),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		(args) =>
			run(async () =>
				agentServer(
					await getServer(svc, actor.userId, args.id, {
						waitForRunningSeconds: args.wait_for_running_seconds,
					}),
				),
			),
	);

	mcp.registerTool(
		"list_servers",
		{
			title: "List servers",
			description:
				"Servers on this account (active ones unless include_deleted is true).",
			inputSchema: { include_deleted: z.boolean().optional() },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		(args) =>
			run(async () =>
				(
					await listServers(svc, actor.userId, {
						includeDeleted: args.include_deleted,
					})
				).map(agentServer),
			),
	);

	mcp.registerTool(
		"server_action",
		{
			title: "Start, stop or reboot",
			description:
				"Power actions. Stopped servers are still billed by providers, and still carry the fee — delete to stop both.",
			inputSchema: {
				id: z.string(),
				action: z.enum(["start", "stop", "reboot"]),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				openWorldHint: true,
			},
		},
		(args) =>
			run(async () =>
				agentServer(await powerAction(svc, actor, args.id, args.action)),
			),
	);

	mcp.registerTool(
		"delete_server",
		{
			title: "Delete server",
			description:
				"Permanently destroy a server and its disk at the provider. Stops billing and the fee. Cannot be undone.",
			inputSchema: { id: z.string() },
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		(args) =>
			run(async () => {
				const s = await deleteServer(svc, actor, args.id);
				return {
					deleted: s.id,
					final_cost: formatUsd(s.totalCostMicros, { precise: true }),
					fees: formatUsd(s.totalFeeMicros, { precise: true }),
				};
			}),
	);

	mcp.registerTool(
		"keep_server",
		{
			title: "Keep server",
			description:
				"Move a server's time limit to hours from now, so it isn't deleted yet. Call it before deletes_at passes when the work needs longer.",
			inputSchema: {
				id: z.string(),
				hours: z
					.number()
					.int()
					.min(1)
					.max(720)
					.describe("New time limit, counted from now"),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		(args) =>
			run(async () =>
				agentServer(await keepServer(svc, actor, args.id, args.hours)),
			),
	);

	mcp.registerTool(
		"get_balance",
		{
			title: "Get balance",
			description:
				"Credit balance (it pays HessianLabs's fee), the fee burn rate and runway, what active servers cost at their providers, and this API key's spend limit.",
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		() =>
			run(async () => {
				const [balance, burn, limits, [w]] = await Promise.all([
					getBalance(svc.db, actor.userId),
					burnRate(svc.db, actor.userId),
					getGuardrails(svc.db, actor.userId),
					svc.db
						.select({
							monthSpentMicros: wallet.monthSpentMicros,
							monthStartedAt: wallet.monthStartedAt,
						})
						.from(wallet)
						.where(eq(wallet.userId, actor.userId)),
				]);
				const usd = (micros: number | null) =>
					micros === null ? null : formatUsd(micros, { precise: true });
				return {
					balance: formatUsd(balance),
					fee_per_hour: formatUsd(burn.feeMicros, { precise: true }),
					runway_hours:
						burn.feeMicros > 0 ? Math.floor(balance / burn.feeMicros) : null,
					servers_per_hour_at_providers: formatUsd(burn.serverMicros, {
						precise: true,
					}),
					api_key: {
						name: key.name,
						spent_at_providers: formatUsd(key.spentMicros),
						spend_limit:
							key.spendLimitMicros === null
								? null
								: formatUsd(key.spendLimitMicros),
						max_servers: key.maxServers,
					},
					guardrails: {
						spent_at_providers_this_month: formatUsd(w ? monthSpent(w) : 0),
						monthly_spend_limit: usd(limits.monthlySpendLimitMicros),
						max_servers: limits.maxServers,
						max_price_per_hour: usd(limits.maxHourlyPriceMicros),
						allowed_providers: limits.allowedProviders,
						allowed_continents: limits.allowedContinents,
						gpu_allowed: limits.allowGpu,
						time_limit_hours: limits.defaultTtlHours,
					},
				};
			}),
	);

	return mcp;
}
