# P2-17 part A: adapter claim manifests and the harness support matrix

Recorded on 2026-10-28 on local macOS arm64 (not CI) at commit `29f8d2722193f3c69e3a45b64f5d98b90ca230ce`.

- Four manifests in `docs/adapters/manifests/`: Pi 1.0.2 and 1.0.4 (enforced at `tool_call`), Claude Code 2.1.296 (enforced at `PreToolUse` and `UserPromptSubmit`), backed by the P1-22 and P1-23 qualification records (hashes checked against each folder's `receipt.json`); DSH observe-only (launch capture, no qualified version); Codex unsupported (no integration yet).
- `SUPPORT_MATRIX.md` here and `manifests/` are copies of the generated matrix and the manifests at that commit.
- Tests: 18/18 across `tests/adapterManifest.test.ts`, `tests/harnessMatrix.test.ts`, `tests/piConformanceMatrix.test.ts`.
- Mutation checks (each killed, then restored): enforce without a receipt case; enforce with `onFailure` other than `blocks`; record hash not compared; case values not compared.
- Pending: Sid's approval of `docs/adapters/SUPPORT_POLICY.md` (a `DECISION:` comment on the P2-17 heading); parts B, C and D.
