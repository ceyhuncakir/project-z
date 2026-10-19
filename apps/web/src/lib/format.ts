export { formatUsd, microsToUsd } from "@switchyard/cloud/money";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(value: Date | string): string {
	const diff = (new Date(value).getTime() - Date.now()) / 1000;
	const abs = Math.abs(diff);
	if (abs < 45) return "just now";
	if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
	if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
	return rtf.format(Math.round(diff / 86_400), "day");
}

export function formatRunway(hours: number | null): string {
	if (hours === null) return "—";
	if (hours < 1) return `${Math.round(hours * 60)} min`;
	if (hours < 48) return `${hours.toFixed(1)} h`;
	return `${Math.floor(hours / 24)} days`;
}

export const flag = (country: string) =>
	country
		.toUpperCase()
		.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

/** "Firefox on Linux" from a user agent; API clients fall back to the raw string. */
export function describeAgent(ua?: string | null): string {
	if (!ua) return "Unknown device";
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /Firefox\//.test(ua)
			? "Firefox"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Safari\//.test(ua)
					? "Safari"
					: null;
	// iOS agents mention Mac OS X and Android ones mention Linux, so check those first.
	const os = /iPhone|iPad/.test(ua)
		? "iOS"
		: /Android/.test(ua)
			? "Android"
			: /Mac OS X/.test(ua)
				? "macOS"
				: /Windows/.test(ua)
					? "Windows"
					: /Linux/.test(ua)
						? "Linux"
						: null;
	if (browser && os) return `${browser} on ${os}`;
	return browser ?? os ?? ua.slice(0, 60);
}
