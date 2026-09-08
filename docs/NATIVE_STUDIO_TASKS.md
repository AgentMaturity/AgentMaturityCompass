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

## Continue, cancel and recover

| Control | What happens |
|---|---|
| Run task / Send follow-up | Records one admission, then executes one bounded native turn. The task must be idle for a follow-up. |
| Cancel | Requests cancellation of the currently displayed revision. Inspect the ending reason; a canceled task is not a successful result. |
| Release | Releases an idle native writer while retaining an eligible session for later continuation. |
| Resume | Reopens your signed, unsealed session under the same agent and scope. It never replays an uncertain prompt automatically. |
| Close and verify | Seals an idle session and checks native evidence. A sealed session cannot resume. |
| Verify evidence | Checks released/closed evidence without creating a new model turn. Other open ledger writers can prevent complete verification. |
| Refresh status | Reconciles the displayed state after a disconnected or uncertain request, without resubmitting it. |

The activity view displays authenticated, committed updates. It does not provide provisional token previews. Task ending reasons and evidence verification are separate: recorded output does not prove task success, and workspace-key consistency is not an external trust anchor.

If a request loses its response, keep the draft and refresh status. The browser retains its request ID and does not automatically submit a replacement. A conflicting request ID or stale revision produces a conflict response. After a Studio restart, eligible tasks appear released; resume explicitly before submitting a new turn. Uncertain prior admissions are flagged rather than replayed.

Resume checks the signed native session and recorded ledger prefix even while Studio's unrelated gateway session is still open. It does not classify that incomplete archive as fully verified. Existing signatures, present seals, native identity and writer ownership remain admission requirements; complete cold verification remains a separate operation.

## Capacity and retention

Studio admits at most four active native tasks per workspace, one turn per task, eight steps and 1,024 output tokens per turn. The page can reduce those step/token limits. A turn times out after two minutes; idle native writers release after 15 minutes, and a live task process is limited to one hour. Prompts are limited to 16 KiB UTF-8.

The service retains at most 512 displayed events and 2 MiB of event text, 32 admitted submissions per task and 256 signed task descriptors. The browser labels a partial transcript when earlier updates are missing. Display retention does not replace or weaken the native evidence verifier. Reaching capacity refuses new admissions; it does not silently delete signed history.

## API clients and hosted workspaces

The typed API is `/api/v1/native-tasks`; Studio's `/openapi.yaml` reference documents options, listing, committed updates, submissions and revision-bound controls. See [API surfaces](API_SURFACES.md) for the public reference. Responses use `{ok: true, data: ...}` and `Cache-Control: no-store`. A `202` means admission or cancellation was recorded, not that a task succeeded.

Mutations require `x-amc-native-intent: task-workspace-v1`. Human session-cookie clients must also send `x-amc-native-csrf` from the options response or `/auth/me`, plus an `Origin` matching the configured browser origin and request host. Keep the proof out of URLs. Bootstrap admin-token clients may omit Origin and CSRF, but must send the intent header; supplied origins are still validated. Agent tokens and leases cannot act as human task owners.

The same intent, origin and CSRF requirements protect the approval decision/cancellation aliases: `/approvals/:id/approve`, `/approvals/:id/deny`, `/approvals/requests/:id/decide` and `/approvals/requests/:id/cancel`. Existing Studio UI clients attach this proof automatically; custom cookie clients must update before using these mutations. Local demo sessions cannot approve, execute commands or modify policy.

Hosted workspaces preserve the selected agent and event cursor through their workspace URL prefix. Native task admission uses the authenticated workspace membership and public browser origin. Workspace startup is shared across concurrent requests, and shutdown drains any accepted startup and its native task processes.
