import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { createHash } from "node:crypto";

import { PROVIDERS } from "../index";
import { type CreateServerInput, type Plan, ProviderError } from "../types";
import { createDigitalOceanAdapter } from "./digitalocean";
import { createHetznerAdapter } from "./hetzner";
import { createLinodeAdapter } from "./linode";
import { createOvhAdapter, ovhSignature } from "./ovhcloud";
import { createScalewayAdapter } from "./scaleway";
import { createVultrAdapter } from "./vultr";

// ---------------------------------------------------------------------------
// Fake fetch: first matching route wins; unmatched requests get a 404.

interface Call {
	method: string;
	url: URL;
	headers: Record<string, string>;
	body?: string;
}

interface Route {
	method?: string;
	path: string | RegExp;
	status?: number;
	body?: unknown;
	/** `n` counts earlier calls that matched this route. */
	handler?: (call: Call, n: number) => { status?: number; body?: unknown };
}

function fakeFetch(routes: Route[]) {
	const calls: Call[] = [];
	const hits = new Map<Route, number>();
	const impl = async (
		input: string | URL | Request,
		init: RequestInit = {},
	) => {
		const call: Call = {
			method: init.method ?? "GET",
			url: new URL(String(input)),
			headers: (init.headers ?? {}) as Record<string, string>,
			body: typeof init.body === "string" ? init.body : undefined,
		};
		calls.push(call);
		const route = routes.find(
			(r) =>
				(r.method ?? "GET") === call.method &&
				(typeof r.path === "string"
					? r.path === call.url.pathname
					: r.path.test(call.url.pathname)),
		);
		if (!route)
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
			});
		const n = hits.get(route) ?? 0;
		hits.set(route, n + 1);
		const { status = route.status ?? 200, body = route.body } =
			route.handler?.(call, n) ?? {};
		const text =
			body === undefined
				? null
				: typeof body === "string"
					? body
					: JSON.stringify(body);
		return new Response(text, { status });
	};
	const find = (method: string, path: string) =>
		calls.find((c) => c.method === method && c.url.pathname === path);
	return {
		fetch: impl as unknown as typeof fetch,
		calls,
		find,
		json: (method: string, path: string) =>
			JSON.parse(find(method, path)?.body ?? "null") as Record<string, unknown>,
	};
}

const USER_DATA =
	"#cloud-config\nssh_authorized_keys:\n  - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest test@example\n";

const input = (
	regionSlug: string,
	planSlug: string,
	extra: Partial<CreateServerInput> = {},
): CreateServerInput => ({
	serverId: "srv_01HXYZ",
	name: "Web Server #1",
	regionSlug,
	planSlug,
	image: "ubuntu-24.04",
	sshPublicKeys: ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest test@example"],
	userData: USER_DATA,
	...extra,
});

/** Account-level key references would install one tenant's key on every server. */
function expectNoAccountKeys(body: Record<string, unknown>) {
	for (const key of Object.keys(body)) expect(key).not.toMatch(/ssh/i);
}

const plan = (plans: Plan[], slug: string) => {
	const p = plans.find((x) => x.slug === slug);
	if (!p) throw new Error(`plan ${slug} missing`);
	return p;
};

const rejection = async (work: Promise<unknown>) => {
	try {
		await work;
	} catch (err) {
		return err as ProviderError;
	}
	throw new Error("expected rejection");
};

// ---------------------------------------------------------------------------

