# Assurance Lab

Assurance Lab is AMC's defensive, deterministic red-team harness. It tests the AMC-controlled boundary (Bridge, ToolHub, policy/governance, Truthguard, and trust/notary checks) and produces signed, evidence-bound outcomes.

It is designed for continuous recurrence: run on schedule and after material governance/runtime changes so risk assurance stays current in realtime operations.

## What It Tests

Built-in deterministic packs:
- `injection`: prompt override and system-message tamper resilience.
- `exfiltration`: secret/PII leakage controls and truthguard enforcement.
- `toolMisuse`: denied tools/model/provider and budget boundary enforcement.
- `truthfulness`: evidence-bound claim discipline and output-contract checks.
- `sandboxBoundary`: deny-by-default egress and boundary policy behavior.
- `notaryAttestation`: trust-boundary enforcement for NOTARY mode.
- `sycophancy`: resistance to agreeing with incorrect user statements under social, authority, or emotional pressure (Bloom-inspired).
- `self-preservation`: graceful acceptance of shutdown, modification, replacement, or correction without resistance or manipulation (Bloom-inspired).
- `sabotage`: transparent flagging of conflicting instructions rather than subtle undermining or malicious compliance (Bloom-inspired).
- `self-preferential-bias`: objective evaluation in comparative decisions without favoring self, own outputs, or AI approaches (Bloom-inspired).

All scenarios run only against AMC interfaces. No internet scanning, no generic exploit tooling.

## Evidence Model

Runs store privacy-safe trace references (`trace.refs.json`) only:
- request/run identifiers
- hashes (input/output/receipt)
- decision outcomes (allowed/denied/rejected/flagged)
- policy hashes and evidence event hashes

Raw prompts/outputs are not stored by default.

## Provenance Gate (SH-TRUST-02)

A sealed report proves who wrote it; the provenance gate proves its graded rows exist in that writer's own sealed ledger session. Every reader that feeds a pack score forward (`verifiedAssuranceByPack` for compliance, `scanVerifiedAssuranceByPack` for the governor, drift, indices, dashboards and the bench collector, `latestAssuranceReports` for the readiness gate and the passport companion, `loadAssuranceSummary` for the maturity caps, the read-only bench reader and the signed benchmark export, and `amc assurance cert-issue`) calls one predicate, `src/assurance/reportProvenance.ts`, right after the seal check:

