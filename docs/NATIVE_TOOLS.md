# Native tools: web fetch, web search, ask-user, todo and plan

Linear: AMC-1549. Source: `src/tools/builtin/{webFetchTool,webSearchTool,askUserTool,todoTool,planTool}.ts`
and `src/tools/builtin/nativeToolBreadth/`.

> **Status: implemented, not yet registered.** These five tools exist and are tested,
> but no agent can call them yet. `src/agent/nativeToolCapabilities.ts` and
> `src/agent/agentToolset.ts` do not register them. The registration diff is in
> `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/wiring.diff`,
> and the track report explains it. Until someone applies it, the tools cannot be reached.

Each tool refuses unless a signed policy or a composed dependency explicitly
permits the call. Registering a tool does not grant it. After registration, a
call still has to pass the full guard stack: prompt-injection, runtime firewall,
budgets, network egress, the signed tool allowlist and native-tool identity.
After that, the tool's own body applies the checks described below.

## Tools

| Tool | Action class | Refuses when |
| --- | --- | --- |
| `web_fetch` | `NETWORK_EXTERNAL` | The signed policy does not list it or cannot be verified. The URL's exact origin is not allowlisted. The URL carries credentials or a secret-looking value. The response is a redirect. The body exceeds the cap. The receipt cannot be recorded. |
| `web_search` | `NETWORK_EXTERNAL` | No provider is configured (there is no default). The signed policy does not list it. A provider request goes to an origin that is not allowlisted, or that differs from the provider's declared `origin`. The provider makes more than 3 requests. Together the requests exceed the cap. |
| `ask_user` | `READ_ONLY` | No answerer is composed. The answerer returns nothing, throws, or times out. The answer is not signed with the workspace **auditor** key. The answer is bound to a different question or session. The answer is not one of the offered choices. |
| `todo` | `READ_ONLY` | The existing record fails signature verification. The existing record is bound to another session or agent. The session id is unsafe. |
| `plan` | `READ_ONLY` | Same as `todo`. Plan records have their own record kind and file. |

`todo`, `plan` and `ask_user` are classed `READ_ONLY` because they change
nothing in the workspace or outside it. They only write AMC's own signed session
records. Each one still has to be listed in the signed tools policy.

## Granting them (signed `.amc/tools.yaml`)

The shipped default policy does not list any of these tools, so they stay denied.
To grant them, an operator adds entries like these and runs `amc tools sign`:

```yaml
- name: web_fetch
  actionClass: NETWORK_EXTERNAL
  allow:
    hostAllowlist:
      - eur-lex.europa.eu          # bare host: https://eur-lex.europa.eu on port 443 only
  maxBytes: 1000000                 # optional; clamped to 5000000
- name: web_search
  actionClass: NETWORK_EXTERNAL
  allow:
    hostAllowlist: [search.example.org]
- name: ask_user
  actionClass: READ_ONLY
- name: todo
  actionClass: READ_ONLY
- name: plan
  actionClass: READ_ONLY
```

How the web tools read `hostAllowlist` entries (`nativeToolBreadth/originPolicy.ts`):

- **Bare hostname** (`docs.example.org`): grants exactly `https://docs.example.org`.
  It does not grant subdomains, plain `http` or other ports.
- **Explicit origin** (`http://127.0.0.1:8080`): grants exactly that scheme, host and port.
- Any other entry is ignored and never widens the grant. That covers paths,
  wildcards, credentials and query strings.
- **An empty list grants nothing.** The existing `networkEgressGuard` treats an
  empty list as "any host". `tests/webFetchTool.test.ts` proves this, and it is
  why the tool body runs its own check.

The composed `networkEgressGuard` and the tool-allowlist guard compare the
**hostname** against the same list. So an explicit-origin entry also passes those
guards only if its bare host is listed too. The guards and the body check
intersect. Neither can widen the other.

## Fetch behaviour

