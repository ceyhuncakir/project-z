/**
 * Production server for the TanStack Start build. `vite build` emits a static
 * client bundle and an SSR fetch handler but no HTTP server, so this serves
 * files from dist/client and hands every other request to the SSR handler.
 *
 * Run it from apps/web so varlock finds that app's .env.schema.
 */
import { join } from "node:path";

import ssr from "../apps/web/dist/server/server.js";

const CLIENT_DIR = join(import.meta.dir, "../apps/web/dist/client");

// The bundle never changes at runtime, so index it once instead of touching
// the filesystem per request (which also rules out path traversal).
const files = new Set<string>();
for await (const path of new Bun.Glob("**/*").scan({ cwd: CLIENT_DIR })) {
	files.add(`/${path}`);
}

const server = Bun.serve({
	port: 3001,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (files.has(pathname)) {
			return new Response(Bun.file(join(CLIENT_DIR, pathname)), {
				// Vite fingerprints everything under /assets.
				headers: pathname.startsWith("/assets/")
					? { "Cache-Control": "public, max-age=31536000, immutable" }
					: undefined,
			});
		}
		return ssr.fetch(request);
	},
});

console.log(`web listening on ${server.url}`);