describe("hetzner", () => {
	const tib = 2 ** 40;
	const price = (
		location: string,
		hourly: string,
		monthly: string,
		traffic = 20 * tib,
	) => ({
		location,
		price_hourly: { net: hourly, gross: "0" },
		price_monthly: { net: monthly, gross: "0" },
		included_traffic: traffic,
	});
	const routes: Route[] = [
		{
			path: "/v1/locations",
			body: {
				locations: [
					{
						name: "fsn1",
						city: "Falkenstein",
						country: "DE",
						network_zone: "eu-central",
					},
					{
						name: "ash",
						city: "Ashburn, VA",
						country: "US",
						network_zone: "us-east",
					},
					{
						name: "sin",
						city: "Singapore",
						country: "SG",
						network_zone: "ap-southeast",
					},
				],
				meta: { pagination: { next_page: null } },
			},
		},
		{
			path: "/v1/server_types",
			handler: (call) =>
				call.url.searchParams.get("page") === "1"
					? {
							body: {
								server_types: [
									{
										name: "cx22",
										description: "CX22",
										cores: 2,
										memory: 4,
										disk: 40,
										cpu_type: "shared",
										architecture: "x86",
										deprecation: null,
										prices: [
											price("fsn1", "0.0060000000", "3.7900000000"),
											price("ash", "0.0080000000", "4.9900000000", tib),
										],
									},
									{
										name: "cx11",
										cores: 1,
										memory: 2,
										disk: 20,
										cpu_type: "shared",
										deprecated: true,
										prices: [price("fsn1", "0.0050", "3.29")],
									},
								],
								meta: { pagination: { next_page: 2 } },
							},
						}
					: {
							body: {
								server_types: [
									{
										name: "ccx13",
										description: "CCX13",
										cores: 2,
										memory: 8,
										disk: 80,
										cpu_type: "dedicated",
										architecture: "x86",
										prices: [price("fsn1", "0.0200", "12.49")],
									},
									{
										name: "cax11",
										description: "CAX11",
										cores: 2,
										memory: 4,
										disk: 40,
										cpu_type: "shared",
										architecture: "arm",
										locations: [
											{ name: "fsn1" },
											{
												name: "nbg1",
												deprecation: { announced: "2025-01-01" },
											},
										],
										prices: [
											price("fsn1", "0.0065", "3.99"),
											price("nbg1", "0.0001", "0.10"),
										],
									},
								],
								meta: { pagination: { next_page: null } },
							},
						},
		},
		{
			method: "POST",
			path: "/v1/servers",
			body: {
				server: {
					id: 42,
					status: "initializing",
					public_net: {
						ipv4: { ip: "203.0.113.10" },
						ipv6: { ip: "2a01:4f8:c17:1::/64" },
					},
				},
				root_password: "never-surfaced",
			},
		},
		{
			path: "/v1/servers/7",
			body: {
				server: {
					id: 7,
					status: "off",
					public_net: { ipv4: null, ipv6: null },
				},
			},
		},
		{
			path: "/v1/servers/8",
			body: { server: { id: 8, status: "running", public_net: {} } },
		},
		{
			method: "POST",
			path: "/v1/servers/7/actions/shutdown",
			status: 201,
			body: { action: {} },
		},
		{ method: "DELETE", path: "/v1/servers/7", body: { action: {} } },
	];
	const make = (r = routes) => {
		const fake = fakeFetch(r);
		return {
			fake,
			adapter: createHetznerAdapter(
				PROVIDERS.hetzner,
				{ token: "t", eurUsdRate: 1.1 },
				fake.fetch,
			),
		};
	};

	test("listRegions maps network zones to continents", async () => {
		const { adapter, fake } = make();
		expect(adapter.info.mode).toBe("live");
		const regions = await adapter.listRegions();
		expect(regions.map((r) => [r.id, r.country, r.continent])).toEqual([
			["hetzner:fsn1", "DE", "EU"],
			["hetzner:ash", "US", "NA"],
			["hetzner:sin", "SG", "AS"],
		]);
		expect(fake.calls[0]?.headers.Authorization).toBe("Bearer t");
	});

	test("listPlans paginates, converts EUR and skips deprecated types", async () => {
		const { adapter, fake } = make();
		const plans = await adapter.listPlans();
		expect(
			fake.calls.filter((c) => c.url.pathname === "/v1/server_types"),
		).toHaveLength(2);
		expect(plans.map((p) => p.slug)).toEqual(["cx22", "ccx13", "cax11"]);
		const cx22 = plan(plans, "cx22");
		// Cheapest location wins: 0.006 EUR * 1.1 = 0.0066 USD/h, 3.79 * 1.1 = 4.169 USD/mo.
		expect(cx22.priceHourlyMicros).toBe(6_600);
		expect(cx22.priceMonthlyMicros).toBe(4_169_000);
		expect(cx22.regions).toEqual(["fsn1", "ash"]);
		expect(cx22).toMatchObject({
			id: "hetzner:cx22",
			vcpu: 2,
			memoryGb: 4,
			diskGb: 40,
			transferTb: 20,
			cpuType: "shared",
		});
		expect(plan(plans, "ccx13").cpuType).toBe("dedicated");
		const cax11 = plan(plans, "cax11");
		expect(cax11.arch).toBe("arm");
		// nbg1 is deprecated for this type, so neither its location nor its price count.
		expect(cax11.regions).toEqual(["fsn1"]);
		expect(cax11.priceMonthlyMicros).toBe(4_389_000);
	});

	test("createServer passes cloud-init and no project ssh_keys", async () => {
		const { adapter, fake } = make();
		const server = await adapter.createServer(input("fsn1", "cx22"));
		expect(server).toEqual({
			providerServerId: "42",
			status: "provisioning",
			ipv4: "203.0.113.10",
			ipv6: "2a01:4f8:c17:1::1",
		});
		const body = fake.json("POST", "/v1/servers");
		expectNoAccountKeys(body);
		expect(body).toEqual({
			name: "web-server-1",
			server_type: "cx22",
			location: "fsn1",
			image: "ubuntu-24.04",
			user_data: USER_DATA,
			labels: { "switchyard-id": "srv_01HXYZ" },
			start_after_create: true,
			public_net: { enable_ipv4: true, enable_ipv6: true },
		});
	});

	test("createServer retries a taken name with a suffix", async () => {
		const { adapter, fake } = make([
			{
				method: "POST",
				path: "/v1/servers",
				handler: (_call, n) =>
					n === 0
						? {
								status: 409,
								body: {
									error: {
										code: "uniqueness_error",
										message: "server name is already used",
									},
								},
							}
						: {
								status: 201,
								body: {
									server: { id: 43, status: "initializing", public_net: {} },
								},
							},
			},
		]);
		const server = await adapter.createServer(input("fsn1", "cx22"));
		expect(server.providerServerId).toBe("43");
		const names = fake.calls.map(
			(c) => (JSON.parse(c.body ?? "{}") as { name: string }).name,
		);
		expect(names).toEqual(["web-server-1", "web-server-1-srv-01hxyz"]);
	});

	test("capacity and limit errors are retryable", async () => {
		const { adapter } = make([
			{
				method: "POST",
				path: "/v1/servers",
				status: 403,
				body: {
					error: {
						code: "resource_limit_exceeded",
						message: "server limit exceeded",
					},
				},
			},
		]);
		const err = await rejection(adapter.createServer(input("fsn1", "cx22")));
		expect(err).toBeInstanceOf(ProviderError);
		expect(err.retryable).toBe(true);
	});

	test("getServer maps status; unknown ids read as deleted", async () => {
		const { adapter } = make();
		expect((await adapter.getServer("7")).status).toBe("stopped");
		expect((await adapter.getServer("8")).status).toBe("running");
		expect(await adapter.getServer("404")).toEqual({
			providerServerId: "404",
			status: "deleted",
			ipv4: null,
			ipv6: null,
		});
	});

	test("deleteServer tolerates 404; powerAction uses graceful shutdown", async () => {
		const { adapter, fake } = make();
		await adapter.deleteServer("7");
		await adapter.deleteServer("999");
		await adapter.powerAction("7", "stop");
		expect(fake.find("POST", "/v1/servers/7/actions/shutdown")).toBeDefined();
	});
});

// ---------------------------------------------------------------------------

