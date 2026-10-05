# REV_FULLSTACK_ENGINEER — 2026-09-29

Scope: Windows initialization and signed-file/report path handling for CLI, Vault, Fleet and deployment portability.

## Deliverables

- `src/org/orgSigner.ts`, `src/notary/notarySigner.ts`, `src/notary/notaryLog.ts`, `src/org/orgApi.ts`: replaced slash-only parent-directory extraction with `node:path.dirname` at eight call sites.
- `tests/orgSignerPaths.test.ts`: real filesystem and signing regressions for relative filenames, native absolute paths with spaces, tamper/re-sign, existing-directory preservation, sealed notary logs and organization report creation.

## Evidence

- Nightly run 36399068569, commit af43e3aa, Windows Node 22 and 24: initialization failed with EPERM renaming a temporary file onto `.amc/adapters.yaml.sig`. Build/install/help succeeded first. https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/36399068569
- Root cause: `sigPath.replace(/\/[^/]+$/, "")` leaves a Windows backslash path unchanged. `ensureDir` creates the signature destination as a directory, then rename fails. Signature mode is 0644; read-only flags were not the cause.
- Before the fix, the new bare-relative-name regression failed with EISDIR at the actual atomic rename, reproducing the same directory-at-file-path defect on macOS without mocking filesystem or signing behavior.
- After the fix: `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run tests/orgSignerPaths.test.ts tests/trustBoundarySignature.test.ts tests/utilsCoreFoundation.test.ts tests/adapterCapabilityReceipts.test.ts tests/notaryTrust.test.ts tests/orgCompass.test.ts` — 6 files, 82 tests passed, 4.76 seconds, Node 22.22.0.

## Caveats and next owner actions

- Atomic writer, signature format, permission modes and cryptographic verification remain unchanged. No target deletion or rename retry workaround was added.
- Parent owns combined typechecks/build/full suite, generated test counts and hosted Windows qualification. Local macOS evidence does not establish native Windows acceptance.
- Existing malformed signature directories are preserved; no destructive migration is attempted.
- No Git mutations or root builds performed. Existing `.serena/project.yml` user change left untouched.


## Qualified source handoff — 2026-10-02 `5fbd9e2fb5bede9119e4b49665257925435dd2c7`

Fresh exact-source full suite and all unchanged per-file floors pass. Strict duplicate/dead-code gate failures remain; live health skipped without target. Source boundary only, no deployed release or issue Done. The preserved worker handoff follows.

# REV_FULLSTACK_ENGINEER — 2026-09-29

Scope: Windows initialization and signed-file/report path handling for CLI, Vault, Fleet and deployment portability.

## Deliverables

- `src/org/orgSigner.ts`, `src/notary/notarySigner.ts`, `src/notary/notaryLog.ts`, `src/org/orgApi.ts`: replaced slash-only parent-directory extraction with `node:path.dirname` at eight call sites.
- `tests/orgSignerPaths.test.ts`: real filesystem and signing regressions for relative filenames, native absolute paths with spaces, tamper/re-sign, existing-directory preservation, sealed notary logs and organization report creation.

## Evidence

- Nightly run 36399068569, commit af43e3aa, Windows Node 22 and 24: initialization failed with EPERM renaming a temporary file onto `.amc/adapters.yaml.sig`. Build/install/help succeeded first. https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/36399068569
- Root cause: `sigPath.replace(/\/[^/]+$/, "")` leaves a Windows backslash path unchanged. `ensureDir` creates the signature destination as a directory, then rename fails. Signature mode is 0644; read-only flags were not the cause.
- Before the fix, the new bare-relative-name regression failed with EISDIR at the actual atomic rename, reproducing the same directory-at-file-path defect on macOS without mocking filesystem or signing behavior.
- After the fix: `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run tests/orgSignerPaths.test.ts tests/trustBoundarySignature.test.ts tests/utilsCoreFoundation.test.ts tests/adapterCapabilityReceipts.test.ts tests/notaryTrust.test.ts tests/orgCompass.test.ts` — 6 files, 82 tests passed, 4.76 seconds, Node 22.22.0.

