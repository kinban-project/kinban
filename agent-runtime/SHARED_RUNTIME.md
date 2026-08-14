# Shared KINBAN agent runtime

The runtime can serve two explicitly separated modes:

- `member`: a short-lived personal token and member-scoped MCP tools.
- `operations`: a short-lived operations token and manager-scoped MCP tools.

Both modes use the same runtime URL and process. The mode is carried in the
short-lived handoff payload, but authorization is never based on that payload
alone. The runtime calls KINBAN MCP during session establishment and requires
`personal` for member mode or `assistant` for operations mode. KINBAN then
revalidates the context, membership, assistant status, group, audience, expiry,
revocation, and scopes on every MCP request.

## Isolation policy

Sessions are keyed by an opaque HttpOnly cookie and kept in an in-memory map.
The session namespace includes mode, group, and a random value. Browser chat
history is submitted only by that browser session; the runtime does not keep a
shared conversation or filesystem workspace. Usage records include the mode,
group, and an opaque session scope, but never the raw token.

The operations UI is shown at the end of the manager menu only when the same
runtime URL is configured. If it is not configured, no assistant button is
rendered. The member assistant remains available separately for managers who
also use member functions.

High-impact operations in operations mode use a two-step confirmation. The
first request describes the target and impact without executing; a separate
confirmation is required before the runtime forwards the same operation with
`confirm: true`. Handoff requests validate the short-lived token and group
before entering the one-time queue, and are rate-limited per client.

## Local configuration

Set `KINBAN_AGENT_RUNTIME_URL` in the KINBAN app to the shared runtime URL.
The runtime itself needs `OPENAI_API_KEY`, `KINBAN_MCP_URL`, and either the
fixed compatibility key or the configured usage/delegation settings required
by the selected deployment. Do not put short-lived context tokens in URLs,
localStorage, logs, Git, or this document.
