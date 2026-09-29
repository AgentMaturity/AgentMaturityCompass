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
