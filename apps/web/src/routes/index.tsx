import { createFileRoute, redirect } from "@tanstack/react-router";

// The landing page lives in its own repo now (hessianlabs-ai/landing).
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard" });
	},
});