describe("digitalocean", () => {
	const size = (slug: string, extra: Record<string, unknown>) => ({
		slug,
		vcpus: 2,
		memory: 4096,
		disk: 80,
		transfer: 4,
		price_monthly: 24,
		price_hourly: 0.03571,
		regions: ["nyc3", "ams3"],
		available: true,
		description: "Basic",
		...extra,
	});
	const routes: Route[] = [
		{
			path: "/v2/regions",
			body: {
				regions: [
					{ slug: "nyc3", name: "New York 3", available: true },
					{ slug: "ams3", name: "Amsterdam 3", available: true },
					{ slug: "nyc2", name: "New York 2", available: false },
					{ slug: "zzz1", name: "Somewhere 1", available: true },
				],
				links: {},
			},
		},
		{
			path: "/v2/sizes",
			body: {
				sizes: [
					size("s-1vcpu-1gb", {
						vcpus: 1,
						memory: 1024,
						disk: 25,
						transfer: 1,
						price_monthly: 6,
						price_hourly: 0.00893,
					}),
					size("c-2", {
						description: "CPU-Optimized",
						price_monthly: 42,
						price_hourly: 0.0625,
					}),
					size("m-2vcpu-16gb", {
						description: "Memory-Optimized",
						memory: 16384,
					}),
					size("s-8vcpu-16gb", { available: false }),
					size("gpu-h100x1-80gb", { gpu_info: { count: 1 } }),
				],
				links: { pages: {} },
			},
		},
		{
			method: "POST",
			path: "/v2/droplets",
			status: 202,
			body: {
				droplet: { id: 123, status: "new", networks: { v4: [], v6: [] } },
			},
		},
		{
			path: "/v2/droplets/123",
			body: {
				droplet: {
					id: 123,
					status: "active",
					networks: {
						v4: [
							{ ip_address: "10.10.0.2", type: "private" },
							{ ip_address: "203.0.113.20", type: "public" },
						],
						v6: [{ ip_address: "2604:a880:400:d1::1", type: "public" }],
					},
				},
			},
		},
		{ path: "/v2/droplets/124", body: { droplet: { id: 124, status: "off" } } },
		{ method: "DELETE", path: "/v2/droplets/123", status: 204 },
		{
			method: "POST",
			path: "/v2/droplets/123/actions",
			status: 201,
			body: { action: {} },
		},
	];
	const make = () => {
		const fake = fakeFetch(routes);
		return {
			fake,
			adapter: createDigitalOceanAdapter(
				PROVIDERS.digitalocean,
				{ token: "do" },
				fake.fetch,
			),
		};
	};

	test("listRegions keeps available, known regions and enriches them", async () => {
		const regions = await make().adapter.listRegions();
		expect(
			regions.map((r) => [r.slug, r.city, r.country, r.continent]),
		).toEqual([
			["nyc3", "New York", "US", "NA"],
			["ams3", "Amsterdam", "NL", "EU"],
		]);
	});

	test("listPlans maps USD prices and CPU classes", async () => {
		const plans = await make().adapter.listPlans();
		expect(plans.map((p) => p.slug)).toEqual([
			"s-1vcpu-1gb",
			"c-2",
			"m-2vcpu-16gb",
		]);
		const basic = plan(plans, "s-1vcpu-1gb");
		expect(basic).toMatchObject({
			priceHourlyMicros: 8_930,
			priceMonthlyMicros: 6_000_000,
			memoryGb: 1,
			transferTb: 1,
			cpuType: "shared",
			arch: "x86",
			regions: ["nyc3", "ams3"],
		});
		expect(plan(plans, "c-2")).toMatchObject({
			cpuType: "dedicated",
			priceHourlyMicros: 62_500,
		});
		expect(plan(plans, "m-2vcpu-16gb").cpuType).toBe("dedicated");
	});

	test("createServer passes user_data and tags, no ssh_keys", async () => {
		const { adapter, fake } = make();
		const server = await adapter.createServer(
			input("ams3", "s-1vcpu-1gb", { serverId: "srv.01/x" }),
		);
		expect(server).toEqual({
			providerServerId: "123",
			status: "provisioning",
			ipv4: null,
			ipv6: null,
		});
		const body = fake.json("POST", "/v2/droplets");
		expectNoAccountKeys(body);
		expect(body).toMatchObject({
			name: "web-server-1",
			region: "ams3",
			size: "s-1vcpu-1gb",
			image: "ubuntu-24-04-x64",
			user_data: USER_DATA,
			ipv6: true,
			tags: ["switchyard", "switchyard-srv_01_x"],
		});
		for (const tag of body.tags as string[])
			expect(tag).toMatch(/^[a-zA-Z0-9_\-:]+$/);
	});

	test("getServer picks public addresses and maps status", async () => {
		const { adapter } = make();
		expect(await adapter.getServer("123")).toEqual({
			providerServerId: "123",
			status: "running",
			ipv4: "203.0.113.20",
			ipv6: "2604:a880:400:d1::1",
		});
		expect((await adapter.getServer("124")).status).toBe("stopped");
	});

	test("deleteServer tolerates 404; power actions post a typed action", async () => {
		const { adapter, fake } = make();
		await adapter.deleteServer("123");
		await adapter.deleteServer("999");
		await adapter.powerAction("123", "start");
		expect(fake.json("POST", "/v2/droplets/123/actions")).toEqual({
			type: "power_on",
		});
	});

	test("size not available in region is retryable", async () => {
		const fake = fakeFetch([
			{
				method: "POST",
				path: "/v2/droplets",
				status: 422,
				body: {
					id: "unprocessable_entity",
					message: "Size is not available in this region.",
				},
			},
		]);
		const adapter = createDigitalOceanAdapter(
			PROVIDERS.digitalocean,
			{ token: "do" },
			fake.fetch,
		);
		expect(
			(await rejection(adapter.createServer(input("ams3", "c-2")))).retryable,
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------

describe("vultr", () => {
	const routes: Route[] = [
		{
			path: "/v2/regions",
			body: {
				regions: [
					{ id: "ams", city: "Amsterdam", country: "NL", continent: "Europe" },
					{ id: "syd", city: "Sydney", country: "AU", continent: "Australia" },
					{
						id: "sao",
						city: "São Paulo",
						country: "BR",
						continent: "South America",
					},
				],
				meta: { links: { next: "" } },
			},
		},
		{
			path: "/v2/plans",
			handler: (call) =>
				call.url.searchParams.get("cursor") === "page2"
					? {
							body: {
								plans: [
									{
										id: "voc-c-2c-4gb-50s-amd",
										type: "voc",
										vcpu_count: 2,
										ram: 4096,
										disk: 50,
										bandwidth: 4096,
										monthly_cost: 40,
										hourly_cost: 0.06,
										locations: ["ams"],
									},
									{
										id: "vcg-a16-2c",
										type: "vcg",
										vcpu_count: 2,
										ram: 8192,
										disk: 50,
										bandwidth: 1024,
										monthly_cost: 43,
										locations: ["ams"],
									},
								],
								meta: { links: { next: "" } },
							},
						}
					: {
							body: {
								plans: [
									{
										id: "vc2-1c-1gb",
										type: "vc2",
										vcpu_count: 1,
										ram: 1024,
										disk: 25,
										bandwidth: 1024,
										monthly_cost: 5,
										locations: ["ams", "syd"],
									},
									{
										id: "vc2-1c-2gb",
										type: "vc2",
										vcpu_count: 1,
										ram: 2048,
										disk: 55,
										bandwidth: 2048,
										monthly_cost: 10,
										locations: [],
									},
								],
								meta: { links: { next: "page2" } },
							},
						},
		},
		{
			method: "POST",
			path: "/v2/instances",
			status: 202,
			body: {
				instance: {
					id: "a1b2",
					status: "pending",
					power_status: "running",
					server_status: "none",
					main_ip: "0.0.0.0",
					v6_main_ip: "",
					default_password: "never-surfaced",
				},
			},
		},
		{
			path: "/v2/instances/booting",
			body: {
				instance: {
					id: "booting",
					status: "active",
					power_status: "running",
					server_status: "installingbooting",
					main_ip: "203.0.113.30",
				},
			},
		},
		{
			path: "/v2/instances/up",
			body: {
				instance: {
					id: "up",
					status: "active",
					power_status: "running",
					server_status: "ok",
					main_ip: "203.0.113.31",
					v6_main_ip: "2001:19f0::1",
				},
			},
		},
		{
			path: "/v2/instances/down",
			body: {
				instance: {
					id: "down",
					status: "active",
					power_status: "stopped",
					server_status: "ok",
				},
			},
		},
		{ method: "DELETE", path: "/v2/instances/up", status: 204 },
		{ method: "POST", path: "/v2/instances/up/halt", status: 204 },
	];
	const make = () => {
		const fake = fakeFetch(routes);
		return {
			fake,
			adapter: createVultrAdapter(
				PROVIDERS.vultr,
				{ apiKey: "vk" },
				fake.fetch,
			),
		};
	};

	test("listRegions maps continent names", async () => {
		const regions = await make().adapter.listRegions();
		expect(regions.map((r) => [r.slug, r.continent])).toEqual([
			["ams", "EU"],
			["syd", "OC"],
			["sao", "SA"],
		]);
	});

	test("listPlans follows cursors, filters families and derives prices", async () => {
		const { adapter, fake } = make();
		const plans = await adapter.listPlans();
		expect(
			fake.calls.filter((c) => c.url.pathname === "/v2/plans"),
		).toHaveLength(2);
		expect(plans.map((p) => p.slug)).toEqual([
			"vc2-1c-1gb",
			"voc-c-2c-4gb-50s-amd",
		]);
		// No hourly_cost: monthly / 672 h cap, rounded up.
		expect(plan(plans, "vc2-1c-1gb")).toMatchObject({
			priceMonthlyMicros: 5_000_000,
			priceHourlyMicros: 7_441,
			transferTb: 1,
			cpuType: "shared",
			regions: ["ams", "syd"],
		});
		expect(plan(plans, "voc-c-2c-4gb-50s-amd")).toMatchObject({
			priceHourlyMicros: 60_000,
			cpuType: "dedicated",
			transferTb: 4,
			memoryGb: 4,
		});
	});

	test("createServer sends base64 user_data and os_id, no sshkey_id", async () => {
		const { adapter, fake } = make();
		const server = await adapter.createServer(input("ams", "vc2-1c-1gb"));
		expect(server).toEqual({
			providerServerId: "a1b2",
			status: "provisioning",
			ipv4: null,
			ipv6: null,
		});
		const body = fake.json("POST", "/v2/instances");
		expectNoAccountKeys(body);
		expect(
			Buffer.from(body.user_data as string, "base64").toString("utf8"),
		).toBe(USER_DATA);
		expect(body).toMatchObject({
			region: "ams",
			plan: "vc2-1c-1gb",
			os_id: 2284,
			label: "Web Server #1",
			hostname: "web-server-1",
			enable_ipv6: true,
			tags: ["switchyard", "srv_01HXYZ"],
		});
	});

	test("getServer waits for server_status and reads power_status", async () => {
		const { adapter } = make();
		expect((await adapter.getServer("booting")).status).toBe("provisioning");
		expect(await adapter.getServer("up")).toEqual({
			providerServerId: "up",
			status: "running",
			ipv4: "203.0.113.31",
			ipv6: "2001:19f0::1",
		});
		expect((await adapter.getServer("down")).status).toBe("stopped");
	});

	test("deleteServer tolerates 404; stop halts", async () => {
		const { adapter, fake } = make();
		await adapter.deleteServer("up");
		await adapter.deleteServer("gone");
		await adapter.powerAction("up", "stop");
		expect(fake.find("POST", "/v2/instances/up/halt")).toBeDefined();
	});
});

// ---------------------------------------------------------------------------

describe("linode", () => {
	const region = (
		id: string,
		label: string,
		country: string,
		capabilities: string[],
		status = "ok",
	) => ({
		id,
		label,
		country,
		capabilities,
		status,
	});
	const routes: Route[] = [
		{
			path: "/v4/regions",
			body: {
				data: [
					region("us-east", "Newark, NJ", "us", [
						"Linodes",
						"Block Storage",
						"Metadata",
					]),
					region("eu-west", "London, UK", "uk", ["Linodes"]),
					region("us-down", "Nowhere, US", "us", ["Linodes"], "outage"),
					region("objects", "Storage, DE", "de", ["Object Storage"]),
				],
				page: 1,
				pages: 1,
				results: 4,
			},
		},
		{
			path: "/v4/regions/us-east",
			body: region("us-east", "Newark, NJ", "us", ["Linodes", "Metadata"]),
		},
		{
			path: "/v4/linode/types",
			body: {
				data: [
					{
						id: "g6-nanode-1",
						label: "Nanode 1GB",
						class: "nanode",
						vcpus: 1,
						memory: 1024,
						disk: 25600,
						transfer: 1000,
						price: { hourly: 0.0075, monthly: 5 },
						region_prices: [{ id: "id-cgk", hourly: 0.009, monthly: 6 }],
					},
					{
						id: "g6-dedicated-2",
						label: "Dedicated 4GB",
						class: "dedicated",
						vcpus: 2,
						memory: 4096,
						disk: 81920,
						transfer: 4000,
						price: { hourly: 0.054, monthly: 36 },
					},
					{
						id: "g1-gpu-rtx6000-1",
						label: "Dedicated 32GB + RTX6000",
						class: "gpu",
						vcpus: 8,
						memory: 32768,
						disk: 655360,
						transfer: 16000,
						price: { hourly: 1.5, monthly: 1000 },
					},
				],
				page: 1,
				pages: 1,
			},
		},
		{
			method: "POST",
			path: "/v4/linode/instances",
			body: {
				id: 555,
				status: "provisioning",
				ipv4: ["192.168.130.5", "198.51.100.7"],
				ipv6: "2600:3c00::f03c:91ff:fe24:3a2f/128",
			},
		},
		{
			path: "/v4/linode/instances/555",
			body: { id: 555, status: "offline", ipv4: ["198.51.100.7"], ipv6: null },
		},
		{
			path: "/v4/linode/instances/556",
			body: { id: 556, status: "booting", ipv4: [] },
		},
		{ method: "DELETE", path: "/v4/linode/instances/555", body: {} },
		{ method: "POST", path: "/v4/linode/instances/555/reboot", body: {} },
	];
	const make = () => {
		const fake = fakeFetch(routes);
		return {
			fake,
			adapter: createLinodeAdapter(
				PROVIDERS.linode,
				{ token: "li" },
				fake.fetch,
			),
		};
	};

	test("listRegions keeps compute regions and normalizes countries", async () => {
		const regions = await make().adapter.listRegions();
		expect(
			regions.map((r) => [r.slug, r.city, r.country, r.continent]),
		).toEqual([
			["us-east", "Newark", "US", "NA"],
			["eu-west", "London", "GB", "EU"],
		]);
	});

	test("listPlans converts units and skips GPU classes", async () => {
		const plans = await make().adapter.listPlans();
		expect(plans.map((p) => p.slug)).toEqual(["g6-nanode-1", "g6-dedicated-2"]);
		expect(plan(plans, "g6-nanode-1")).toMatchObject({
			priceHourlyMicros: 7_500,
			priceMonthlyMicros: 5_000_000,
			memoryGb: 1,
			diskGb: 25,
			transferTb: 1,
			cpuType: "shared",
			regions: ["us-east", "eu-west"],
		});
		expect(plan(plans, "g6-dedicated-2")).toMatchObject({
			cpuType: "dedicated",
			diskGb: 80,
			transferTb: 4,
		});
	});

	test("createServer sends metadata only where supported, with per-instance keys", async () => {
		const { adapter, fake } = make();
		await adapter.listRegions();
		const server = await adapter.createServer(input("us-east", "g6-nanode-1"));
		expect(server).toEqual({
			providerServerId: "555",
			status: "provisioning",
			ipv4: "198.51.100.7",
			ipv6: "2600:3c00::f03c:91ff:fe24:3a2f",
		});
		const withMeta = JSON.parse(fake.calls.at(-1)?.body ?? "{}") as Record<
			string,
			unknown
		>;
		expect(withMeta).toMatchObject({
			label: "sy-srv_01HXYZ",
			region: "us-east",
			type: "g6-nanode-1",
			image: "linode/ubuntu24.04",
			authorized_keys: [
				"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest test@example",
			],
			tags: ["switchyard"],
			booted: true,
		});
		expect((withMeta.root_pass as string).length).toBeGreaterThanOrEqual(32);
		const meta = withMeta.metadata as { user_data: string };
		expect(Buffer.from(meta.user_data, "base64").toString("utf8")).toBe(
			USER_DATA,
		);

		await adapter.createServer(
			input("eu-west", "g6-nanode-1", { serverId: "--odd id..with__junk" }),
		);
		const noMeta = JSON.parse(fake.calls.at(-1)?.body ?? "{}") as Record<
			string,
			unknown
		>;
		expect(noMeta.metadata).toBeUndefined();
		expect(noMeta.label).toMatch(
			/^[a-zA-Z](?!.*(--|__|\.\.))[a-zA-Z0-9_.-]{2,63}$/,
		);
		expect(noMeta.root_pass).not.toBe(withMeta.root_pass);
	});

	test("createServer looks up region capabilities when not cached", async () => {
		const { adapter, fake } = make();
		await adapter.createServer(input("us-east", "g6-nanode-1"));
		expect(fake.find("GET", "/v4/regions/us-east")).toBeDefined();
		expect(fake.json("POST", "/v4/linode/instances").metadata).toBeDefined();
	});

	test("getServer maps status; deleteServer tolerates 404", async () => {
		const { adapter, fake } = make();
		expect((await adapter.getServer("555")).status).toBe("stopped");
		expect((await adapter.getServer("556")).status).toBe("provisioning");
		await adapter.deleteServer("555");
		await adapter.deleteServer("999");
		await adapter.powerAction("555", "reboot");
		expect(fake.find("POST", "/v4/linode/instances/555/reboot")).toBeDefined();
	});
});

// ---------------------------------------------------------------------------

describe("scaleway", () => {
	const GiB = 2 ** 30;
	const product = (extra: Record<string, unknown>) => ({
		hourly_price: 0.0088,
		monthly_price: 6.42,
		ncpus: 2,
		ram: 2 * GiB,
		arch: "x86_64",
		volumes_constraint: { min_size: 20e9, max_size: 20e9 },
		end_of_service: false,
		...extra,
	});
	const zoneOf = (call: Call) => call.url.pathname.split("/")[4];
	const routes: Route[] = [
		{
			path: /^\/instance\/v1\/zones\/[^/]+\/products\/servers\/availability$/,
			handler: (call) => ({
				body: {
					servers:
						zoneOf(call) === "fr-par-1"
							? { "COPARM1-2C-8G": { availability: "shortage" } }
							: {},
				},
			}),
		},
		{
			path: /^\/instance\/v1\/zones\/[^/]+\/products\/servers$/,
			handler: (call) => {
				const zone = zoneOf(call);
				if (zone === "pl-waw-3")
					return { status: 503, body: { message: "unavailable" } };
				if (zone === "fr-par-1") {
					return {
						body: {
							servers: {
								"DEV1-S": product({}),
								"POP2-2C-8G": product({
									hourly_price: 0.0735,
									monthly_price: 53.66,
									ram: 8 * GiB,
									volumes_constraint: { min_size: 0, max_size: 0 },
								}),
								"COPARM1-2C-8G": product({ arch: "arm64", ram: 8 * GiB }),
								"OLD1-XS": product({ end_of_service: true }),
								"GPU-3070-S": product({ gpu: 1 }),
							},
						},
					};
				}
				if (zone === "nl-ams-1") {
					return {
						body: {
							servers: {
								"DEV1-S": product({ hourly_price: 0.009, monthly_price: 6.57 }),
								"COPARM1-2C-8G": product({ arch: "arm64", ram: 8 * GiB }),
							},
						},
					};
				}
				return { body: { servers: {} } };
			},
		},
		{
			path: "/marketplace/v2/local-images",
			body: {
				local_images: [
					{
						id: "img-local",
						type: "instance_local",
						arch: "x86_64",
						compatible_commercial_types: ["DEV1-S"],
					},
					{
						id: "img-sbs",
						type: "instance_sbs",
						arch: "x86_64",
						compatible_commercial_types: ["DEV1-S", "POP2-2C-8G"],
					},
					{
						id: "img-arm",
						type: "instance_sbs",
						arch: "arm64",
						compatible_commercial_types: ["COPARM1-2C-8G"],
					},
				],
			},
		},
		{
			method: "POST",
			path: "/instance/v1/zones/fr-par-1/servers",
			status: 201,
			body: {
				server: {
					id: "s-1",
					state: "stopped",
					public_ips: [{ id: "ip-1", address: "51.15.0.1", family: "inet" }],
				},
			},
		},
		{
			method: "PATCH",
			path: "/instance/v1/zones/fr-par-1/servers/s-1/user_data/cloud-init",
			status: 204,
		},
		{
			method: "POST",
			path: /^\/instance\/v1\/zones\/[^/]+\/servers\/[^/]+\/action$/,
			status: 202,
			body: { task: {} },
		},
		{
			path: "/instance/v1/zones/nl-ams-1/servers/s-2",
			body: {
				server: {
					id: "s-2",
					state: "running",
					public_ips: [
						{ id: "ip-2", address: "51.158.0.2", family: "inet" },
						{ id: "ip-3", address: "2001:bc8::1", family: "inet6" },
					],
					volumes: { "0": { id: "vol-2", volume_type: "sbs_volume" } },
				},
			},
		},
		{
			method: "DELETE",
			path: /^\/block\/v1alpha1\/zones\/[^/]+\/volumes\/[^/]+$/,
			status: 204,
		},
	];
	const make = (r = routes) => {
		const fake = fakeFetch(r);
		const adapter = createScalewayAdapter(
			PROVIDERS.scaleway,
			{ secretKey: "scw-secret", projectId: "proj-1", eurUsdRate: 1.1 },
			fake.fetch,
		);
		return { fake, adapter };
	};

	test("listRegions serves the static zone list", async () => {
		const regions = await make().adapter.listRegions();
		expect(regions).toHaveLength(9);
		expect(regions[0]).toEqual({
			id: "scaleway:fr-par-1",
			provider: "scaleway",
			slug: "fr-par-1",
			city: "Paris",
			country: "FR",
			continent: "EU",
		});
	});

	test("listPlans merges zones, drops EOS/GPU/shortage and converts EUR", async () => {
		const { adapter, fake } = make();
		const plans = await adapter.listPlans();
		expect(fake.calls[0]?.headers["X-Auth-Token"]).toBe("scw-secret");
		expect(plans.map((p) => p.slug).sort()).toEqual([
			"COPARM1-2C-8G",
			"DEV1-S",
			"POP2-2C-8G",
		]);
		expect(plan(plans, "DEV1-S")).toMatchObject({
			regions: ["fr-par-1", "nl-ams-1"],
			// min(0.0088, 0.009) EUR * 1.1
			priceHourlyMicros: 9_680,
			priceMonthlyMicros: 7_062_000,
			memoryGb: 2,
			diskGb: 20,
			cpuType: "shared",
			arch: "x86",
		});
		expect(plan(plans, "POP2-2C-8G")).toMatchObject({
			cpuType: "dedicated",
			diskGb: 20,
			regions: ["fr-par-1"],
		});
		// Short in fr-par-1, so only orderable in nl-ams-1.
		expect(plan(plans, "COPARM1-2C-8G")).toMatchObject({
			arch: "arm",
			cpuType: "dedicated",
			regions: ["nl-ams-1"],
		});
	});

	test("createServer resolves the image, sets raw cloud-init, then powers on", async () => {
		const { adapter, fake } = make();
		const server = await adapter.createServer(input("fr-par-1", "POP2-2C-8G"));
		expect(server).toEqual({
			providerServerId: "fr-par-1/s-1",
			status: "provisioning",
			ipv4: "51.15.0.1",
			ipv6: null,
		});

		const lookup = fake.find("GET", "/marketplace/v2/local-images");
		expect(lookup?.url.searchParams.get("image_label")).toBe("ubuntu_noble");
		expect(lookup?.url.searchParams.get("zone")).toBe("fr-par-1");

		const body = fake.json("POST", "/instance/v1/zones/fr-par-1/servers");
		expectNoAccountKeys(body);
		expect(body).toEqual({
			name: "web-server-1",
			commercial_type: "POP2-2C-8G",
			image: "img-sbs",
			project: "proj-1",
			tags: ["switchyard", "srv_01HXYZ"],
			dynamic_ip_required: true,
			volumes: { "0": { size: 20e9, volume_type: "sbs_volume" } },
		});

		const cloudInit = fake.find(
			"PATCH",
			"/instance/v1/zones/fr-par-1/servers/s-1/user_data/cloud-init",
		);
		expect(cloudInit?.body).toBe(USER_DATA);
		expect(cloudInit?.headers["Content-Type"]).toBe("text/plain");
		expect(cloudInit?.headers["X-Auth-Token"]).toBe("scw-secret");
		expect(
			fake.json("POST", "/instance/v1/zones/fr-par-1/servers/s-1/action"),
		).toEqual({ action: "poweron" });
		// Power-on only after user data is in place.
		const order = fake.calls.map(
			(c) => `${c.method} ${c.url.pathname.split("/").at(-1)}`,
		);
		expect(order.indexOf("PATCH cloud-init")).toBeLessThan(
			order.indexOf("POST action"),
		);
	});

	test("createServer cleans up a stopped server when cloud-init fails", async () => {
		const { adapter, fake } = make([
			{
				method: "PATCH",
				path: "/instance/v1/zones/fr-par-1/servers/s-1/user_data/cloud-init",
				status: 500,
				body: "boom",
			},
			{
				path: "/instance/v1/zones/fr-par-1/servers/s-1",
				body: {
					server: {
						id: "s-1",
						state: "stopped",
						public_ips: [{ id: "ip-1", address: "51.15.0.1" }],
						volumes: { "0": { id: "vol-1", volume_type: "sbs_volume" } },
					},
				},
			},
			{
				method: "DELETE",
				path: "/instance/v1/zones/fr-par-1/servers/s-1",
				status: 204,
			},
			{
				method: "DELETE",
				path: "/instance/v1/zones/fr-par-1/ips/ip-1",
				status: 204,
			},
			...routes,
		]);
		const err = await rejection(
			adapter.createServer(input("fr-par-1", "DEV1-S")),
		);
		expect(err.retryable).toBe(true);
		expect(
			fake.find("DELETE", "/instance/v1/zones/fr-par-1/servers/s-1"),
		).toBeDefined();
		expect(
			fake.find("DELETE", "/instance/v1/zones/fr-par-1/ips/ip-1"),
		).toBeDefined();
		expect(
			fake.find("DELETE", "/block/v1alpha1/zones/fr-par-1/volumes/vol-1"),
		).toBeDefined();
		expect(
			fake.find("POST", "/instance/v1/zones/fr-par-1/servers/s-1/action"),
		).toBeUndefined();
	});

	test("getServer uses the zone from the id", async () => {
		const { adapter } = make();
		expect(await adapter.getServer("nl-ams-1/s-2")).toEqual({
			providerServerId: "nl-ams-1/s-2",
			status: "running",
			ipv4: "51.158.0.2",
			ipv6: "2001:bc8::1",
		});
		expect((await adapter.getServer("nl-ams-1/missing")).status).toBe(
			"deleted",
		);
	});

	test("deleteServer terminates running servers, removes SBS volumes, tolerates 404", async () => {
		const { adapter, fake } = make();
		await adapter.deleteServer("nl-ams-1/s-2");
		expect(
			fake.json("POST", "/instance/v1/zones/nl-ams-1/servers/s-2/action"),
		).toEqual({ action: "terminate" });
		expect(
			fake.find("DELETE", "/block/v1alpha1/zones/nl-ams-1/volumes/vol-2"),
		).toBeDefined();

		const before = fake.calls.length;
		await adapter.deleteServer("nl-ams-1/missing");
		expect(fake.calls).toHaveLength(before + 1);
	});

	test("out of stock is retryable", async () => {
		const { adapter } = make([
			{
				method: "POST",
				path: "/instance/v1/zones/fr-par-1/servers",
				status: 412,
				body: { type: "out_of_stock", message: "Out of stock" },
			},
			...routes,
		]);
		expect(
			(await rejection(adapter.createServer(input("fr-par-1", "DEV1-S"))))
				.retryable,
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------

describe("ovhcloud", () => {
	afterEach(() => setSystemTime());

	const config = {
		endpoint: "ovh-eu",
		applicationKey: "appkey",
		applicationSecret: "appsecret",
		consumerKey: "consumerkey",
		projectId: "p1",
		eurUsdRate: 1.1,
	};
	const P = "/1.0/cloud/project/p1";
	const flavor = (
		name: string,
		region: string,
		extra: Record<string, unknown> = {},
	) => ({
		id: `flv-${name}-${region}`,
		name,
		region,
		vcpus: 1,
		ram: 2000,
		disk: 25,
		osType: "linux",
		available: true,
		type: "ovh.ssd.eg",
		planCodes: {
			hourly: `${name}.consumption`,
			monthly: `${name}.monthly.postpaid`,
		},
		...extra,
	});
	const routes: Route[] = [
		{ path: "/1.0/auth/time", body: 1_700_000_005 },
		{ path: `${P}/region`, body: ["GRA11", "BHS5", "US-EAST-VA-1", "XYZ1"] },
		{
			path: `${P}/flavor`,
			handler: (call) => {
				const region = call.url.searchParams.get("region");
				const all = [
					flavor("d2-2", "GRA11"),
					flavor("d2-2", "BHS5"),
					flavor("win-d2-2", "GRA11", { osType: "windows" }),
					flavor("b3-8", "GRA11", { vcpus: 2, ram: 8000, disk: 50 }),
					flavor("c3-4", "GRA11", { available: false }),
					flavor("zz9-1", "GRA11"),
					flavor("t1-45", "GRA11", { vcpus: 8, ram: 45000 }),
				];
				return { body: region ? all.filter((f) => f.region === region) : all };
			},
		},
		{
			path: "/1.0/order/catalog/public/cloud",
			body: {
				locale: { currencyCode: "EUR", subsidiary: "FR" },
				addons: [
					{
						planCode: "d2-2.consumption",
						pricings: [
							{
								capacities: ["consumption"],
								price: 990_000,
								intervalUnit: "hour",
							},
						],
					},
					{
						planCode: "d2-2.monthly.postpaid",
						pricings: [{ capacities: ["renew"], price: 500_000_000 }],
					},
				],
			},
		},
		{
			path: `${P}/image`,
			body: [
				{ id: "img-deb", name: "Debian 12", status: "active" },
				{
					id: "img-u24-gpu",
					name: "Ubuntu 24.04",
					status: "active",
					flavorType: "t1",
				},
				{ id: "img-u24", name: "Ubuntu 24.04", status: "active" },
			],
		},
		{
			method: "POST",
			path: `${P}/instance`,
			body: { id: "i-1", status: "BUILD", ipAddresses: [] },
		},
		{
			path: `${P}/instance/i-1`,
			body: {
				id: "i-1",
				status: "ACTIVE",
				ipAddresses: [
					{ ip: "10.0.0.5", type: "private", version: 4 },
					{ ip: "51.68.0.1", type: "public", version: 4 },
					{ ip: "2001:41d0:304::1", type: "public", version: 6 },
				],
			},
		},
		{ path: `${P}/instance/i-2`, body: { id: "i-2", status: "SHUTOFF" } },
		{ method: "DELETE", path: `${P}/instance/i-1`, body: null },
		{ method: "POST", path: `${P}/instance/i-1/reboot`, body: null },
	];
	const make = (r = routes) => {
		const fake = fakeFetch(r);
		return {
			fake,
			adapter: createOvhAdapter(PROVIDERS.ovhcloud, config, fake.fetch),
		};
	};

	test("signature matches a hand-computed SHA1", () => {
		const url = "https://eu.api.ovh.com/1.0/cloud/project/p1/region";
		const expected = createHash("sha1")
			.update(`appsecret+consumerkey+GET+${url}++1700000005`)
			.digest("hex");
		expect(expected).toBe("635115b855b9a5b3f3885334a7af51c4c99beb34");
		expect(
			ovhSignature({
				applicationSecret: "appsecret",
				consumerKey: "consumerkey",
				method: "GET",
				url,
				body: "",
				timestamp: 1_700_000_005,
			}),
		).toBe(`$1$${expected}`);
	});

	test("requests are signed with the server clock", async () => {
		setSystemTime(new Date(1_700_000_000_000));
		const { adapter, fake } = make();
		await adapter.listRegions();
		await adapter.powerAction("i-1", "reboot");
		// The clock offset is fetched once, unsigned.
		const timeCalls = fake.calls.filter(
			(c) => c.url.pathname === "/1.0/auth/time",
		);
		expect(timeCalls).toHaveLength(1);
		expect(timeCalls[0]?.headers["X-Ovh-Signature"]).toBeUndefined();

		const regions = fake.find("GET", `${P}/region`);
		expect(regions?.headers).toMatchObject({
			"X-Ovh-Application": "appkey",
			"X-Ovh-Consumer": "consumerkey",
			"X-Ovh-Timestamp": "1700000005",
			"X-Ovh-Signature": "$1$635115b855b9a5b3f3885334a7af51c4c99beb34",
		});
		const reboot = fake.find("POST", `${P}/instance/i-1/reboot`);
		expect(reboot?.body).toBe('{"type":"soft"}');
		expect(reboot?.headers["X-Ovh-Signature"]).toBe(
			"$1$0434369160e110071f5d1b49b89370866b4a4aac",
		);
	});

	test("listRegions enriches region names", async () => {
		const regions = await make().adapter.listRegions();
		expect(
			regions.map((r) => [r.slug, r.city, r.country, r.continent]),
		).toEqual([
			["GRA11", "Gravelines", "FR", "EU"],
			["BHS5", "Beauharnois", "CA", "NA"],
			["US-EAST-VA-1", "Vint Hill", "US", "NA"],
		]);
	});

	test("listPlans groups flavors and prices them from the catalog (1e-8 units)", async () => {
		const { adapter, fake } = make();
		const plans = await adapter.listPlans();
		expect(
			fake.find("GET", "/1.0/order/catalog/public/cloud")?.headers[
				"X-Ovh-Signature"
			],
		).toBeUndefined();
		expect(plans.map((p) => p.slug)).toEqual(["d2-2", "b3-8"]);
		// 990000e-8 EUR = 0.0099 EUR/h * 1.1 = 0.01089 USD/h; hourly billing, 730 h a month.
		expect(plan(plans, "d2-2")).toMatchObject({
			priceHourlyMicros: 10_890,
			priceMonthlyMicros: 10_890 * 730,
			regions: ["GRA11", "BHS5"],
			cpuType: "shared",
			memoryGb: 2,
			diskGb: 25,
		});
		// Not in the catalog: falls back to the reference price.
		expect(plan(plans, "b3-8")).toMatchObject({
			priceMonthlyMicros: 37_500_000,
			priceHourlyMicros: 51_370,
			cpuType: "dedicated",
			memoryGb: 8,
		});
	});

	test("createServer resolves per-region flavor and image ids", async () => {
		const { adapter, fake } = make();
		const server = await adapter.createServer(input("GRA11", "d2-2"));
		expect(server).toEqual({
			providerServerId: "i-1",
			status: "provisioning",
			ipv4: null,
			ipv6: null,
		});
		const flavorLookup = fake.calls.find(
			(c) => c.url.pathname === `${P}/flavor`,
		);
		expect(flavorLookup?.url.searchParams.get("region")).toBe("GRA11");
		const imageLookup = fake.find("GET", `${P}/image`);
		expect(imageLookup?.url.searchParams.get("osType")).toBe("linux");
		const body = fake.json("POST", `${P}/instance`);
		expectNoAccountKeys(body);
		expect(body).toEqual({
			name: "web-server-1",
			flavorId: "flv-d2-2-GRA11",
			imageId: "img-u24",
			region: "GRA11",
			userData: USER_DATA,
			monthlyBilling: false,
		});
	});

	test("unavailable flavor is retryable", async () => {
		const err = await rejection(
			make().adapter.createServer(input("GRA11", "c3-4")),
		);
		expect(err).toBeInstanceOf(ProviderError);
		expect(err.retryable).toBe(true);
	});

	test("getServer maps status and public IPs; deleteServer tolerates 404", async () => {
		const { adapter } = make();
		expect(await adapter.getServer("i-1")).toEqual({
			providerServerId: "i-1",
			status: "running",
			ipv4: "51.68.0.1",
			ipv6: "2001:41d0:304::1",
		});
		expect((await adapter.getServer("i-2")).status).toBe("stopped");
		expect((await adapter.getServer("i-3")).status).toBe("deleted");
		await adapter.deleteServer("i-1");
		await adapter.deleteServer("i-404");
	});

	test("rejects unknown endpoints", () => {
		expect(() =>
			createOvhAdapter(PROVIDERS.ovhcloud, { ...config, endpoint: "ovh-mars" }),
		).toThrow(ProviderError);
	});
});
