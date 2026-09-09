# Run native AMC tasks in Studio

Open **Native Tasks** from Studio Home. Select an agent, check setup, choose a provider and enter a task. AMC runs the task through its own native model loop and records the conversation in its evidence ledger. No DSH or Pi installation is required.

Choose **Local recording demonstration** to try the workflow without credentials or a provider charge. This exercises recording and task controls; it does not produce a real model answer. Demo sessions can use this mode with no tools. Sign in as an authorized operator to use a real provider or workspace tools.

## Connect a model

Configure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` on the Studio host using the masked `amc credentials set` prompt or the server environment. Do not enter a secret into the task prompt. The page displays configuration metadata, never the credential value. Studio native tasks use the server environment and managed credential store; they exclude both project and user `.env` files.

Select OpenAI Chat Completions, OpenAI Responses, or Anthropic, and supply a model ID your account can access. Checking setup makes no provider request and does not prove that a credential works. Submitting a real task can incur provider charges. Browser requests cannot override provider origins, the native process command, environment variables or credential paths. For explicit operator-controlled custom provider origins, use the [native CLI workflow](NATIVE_AGENT_WORKFLOW.md).

The selected agent remains attached to the task after creation. Its tools and approvals do not follow later changes to Studio's default agent. Another user or agent cannot adopt the task by knowing its ID.

## Choose what the task may access

**No tools** lets the model use the prompt and its recorded conversation. It cannot inspect your project. **Workspace tools** shows the actual signed tool scope: paths, denied paths, hosts, commands and any native Linux sandbox writable directories. AMC pins the displayed configuration digest when admitting the task. A changed scope requires a new task after review; an existing task cannot silently acquire new grants.

Workspace tools require valid signed configuration and an approval policy with a nonzero quorum for high-impact writes. A task's pending approval links open the existing approval inbox, where authorized reviewers see the real request and its digest. Task output cannot approve itself. Existing roles, distinct-reviewer rules and quorum remain in force. Merely displaying an approval card does not authorize an effect.

The browser cannot create grants, change budgets, load arbitrary plugins or install MCP servers. Native CLI and SDK configuration remain available to operators for those capabilities. See [native shell confinement](NATIVE_SANDBOX_UBUNTU.md) before enabling shell execution.

You can use a read-only workspace policy for repository review. The native runtime accepts a signed subset such as `fs.read`, `glob` and `grep` with matching `READ_ONLY` action classes; editing and shell tools need not be granted. **Check setup** shows the supported tools from the signed policy, and explicitly identifies a read-only subset. Studio still requires its configured approval quorum for each workspace tool call. To change an existing policy, review its entries and path restrictions on the host, then use `amc tools sign`; resetting all tool defaults is unnecessary.

## Select public validation checks

An operator can make named checks available through `AMC_NATIVE_VALIDATION_CONFIG`, pointing to an explicit host JSON file. Programmatic Studio service composition can set `validationConfig` instead. Use the [native public-check configuration](NATIVE_AGENT_WORKFLOW.md#public-task-validation): schema version 1, one through eight checks, each with an ID, public title, command and bounded timeout. This configuration is operator input, not model-generated instructions or a hidden benchmark oracle. Its file path and commands are not returned to the browser.

After **Check setup**, select the checks you want before starting a task. None are selected automatically. Checks require signed workspace `bash`, the existing approval quorum and a signed tool-scope digest. Demo and no-tools tasks cannot select them. Check selection creates no tool grant, and checks use the same policy, budget, sandbox and approval pipeline as native tool execution. They run sequentially after a normally completed model turn, without an automatic repair loop. A check's timeout cannot extend Studio's two-minute turn deadline.

Studio pins the exact configuration-file digest and ordered check IDs in the signed task descriptor. Every follow-up and resume keeps that selection; a changed or unavailable configuration requires a new reviewed task. The browser accepts IDs and the displayed digest, never commands, config paths or environment overrides. Existing tasks created without validation retain **Not requested**, including after restart.

The **Public validation** panel reports **Not requested**, **Pending**, **Selected checks passed**, **Selected checks failed** or **Validation unavailable** independently of model completion and evidence verification. It shows each check's title, actual exit code when known, timeout and recorded reason. A model ending `complete` can still have failed checks. Denied, canceled, timed-out, missing or unauthenticated check results never become a pass; an earlier turn's pass is not reused while a new admission awaits evidence.

Open **View check output** for the exact authenticated check-result payload. AMC checks its complete bytes against the signed digest before decoding or redacting the display. Displayed output is escaped, secret-redacted and capped at 16 KiB per check; shortened output is labeled. Pruned, unreadable, non-text, mismatched or over-2-MiB payloads are withheld with an explicit message and event reference. The displayed digest identifies original payload bytes, not redacted text. Use runtime records for evidence beyond this display bound. Passing the selected public checks establishes only their assertions, not general coding quality or full task correctness.

## Continue, cancel and recover

| Control | What happens |
|---|---|
| Run task / Send follow-up | Records one admission, then executes one bounded native turn. The task must be idle for a follow-up. |
| Cancel | Requests cancellation of the currently displayed revision. Inspect the ending reason; a canceled task is not a successful result. |
| Release | Releases an idle native writer while retaining an eligible session for later continuation. |
| Resume | Reopens your signed, unsealed session under the same agent and scope. It never replays an uncertain prompt automatically. |
| Close and verify | Seals an idle session and checks native evidence. A sealed session cannot resume. |
| Verify evidence | Checks released/closed evidence without creating a new model turn. Other open ledger writers can prevent complete verification. |
| Archive closed task | Removes an eligible closed task from the current list while retaining its signed descriptor, request identities and native evidence. Active, uncertain or unsealed tasks cannot be archived. |
| Show archived tasks | Includes retained archived tasks in the list for inspection. Archiving does not make a sealed session resumable. |
| Refresh status | Reconciles the displayed state after a disconnected or uncertain request, without resubmitting it. |
| Retry original submission | After a successful status refresh leaves admission unconfirmed, explicitly resends the original request and identity. Edited draft text is preserved for a later submission. |

The activity view displays authenticated, committed updates. It does not provide provisional token previews. Task ending reasons and evidence verification are separate: recorded output does not prove task success, and workspace-key consistency is not an external trust anchor.

If a request loses its response, keep the draft and refresh status. The browser retains its request ID and does not automatically submit a replacement. A conflicting request ID or stale revision produces a conflict response. After a Studio restart, eligible tasks appear released; resume explicitly before submitting a new turn. Uncertain prior admissions are flagged rather than replayed.

When a successful refresh still cannot confirm the request, **Retry original submission** becomes available. It resends the original task or follow-up, including its original choices and revision, using the same request ID. An already admitted request returns its existing task without running another turn. A request that never arrived can then be admitted normally. A later edit in the draft is never included in this retry, and remains after acknowledgement. Repeated network failures require another refresh and explicit retry; an unreadable response or server error remains unconfirmed.

Retry stays bound to the original agent, workspace and sign-in. It cannot move a task into another account or acquire changed grants. The pending request lives only in the current page; no prompt or credential is saved to browser storage. Keep the page open while resolving an uncertain admission. Reloading discards its in-memory request and draft; first inspect your task list before making a replacement submission.

A refused retry does not prove the original request failed. A sign-in, ownership, rate-limit or policy refusal can happen before Studio looks up the earlier admission. The page therefore keeps that request unconfirmed, preserves your draft and requires another successful refresh before an explicit retry. A failed setup refresh also leaves **Refresh status** available so a temporary outage cannot strand the pending request.

Resume checks the signed native session and recorded ledger prefix even while Studio's unrelated gateway session is still open. It does not classify that incomplete archive as fully verified. Existing signatures, present seals, native identity and writer ownership remain admission requirements; complete cold verification remains a separate operation.

## Capacity and retention

Studio admits at most four active native tasks per workspace, one turn per task, eight steps and 1,024 output tokens per turn. The page can reduce those step/token limits. A turn times out after two minutes; idle native writers release after 15 minutes, and a live task process is limited to one hour. Prompts are limited to 16 KiB UTF-8.

The service retains at most 512 displayed events and 2 MiB of event text, 32 admitted submissions per task and 256 unarchived task descriptors. The browser labels a partial transcript when earlier updates are missing. Display retention does not replace or weaken the native evidence verifier. Reaching capacity refuses new admissions; it does not silently delete signed history.

Use **Close and verify**, then **Archive closed task** to free a current-history slot. Archival authenticates the sealed native history and keeps the signed descriptor and every admitted request identity. It does not delete evidence, change a verification verdict, replay a turn or make the closed session resumable. Active operations, uncertain admissions, unsealed sessions and untrusted history must be resolved before archival. Choose **Show archived tasks** to inspect retained history. A damaged archived descriptor still causes a trust refusal; hiding it from the current list does not bypass authentication. History lookup and duplicate detection scan retained signed descriptors, so their cost grows with the archive.

## API clients and hosted workspaces

The typed API is `/api/v1/native-tasks`; Studio's `/openapi.yaml` reference documents options, listing, committed updates, submissions and revision-bound controls. See [API surfaces](API_SURFACES.md) for the public reference. Responses use `{ok: true, data: ...}` and `Cache-Control: no-store`. A `202` means admission or cancellation was recorded, not that a task succeeded.

Options includes the public `validation` catalogue. Creation may include `validation: {configSha256, checkIds}`; follow-up and control requests cannot change it. Task views expose `validationSelection`, the authenticated `validation` result and bounded `validationOutputs` separately. An absent selection is not an empty passing check set.

`POST /api/v1/native-tasks/:taskId/archive?agentId=...` accepts only `{expectedRevision}` through the same owner, origin and CSRF controls as other mutations. `GET /api/v1/native-tasks?agentId=...&includeArchived=true` includes archived tasks; omitting the flag or using `false` returns the current list. Task views expose `archived` separately from the closed lifecycle state. Exact previously admitted submissions still resolve to their retained task without executing again, including after a Studio restart.

Mutations require `x-amc-native-intent: task-workspace-v1`. Human session-cookie clients must also send `x-amc-native-csrf` from the options response or `/auth/me`, plus an `Origin` matching the configured browser origin and request host. Keep the proof out of URLs. Bootstrap admin-token clients may omit Origin and CSRF, but must send the intent header; supplied origins are still validated. Agent tokens and leases cannot act as human task owners.

The same intent, origin and CSRF requirements protect the approval decision/cancellation aliases: `/approvals/:id/approve`, `/approvals/:id/deny`, `/approvals/requests/:id/decide` and `/approvals/requests/:id/cancel`. Existing Studio UI clients attach this proof automatically; custom cookie clients must update before using these mutations. Local demo sessions cannot approve, execute commands or modify policy.

Hosted workspaces preserve the selected agent and event cursor through their workspace URL prefix. Native task admission uses the authenticated workspace membership and public browser origin. Workspace startup is shared across concurrent requests, and shutdown drains any accepted startup and its native task processes.

## Authenticated history and reconnect boundaries

Task responses include `history.status`, the selected `history.backend`, an
authenticated session head and event count when available, and
`resumeBlockedReason`. These describe actual persisted session metadata, not
private retained-output access or a task-success verdict. An unavailable history
has no authenticated head: its zero count means unknown, not a verified empty log.
The browser withholds the previous transcript, validation outputs and verification
badge when authentication fails. A prior verification also expires when the
observed store head changes; restore evidence and explicitly verify a new snapshot.

Eligible JSONL sessions display **Session ready to resume** or **Interrupted
session · recovery available**, with **Resume** available to their authenticated
operator. Recovery preserves the original session and history. It acknowledges
unfinished work as interrupted or unknown, does not rerun previous effects, and
waits for a new explicit turn. Task responses expose `recovery.eligible`,
`recovery.state` and a public `recovery.message`; these are readiness information,
not a completed recovery or an ownership grant.

A live or unknown writer, incomplete history, missing original accounting,
incompatible state or lost parent controller leaves the session cold-only with an
actionable refusal. Resume requires the original execution settings and signed
controls; closed and archived sessions remain non-resumable. JSONL permits one
writer in a workspace, even when the general Studio task limit would allow more.
The actual core rechecks exclusive ownership and authenticated history before
opening its writer. SQLite keeps its existing native continuation rules. See the
[native recovery contract](SESSION_RESUME.md) for local-filesystem limits and the
difference between an interrupted turn, a released turn and a closed session.

After a network or control-response failure, the page requires **Refresh status**
before another action. It clears previously displayed activity and labels the
current evidence/validation status unconfirmed; reconnect never resubmits a
prompt or grants an approval. A successful refresh reloads authenticated activity
from cursor zero. Identical admitted-request retries retain their original ID,
body and revision; changed-body retries and stale controls remain refusals.

Every native route accepts each supported query parameter only once. Options and
controls accept only `agentId`; task reads also accept `cursor`; listing also
accepts `includeArchived`. Creation accepts no query options (its identity and
choices are in its strict body). Unknown or repeated query fields are rejected
before service dispatch. Follow-up revisions must be integers from 1 through 32.
Monitor-fingerprint verification means the configured pin matched; its independent
origin must be established by the operator, not inferred from the rendered label.
