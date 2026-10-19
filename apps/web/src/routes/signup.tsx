import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthForm, skipIfSignedIn } from "@/components/auth-form";

export const Route = createFileRoute("/signup")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	// The session lives in the browser; "Sign in" on the website lands here.
	ssr: false,
	beforeLoad: ({ search }) => skipIfSignedIn(search.redirect),
	head: () => ({ meta: [{ title: "Create account — HessianLabs" }] }),
	component: () => (
		<AuthForm mode="signup" redirect={Route.useSearch().redirect} />
	),
});
