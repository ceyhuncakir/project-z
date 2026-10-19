import { ENV } from "../env";

export const API_URL = ENV.VITE_SERVER_URL.replace(/\/$/, "");
export const MCP_URL = `${API_URL}/mcp`;

/** The public website (landing page, catalog and docs) lives in its own repo. */
export const SITE_URL = ENV.VITE_SITE_URL.replace(/\/$/, "");
export const DOCS_URL = `${SITE_URL}/docs`;
