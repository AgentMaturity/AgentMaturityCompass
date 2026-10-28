# P2-17: govern any harness (parts A to D)

Recorded on 2026-10-28 on local macOS arm64 (not CI) at commit `ce6fb85e5bd202cff4cbffb5b067886e15f3aba2`, branch `rtd/w4-p2-17`.

- **A. Manifests and matrix.** Four manifests in `docs/adapters/manifests/` (copies in `manifests/`). Pi 1.0.2 and 1.0.4 are enforced at `tool_call`, and Claude Code 2.1.296 at `PreToolUse` and `UserPromptSubmit`. Both are backed by the P1-22 and P1-23 records, whose hashes are checked against each folder's `receipt.json`. `SUPPORT_MATRIX.md` is a copy of the generated matrix. The support policy is a draft pending Sid.
- **B. Codex.** `@openai/codex@0.165.0` (tag `rust-v0.165.0`, commit `360319d8`) reviewed from source in `docs/source-reviews/P2-17-codex-hooks.md`. Its `PreToolUse` fails open, so AMC installs no Codex hook and claims nothing. The binary was not run.
- **C. DSH plugin.** `@deepseek-ai/dsh@0.2.1-rc.2` (commit `687f282e`) reviewed in `docs/source-reviews/P2-17-dsh-plugin.md`. `packages/dsh-amc-plugin` gates `tools/pre-execute`, backed by a guard, and fails closed. It is tested against a fake Cordis context only. No Bridge `dsh` provider and no installed run exist, so there is no DSH claim.
- **D. GA.** Support-status docs; `.github/workflows/harness-conformance.yml` (first run pending, in CI); `PUBLISH.md` with the `npm pack` dry run and Sid's publish steps (not published).
- **Tests:** 34 passed, 7 skipped (the opt-in binary conformance suites), 0 failed.
- **Mutation checks:** 9, all killed and restored (listed in `receipt.json`).
- **Pending:** Sid approves `SUPPORT_POLICY.md` and accepts the DSH pre-release pin. Still to come: the first green nightly run, a recorded Codex or DSH binary run, the Bridge `dsh` provider and transport, and DSH session registration.

## Follow-on on the same branch (2026-10-28)

- **DSH, AMC side:** Bridge provider `dsh` with a fixed argument schema per tool (`src/adapters/dsh/dshProvider.ts`), session registration (`src/bridge/dshSessionRegistry.ts`), installer (`--provider dsh`, control only) and transport (`src/adapters/dsh/dshControlClient.ts`), which the plugin loads by dynamic import. No DSH version is qualified, so the Bridge denies every DSH call.
- **Codex observe:** route `/bridge/hooks/codex/v1`, recorder (`src/bridge/codexObservations.ts`, digests only), forwarder and installer (`--provider codex --mode observe`). Control is refused.
- **Tests:** 312/312 across the 27 hook-path suites in `receipt.json`. Mutation checks are listed in its notes; one mutant was equivalent.
