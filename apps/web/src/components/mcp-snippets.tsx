import { CodeBlock, type CodeTab } from "./code-block";

export function mcpSnippets(
	mcpUrl: string,
	key = "hl_live_YOUR_KEY",
): CodeTab[] {
	return [
		{
			label: "Claude Code",
			code: `claude mcp add --transport http hessianlabs ${mcpUrl} \\\n  --header "Authorization: Bearer ${key}"`,
		},
		{
			label: "Cursor",
			hint: "~/.cursor/mcp.json",
			code: JSON.stringify(
				{
					mcpServers: {
						hessianlabs: {
							url: mcpUrl,
							headers: { Authorization: `Bearer ${key}` },
						},
					},
				},
				null,
				2,
			),
		},
		{
			label: "Codex",
			hint: "~/.codex/config.toml",
			code: `[mcp_servers.hessianlabs]\nurl = "${mcpUrl}"\nbearer_token_env_var = "HESSIANLABS_API_KEY"\n\n# then: export HESSIANLABS_API_KEY=${key}`,
		},
		{
			label: "VS Code",
			hint: ".vscode/mcp.json",
			code: JSON.stringify(
				{
					servers: {
						hessianlabs: {
							type: "http",
							url: mcpUrl,
							headers: { Authorization: `Bearer ${key}` },
						},
					},
				},
				null,
				2,
			),
		},
		{
			label: "Any client",
			code: `Transport:  Streamable HTTP\nURL:        ${mcpUrl}\nHeader:     Authorization: Bearer ${key}`,
		},
	];
}

export function McpSnippets({
	mcpUrl,
	apiKey,
	className,
}: {
	mcpUrl: string;
	apiKey?: string;
	className?: string;
}) {
	return <CodeBlock tabs={mcpSnippets(mcpUrl, apiKey)} className={className} />;
}