- The tools use Node's built-in `fetch` and add no dependency.
- Requests are `GET` only, with a fixed `accept` header and user agent. The model
  cannot set headers, a body or cookies.
- Redirects are not followed, not even to an allowlisted origin.
- The cap is the smaller of the signed `maxBytes` (default 1 000 000, hard limit
  5 000 000) and an optional per-call `maxBytes`. Bytes are counted as they arrive.
  When the body passes the cap, the read is cancelled and the call refuses. The
  body is never truncated.
- Non-text content types are described rather than rendered.
- Output passes through `redactSecrets` (the shared P5.3 table). Each match becomes
  `[AMC_REDACTED:<type>]`.
- `SIMULATE` checks the policy and the URL, then stops before any request.

## Receipts

Composition supplies a required `record` callback. If recording the receipt fails,
the call fails before any content is returned.

- **`NATIVE_WEB_FETCH`** records the URL, origin, status, content type and byte
  count. It also records `contentSha256` (the body as received), `deliveredSha256`
  (what the model saw), redaction counts by type, a redacted excerpt of up to 512
  characters, the signed policy digest and a timestamp. It never stores the raw body.
- **`NATIVE_WEB_SEARCH`** records the provider id and a `querySha256`. For each
  request it records the origin, status, byte count and `contentSha256`. It also
  records the result count, `deliveredSha256`, redaction counts and the policy digest.
- The pipeline's own `audit`, `metric` and `stdout` rows (`toolEvidence.ts`) are
  still written for every call. Receipts add to them.

## Signed session records (todo, plan, ask-user)

- **Location:** `<workspace>/.amc/native-tools/<sessionId>/`, as `todo.json`,
  `plan.json` and `ask-user/<questionId>.{question,answer}.json`.
- **File contents:** each file holds `{ record, digestSha256, signature, signer }`.
  The digest is SHA-256 over the canonical JSON of `record`. Records the agent
  process writes are signed with the **monitor** key. An ask-user answer must be
  signed with the **auditor** key. That is the role approvals use, so an answer
  signed with the monitor key is refused.
- **Revisions:** `todo` and `plan` replace the whole list on each call. They chain
  `revision` and `previousSha256`. If the stored file has been edited outside the
  tool, the next call refuses instead of building on it. `readSessionTodo` and
  `readSessionPlan` verify the file before returning it.
- **Session id:** the session id may be a resolver function. `agentToolset`'s
  `sessionId` is a getter that a fork or resume rebinds after construction, so
  the tools read it on every call.
- **Studio:** no session event type exists for todo or plan, and `src/session/**`
  is outside this change. The records are therefore file-backed, and Studio does
  not render them yet.

## ask_user, precisely

1. The tool writes a question record signed with the monitor key. It then hands
   the answerer `{...question, questionSha256}` and an abort signal. The default
   timeout is 15 minutes, and the turn's signal also applies.
2. While the tool waits for the answerer, the agent loop is paused.
3. The human-facing surface, such as a CLI prompt or the Studio inbox, signs what
   the person typed with `signAskUserAnswer(workspace, question, answer, answeredBy)`.
   The tool never calls this function.
4. The tool returns the answer text only when the record verifies against the
   auditor key and binds this exact question id, digest and session.

**Boundary:** a valid signature proves the answer came through a holder of this
workspace's auditor key. That is the same trust the approvals store relies on.
It does not prove which human answered. `answeredBy` is recorded as the
surface's claim and is not verified.

## Not covered here

- **No answerer or provider yet:** no CLI or Studio answerer exists for
  `ask_user`, and no `web_search` provider ships. Until a caller passes `askUser`
  and `webSearchProvider` to `agentToolset`, both tools refuse, even after the
  wiring diff is applied.
- **Refusals are failures in evidence:** a refusal from a tool body is recorded
  as `TOOL_CALL_FAILED`, not `TOOL_CALL_DENIED`. The `ToolBody` contract has no
  denial channel. Guard denials stay `TOOL_CALL_DENIED`.
