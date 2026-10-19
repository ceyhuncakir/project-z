import { cn } from "@switchyard/ui/lib/utils";

type Line =
	| { kind: "user"; text: string }
	| { kind: "tool"; name: string; args: string }
	| { kind: "out"; text: string; tone?: "go" | "muted" }
	| { kind: "agent"; text: string };

const SCRIPT: Line[] = [
	{
		kind: "user",
		text: "Spin up a 4 GB box in Europe, run the load test, then clean up.",
	},
	{
		kind: "tool",
		name: "switchyard.create_server",
		args: '{ min_memory_gb: 4, continents: ["EU"] }',
	},
	{ kind: "out", text: "routed → hetzner:cx23 · Falkenstein, DE · $0.0055/h" },
	{
		kind: "out",
		text: "fallbacks: ovhcloud:d2-4, digitalocean:s-2vcpu-4gb",
		tone: "muted",
	},
	{
		kind: "tool",
		name: "switchyard.get_server",
		args: "{ wait_for_running_seconds: 90 }",
	},
	{ kind: "out", text: "running · 203.0.113.42 · booted in 31s", tone: "go" },
	{
		kind: "tool",
		name: "bash",
		args: "ssh root@203.0.113.42 ./loadtest.sh --rps 2000",
	},
	{ kind: "out", text: "p99 41 ms · 0 errors · 120 000 requests" },
	{
		kind: "tool",
		name: "switchyard.delete_server",
		args: '{ id: "srv_8kq2m1x0d3a7" }',
	},
	{ kind: "out", text: "deleted · final cost $0.0055", tone: "go" },
	{
		kind: "agent",
		text: "Load test passed (p99 41 ms). Server destroyed — total spend $0.0055.",
	},
];

/** A scripted agent session that types itself out. Pure CSS, no JS timers. */
export function AgentTerminal({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"overflow-hidden border bg-card text-left shadow-[0_1px_0_0_var(--border)]",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b px-4 py-2.5">
				<div className="flex items-center gap-2">
					<span className="size-2.5 rounded-full bg-border" />
					<span className="size-2.5 rounded-full bg-border" />
					<span className="size-2.5 rounded-full bg-border" />
					<span className="ml-2 font-mono text-[11px] text-muted-foreground">
						agent session
					</span>
				</div>
				<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
					<span className="size-1.5 animate-pulse-dot rounded-full bg-go" />
					mcp · switchyard
				</span>
			</div>
			<div className="space-y-1.5 px-4 py-4 font-mono text-[11.5px] leading-relaxed sm:px-5 sm:text-[12.5px]">
				{SCRIPT.map((line, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static script
						key={i}
						className="animate-line-in"
						style={{ animationDelay: `${0.25 + i * 0.55}s` }}
					>
						<TerminalLine line={line} />
					</div>
				))}
				<div
					className="animate-line-in pt-1"
					style={{ animationDelay: `${0.25 + SCRIPT.length * 0.55}s` }}
				>
					<span className="text-muted-foreground">›</span>{" "}
					<span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-foreground" />
				</div>
			</div>
		</div>
	);
}

function TerminalLine({ line }: { line: Line }) {
	switch (line.kind) {
		case "user":
			return (
				<p className="text-foreground">
					<span className="text-signal">›</span> {line.text}
				</p>
			);
		case "tool":
			return (
				<p className="truncate pt-1.5">
					<span className="text-signal">●</span>{" "}
					<span className="text-foreground">{line.name}</span>{" "}
					<span className="text-muted-foreground">{line.args}</span>
				</p>
			);
		case "out":
			return (
				<p
					className={cn(
						"truncate pl-4",
						line.tone === "go"
							? "text-go"
							: line.tone === "muted"
								? "text-muted-foreground"
								: "text-foreground/80",
					)}
				>
					<span className="text-muted-foreground">⎿</span> {line.text}
				</p>
			);
		case "agent":
			return <p className="pt-2 text-foreground">{line.text}</p>;
	}
}
