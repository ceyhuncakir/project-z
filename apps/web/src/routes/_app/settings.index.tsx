import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_app/settings/")({
	// Older email links point here; keep their ?error=… on the way through.
	validateSearch: z.object({ error: z.string().optional() }),
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/settings/profile", search, replace: true });
	},
});
