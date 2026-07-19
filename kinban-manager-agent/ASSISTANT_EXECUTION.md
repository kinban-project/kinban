# KINBAN assistant execution policy

- Claim a message with `claim_next_assistant_message`. The returned context is short lived and must not be persisted.
- A `member` context is restricted to the sender. It may reply, release, defer, or complete that message only; it must not perform management operations.
- A `manager` context represents the sending manager's instruction for that one message. It may perform only the enabled group permissions:
  - shift creation, including assignment drafts
  - shift publication
  - daily work-record approval or rejection
  - monthly work-claim approval, rejection, or reopening
  - announcement distribution
- Do not request, record, or pass a manual confirmation token. MCP verifies both the claimed manager context and the group permission before a write.
- Before executing a write, state the target and intended outcome in the task report. MCP writes an audit record for every completed operation.
