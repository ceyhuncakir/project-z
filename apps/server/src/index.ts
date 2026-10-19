import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createMcpServer } from "@switchyard/api/mcp";
import { appRouter } from "@switchyard/api/routers/index";
import { verifyApiKey } from "@switchyard/api/services/api-keys";
import { startJobs } from "@switchyard/api/services/jobs";
import { handleStripeWebhook } from "@switchyard/api/services/payments";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { bearerToken, createContext } from "./context";
import { ENV } from "./env.server";
import { auth, services } from "./services";

const app = new Hono();

app.use(logger());

// The dashboard talks to /rpc and /api/auth with cookies.
const dashboardCors = cors({
	origin: ENV.CORS_ORIGIN,
	allowMethods: ["GET", "POST", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization"],
	credentials: true,
});
app.use("/rpc/*", dashboardCors);
app.use("/api/auth/*", dashboardCors);

// Agents and scripts use bearer API keys from anywhere.
const publicCors = cors({
	origin: "*",
	allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
	allowHeaders: [
		"Content-Type",
		"Authorization",
		"Mcp-Session-Id",
		"Mcp-Protocol-Version",
	],
	exposeHeaders: ["Mcp-Session-Id"],
});
app.use("/v1/*", publicCors);
app.use("/mcp", publicCors);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/**
 * MCP over Streamable HTTP, stateless: every request gets a fresh server
 * bound to the caller's API key, so the endpoint scales horizontally.
 */
app.all("/mcp", async (c) => {
	const token = bearerToken(c.req.header("authorization"));
	const key = token ? await verifyApiKey(services.db, token) : null;
	if (!key) {
		return c.json(
			{
				jsonrpc: "2.0",
				error: {
					code: -32001,
					message: "Missing or invalid API key. Create one at /keys.",
				},
				id: null,
			},
			401,
			{ "WWW-Authenticate": 'Bearer realm="hessianlabs"' },
		);
	}
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await createMcpServer(services, key).connect(transport);
	return transport.handleRequest(c.req.raw);
});

// Stripe needs the raw body to verify the signature.
app.post("/webhooks/stripe", async (c) => {
	if (!services.config.stripe) return c.text("payments disabled", 404);
	const result = await handleStripeWebhook(
		services,
		await c.req.text(),
		c.req.header("stripe-signature"),
	);
	return c.json(result, result.status);
});

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [onError((e) => console.error(e))],
});

const restHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			docsPath: "/docs",
			specPath: "/openapi.json",
			docsTitle: "HessianLabs API",
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				info: { title: "HessianLabs API", version: "1.0.0" },
				servers: [{ url: `${services.config.apiUrl}/v1` }],
				components: {
					securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
				},
				security: [{ apiKey: [] }],
				// Only document procedures that declare an explicit REST path.
				filter: ({ contract }) => Boolean(contract["~orpc"].route.path),
			},
		}),
	],
	interceptors: [onError((e) => console.error(e))],
});

app.use("/rpc/*", async (c, next) => {
	const { matched, response } = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: await createContext({ context: c }),
	});
	if (matched) return c.newResponse(response.body, response);
	await next();
});

app.use("/v1/*", async (c, next) => {
	const { matched, response } = await restHandler.handle(c.req.raw, {
		prefix: "/v1",
		context: await createContext({ context: c }),
	});
	if (matched) return c.newResponse(response.body, response);
	await next();
});

app.get("/", (c) =>
	c.json({ name: "hessianlabs", mcp: "/mcp", api: "/v1", docs: "/v1/docs" }),
);

// Billing and provisioning loops. Guarded so `bun --hot` reloads don't stack intervals.
const g = globalThis as { __stopJobs?: () => void };
g.__stopJobs?.();
if (ENV.NODE_ENV !== "test") g.__stopJobs = startJobs(services);

export default {
	port: 3000,
	fetch: app.fetch,
	// get_server can wait up to two minutes for a server to boot.
	idleTimeout: 180,
};
