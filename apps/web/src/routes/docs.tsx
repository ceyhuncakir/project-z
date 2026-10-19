import { buttonVariants } from "@switchyard/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CodeBlock } from "@/components/code-block";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { McpSnippets } from "@/components/mcp-snippets";
import { API_URL, MCP_URL } from "@/lib/api-url";
import { site } from "@/lib/site";

export const Route = createFileRoute("/docs")({
	head: () => ({ meta: [{ title: `Docs — ${site.name}` }] }),
	component: DocsPage,
});

const TOC = [
	["quickstart", "Quickstart"],
	["accounts", "Cloud accounts"],
	["tools", "MCP tools"],
	["routing", "Routing & fallback"],
	["gpu", "GPUs & LLM hosting"],
	["access", "Server access"],
	["billing", "Billing"],
	["safety", "Budgets & safety"],
	["rest", "REST API"],
] as const;

const TOOLS: [string, string, string][] = [
	[
		"search_plans",
		"Compare plans on your connected accounts, cheapest first.",
		"min_vcpu, min_memory_gb, continents, max_hourly_usd, sort",
	],
	[
		"create_server",
		"Provision in a connected account, by exact plan_id or by requirements (auto-routed).",
		"plan_id | requirements, image, ssh_public_keys, user_data",
	],
	[
		"get_server",
		"Status, IPs, price, fee and cost so far. Can block until running.",
		"id, wait_for_running_seconds",
	],
	["list_servers", "Active servers on the account.", "include_deleted"],
	["server_action", "Start, stop or reboot.", "id, action"],
	[
		"delete_server",
		"Destroy a server at the provider; stops billing and the fee.",
		"id",
	],
	[
		"get_balance",
		"Credits, fee per hour, runway, server spend at providers, key limits.",
		"—",
	],
	[
		"list_regions",
		"Regions by provider, country or continent.",
		"providers, countries, continents",
	],
	[
		"list_providers",
		"Providers, whether you've connected each, plan counts and starting price.",
		"—",
	],
	["list_images", "OS images available everywhere.", "—"],
	[
		"size_llm",
		"VRAM needed for an open-weight model + cheapest GPU plans on your accounts (GPU clouds coming soon).",
		"model | params_b, precision",
	],
];

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className="scroll-mt-24 border-t py-12 first:border-t-0 first:pt-0"
		>
			<h2 className="mb-5 font-medium text-2xl tracking-tight">{title}</h2>
			<div className="space-y-4 text-[14.5px] text-muted-foreground leading-relaxed [&_strong]:font-medium [&_strong]:text-foreground">
				{children}
			</div>
		</section>
	);
}

