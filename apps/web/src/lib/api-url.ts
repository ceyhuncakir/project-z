import { ENV } from "../env";

export const API_URL = ENV.VITE_SERVER_URL.replace(/\/$/, "");
export const MCP_URL = `${API_URL}/mcp`;
