# AppRun shared-runtime notes

This document describes the AppRun-style deployment option for the member assistant.

## Runtime configuration

- Put `OPENAI_API_KEY` in the AppRun secret store.
- Set `KINBAN_MCP_URL` to the KINBAN MCP HTTPS endpoint.
- Set `AGENT_ALLOWED_ORIGIN` to the production KINBAN origin.
- Set `KINBAN_AGENT_RUNTIME_URL` in KINBAN to the AppRun HTTPS URL.
- A fixed manager key is not required for the member handoff path. KINBAN issues a short-lived member context.
- Keep direct runtime access blocked unless an HttpOnly runtime session exists.

## Scale-to-zero behavior

The recommended trial shape is minimum scale 0 and maximum scale 1. KINBAN opens the runtime, waits for `/health` for up to about one minute, and then creates a one-time opaque handoff code. The code expires after 120 seconds and is consumed once. The runtime session is short-lived.

In-memory sessions and unused handoff codes may disappear when AppRun restarts. This is intentional: reopen the assistant from KINBAN after a restart. Business data remains in KINBAN; do not put a permanent business database in the runtime container.

Configure an AppRun request timeout around 120 seconds. OpenAI usage is recorded with execution time, user category, model, success/failure, input/output token counts, and `pricingProfileId`. Pricing is updated through `pricing_profiles.json`, not hard-coded in the request handler.

## Security boundaries

Never put `OPENAI_API_KEY`, KINBAN delegation tokens, or MCP keys in a URL, browser storage, or logs. The handoff URL contains only the opaque one-time code. A runtime without a valid session must not execute MCP operations.
