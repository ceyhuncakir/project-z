import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	head: () => ({ meta: [{ title: "Sign in — HessianLabs" }] }),
	component: () => (
		<AuthForm mode="signin" redirect={Route.useSearch().redirect} />
	),
});
