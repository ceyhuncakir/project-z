import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/signup")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	head: () => ({ meta: [{ title: "Create account — HessianLabs" }] }),
	component: () => (
		<AuthForm mode="signup" redirect={Route.useSearch().redirect} />
	),
});
