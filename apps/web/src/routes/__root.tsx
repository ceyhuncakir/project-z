import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { Toaster } from "@switchyard/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { site } from "@/lib/site";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: `${site.name} — ${site.tagline}` },
			{ name: "description", content: site.description },
			{ property: "og:title", content: `${site.name} — ${site.tagline}` },
			{ property: "og:description", content: site.description },
			{ name: "theme-color", content: "#F5F3EF" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],
	}),
	component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="min-h-svh">
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<Outlet />
					<Toaster position="bottom-right" />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