## Caveats and next owner actions

- Atomic writer, signature format, permission modes and cryptographic verification remain unchanged. No target deletion or rename retry workaround was added.
- Parent owns combined typechecks/build/full suite, generated test counts and hosted Windows qualification. Local macOS evidence does not establish native Windows acceptance.
- Existing malformed signature directories are preserved; no destructive migration is attempted.
- No Git mutations or root builds performed. Existing `.serena/project.yml` user change left untouched.


## REV_FULLSTACK_ENGINEER — 2026-10-02 native HTTP controls

Scope: bridge and workspace-router response contracts. Shared `src/utils/controlHttpResponses.ts` writes the established status/header/JSON/end contract and single-field error envelope. Existing local writer functions, routes, authentication, tenant membership, role, lease, native admission, body parsing, auditing and policy ordering remain explicit.

Deliverables: two source integrations; `tests/controlHttpResponsesParity.test.ts`; complete original modules/handoff and exact restoration map under `unused-code/2026-10-02-native/http-controls/`. The test executes archived full modules with real built dependencies and current public local HTTP servers, plus serialization/getter/native-error parity.

Qualification is recorded by the main-owned `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/http-report.md` and `http-receipt.json`, pinned to the slice commit and fresh acceptance clone. The worker does not claim full-suite, combined gate, release, live-provider or deployment acceptance. Main owns integration and any bounded extension of historical whole-source freeze tests.


## Qualified source handoff — 2026-10-02 `65b3e16a849c18cd9fc76410e095e63abd39e48a`

Fresh exact-source full suite and all unchanged per-file floors pass. Strict duplicate/dead-code gate failures remain; live health skipped without target. Source boundary only, no deployed release or issue Done. The preserved worker handoff follows.

# REV_FULLSTACK_ENGINEER — 2026-09-29

Scope: Windows initialization and signed-file/report path handling for CLI, Vault, Fleet and deployment portability.

## Deliverables

- `src/org/orgSigner.ts`, `src/notary/notarySigner.ts`, `src/notary/notaryLog.ts`, `src/org/orgApi.ts`: replaced slash-only parent-directory extraction with `node:path.dirname` at eight call sites.
- `tests/orgSignerPaths.test.ts`: real filesystem and signing regressions for relative filenames, native absolute paths with spaces, tamper/re-sign, existing-directory preservation, sealed notary logs and organization report creation.

## Evidence

- Nightly run 36399068569, commit af43e3aa, Windows Node 22 and 24: initialization failed with EPERM renaming a temporary file onto `.amc/adapters.yaml.sig`. Build/install/help succeeded first. https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/36399068569
- Root cause: `sigPath.replace(/\/[^/]+$/, "")` leaves a Windows backslash path unchanged. `ensureDir` creates the signature destination as a directory, then rename fails. Signature mode is 0644; read-only flags were not the cause.
- Before the fix, the new bare-relative-name regression failed with EISDIR at the actual atomic rename, reproducing the same directory-at-file-path defect on macOS without mocking filesystem or signing behavior.
- After the fix: `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run tests/orgSignerPaths.test.ts tests/trustBoundarySignature.test.ts tests/utilsCoreFoundation.test.ts tests/adapterCapabilityReceipts.test.ts tests/notaryTrust.test.ts tests/orgCompass.test.ts` — 6 files, 82 tests passed, 4.76 seconds, Node 22.22.0.

## Caveats and next owner actions

- Atomic writer, signature format, permission modes and cryptographic verification remain unchanged. No target deletion or rename retry workaround was added.
- Parent owns combined typechecks/build/full suite, generated test counts and hosted Windows qualification. Local macOS evidence does not establish native Windows acceptance.
- Existing malformed signature directories are preserved; no destructive migration is attempted.
- No Git mutations or root builds performed. Existing `.serena/project.yml` user change left untouched.


