# KINBAN connection pack

This folder is a project-local MCP connection pack for the KINBAN group named in `connection.env`.

- Open this extracted folder as the project root.
- Claude Code uses `.mcp.json`; Codex uses `.codex/config.toml`.
- Both configurations start `scripts/mcp-http-bridge.mjs`, which reads `connection.env` and forwards MCP JSON-RPC requests to the configured KINBAN URL.
- Treat `connection.env` as a secret. Never commit it, paste it into chat, or copy it into a global environment or unrelated project.
- Before any write, confirm the group, target, period, current status, and warnings.
