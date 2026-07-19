# KINBAN assistant execution policy

- The group-bound assistant key may read the operational data of its own group. Do not use that access to disclose another member's private information in a reply.
- Claim a message with `claim_next_assistant_message` when processing the message queue. Use the returned `message.id` and `claimId` together to reply, release, defer, or complete that message; no short-lived context token is used.
- A manager message may authorise a write only while it is claimed, when its `message.id` is supplied as `sourceMessageId` together with that claim's `claimId`. MCP verifies that the sender is an active manager and that the group permission is enabled.
- A member message may not authorise management operations.
- A manager message may perform only the enabled group permissions:
  - shift creation, including assignment drafts
  - shift publication
  - daily work-record approval or rejection
  - monthly work-claim approval, rejection, or reopening
  - announcement distribution
- Do not request, record, or pass context or confirmation tokens. MCP verifies the source manager message and group permission before a write.
- Before executing a write, state the target and intended outcome in the task report. MCP writes an audit record for every completed operation.
