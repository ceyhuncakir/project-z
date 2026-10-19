import { type MotionValue, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Drives a scripted scene. Returns elapsed time quantised to 50 ms (so scenes
 * re-render ~20×/s) plus a per-frame progress MotionValue for progress bars.
 * Time only advances while `playing`; `onDone` fires once per run.
 */
export function useSceneClock(
	duration: number,
	playing: boolean,
	runKey: string | number,
	onDone: () => void,
): { t: number; progress: MotionValue<number> } {
	const [t, setT] = useState(0);
	const progress = useMotionValue(0);
	const elapsed = useRef(0);
	const done = useRef(onDone);
	done.current = onDone;

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on every new run
	useEffect(() => {
		elapsed.current = 0;
		setT(0);
		progress.set(0);
	}, [runKey, progress]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart the loop on every new run
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			elapsed.current += now - last;
			last = now;
			progress.set(Math.min(1, elapsed.current / duration));
			const quantised = Math.floor(elapsed.current / 50) * 50;
			setT((prev) => (prev === quantised ? prev : quantised));
			if (elapsed.current >= duration) {
				done.current();
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration, runKey, progress]);

	return { t, progress };
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 0→1 over [start, start + length]. */
export const phase = (t: number, start: number, length: number) =>
	clamp01((t - start) / length);

/** Characters of `text` revealed by `t`, typing from `start` at `cps` chars/sec. */
export const typed = (text: string, t: number, start: number, cps = 45) =>
	text.slice(0, Math.max(0, Math.floor(((t - start) / 1000) * cps)));
