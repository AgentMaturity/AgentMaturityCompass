# AMC-1480 - hook health and last-event diagnostics

- Issue: `AMC-1480`
- Dimension: provider hook operability, last verified observation, and evidence truth
- AMC surfaces requested: Watch, Connect CLI, authenticated Watch API, Studio Integrations, Docs
- Sources reviewed: [AgentApprove activity monitoring](https://www.agentapprove.com/use-cases/monitor-agent-activity), [Agent Control observability endpoint](https://github.com/agentcontrol/agent-control/blob/83188b62c63e2b4ff9ada87048fd99605184ee5a/server/src/agent_control_server/endpoints/observability.py), and the pinned AEP draft
- Retrieval: live first-party page and immutable repository source reviewed 2026-07-13
- Immutable source commits: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`; AEP `2583cff9380f8f0a459d52c7112b6105c46496ed`
- Status: Implemented, published, and exact-SHA verified

## Relevance decision

This item is directly relevant. AMC already verified signed Claude Code and Gemini CLI installation ownership, narrow leases, provider action receipts, sealed sessions, and end-to-end action lifecycles. It lacked one operator-facing projection that distinguished an intact configuration awaiting runtime evidence from a verified observation or an integrity failure.

AgentApprove's first-party activity page was retrieved with SHA-256 `7c2beb14811d76457839a38e1b126bf55007d50445ae31d3588b160a599f6907`; the relevant source signal is last-seen time and event-count usability. Agent Control's basic observability status endpoint was reviewed at immutable commit `83188b62c63e2b4ff9ada87048fd99605184ee5a`, source SHA-256 `43fdf5033d8a1a8adabc054f035ad1f6289d6c883b78e5a55d51d86351f8035e`. AMC copies neither model. It uses its own signed installation and evidence authorities.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No maturity, diagnostic, weighting, methodology, or evidence-acceptance change. |
| Shield | No detector, attack pack, red-team rule, or security score change. |
| Enforce | Existing control-mode installation state is reported, but no decision or policy behavior changes. |
| Vault | Existing encrypted event bodies and public verification keys remain authoritative; no secret or raw content is returned. |
| Watch | Primary surface. It joins signed setup state to the latest verified existing hook event. |
| Fleet | The signed installation agent is shown; no fleet aggregate, inheritance, or topology change. |
| Passport | The diagnostic is not signed, portable, or claim eligible. |
| Comply | No framework mapping or audit evidence type changes. |

## Product closure

- Added `amc connect hooks health --provider claude-code|gemini-cli [--json]`.
- Added authenticated `GET /api/v1/watch/hooks/{provider}/health` with the same projection.
- Added an on-demand Provider Hook Health table to the existing Studio Integrations page; it reads both supported providers only while the page is open.
- Made the existing Integrations status reader return an explicit empty, unsigned state for an unconfigured workspace instead of throwing HTTP 500; the read creates no config, queue, or journal files.
- Replaced the Studio Integration Hub's raw status/path dump with channel and queue totals, disabled test dispatch until a signed config exists, and showed the exact `amc integrations init` repair command.
- Reused `getHookIntegrationStatus`, the existing strict hook receipt metadata schema, append-only ledger order, `verifyEvidenceEventIntegrity`, attached receipt verification, and sealed-session verification.
- Added four states: `not_installed`, `awaiting_first_event`, `observed`, and `fail_closed`.
- Added stable exit classes: 0 observed, 1 setup/action needed, and 2 fail closed.
- Added privacy-safe event/action/receipt references, last-observed time, event count, reason codes, and bounded repair commands.
- The CLI uses the existing `AMC_VAULT_PASSPHRASE` environment credential when available. If encrypted evidence cannot be authenticated because the Vault remains locked, it returns `HOOK_EVIDENCE_UNAVAILABLE`, exit 2, and `amc vault unlock` as the first repair command.

## Fail-closed rule

Invalid or missing signed installation identity, manifest/config drift, lease expiry, invalid installation state, unreadable evidence, malformed matching AEP metadata, event-type mismatch, event-chain failure, encrypted body tamper, receipt failure, and missing or invalid session seal cannot become an observed result. The projection never falls back to an older valid event after a newer matching event is malformed or invalid.

A locked Vault never degrades encrypted payload verification to metadata-only trust. The diagnostic fails closed until the existing Vault session can authenticate the body; it does not expose whether an environment passphrase was absent or incorrect.

An intact installation with no matching event is `awaiting_first_event`, not healthy runtime proof. Historical evidence may remain visible when installation drift or expiry makes the overall diagnostic fail closed.

## Privacy and proof boundary

Output contains stable provider/agent/action/event/receipt identifiers, enum event kind, ingestion time, counts, integrity state, reason codes, and repair commands. It excludes raw input, output, error messages, evaluator reasons, cwd, transcript paths, raw session IDs, lease tokens, config paths, signature bytes, credentials, and provider payloads.

Every result says `derivedDiagnostic: true`, `recorded: false`, and `proofEligible: false`. Last-observed time is historical context, not current liveness, working/idle/stuck state, provider availability, action success beyond the exact event, or maturity proof.

## No-bloat boundary

No daemon, timer, poller, heartbeat writer, active delivery probe, synthetic event, remote telemetry service, activity database, second event store, second installation authority, receipt type, API mutation, new Studio process, new public guide, methodology change, Score claim, provider adapter, or competitor compatibility layer was added.

No competitor code, status model, schema, query, event row, test, prose, configuration, screenshot, generated output, or visual asset was copied.

## Verification

- Expected red: the dedicated contract failed only because `src/watch/hookHealthDiagnostics.ts` did not exist.
- Core regression: 5 of 6 dedicated tests passed; the only remaining failure was the intentionally absent publication/documentation closure.
- The final dedicated contract passed 6 of 6 tests. The adjacent hook, lifecycle, API, OpenAPI, Studio, and built-CLI matrix passed 59 of 59 tests; integration-status regressions passed 16 of 16; final Studio/theme focus passed 18 of 18.
- Focused coverage for `src/watch/hookHealthDiagnostics.ts` reached 88.77% statements, 88.46% branches, 100% functions, and 89.15% lines.
- Typecheck, clean build, JavaScript syntax, OpenAPI parse, architecture boundaries, 1,499-file Docs drift, and diff hygiene passed.
- The authoritative `tmp/release-gate/amc-1480-final.json` receipt passed on 2026-07-13: 12 applicable steps passed, only the intentionally unset pre-publication live URL was skipped, and full Vitest passed 1,076 files / 8,527 tests with bounded worker concurrency.
- Runtime dependency audit reported zero vulnerabilities. All isolated install personas, CLI/domain smoke paths, the 1,166-command generated inventory, npm pack, SBOM, license inventory, release scan, signed release bundle creation, and bundle verification passed.
- Desktop packaging and manifest verification passed for macOS universal, Linux x64, and Windows x64. Final archive SHA-256 values were `4210f651de539ce52b993a576c89875a0757646fd8bf3a62f77d4329edc6c0da`, `d049aece127d821d9661df8b4bb303cb86b9f99814697e461c9ac34500e71e74`, and `f30933b0d06a73683c73f1f8869b01c82c5143adefdbcacad9493ea5054b1844`.
- Public Playwright passed 55 checks with 2 intentional i18n skips. Local Studio browser checks at 1,440 px and 390 px rendered both providers with no page overflow, private-path disclosure, failed request, console error, or page error; the unconfigured dispatch action was disabled at computed opacity 0.45 with `amc integrations init` visible.
- Final local artifact SHA-256 values: hook projection `a39e59fbc85c652dda9beaecda022cd5bb93765d3d46893e34a0b4acd355ead1`, Studio app `74b3d093db9d9d0241046e2c05a3f7b5de5790de58498f2bf44388501fa57904`, Studio styles `6e3f65f10b04837a8edb10bf80b3d80fb3d5f18d1968797e72e0c6c2325a1e23`, public OpenAPI `f86fc46c0fa8626474a1f9f3739475c1b16a11bbcb1d387fe67ce751f7fabc32`, and CLI inventory `31f23e17995bbb9b7ff836dc8c528f516055e9ebe77aced7e392a4501bfabc15`.
- Implementation commit `364aec3d919e36868ac9ce8d36ddd8fea775ccc6` passed exact-SHA CI `29234255260`, Pages `29234255353`, Docker Runner Image `29234255361`, and npm validation `29234255377`. The CI matrix included Node 20 and 22 full suites, security scan, local E2E, Helm validation, Docker smoke, policy fixture regression, architecture boundaries, and release smoke; npm validation included the independent full suite and prepack guardrails.
- Production `https://agentmaturity.co/docs/content-manifest.json` reports exact source revision `364aec3d919e36868ac9ce8d36ddd8fea775ccc6` and 173 public guides. Deployed adapter guide, CLI page, OpenAPI, and homepage matched repository bytes with SHA-256 `5d8ce2bd099aa3445a9ca161b57710a9dd18096f314fb8a6288865e59bba6a1c`, `38e72fd1be936a765505469dfb00252103fb0adb9ed5fa432304fa53d947ef63`, `f86fc46c0fa8626474a1f9f3739475c1b16a11bbcb1d387fe67ce751f7fabc32`, and `a10f71842711e4fe5c5a4ab4286901b5d80a4a10fdff1ea816d1228a9bfd34d9` respectively.
- Production browser checks passed at 1,440 px and 390 px for the homepage, adapter guide, collapsed-and-expanded CLI namespace, and dynamic Docs hub. The health command, historical-not-liveness boundary, 173-guide count, 1,166-command count, and 8,527-test count rendered with no horizontal overflow, failed first-party request, console error, or page error. Deployed desktop and mobile adapter-guide screenshots were visually reviewed.
- Live release gate `tmp/release-gate/amc-1480-live.json` passed 11 applicable checks with zero failures; quick mode intentionally skipped the full suite and install personas already proven by the authoritative local gate and exact-SHA workflows. Apex returned HTTP 200, `www` redirected once to apex, and the Let's Encrypt certificate covers both names from 2026-06-26 through 2026-09-24.
