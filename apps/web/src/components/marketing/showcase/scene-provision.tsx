import { cn } from "@switchyard/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";

import { StatusDot } from "@/components/status";

import { phase, typed } from "./clock";
import { Appear, OutLine, PanelTitle, ToolLine, UserLine } from "./parts";

export const PROVISION_DURATION = 10_500;
/** The moment shown when motion is reduced: server running, cost ticking. */
export const PROVISION_STATIC_T = 6_600;

const PROMPT =
	"Spin up a 4 GB box in Europe, run the load test, then clean up.";
const PRICE_MICROS = 5_466;

export function SceneProvision({ t }: { t: number }) {
	const created = t >= 2_200;
	const running = t >= 4_400;
	const deleted = t >= 8_000;
	// Accelerated meter: the one-hour minimum accrues over the scene.
	const cost = PRICE_MICROS * phase(t, 4_400, 3_400);
	const prompt = typed(PROMPT, t, 200, 55);

	return (
		<div className="grid h-full grid-cols-1 gap-px bg-border md:grid-cols-[1.05fr_1fr]">
			<div className="flex min-w-0 flex-col bg-card">
				<PanelTitle
					right={
						<span className="font-mono text-[10.5px] text-muted-foreground">
							claude code
						</span>
					}
				>
					Agent
				</PanelTitle>
				<div className="space-y-1.5 px-4 py-4 font-mono text-[11.5px] leading-relaxed">
					<UserLine text={prompt} cursor={prompt.length < PROMPT.length} />
					<Appear show={t >= 1_600}>
						<ToolLine
							name="switchyard.create_server"
							args='{ min_memory_gb: 4, continents: ["EU"] }'
							pending={!created}
						/>
					</Appear>
					<Appear show={created}>
						<OutLine>
							routed → hetzner:cx23 · Falkenstein, DE · $0.0055/h
						</OutLine>
					</Appear>
					<Appear show={t >= 2_800}>
						<ToolLine
							name="switchyard.get_server"
							args="{ wait_for_running_seconds: 90 }"
							pending={!running}
						/>
					</Appear>
					<Appear show={running}>
						<OutLine tone="go">running · 203.0.113.42 · booted in 31s</OutLine>
					</Appear>
					<Appear show={t >= 5_200}>
						<ToolLine
							name="bash"
							args="ssh root@203.0.113.42 ./loadtest.sh"
							pending={t < 6_600}
						/>
					</Appear>
					<Appear show={t >= 6_600}>
						<OutLine>p99 41 ms · 0 errors · 120 000 requests</OutLine>
					</Appear>
					<Appear show={t >= 7_400}>
						<ToolLine
							name="switchyard.delete_server"
							args='{ id: "srv_8kq2m1" }'
							pending={!deleted}
						/>
					</Appear>
					<Appear show={deleted}>
						<OutLine tone="go">deleted · final cost $0.0055</OutLine>
					</Appear>
					<Appear show={t >= 8_900}>
						<p className="pt-2 text-foreground">
							Load test passed. Server destroyed — spent $0.0055.
						</p>
					</Appear>
				</div>
			</div>

			<div className="flex min-w-0 flex-col bg-background">
				<PanelTitle
					right={
						<span className="font-mono text-[10.5px] text-muted-foreground">
							balance{" "}
							<span className="tabular text-foreground">
								${(50 - cost / 1e6).toFixed(4)}
							</span>
						</span>
					}
				>
					Servers
				</PanelTitle>
				<div className="divide-y text-[12px]">
					<ServerRow
						name="ci-runner-7"
						plan="CAX11 · Nuremberg"
						status="running"
						ip="203.0.113.17"
						price="$0.0062"
					/>
					<AnimatePresence initial={false}>
						{created && !deleted && (
							<motion.div
								key="new"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
								className="relative overflow-hidden"
							>
								{/* Arrival flash */}
								<motion.span
									aria-hidden="true"
									className="pointer-events-none absolute inset-0 bg-signal"
									initial={{ opacity: 0.16 }}
									animate={{ opacity: 0 }}
									transition={{ duration: 1.4 }}
								/>
								<ServerRow
									name="fsn1-8kq2m1"
									plan="CX23 · Falkenstein"
									status={running ? "running" : "provisioning"}
									ip={running ? "203.0.113.42" : null}
									price="$0.0055"
									highlight
								/>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				<div className="mt-auto grid grid-cols-2 gap-px border-t bg-border font-mono text-[11px]">
					<div className="bg-background px-4 py-3">
						<p className="text-muted-foreground">this run</p>
						<p className="tabular mt-0.5 text-[15px] text-foreground">
							${(cost / 1e6).toFixed(4)}
						</p>
					</div>
					<div className="bg-background px-4 py-3">
						<p className="text-muted-foreground">billing</p>
						<p
							className={cn(
								"tabular mt-0.5 text-[15px]",
								running && !deleted ? "text-signal" : "text-foreground",
							)}
						>
							{running && !deleted ? "per minute" : deleted ? "stopped" : "—"}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function ServerRow({
	name,
	plan,
	status,
	ip,
	price,
	highlight,
}: {
	name: string;
	plan: string;
	status: "running" | "provisioning";
	ip: string | null;
	price: string;
	highlight?: boolean;
}) {
	return (
		<div
			className={cn(
				"grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3",
				highlight && "bg-signal/[0.04]",
			)}
		>
			<div className="min-w-0">
				<p className="truncate font-medium">{name}</p>
				<p className="truncate font-mono text-[10.5px] text-muted-foreground">
					{plan}
				</p>
			</div>
			<div className="text-right font-mono text-[11px]">
				<p className="inline-flex items-center gap-1.5">
					<StatusDot status={status} />
					{status}
				</p>
				<p className="text-muted-foreground">
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={ip ?? "none"}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						>
							{ip ?? "assigning…"}
						</motion.span>
					</AnimatePresence>{" "}
					· {price}/h
				</p>
			</div>
		</div>
	);
}
