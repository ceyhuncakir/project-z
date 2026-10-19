import { MCP_URL } from "@/lib/api-url";
import { site } from "@/lib/site";

import { McpSnippets } from "../mcp-snippets";
import { Reveal, SectionLabel } from "./section";

const TOOLS = [
	"search_plans",
	"create_server",
	"get_server",
	"size_llm",
	"delete_server",
	"get_balance",
];

export function Connect() {
	return (
		<section className="border-y bg-card/50">
			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-24 lg:grid-cols-[1fr_1.3fr] lg:items-center">
				<Reveal>
					<SectionLabel index="08" label="Connect" />
					<h2 className="mt-4 font-medium text-3xl tracking-tight">
						One line, any agent.
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground text-sm leading-relaxed">
						{site.name} speaks the Model Context Protocol over Streamable HTTP.
						Create a key, paste the config, and your agent gets eleven tools to
						find, create, inspect, power and delete servers — and to size GPU
						machines for models.
					</p>
					<ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px]">
						{TOOLS.map((t) => (
							<li key={t} className="flex items-center gap-2">
								<span className="text-signal">●</span> {t}
							</li>
						))}
					</ul>
					<p className="label-mono mt-8">Works with</p>
					<ul className="mt-3 flex flex-wrap gap-1.5">
						{site.clients.map((c) => (
							<li
								key={c}
								className="border bg-background px-2 py-1 font-mono text-[11px]"
							>
								{c}
							</li>
						))}
					</ul>
				</Reveal>
				<Reveal delay={0.1}>
					<McpSnippets mcpUrl={MCP_URL} />
				</Reveal>
			</div>
		</section>
	);
}