function DocsPage() {
	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />
			<main className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-5 py-14 lg:grid-cols-[180px_1fr]">
				<aside className="hidden lg:block">
					<nav className="sticky top-24 space-y-1 text-[13px]">
						<p className="label-mono mb-3">On this page</p>
						{TOC.map(([id, label]) => (
							<a
								key={id}
								href={`#${id}`}
								className="block py-1 text-muted-foreground hover:text-foreground"
							>
								{label}
							</a>
						))}
					</nav>
				</aside>
				<article className="min-w-0 max-w-3xl">
					<p className="label-mono">Documentation</p>
					<h1 className="mt-3 mb-12 font-medium text-4xl tracking-tight">
						Connect an agent in a minute.
					</h1>

					<Section id="quickstart" title="Quickstart">
						<p>
							<strong>1. Connect a cloud account</strong> on the{" "}
							<Link
								to="/providers"
								className="text-foreground underline underline-offset-4"
							>
								Providers
							</Link>{" "}
							page: paste an API token for Hetzner, DigitalOcean, Vultr, Akamai
							Linode, OVHcloud or Scaleway. Servers are created there.
						</p>
						<p>
							<strong>2. Add credits and create an API key.</strong> Credits on
							the{" "}
							<Link
								to="/credits"
								className="text-foreground underline underline-offset-4"
							>
								Credits
							</Link>{" "}
							page pay HessianLabs's fee. Create a key on the{" "}
							<Link
								to="/keys"
								className="text-foreground underline underline-offset-4"
							>
								API keys
							</Link>{" "}
							page and give it a spend limit if an agent will hold it.
						</p>
						<p>
							<strong>3. Add the MCP server</strong> to your client. The
							endpoint is{" "}
							<code className="font-mono text-[13px] text-foreground">
								{MCP_URL}
							</code>{" "}
							over Streamable HTTP.
						</p>
						<McpSnippets mcpUrl={MCP_URL} />
						<p>
							<strong>4. Ask for a server.</strong> For example:
						</p>
						<CodeBlock
							compact
							tabs={[
								{
									label: "Prompt",
									code: "Create the cheapest server with 4 GB RAM in Europe, install Docker,\nrun `docker run --rm hello-world`, then delete the server.",
								},
							]}
						/>
					</Section>

					<Section id="accounts" title="Cloud accounts">
						<p>
							HessianLabs creates servers in <strong>your own accounts</strong>.
							Each provider bills you directly at its list price, under its own
							terms; HessianLabs only charges its fee. You can connect one
							account per provider: Hetzner, DigitalOcean, Vultr, Akamai Linode,
							OVHcloud and Scaleway today. UpCloud, Contabo, Civo, Exoscale and
							the GPU clouds are coming soon.
						</p>
						<p>
							Credentials are checked with the provider when you add them, then{" "}
							<strong>encrypted with AES-256-GCM</strong> and never shown again.
							Use a token that can only manage servers — for Hetzner, a project
							just for HessianLabs — and revoke it at the provider whenever you
							like.
						</p>
						<p>
							Every few minutes HessianLabs checks your servers with their
							provider. A server deleted in the provider's console stops its fee
							within about five minutes. If you disconnect an account, or its
							token stops working, its servers are <strong>detached</strong>:
							they keep running in your account, unmanaged and with no fee.
						</p>
					</Section>

					<Section id="tools" title="MCP tools">
						<div className="overflow-x-auto border">
							<table className="w-full min-w-[560px] text-[13px]">
								<thead>
									<tr className="border-b bg-card text-left">
										<th className="label-mono px-3 py-2.5 font-normal">Tool</th>
										<th className="label-mono px-3 py-2.5 font-normal">Does</th>
										<th className="label-mono px-3 py-2.5 font-normal">
											Key arguments
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{TOOLS.map(([name, does, args]) => (
										<tr key={name}>
											<td className="px-3 py-2.5 font-mono text-[12px] text-foreground">
												{name}
											</td>
											<td className="px-3 py-2.5">{does}</td>
											<td className="px-3 py-2.5 font-mono text-[11.5px]">
												{args}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Section>

					<Section id="routing" title="Routing & fallback">
						<p>
							Pass an exact{" "}
							<code className="font-mono text-[13px] text-foreground">
								plan_id
							</code>{" "}
							(e.g.{" "}
							<code className="font-mono text-[13px] text-foreground">
								hetzner:cx23
							</code>
							) to pin a provider, or pass requirements and let the router
							decide. It ranks every plan on your connected accounts that
							satisfies them by hourly price and tries up to three candidates —
							at most two per provider — so a capacity shortage at one provider
							falls through to the next.
						</p>
						<CodeBlock
							compact
							tabs={[
								{
									label: "create_server",
									code: `{\n  "min_vcpu": 2,\n  "min_memory_gb": 4,\n  "continents": ["EU"],\n  "max_hourly_usd": 0.05,\n  "image": "ubuntu-24.04",\n  "wait_for_running_seconds": 90\n}`,
								},
							]}
						/>
					</Section>

					<Section id="access" title="Server access">
						<p>
							Servers boot with <strong>root SSH access</strong> and password
							login disabled. Keys come from, in order: keys passed in the
							request, then the keys saved on your account. If neither exists, a
							one-time ed25519 key pair is generated and the private key is
							returned in the create response — it is never stored, so the agent
							must save it.
						</p>
						<p>
							Keys are delivered with cloud-init, so your account's own key
							store is left alone. Pass{" "}
							<code className="font-mono text-[13px] text-foreground">
								user_data
							</code>{" "}
							(cloud-config or a shell script) to run your own setup on first
							boot.
						</p>
					</Section>

					<Section id="gpu" title="GPUs & LLM hosting">
						<p>
							GPU clouds — RunPod, Lambda, Vast.ai, CoreWeave, Paperspace,
							Nebius and Hyperstack — are <strong>coming soon</strong>. They sit
							in the catalog with indicative prices but can't be connected until
							their live integrations ship. Once they can, searches still return
							CPU plans unless you ask for GPUs with{" "}
							<code className="font-mono text-[13px] text-foreground">
								kind: "gpu"
							</code>
							,{" "}
							<code className="font-mono text-[13px] text-foreground">
								min_vram_gb
							</code>
							,{" "}
							<code className="font-mono text-[13px] text-foreground">
								gpu_models
							</code>{" "}
							or{" "}
							<code className="font-mono text-[13px] text-foreground">
								min_gpu_count
							</code>
							. GPU servers boot Ubuntu 22.04 with NVIDIA drivers and CUDA 12 by
							default.
						</p>
						<p>
							Not sure what a model needs? <strong>size_llm</strong> estimates
							VRAM as weights × 1.2 (room for KV cache at moderate context) and
							lists the cheapest plans that fit on your connected accounts.
						</p>
						<CodeBlock
							compact
							tabs={[
								{
									label: "size_llm",
									code: `{ "model": "llama-3.3-70b", "precision": "int8" }\n\n→ vram_needed_gb: 85, cheapest_fits: [lambda:gpu_1x_gh200, …]`,
								},
								{
									label: "create_server",
									code: `{\n  "min_vram_gb": 85,\n  "continents": ["NA"],\n  "wait_for_running_seconds": 90\n}`,
								},
							]}
						/>
					</Section>

					<Section id="billing" title="Billing">
						<p>
							Your provider bills each server to your own account at its list
							price. HessianLabs charges a <strong>fee</strong>: a percentage of
							that list price, fixed when the server is created, charged{" "}
							<strong>per minute</strong> from your credits with a{" "}
							<strong>one-hour minimum</strong> per server. Stopped servers
							still cost money at the provider and still carry the fee — delete
							to stop both. Top-ups carry a 5% fee (minimum $0.50).
						</p>
						<p>
							Top-ups are paid through <strong>Stripe Checkout</strong>; the fee
							shows as its own line item and Stripe emails a receipt. Save the
							card at checkout to turn on <strong>auto top-up</strong>: when the
							balance drops below your threshold, the card is charged
							off-session so your agents can keep creating servers. Refunds
							remove the matching credit.
						</p>
					</Section>

					<Section id="safety" title="Budgets & safety">
						<p>
							Every key can carry a <strong>lifetime spend limit</strong> and a{" "}
							<strong>max concurrent servers</strong> cap. Spend limits count
							servers at provider list price, not just the fee. Creating a
							server needs credit for at least one hour of its fee; an empty
							balance blocks new servers but never touches running ones. Every
							create, power action and delete is written to the activity log
							with the key that did it.
						</p>
					</Section>

					<Section id="rest" title="REST API">
						<p>
							The same key authenticates the REST API at{" "}
							<code className="font-mono text-[13px] text-foreground">
								{API_URL}/v1
							</code>
							. An OpenAPI spec and interactive reference are served alongside
							it.
						</p>
						<a
							href={`${API_URL}/v1/docs`}
							target="_blank"
							rel="noreferrer"
							className={buttonVariants({ variant: "outline" })}
						>
							Open API reference <ArrowUpRightIcon />
						</a>
						<CodeBlock
							tabs={[
								{
									label: "Search",
									code: `curl -X POST ${API_URL}/v1/plans/search \\\n  -H "Content-Type: application/json" \\\n  -d '{"filters":{"minMemoryGb":4,"continents":["EU"]},"limit":5}'`,
								},
								{
									label: "Create",
									code: `curl -X POST ${API_URL}/v1/servers \\\n  -H "Authorization: Bearer $HESSIANLABS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"requirements":{"minVcpu":2,"minMemoryGb":4,"continents":["EU"]}}'`,
								},
								{
									label: "Get",
									code: `curl "${API_URL}/v1/servers/srv_123?waitForRunningSeconds=60" \\\n  -H "Authorization: Bearer $HESSIANLABS_API_KEY"`,
								},
								{
									label: "Delete",
									code: `curl -X DELETE ${API_URL}/v1/servers/srv_123 \\\n  -H "Authorization: Bearer $HESSIANLABS_API_KEY"`,
								},
							]}
						/>
					</Section>
				</article>
			</main>
			<SiteFooter />
		</div>
	);
}
