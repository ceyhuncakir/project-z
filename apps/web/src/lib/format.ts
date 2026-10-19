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
