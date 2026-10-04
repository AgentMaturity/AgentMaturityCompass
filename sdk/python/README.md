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

`result.validation` is a separate `NativeValidationResult`, with `status`,
`turn`, `config_sha256` and an immutable tuple of `NativeValidationCheckResult`
objects. Public statuses are `not-requested`, `pending`, `passed`, `failed` and
`unavailable`; none changes `stop_reason` or `verification`. Check fields are
`id`, `title`, `status`, `call_id`, `exit_code`, `timed_out`, `reason` and
`output_event_id`. The original wire metadata remains available in `result.meta`.
These types and the status aliases are exported by `amc_sdk`.

Missing validation metadata from an older peer is explicitly `unavailable`, with
no inferred configuration, turn or checks. Explicit malformed validation metadata
raises `AmcProtocolError`: unknown/missing fields, duplicate checks, truthy
non-booleans, invalid identities and inconsistent outcomes are not accepted.
The decoder follows AMC's native wire semantics, including a pending aggregate
until the native finished row exists. Parsing does not authenticate a peer or
prove the reported configuration/IDs match your request; use independently
verified signed evidence for that. A public check passing does not guarantee
task correctness or make cold ledger/proof verification unnecessary.

### Select reviewed public checks and pin the tool policy

```python
with AmcAgent(
    workspace=".", provider="stub", tools="workspace",
    validation_config="reviewed-public-checks.json",
    validation_config_sha256=reviewed_config_sha256,
    validate=["unit", "lint"],
    expected_tools_digest=reviewed_signed_tools_sha256,
) as agent:
    result = agent.new_session().prompt("Local recording demonstration.")
    print(result.stop_reason, result.validation.status, result.verification)
    for check in result.validation.checks:
        print(check.id, check.status, check.reason, check.output_event_id)
```

The digest variables above must come from your reviewed configuration and signed
tool policy, not placeholders or an untrusted peer. Provision the workspace and
grants separately; this example does not initialize, sign, approve or widen them.
Use `approve_tools`/`approve_risk` when the existing signed approval gate is needed.
The `stub` provider remains only a local demonstration.

`validation_config` is an explicit UTF-8 path (client limit: 4096 bytes, no NUL).
`validate` is a list of one through eight distinct IDs, each 1–64 ASCII letters,
digits, underscores or hyphens. IDs and an optional lowercase SHA-256 config pin
require that path. A config file does not implicitly select all its checks:
the native runtime refuses a config without selected IDs. Python forwards each
ID as a separate `--validate` argument; no commands are taken from the prompt.
The native loader, not Python, reads the explicit regular nonsymlink JSON file
(at most 32 KiB), checks its exact-byte digest, and selects the named checks.
It preserves the existing schemaVersion 1, bounded commands (8192 UTF-8 bytes)
and timeouts (1–600000 ms). No config discovery, new validator or automatic repair.

`expected_tools_digest` requires `tools="workspace"` and a lowercase 64-character
SHA-256 value. It forwards the existing `--expected-tools-digest` policy pin:
native startup and tool dispatch refuse a changed signed policy. It does not
grant a tool or replace approvals, budgets, sandbox restrictions or cancellation.
All these options are fixed at child launch, not mutable through session messages.

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

### Regression scope (task10: AUTHORED UNEXECUTED)

`tests/test_validation.py` covers public options, native result/negative wire
semantics and pending-request ownership. `tests/test_validation_installed.py`
launches a Python `-I` consumer that requires a non-editable installed canonical
wheel and matching candidate client/export bytes. Set `AMC_PYTHON_INSTALLED` to
that environment's absolute interpreter. Its scripted ACP peer checks protocol
handling and child cleanup; it is **not** signed-native or provider acceptance.
Neither test file builds, installs or probes a CLI at collection.
Installed fixture supervision currently requires POSIX process groups; other
platforms are explicitly skipped, not qualified. Timeouts and forced cleanup
fail the fixture instead of counting as a malformed-metadata refusal.

The optional real-native test requires `AMC_PYTHON_NATIVE_VALIDATION_FIXTURES`,
a JSON manifest of disposable, already-provisioned signed workspaces and explicit
installed CLI commands, with reviewed validation/policy pins and expected
passing/nonzero/unavailable checks (schema documented in the test). Fixture
checks must fit the consumer's request/cleanup deadlines. No workspace setup,
signing or provider setup is performed by the test. Without those fixtures that
lane is skipped, not passed. All new tests remain unexecuted in this authoring
batch; clean candidate/package/platform, cold verification and release gates
remain separate and must not reuse these descriptions as acceptance receipts.

## Industry packs and domains

