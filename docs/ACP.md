# Agent Client Protocol (`amc acp`)

`amc acp` serves the [Agent Client Protocol](https://agentclientprotocol.com/) over stdio for editors such as Zed and
JetBrains, and is the transport under the TypeScript and Python SDKs and Studio native tasks. Every session it opens is
a signed, hash-chained AMC session: what the editor sees is projected from committed rows, never from the raw provider
stream. This page lists what the server implements in the current source build, what it refuses and why.

Schema: the vendored `@agentclientprotocol/sdk` 0.18.0 schema (`vendor/acp-schema`), against which every inbound frame
is validated. Outbound frames are checked against the same schema in tests.

## Methods

| Method | Status | Notes |
|---|---|---|
| `initialize` | implemented | `authMethods: []`: the workspace and agent are fixed by whoever spawned the process |
| `authenticate` | implemented | a no-op, honestly |
| `session/new` | implemented | `cwd` must be the launch workspace; `mcpServers` must be empty (reviewed `--mcp-config` grants are process-bound); `additionalDirectories` unsupported |
| `session/load` | implemented | verified resume; history replayed as `user_message_chunk` / `agent_message_chunk` / tool updates |
| `session/fork` | implemented when the runtime can inherit verified context (`sessionCapabilities.fork`) | `_amc/session/fork` is the lineage-only CLI fork |
| `session/prompt` | implemented | text, images and audio as the route supports; `stopReason` per the ACP table plus `_meta["dev.agentmaturity.amc"]` with the execution phases |
| `session/cancel` | implemented | a signed `loop/cancel` with cause `user` |
| `session/request_permission` (agent → client) | implemented | see below |
| `session/set_mode`, `session/set_config_option`, `session/list`, `session/resume`, `session/close` | not implemented | `-32601`. No stub returns success for something the server does not do. `session/list` is deferred until it can be agent-scoped, bounded and honest about truncation |
| client `fs/*`, `terminal/*` | never called | AMC runs its own governed tools under the signed allowlist and OS sandbox; delegating edits or commands to the editor would bypass the tool pipeline |
| `_amc/session/release`, `_amc/session/events`, `_amc/session/withdraw`, `_amc/session/mcp`, `_amc/ask_user` | AMC extensions | release a writer, paged authenticated history, withdraw a queued submission, MCP status, `ask_user` to the client (`--ask-user`) |

## `session/update` kinds

| Kind | Source |
|---|---|
| `agent_message_chunk` | each committed assistant text block (block-sized, when committed: there is no token stream over ACP by design, see `src/acp/acpProjection.ts`) |
| `agent_thought_chunk` | each committed `thinking` block |
| `user_message_chunk` | history replay only |
| `tool_call` | the committed `tool/call` row: `title` (tool name), `kind` (`fs.read` → `read`, `fs.edit`/`fs.write` → `edit`, `bash` → `execute`, `glob`/`grep`/`tool_search` → `search`, `web_fetch`/`web_search` → `fetch`, `todo` → `think`, anything else `other`), `locations` for fs tools from the frozen `path` argument, resolved to an absolute path inside the session workspace (an argument that escapes it is not announced), `status: "pending"`. No `rawInput`: complete arguments can exceed a frame and the row's digest already binds them |
| `tool_call_update` | the committed result: `completed` or `failed`, the recorded text as content. `fs.edit`/`fs.write` results carry the recorded, bounded, secret-redacted unified diff as text. No `{type: "diff"}` block: ACP's Diff needs the file's full new text, which the ledger never records |
| `plan` | the signed current plan (`todo`), only for clients that negotiated `currentPlanUpdates` |
| `available_commands_update` | after `session/new`, `session/load` and `session/fork`: the workspace skills (`/name`), from the same roots an ACP prompt resolves (the workspace's; `--credentials-home` skills are not offered or resolvable under ACP). Skills only: `amc acp` loads no native extensions |

## Permission requests

With `--approve-tools <class>`, every tool call raises a signed approval request through the approvals engine. The
server flushes the committed tail (so the `tool_call` being decided has reached the client), then sends
`session/request_permission` whose `toolCall.toolCallId` is that committed tool call's id, with the raised request's
identity in `_meta["dev.agentmaturity.amc"]` (`approvalRequestId`, `requestDigestSha256`, `actionClass`, `riskTier`,
`boundHashes`, `expiresAt`) and these options:

- `reject_once` (always): cancels the turn, cause `user`, by `acp-client`. The request stays in the inbox.
- `allow_once` (only with `--reviewer-session-token-file <path>`): the operator pinned an active tracked workspace login
  (a private 0600 file) at launch. Selecting it re-checks the inbox item's integrity, that it is still `PENDING` with the
  digest the client was shown, that the login's roles may decide it, then records the decision through
  `amc approvals approve --expect-request-digest ...` under that login. The approval gate continues as soon as its own
  engine poll sees the recorded decision; the server's read-back afterwards only confirms, after the fact, that a
  decision by that login with the shown digest exists. It cancels the turn when none exists, and also when the decision
  was recorded but the approve command did not complete cleanly (for example lifecycle delivery failed); the log line
  says which of the two happened, and no retry is sent. The reason is never invented: the client supplies one in
  `_meta["dev.agentmaturity.amc"].reason` on its response, or the operator fixed one with `--reviewer-reason <text>`;
  with neither, the turn is cancelled.

The request is bound to the prompt that raised it: a late answer cancels that prompt or nothing, never a later prompt
on the session. The server stops waiting on an outstanding request when its prompt ends, when the approval expires,
and when the approval is decided elsewhere (for example with `amc approvals approve` or `deny`; the server re-reads
the request about once a second). It then sends `$/cancel_request` for it, so a client that implements that
notification (unstable in ACP 0.18, and a client may ignore it) closes the dialog, and it ignores any later answer. An
`allow_once` that lands after the approval was decided elsewhere records nothing and cancels nothing; a `reject_once`
still cancels the prompt that raised it, because cancelling is the safe side. When the committed tail cannot be
delivered before a request (a row that does not authenticate, or the output bound), no request is sent: the session is
unusable, and its prompt's poll disposes the turn.

Client text never grants authority on its own: the client only chooses between options this process offered, and the
engine's quorum and role rules apply unchanged. A client answer of `cancelled` is the client's own cancellation.
`initialize` advertises `permissionRequests: "amc-permission-v1"` when a gate is configured; a dead login is refused at
launch, not at the first approval.

## Negotiation with AMC's own clients

A client that identifies itself as an AMC SDK or Studio (it sends `clientCapabilities._meta["dev.agentmaturity.amc"]`)
receives only what it opted in to, because the shipped SDK clients treat unknown kinds and agent-to-client requests as
protocol errors:

| Opt-in | Enables |
|---|---|
| `currentPlanUpdates: "amc-current-plan-v1"` | `plan` |
| `thoughtUpdates: "amc-thought-updates-v1"` | `agent_thought_chunk` |
| `availableCommands: "amc-available-commands-v1"` | `available_commands_update` |
| `permissionRequests: "amc-permission-v1"` | `session/request_permission` |

A client without that metadata (Zed, JetBrains, any generic ACP client) gets thoughts, commands and permission
requests without negotiation. The current TypeScript and Python SDKs opt in to plans only, so approvals under the SDKs
still wait in the inbox for `approve()` / `pending_approvals()`.

## Editor setup

Zed (`settings.json`):

```json
{
  "agent_servers": {
    "AMC": {
      "command": "amc",
      "args": ["acp", "--provider", "anthropic", "--model", "claude-sonnet-4-5", "--credential", "anthropic-api-key",
               "--tools", "workspace", "--approve-tools", "WRITE_LOW",
               "--reviewer-session-token-file", ".amc/private/reviewer-session.txt",
               "--reviewer-reason", "approved in Zed by the signed-in reviewer"]
    }
  }
}
```

Start it in the workspace root (`cwd` must equal the launch workspace). The same `amc acp` command and arguments go
into JetBrains' ACP agent configuration. The stub provider (`--provider stub`) needs no credential and runs no model.

## Limits

- Block-sized text, when committed; no token streaming over ACP (see above).
- One frame is bounded at 900,000 bytes and one turn at 8 MiB of updates; over that the session is marked unusable
  and the turn cancelled rather than shortened.
- Schema 0.18.0 is vendored; newer spec shapes (`session/set_mode`, config options) exist in it but are not implemented.
- The ACP stream is not a verification verdict: `amc agent-loop verify <sessionId>` is.