## REV_FULLSTACK_ENGINEER — 2026-10-02 native HTTP controls

Scope: bridge and workspace-router response contracts. Shared `src/utils/controlHttpResponses.ts` writes the established status/header/JSON/end contract and single-field error envelope. Existing local writer functions, routes, authentication, tenant membership, role, lease, native admission, body parsing, auditing and policy ordering remain explicit.

Deliverables: two source integrations; `tests/controlHttpResponsesParity.test.ts`; complete original modules/handoff and exact restoration map under `unused-code/2026-10-02-native/http-controls/`. The test executes archived full modules with real built dependencies and current public local HTTP servers, plus serialization/getter/native-error parity.

Qualification is recorded by the main-owned `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/http-report.md` and `http-receipt.json`, pinned to the slice commit and fresh acceptance clone. The worker does not claim full-suite, combined gate, release, live-provider or deployment acceptance. Main owns integration and any bounded extension of historical whole-source freeze tests.

## 2026-10-02 API router response slice — REV_FULLSTACK_ENGINEER

Scope: private score/watch/shield/benchmark/export router review at3148; main alone integrates. Nineteen provider drift response projections share five authored helpers. Existing API envelope writers, required-input guards, role/auth/tenant admission, routes and distinct native error policy remain explicit. Benchmark and Export have no equivalent metadata projection; their source bytes are preserved.

Deliverables: routerResponseHelpers.ts, apiRouterResponseParity.test.ts, complete originals and restoration map under unused-code/2026-10-02-native/api-router-responses. Fresh committed qualification and security mutations are pending; no integration, full suite, release, provider or platform claim. Next owner: main integration and serialized aggregate gate, using http2-report.md/http2-receipt.json.


## 2026-10-02 API router response qualification — REV_FULLSTACK_ENGINEER

Qualified active source/test commit: 5f13f8149156e034f8c7b13f9725387ad6a32be1. Archival correction: 22116072c8d1f22ec7e11a0b157843211e6a8acd; complete src/tests Git trees are identical. Private scope retains 19 provider drift response projections through five helpers; Benchmark/Export and all route/admission/error policies remain explicit.

Fresh macOS 26.6.2 arm64 clones used Node 22.22.0 and pnpm 10.33.0 with offline frozen installs. Build, source/test typechecks, full-original-module new parity 145/145, scoped 550/550 in 15 files, actual compiled Studio raw HTTP 12/12, original public d.ts 5/5 and package entries 5/5 passed at the active source boundary. Three actual mutations each produced RED and restored full SHA/Gitblob/bytes; restored new parity passed 145/145. The new corrective clone also built and passed 145/145. No unrelated green checks were repeated for the archive-only correction.

Two quality captures are retained, including the original failed 1316 duplicates/2409 Knip result. Main explicitly authorized renaming only four inactive historical test snapshots to .test.ts.original, with exact bytes/history preserved. The disclosed corrective capture measured 1316 duplicate findings (baseline 1336; 24 removed/4 added, all owned paths) and 2386 Knip findings (baseline 2386; no fingerprint changes). Both strict quality checks FAIL; no scanner/config/floor/waiver changes or additive combined-lane claim.

Full originals, correction histories, inverse text, failed attempts, raw quality payloads and process records remain under unused-code/2026-10-02-native/api-router-responses. Independent observation found all 43 recorded pre-delivery stages/groups/wrappers absent; final commit closure belongs in root http2-receipt.json. Early short source/read shells and the preliminary unused clone lacked full process telemetry and are not acceptance. Main owns integration, full combined suite/gate, any historical freeze extension and release/platform/provider qualification; no HTTP2 extension is needed by the passing scoped helper-visibility tests.
