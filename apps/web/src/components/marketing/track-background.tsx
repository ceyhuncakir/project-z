import { motion } from "motion/react";

/**
 * Rails that converge into a junction and fan back out — a switchyard seen
 * from above. Signal-coloured dots travel the tracks. Decorative only.
 */
const LEFT = [70, 150, 230, 310, 390, 470];
const RIGHT = [40, 130, 220, 310, 400, 490];
const tracks = LEFT.map(
	(yl, i) =>
		`M-20 ${yl} C 260 ${yl}, 380 270, 600 270 S 940 ${RIGHT[i]}, 1220 ${RIGHT[i]}`,
);

const TRAINS = [
	{ track: 0, dur: 9, begin: 0 },
	{ track: 2, dur: 11, begin: 2.5 },
	{ track: 3, dur: 8, begin: 5 },
	{ track: 5, dur: 12, begin: 1.2 },
	{ track: 1, dur: 10, begin: 6.5 },
];

export function TrackBackground() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 1200 540"
			preserveAspectRatio="xMidYMid slice"
			className="pointer-events-none absolute inset-0 hidden h-full w-full [mask-image:radial-gradient(ellipse_38%_42%_at_50%_44%,transparent_45%,black_95%)] sm:block"
		>
			<g fill="none" stroke="var(--border)" strokeLinecap="round">
				{tracks.map((d, i) => (
					<g key={d}>
						{/* sleepers */}
						<motion.path
							d={d}
							strokeWidth="7"
							strokeDasharray="1.5 13"
							opacity={0.55}
							initial={{ pathLength: 0 }}
							animate={{ pathLength: 1 }}
							transition={{ duration: 1.6, delay: 0.1 * i, ease: "easeOut" }}
						/>
						{/* rail */}
						<motion.path
							d={d}
							strokeWidth="1.25"
							initial={{ pathLength: 0 }}
							animate={{ pathLength: 1 }}
							transition={{ duration: 1.6, delay: 0.1 * i, ease: "easeOut" }}
						/>
					</g>
				))}
			</g>
			{/* Hidden by CSS (not unmounted) under reduced motion, so SSR markup matches. */}
			<g className="motion-reduce:hidden">
				{TRAINS.map((t) => (
					<circle
						key={`${t.track}-${t.begin}`}
						r="3"
						fill="var(--signal)"
						opacity="0.85"
					>
						<animateMotion
							dur={`${t.dur}s`}
							begin={`${t.begin}s`}
							repeatCount="indefinite"
							path={tracks[t.track]}
							keyPoints="0;1"
							keyTimes="0;1"
							calcMode="spline"
							keySplines="0.45 0 0.55 1"
						/>
					</circle>
				))}
			</g>
		</svg>
	);
}
