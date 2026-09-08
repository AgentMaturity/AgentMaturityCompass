# `amc-sdk`

Drive an installed AMC native agent from Python. The client uses the standard library and launches one `amc acp` process with a fixed workspace, provider and credential reference. Select the executable explicitly with `amc_bin` or `AMC_BIN` when multiple AMC installations exist.

```python
from amc_sdk import AmcAgent

with AmcAgent(workspace=".", provider="openai", model="YOUR_MODEL_ID",
              credential="OPENAI_API_KEY") as agent:
    session = agent.new_session()
    result = session.prompt("Draft three acceptance tests for our JSONL importer.")
    print(result.stop_reason, result.text)
```

Initialize the workspace and set the credential reference with the AMC CLI first. The client never initializes the workspace or accepts a different workspace in a session message. `credential` names a reference; do not put a key value in command arguments. `base_url`, `model` and provider selection are fixed at process launch. Supported ACP routes are OpenAI Chat Completions (`openai`), OpenAI Responses (`openai-responses`), Anthropic and `stub`. Unsupported providers are refused without a fallback.

For `provider="openai-responses"`, `base_url` is the server origin: AMC appends
`/v1/responses`. For example, a loopback fixture listening on port 8765 uses
`base_url="http://127.0.0.1:8765"`, **not** `"http://127.0.0.1:8765/v1"`.
The example address is a placeholder for your own local fixture; it does not
start a provider server.

`provider="stub"` is a local recording demonstration with a canned answer, and remains the Python compatibility default. It does not establish real provider access or successful model work.

## Receive committed updates and cancel

```python
with AmcAgent(workspace=".", provider="stub") as agent:
    session = agent.new_session()
    turn = session.start_prompt("Show a local recording demonstration.")
    for event in turn:
        print(event.update)
        # Call turn.cancel() here, or session.cancel() from another thread,
        # to request cancellation. Breaking the iterator also requests it.
    result = turn.result()
    print(result.stop_reason, result.verification)
```

`Turn` supports one iterator and retains its updates in `RunResult.updates`. The result is separate from the stream. Updates are completed blocks projected from committed session rows and may arrive while a turn is still running; they are not raw provider token deltas. A cancellation request does not prove cancellation occurred: inspect the final stop reason. Closing the client cancels and settles active work before sealing owned sessions; a forced termination remains an interrupted run requiring recovery.

## Explicit handoff and verified resume

Ordinary client shutdown seals its sessions. A sealed session cannot be loaded for further writes. To continue a conversation in a later process, explicitly release it at an idle boundary first:

```python
with AmcAgent(workspace=".", provider="stub") as first:
    session = first.new_session()
    session.prompt("First part of the local demonstration.")
    session_id = session.session_id
    session.release()  # acknowledged signed ownership handoff, not a session seal

with AmcAgent(workspace=".", provider="stub") as second:
    continued = second.resume_session(session_id)
    for historical_event in continued.history:
        print(historical_event.update)
    result = continued.prompt("Continue the previous conversation.")
    # Normal shutdown now seals the resumed session.
```

The server advertises `loadSession` only when a verified resume factory exists. Python refuses loading when that capability is absent; it never substitutes a new session. `_amc/session/release` is an AMC extension advertised under `agentCapabilities._meta["dev.agentmaturity.amc"].releaseSession` and is also checked before use.

Loading uses native signed session verification, atomic ownership admission and crash recovery. Missing, sealed, tampered, foreign-format and live-owned sessions are refused. JSONL takeover and legacy sessions without signed ownership remain unsupported. A dead-process recovery records unknown side-effect outcomes instead of repeating work. Replayed user, assistant and tool history arrives before the load response and is exposed only in `Session.history`, never as output of a newly submitted prompt. Unavailable historical payloads cause refusal rather than incomplete conversation replay.

## Interpret results and verify separately

`stop_reason == "end_turn"` is not a success verdict: ACP's stop reasons also encode some blocked, error and interrupted endings. Inspect `result.meta`, and use the signed record for the authoritative ending. `result.verification` is always `"not-verified"`. Received text, tool updates, local replay and protocol completion are not cryptographic verification receipts.

```python
from amc_sdk import export_proof, verify_proof

# Export after normal shutdown has sealed the session.
proof = export_proof(session_id, "run.amcproof.json", workspace=".")
verify_proof("run.amcproof.json", expect_auditor_key=fingerprint_from_elsewhere)
```

Proof helpers invoke the installed CLI. Verify the fingerprint through an independent trusted route; a fingerprint supplied only inside its own bundle does not authenticate that bundle. Released, still-open sessions need continuation and a normal seal before the existing proof-export workflow can claim completeness.

## Transport and failure limits

The client requires JSON-RPC 2.0 and ACP protocol version 1. It validates response IDs and outcomes, rejects duplicate/unsolicited replies and malformed updates, and reaps its owned child on fatal transport failure. Per-frame input and output are bounded to 1 MiB; each turn or replay retains at most 8 MiB and 32,768 updates. At most 32 requests and 32 queued output frames are allowed. Stderr retains at most its last 64 KiB and is never automatically added to exception text.

Request timeout defaults to 120 seconds and is configurable with `timeout`. Transport failure is not permission to replay a task: work may already have been committed. Inspect or recover the existing session before deciding whether to submit anything again. Process cleanup is bounded and escalates from graceful EOF to termination and then kill if the child does not settle. The caller's workspace is never deleted.

MCP client servers and additional workspace roots remain unsupported and are refused rather than silently ignored.

## Verification scope

Protocol completion is not an installed-client or platform qualification. Acceptance must identify the Python wheel and AMC executable and exercise explicit handoff, loaded history, cancellation, child cleanup and independent proof verification. A local scripted provider establishes transport and lifecycle behavior, not real-provider access or answer quality.
# Native execution options and committed progress

AMC runs its own sessions and tools; no DSH/Pi installation is required.
`AmcAgent` now accepts `tools="none"` (the default) or explicitly
`tools="workspace"`, `approve_tools`/`approve_risk`, reviewed
`mcp_config`/`mcp_config_sha256`, `credentials_home`/`credentials_file`, and
`max_tokens`/`max_steps`. `provider="openai-responses"` selects AMC's native
Responses route; it is distinct from `provider="openai"` Chat Completions.
These values are fixed when the AMC process starts. Session messages cannot
change the workspace, credentials, provider or permission boundary.

Workspace tools retain AMC's signed allowlist/firewall, budget, sandbox and
owning-session evidence path. MCP requires workspace tools, an explicit signed
approval gate, reviewed config/catalog digests and existing matching signed
grants. No discovery or policy mutation happens automatically. Client-supplied
ACP `mcpServers` remain refused; use the reviewed startup configuration.

`Session.start_prompt()` returns an iterable `Turn`. It now receives committed
assistant/tool updates while the native prompt is still running, in completed
response-block units. These are authenticated session rows, not raw provisional
provider tokens and not a full-run verification result. Iteration may produce
committed progress before a later error; inspect `result()` and verify the final
session separately. Output/polling bounds and cancellation cleanup fail closed.
An MCP connection is disposed on cancellation; a subsequent explicit session
handoff/load can mount the same reviewed configuration again.

Qualification receipts apply only to their recorded source, installed artifacts,
platforms and exercised behavior. These API descriptions do not extend that scope.
