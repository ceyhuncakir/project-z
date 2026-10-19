export const MICROS_PER_USD = 1_000_000;

export const usdToMicros = (usd: number) => Math.round(usd * MICROS_PER_USD);
export const microsToUsd = (micros: number) => micros / MICROS_PER_USD;

/** `$0.0123` for sub-cent amounts, `$12.34` otherwise. */
export function formatUsd(
	micros: number,
	opts: { precise?: boolean } = {},
): string {
	const usd = microsToUsd(micros);
	const abs = Math.abs(usd);
	const digits = opts.precise || (abs > 0 && abs < 0.1) ? 4 : 2;
	return `${usd < 0 ? "-" : ""}$${abs.toFixed(digits)}`;
}
