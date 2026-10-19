import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app")({
	ssr: false,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		return { session: session.data };
	},
	component: () => (
		<AppShell>
			<Outlet />
		</AppShell>
	),
});
