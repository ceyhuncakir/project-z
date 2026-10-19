import { cn } from "@switchyard/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { site } from "@/lib/site";

/** A track that splits in two, with a signal lamp: routing, literally. */
export function LogoMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.25"
			strokeLinecap="square"
			className={cn("size-5", className)}
			aria-hidden="true"
		>
			<path d="M7 23V13.5L15.5 5" />
			<path d="M7 13.5V1" />
			<rect
				x="17"
				y="0.5"
				width="6"
				height="6"
				fill="var(--signal)"
				stroke="none"
			/>
		</svg>
	);
}

export function Logo({
	className,
	to = "/",
	href,
}: {
	className?: string;
	to?: string;
	/** Another site, such as the public website. */
	href?: string;
}) {
	const classes = cn(
		"inline-flex items-center gap-2 font-medium tracking-tight",
		className,
	);
	const content = (
		<>
			<LogoMark />
			<span className="text-[15px]">{site.name.toLowerCase()}</span>
		</>
	);
	return href ? (
		<a href={href} className={classes}>
			{content}
		</a>
	) : (
		<Link to={to} className={classes}>
			{content}
		</Link>
	);
}
