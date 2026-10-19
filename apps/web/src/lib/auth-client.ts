import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ENV } from "../env";

export const authClient = createAuthClient({
	baseURL: ENV.VITE_SERVER_URL,
	// The sign-in form sends people to /two-factor itself, keeping their redirect.
	plugins: [twoFactorClient()],
});