`amc_sdk.industry.AmcIndustry` wraps the industry pack and domain commands of the installed CLI. Like the proof helpers these are CLI calls: each method runs one `amc domain ... --json` command as an argv list (never a shell string) in the fixed `workspace`, with stdin closed so the CLI cannot prompt, and returns the CLI's JSON unchanged after checking it against the shapes below. `amc_bin`, `AMC_BIN` and `timeout` (default 120 s) behave as for `AmcAgent`.

```python
from amc_sdk.industry import AmcIndustry, AmcIndustryLockedError

industry = AmcIndustry(workspace=".")
for pack in industry.list_packs(domain="health")["packs"]:
    print(pack["packId"], pack["locked"])
try:
    print(industry.score_pack_baseline("clinical-trials")["percentage"])
except AmcIndustryLockedError as locked:
    print(locked.message)
```

| Method | Command | Returns |
| --- | --- | --- |
| `list_domains()` | `amc domain list --json` | `list[DomainMetadata]` |
| `list_packs(domain=None)` | `amc domain pack list [--domain D] --json` | `IndustryPackCatalog` |
| `describe_pack(pack_id)` | `amc domain pack describe --pack P --json` | `IndustryPack` |
| `score_pack_baseline(pack_id)` | `amc domain pack run --pack P --baseline --json` | `IndustryPackScoreResult` |
| `apply(agent_id, *, domain=None, pack_id=None, dry_run=False, compliance=None, file=None)` | `amc domain apply --agent A [--domain D] [--pack P] [--dry-run] [--compliance F]... [--file PATH] --json` | `DomainApplyResult` |

JSON shapes (`number` accepts integers; `?` marks a key the CLI omits when it has no value):

```text
DomainMetadata          {id, name, description, riskLevel, euAIActCategory: string,
                         questionCount: number,
                         aliases, sectorTags, recommendedIndustryPacks, regulatoryBasis,
                         assurancePacks, primaryModules, complianceFrameworks: string[]}
IndustryPackCatalog     {entitlement: IndustryPackEntitlement, packs: IndustryPackCatalogItem[]}
IndustryPackEntitlement {active, checkoutAvailable: boolean, source, planId, priceUsdMonthly,
                         checkoutUrl, message: string, expiresAt: string|null,
                         customerId?, subscriptionId?, licenseStatus?: string}
IndustryPackCatalogItem {packId, name, domain, riskLevel, description: string,
                         questionCount: number, locked: boolean,
                         regulatoryBasis?, complianceFrameworks?: string[]}   (only when unlocked)
IndustryPack            {id, stationId, name, description, riskTier, euAIActClassification,
                         certificationPath: string, certificationThreshold: number,
                         regulatoryBasis, complianceFrameworks, sdgAlignment, keyRisks: string[],
                         questions: [{id, dimension, text, regulatoryRef, l1, l3, l5: string,
                                      weight: number}]}
IndustryPackScoreResult {packId, packName, stationId, riskTier: string, percentage, level: number,
                         certified: boolean, complianceGaps: string[],
                         questionResults: [{id, dimension: string, score, weight, percentage: number}]}
DomainApplyResult       {agentId, domain: string, packsApplied, guardrailsEnabled,
                         complianceFrameworks: string[], guardrailsGenerated: number,
                         configFileUpdated: string|null, dryRun: boolean,
                         assessmentScore: {composite: number, level: string, gaps: number}}
```

Refusals and failures:

- Pack ids must be one of `amc_sdk.industry.PACK_IDS` and domains one of `DOMAIN_IDS` (`health`, `education`, `environment`, `mobility`, `governance`, `technology`, `wealth`); anything else raises `ValueError` before the CLI runs. Domain aliases such as `healthcare` are refused here even though the CLI accepts them; read them from `list_domains()` and pass the canonical id. `agent_id`, `compliance` entries and `file` are passed through unchanged (the CLI normalizes agent ids) and are refused only when empty or containing NUL.
- `describe_pack` and `score_pack_baseline` without an Industry Packs entitlement: the CLI prints `{"error": "industry_packs_locked", "message": ...}` and exits 1, raised as `AmcIndustryLockedError`. `apply` reports the same lock as text on stderr, raised as `AmcIndustryCommandError` (as is every other nonzero exit, with the CLI's own reason and `returncode`).
- Output that is not one JSON document, or does not match its shape, raises `AmcProtocolError`; a CLI timeout raises `AmcTimeoutError`.
- `score_pack_baseline` scores every question at L1. The CLI accepts other responses only interactively, so this module offers no custom-response scoring. `apply` without `dry_run` writes guardrail files into the workspace. The signed audit form of `domain apply` (`--audit`) and the other `domain` subcommands are not wrapped.

`tests/test_industry.py` checks argv, refusals and shapes with a stubbed runner, compares `PACK_IDS`/`DOMAIN_IDS` with the TypeScript source when the checkout is present, and runs the real `dist/cli.js` only when it exists (skipped otherwise). Unlocked describe/score/apply output is covered by fixtures only.