- the report names its runner session (`sessionId`), that session is sealed and its seal verifies against the monitor key;
- every graded row (`inconclusive !== true`) names its stdin, stdout and test rows, which exist in that session with the same pack, scenario and agent, and the test row's pass/fail agrees with the row;
- a pack that claims a score or a pass/fail count with no graded row behind it is refused (`PROVENANCE_MISSING`);
- a report written to the AMC_NO_SIGN store (`evidenceStore`) is refused by signed readers (`PROVENANCE_UNSIGNED_STORE`);
- when the gateway captured the exchange, the runner admits its signed receipts as the reply arrives, and only when they are bound to that exchange (`src/assurance/gatewayReceiptAdmission.ts`): each must verify against the workspace receipt keys, be the right kind (`llm_request`, `llm_response`), name the agent, commit to the exact bytes AMC sent or received (`body_sha256`; a JSON reply also matches its re-serialized form, which is what the gateway's redaction pass signs), be minted while the exchange was in flight (5 s clock tolerance), and not already be bound to another exchange of the run; the response receipt must come from the request receipt's gateway session. Only admitted receipts are stored on the stdout row (`requestReceipt`, `responseReceipt`) and the request receipt's id fills `correlatedRequestIds`. A forged or replayed receipt is dropped and audited (`ASSURANCE_RECEIPT_REJECTED`), and the row is graded all the same: the gate never re-judges a receipt, so the agent under test can neither get its own report refused by answering with a bad one nor pass a direct exchange off as gateway-captured. A gateway that redacted the request or reply body signs the redacted bytes, so its receipt does not bind and is dropped.

The gate verifies the runner session's own rows, O(session) per report, not the whole ledger chain, because it sits on the governor's per-intent path: each row's hash pre-image and writer signature, its link to the stored row just before it (runner rows carry no session envelope, so a session reordered or gapped under a valid seal is refused), the seal, and, in a workspace whose ledger-row key is provider-bound, the delegated authority of those rows under the caller's trust (`PROVENANCE_LEDGER_INVALID`). The rest of the ledger-wide chain is `verifyLedgerIntegrity`'s job, which both runners call at run time. Both runners seal their session when the process is interrupted (SIGINT, SIGTERM) before dying of the signal. A SIGKILL or a crash leaves it open: the ledger reads it as a live session for 15 minutes after its last signed row, then as a missing seal, which `amc verify --repair` plans and `--repair --apply` seals with a signed `interrupted-sealed` marker.

`amc assurance cert-issue` issues only over files a workspace writer cannot forge, bound to one another: `run.json` and `findings.json` must carry the auditor's signature; the run's report must name the run and agent, verify its seal when it claims one, derive to exactly `run.json`'s status, score, pass and finding counts, and pass the provenance gate. A planted report, another verdict, a byte-edited `run.json` or a missing report each issue nothing.

A report that graded nothing (every row inconclusive, score 0) has nothing to prove and passes the gate; it still never counts as MEASURED. Refusals surface as `unverifiable[].reason` in compliance, `unverifiedReports` for the governor (which then reads every required pack as missing) and `INSUFFICIENT_EVIDENCE` for the readiness gate. Reports written before this change carry rows the gate can resolve when their runner session is still in the ledger; a report whose session was pruned stops counting, which is the intended effect: re-run `amc assurance run`.

Limits: the gate binds a row to the exchange AMC itself recorded (P0-18, OBSERVED); it does not re-grade the row (`amc assurance verify` does that), and it does not yet match a native-loop session's own rows (SH-TRUST-01 is deferred).

## Grading Methods and Inconclusive Results

`amc assurance run` and `amc redteam` grade every reply with one rule (`gradeScenarioReply` in `src/assurance/scenarioGrading.ts`). A reply is graded only when its scenario can judge it. Otherwise the row is inconclusive: `pass: false`, both scores 0, `inconclusive: true`, an `ASSURANCE_SCENARIO_INCONCLUSIVE` audit (severity HIGH), and no effect on the pack score. A run in which every row is inconclusive reports `evidenceStatus: "INSUFFICIENT_EVIDENCE"`.

| `inconclusiveCause` | When |
|---|---|
| (absent) | The agent under test could not be invoked. |
| `tool_calls_ungraded` | The agent answered with one or more tool calls and the scenario grades text only. Text next to a tool call is inconclusive too: a polite refusal beside a destructive call must never pass. |
| `token_claim` | The scenario only checks that the reply names an artifact (`[artifact:<id>]`). A named artifact is a claim, not the artifact; checking the evidence store is planned work (P2-27). The `euAiActArticle`, `iso42005ImpactAssessment`, `owaspGenAI` and `context-leakage` packs are token-claim, so their runs report insufficient evidence until then. |
| `ungradable_evidence` | The pack refused to grade the reply: it was empty or had the shape of a canned all-industry answer (`INDUSTRY_EVIDENCE_MISSING`, `INDUSTRY_EVIDENCE_SYNTHETIC`). |

Every graded row records its `gradingMethod`:

| Method | Meaning | Regulated evidence |
|---|---|---|
| `keyword` | Words in the reply matched a pattern. The default for built-in packs. | No |
| `token-claim` | The reply named an artifact. Never graded (see above). | No |
| `structured` | The scenario's `validateToolCalls` judged the agent's tool calls. | Yes |
| `executed` | The behaviour was run and observed. | Yes |

Each pack result carries the weakest method among its scenarios as `gradingMethod`, and `regulatedEligible: true` only when that method is `structured` or `executed`. A compliance requirement of type `requires_assurance_pack` is "not evaluated" with evidence "untrusted" for any other pack, including reports written before these fields existed, whether the pack scored a pass or a fail. Every built-in pack is keyword- or token-claim-graded today, so no assurance pack result satisfies a compliance requirement.

Tool calls are kept as evidence, never graded as empty text. The response ledger event stores only a digest: of the reply text when there were no tool calls (the shape older records carry), or of the canonical `{ text, toolCalls }` otherwise, with `meta.toolCallCount`. The report row lists the calls under `toolCalls`.

`amc assurance verify` re-grades every graded row and skips inconclusive rows, but reports `inconclusive row carries a score` for one marked `pass: true` or with a nonzero score.

A scenario prompt must not state the expected answer: no required artifact ids, token formats or the keywords a validator looks for. The packs in the industry manifest and the packs the built-in compliance mappings use no longer coach the reply; where they did, the closing line now reads "Respond as you would in production." Two gaps remain. `approval-theater` keeps its closing line, because a restoration parity test freezes its prompts. Some validators still pass a reply that only repeats the scenario text, and many other packs still contain hints; both are left for P2-27, which replaces keyword grading with executed tests.

## Policy + Thresholds

Assurance policy is signed at:
- `.amc/assurance/policy.yaml`
- `.amc/assurance/policy.yaml.sig`

Fail-closed behavior:
- invalid policy signature => assurance endpoints fail and workspace readiness includes `ASSURANCE_POLICY_UNTRUSTED`
- threshold breach with fail-closed enabled => readiness includes `ASSURANCE_THRESHOLD_BREACH`
- readiness, certificates, drift, the what-if simulator and every per-pack reader count sealed assurance reports only; an unreadable report, one whose seal fails, or an unsealed report newer than the newest sealed one blocks them (readiness includes `ASSURANCE_EVIDENCE_UNVERIFIABLE`, drift reports `INSUFFICIENT_EVIDENCE`) rather than falling back to an older report
- `amc cert verify` recomputes each carried assurance report's `reportJsonSha256` and verifies its `runSealSig`

## Commands

```bash
amc assurance init
amc assurance verify-policy
amc assurance policy print
amc assurance policy apply --file .amc/assurance/policy.yaml --reason "policy update"

amc assurance run --scope workspace --pack all
amc assurance runs
amc assurance show --run <runId>

amc assurance cert-issue --run <runId>
amc assurance cert-verify .amc/assurance/certificates/latest.amccert --pubkey <recorded-auditor.pub>

amc assurance scheduler status
amc assurance scheduler run-now
amc assurance scheduler enable
amc assurance scheduler disable
```

## Signed Certificate Walkthrough

Use unsigned mode only for local exploration, onboarding, and first-run remediation:

```bash
amc assurance run --demo --no-sign
```

That run is intentionally not verifier-ready. An unsigned run (`--no-sign`, or any run under `AMC_NO_SIGN=1`) records its ledger session in `.amc/unsigned/evidence.sqlite`, never in `.amc/evidence.sqlite`, so it cannot make the signed workspace ledger unverifiable. The run prints that path as `Evidence store:` and its report carries it as `evidenceStore`. Signed readers never open the unsigned store: `amc assurance history` lists signed runs only. Since P0-55 the same store holds every maturity diagnostic run under `AMC_NO_SIGN=1` (the instant `amc` score when the vault cannot be unlocked, `amc run`, `amc quickscore --auto`), every process AMC monitors under it (`amc wrap`, `amc supervise`, `amc evidence collect --first-run`), and the rows of `amc sandbox run`, `amc monitor --stdin` and the `amc monitor start` alert log, so their runs and rows never enter `.amc/evidence.sqlite`. Such a diagnostic is `UNSIGNED` and not cryptographically verified (integrity 0); it verifies the signed store's chain and reads that store's evidence read-only together with the unsigned store's, and writes its derived audits to the unsigned store, so the same level caps apply as in a signed run.

A scan that aborts after it starts (for example because no agent under test is reachable, exit code 2) seals its ledger session with an `ASSURANCE_RUN_ABORTED` audit row naming the error class, and records no assurance run. A scan whose `ASSURANCE_RUN_STARTED` row cannot be written leaves no session at all: the session and that row commit together. Sessions left unsealed by aborted runs before this change stay unsealed, and `amc verify` keeps reporting them.

Graduate to signed assurance when the result will be used for release approval, customer evidence, compliance review, or audit evidence:

```bash
amc setup
amc assurance init
amc assurance verify-policy
amc assurance run --demo
amc assurance runs
amc assurance show --run <runId>
amc assurance cert-issue --run <runId>
amc assurance cert-verify .amc/assurance/certificates/latest.amccert --pubkey <recorded-auditor.pub>
```

What to check before sharing a certificate:
- The run is signed, not `UNSIGNED`.
- `amc assurance verify-policy` passes against `.amc/assurance/policy.yaml.sig`.
- `amc assurance cert-verify .amc/assurance/certificates/latest.amccert --pubkey <recorded-auditor.pub>` passes locally.
- The remediation-priority section has no unresolved CRITICAL items unless the exception is explicitly approved and documented.

## Policy Threshold Tuning

The signed assurance policy lives at `.amc/assurance/policy.yaml`. Tune it through pull request review, then re-sign with:

```bash
amc assurance policy apply --file .amc/assurance/policy.yaml --reason "tighten assurance thresholds for release gate"
amc assurance verify-policy
```

Key threshold fields:
- `minRiskAssuranceScore`: minimum overall assurance score required before the run is considered acceptable.
- `maxCriticalFindings`: maximum allowed CRITICAL findings. Production release policies should usually keep this at `0`.
- `maxHighFindings`: maximum allowed HIGH findings before the gate fails.
- `failClosedIfBelowThresholds`: when `true`, below-threshold runs make readiness fail closed with `ASSURANCE_THRESHOLD_BREACH`.

Tune thresholds only to reflect risk appetite, environment, and evidence quality. Do not relax thresholds to hide known failures; fix the failing pack, document an approved exception, or keep the run unsigned and non-verifier-ready.

## Community Pack Authoring

Use `amc pack init` to scaffold a local community pack. The scaffold writes `package.json` with `"main": "index.mjs"` and creates an ESM entry point at `index.mjs`.

```bash
mkdir my-pack
cd my-pack
amc pack init --name my-pack
amc pack test .
```

`amc pack test` resolves the entry point in this order:
- `package.json` `main`, when it points inside the pack directory
- `index.mjs`
- `index.js`

New packs should use `index.mjs`. Legacy `index.js` packs remain supported for local sandbox tests.

## Community Registry Review Gates

Community registry publishing is a reviewed promotion step, not a blind upload. Before a pack is uploaded to a shared registry, the author or reviewer should record these checks in the pack review note or pull request:

1. **Local execution:** `amc pack test .` passes in sandbox mode and the pack entry point resolves through `package.json` `main`, `index.mjs`, or `index.js`.
2. **Provenance and license:** source references, research papers, CVEs, datasets, and copied snippets are cited; the manifest license is compatible with redistribution.
3. **Scope clarity:** scenarios describe what they test, which AMC dimension or assurance category they affect, and what evidence a pass/fail result represents.
4. **Determinism:** checks avoid hidden randomness, live network dependencies, unpinned remote data, or unverifiable model-judge-only outcomes.
5. **Safety boundary:** the pack does not include secrets, malware, credential harvesting, destructive payloads, or instructions that would make unsafe execution likely.
6. **Maintenance owner:** the manifest identifies an owner or support contact and a version compatible with the current AMC pack contract.

### Moderation rejection criteria

Reject or quarantine a community pack before registry upload when any of these are present:

- leaked credentials, private keys, tokens, customer data, or other secrets
- malware, persistence mechanisms, exploit payloads, credential harvesting, or destructive system commands
- hidden network calls, telemetry, or dependency downloads not documented in the manifest
- unlicensed copied content, unclear dataset provenance, or missing citation for research-derived scenarios
- prompt payloads that materially enable abuse beyond defensive evaluation
- falsified evidence claims, misleading certification language, or impersonation of AMC/partner approval

`amc pack publish .` creates a local bundle first. Upload with `amc pack publish . --registry <url>` only after the review gates above are satisfied for the target registry.

## Why This Matters

Assurance Lab provides the operational risk-assurance loop for AMC's physical/virtual trust boundary:
- deterministic checks (no model-judge scoring)
- signed artifacts and proof bindings
- readiness gating when assurance posture degrades

This keeps unified clarity grounded in observed evidence and supports continuous renewal rather than one-off audits.
