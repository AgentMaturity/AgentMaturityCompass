# Execution API

One contract drives a governed native session from four surfaces: the CLI, the TypeScript SDK
(`agent-maturity-compass/sdk/native`), the Python wrapper (`amc_sdk`) and Studio (`/api/v1/native-tasks`). Each surface
has the same eight verbs with the same meaning, and each reports the same four execution phases. The contract lives in
`src/execution/executionContract.ts`; the TypeScript SDK re-exports its names.

`tests/executionApiParity.test.ts` runs one scripted scenario through all four surfaces and requires identical results.
The scenario uses the stub provider. The stub runs no model, so its results are synthetic demonstrations, never
real-model results.

## The eight verbs

| Verb | CLI | TypeScript SDK | Python `amc_sdk` | Studio |
|---|---|---|---|---|
| start | `amc agent-loop run` (also `chat`) | `AMCNativeClient.start`, then `newSession` | `AmcAgent(...)`, then `new_session` | `POST /api/v1/native-tasks` (admits the first turn) |
| stream | `--stream` (live text and progress on stderr) | iterate `AMCNativeTurn` | `Turn.iter_updates` | `GET /api/v1/native-tasks/{taskId}?cursor={n}` |
| approve | `amc approvals approve` (find IDs with `amc approvals list --status pending`) | `AMCNativeClient.approve`, `pendingApprovals` | `AmcAgent.approve`, `pending_approvals` | `POST /approvals/requests/{approvalRequestId}/decide` (IDs in the task view's `approvals`) |
| cancel | `--cancel-after <ms>` or Ctrl-C | `AMCNativeTurn.cancel` or an `AbortSignal` | `Turn.cancel`, `Session.cancel` | `POST /api/v1/native-tasks/{taskId}/cancel` |
| resume | `--session <id>` | `AMCNativeClient.resumeSession` | `AmcAgent.resume_session` | `POST /api/v1/native-tasks/{taskId}/resume` |
| fork | `--fork-from <id>` | `AMCNativeClient.forkSession` | `AmcAgent.fork_session` | `POST /api/v1/native-tasks/{taskId}/fork` |
| dispose | `--keep-open`, then the process exits | `AMCNativeClient.dispose` | `AmcAgent.dispose` | `POST /api/v1/native-tasks/{taskId}/release` |
| verify | `amc agent-loop verify <id>` | `AMCNativeClient.verifySession` (after `close`) | `AmcAgent.verify_session` (after `close`) | `POST /api/v1/native-tasks/{taskId}/verify` |

What each verb means on every surface:

- **start** opens a session under the governed runtime: the signed tool policy, the run lease when the active plan
  requires a principal (`PRINCIPAL_UNRESOLVED` is refused before any session row), and the session writer.
- **stream** delivers committed updates while a turn runs. The CLI's stream is provisional live text and progress
  lines; the recorded result is the outcome.
- **approve** records a reviewer's decision on a tool call's signed approval request through the signed approval
  engine, the same records every surface reads. The engine refuses the run's initiator where the action class needs
  distinct users, a request that is no longer pending, and a changed request when the decision binds its digest. The
  SDKs run the same installed CLI the session runs under. `approve` is not the A4 gate decision (P2-37), which has its
  own route and record.
- **cancel** requests a signed user cancellation of the turn in flight. A cancelled turn's model phase reads `failed`.
- **resume** continues the same session, verified before its writer is taken. A sealed session cannot resume; fork it.
- **fork** opens a new session whose signed `session/open` row names the parent's verified final row. The parent,
  sealed or live, is read and never written. The child starts with no inherited model context, its own run lease and
  its own limits. A parent that does not verify is refused with the same reason on every surface (`MISSING`,
  `TAMPERED`, ...): ACP error data `reason`, Studio code `NATIVE_FORK_<reason>`, and the CLI's error text.
- **dispose** releases each idle session writer (a resumable handoff), then stops the runtime process. It does not seal
  the session. Without `--keep-open` the CLI seals the session at exit instead. Studio's `archive` is housekeeping for a
  closed task, not an execution verb.
- **verify** re-derives every request in the session from the signed log and checks the chains (`verifyAgentRun`). Pin
  the monitor key (`AMC_EXPECTED_MONITOR_FINGERPRINT` or `--expect-monitor`); without a pin the result proves internal
  consistency only. Signatures checked against the workspace's own keys are a local audit trail, not a portable verdict.

## The four phases

Every surface reports an `ExecutionStatus`:

```ts
interface ExecutionStatus {
  readonly sessionId: string;
  readonly phases: Readonly<Record<"admission" | "model-completion" | "side-effect-completion" | "evidence-verification",
    "pending" | "succeeded" | "failed" | "refused" | "unknown">>;
  readonly receiptStates: readonly string[];
  readonly recheckFailures: readonly string[];
}
```

Each phase has one source, and no phase implies another. A finished turn whose log nobody verified reads
`model-completion: succeeded` and `evidence-verification: pending`; a tampered log reads `evidence-verification:
failed` while the recorded turn still reads `model-completion: succeeded`.

| Phase | Source | States |
|---|---|---|
| admission | the runtime opened the session (lease, signed policy, writer) | `succeeded`; `refused` when Studio refused a start or fork before any session; `pending` before an answer |
| model-completion | the latest recorded turn ending | `succeeded` only for `complete`; `refused` for a guard's `blocked`; `failed` for `cancelled`, `max_tokens`, `max_steps`, `error` and `interrupted`; `pending` while a turn runs; `unknown` when the rows cannot be read |
| side-effect-completion | the verified receipt chain of each journaled consequential action (P1-03) | `succeeded` when every action `completed` with complete evidence, or none was journaled; `refused` when an action was denied (by a guard, or by the authorization step at binding or at the pre-dispatch recheck); `failed` when one was cancelled before dispatch, or a receipt chain fails verification; `unknown` while any action is `outcome_unknown` or its evidence is incomplete, or is still open after its turn ended; `pending` while the turn runs |
| evidence-verification | `verifyAgentRun` only (`amc agent-loop verify`) | `pending` until verification ran; then `succeeded` or `failed` |

`receiptStates` lists each journaled action's verified head state, plus `evidence_incomplete` for a completed action
whose evidence is marked incomplete and `integrity_failed` for a chain that failed verification. Actions are found
through the journal index and the signed `ACTION_STATE` rows, so deleting an index row reports `integrity_failed`
rather than hiding the action. The model phase reads recorded rows: only the evidence phase says the record is intact.

`recheckFailures` lists the typed authorization failures (`RecheckFailure` codes such as `purpose_violation`,
`binding_changed:amount` or `approval_expired`) of every action the authorization step denied, from the same verified
receipts: at binding (`authorization_denied:<codes>`) or at the pre-dispatch recheck (`recheck_failed:<codes>`). A call
the signed run purpose does not allow (P2-02) is refused before any approval request or network, and every surface
reports `side-effect-completion: refused` with `recheckFailures: ["purpose_violation"]`, after the turn and again after
`verify`. The contract adds no path that sends tool arguments out of the process: every surface's tool calls run through
`ToolPipeline.execute` (src/tools/toolPipeline.ts), and the senders behind it are unchanged.

Where the status appears: the CLI's `agent-loop run --json` and `agent-loop verify --json` (`execution`), every SDK turn
result and verification receipt (`execution`), every Python `RunResult` and `VerificationReceipt`, and every Studio
task view (`execution`, null before a session exists).

## Versioning

The ACP runtime advertises `executionApi: 1` in its `dev.agentmaturity.amc` capabilities. The TypeScript SDK and the
Python wrapper refuse a runtime that does not advertise exactly the version they were built for, before any session.

## Examples

CLI:

```bash
amc agent-loop run "summarise the changelog" --provider stub --tools workspace --approve-tools WRITE_HIGH --keep-open --json
amc approvals list --agent default --status pending --json
amc approvals approve <approvalRequestId> --agent default --mode execute --reason "<reviewed reason>" \
  --username <reviewer> --roles APPROVER
amc agent-loop run "continue" --session <sessionId> --provider stub --tools workspace --approve-tools WRITE_HIGH --json
amc agent-loop run "branch" --fork-from <sessionId> --provider stub --tools workspace --approve-tools WRITE_HIGH --json
amc agent-loop verify <sessionId> --json
```

TypeScript:

```ts
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const options = { workspace: process.cwd(), provider: "stub", tools: "workspace", approveTools: "WRITE_HIGH" } as const;
const client = await AMCNativeClient.start(options);
const session = await client.newSession();
const turn = session.prompt("summarise the changelog");
for (const pending of await client.pendingApprovals()) {
  await client.approve({ approvalRequestId: pending.approvalRequestId, reason: "<reviewed reason>", username: "<reviewer>", roles: ["APPROVER"] });
}
console.log((await turn.result).execution?.phases);
await client.dispose();                                     // release, then stop the process

const again = await AMCNativeClient.start(options);
const resumed = await again.resumeSession(session.sessionId);
const child = await again.forkSession(session.sessionId);   // a lineage fork; no inherited model context
await again.close();                                        // seals the sessions
console.log((await again.verifySession(resumed.sessionId)).execution.phases);
```

Python:

```python
from amc_sdk import AmcAgent

options = dict(provider="stub", tools="workspace", approve_tools="WRITE_HIGH")
agent = AmcAgent(".", **options)
session = agent.new_session()
turn = session.start_prompt("summarise the changelog")
for pending in agent.pending_approvals():
    agent.approve(pending.approval_request_id, reason="<reviewed reason>", username="<reviewer>", roles=["APPROVER"])
print(turn.result().execution.phases)
agent.dispose()

agent = AmcAgent(".", **options)
resumed = agent.resume_session(session.session_id)
child = agent.fork_session(session.session_id)
agent.close()
print(agent.verify_session(session.session_id).execution.phases)
```

Studio (a signed-in browser session also sends `Origin`, `x-amc-native-intent: task-workspace-v1` and
`x-amc-native-csrf` on every mutation):

```text
POST /api/v1/native-tasks                          {clientRequestId, agentId, provider, tools, toolsDigest, prompt}
GET  /api/v1/native-tasks/{taskId}?cursor=0        events, approvals and execution
POST /approvals/requests/{approvalRequestId}/decide {decision: "APPROVE_EXECUTE", reason}
POST /api/v1/native-tasks/{taskId}/release         {expectedRevision}
POST /api/v1/native-tasks/{taskId}/resume          {expectedRevision}
POST /api/v1/native-tasks/{taskId}/fork            {clientRequestId, expectedRevision}
POST /api/v1/native-tasks/{taskId}/verify          {expectedRevision}
```

## Web tools through the starter profiles

`amc init --coding --web-allow-host <host>` (repeatable) also grants `web_fetch` and `web_search` exactly those hosts or
origins in the signed tool policy, where the egress decision reads them (see [NATIVE_TOOLS.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/NATIVE_TOOLS.md)).
`web_search` still refuses every call until a caller composes a search provider. `--regulated` keeps both off. The
other S8 tools (`ask_user`, `todo`, `plan`) stay off in both profiles; an operator lists them in a signed `tools.yaml`.

## Python CI lane

The `python-sdk` CI job builds the wheel from `sdk/python`, installs it into a fresh virtual environment, and runs
`sdk/python/tests` from outside the checkout against the CLI built from the same commit, on Python 3.10 and 3.12.
