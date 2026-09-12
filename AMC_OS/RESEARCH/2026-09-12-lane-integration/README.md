# Native lane integration — 2026-09-12 (Claude Code, Fable 5.1)

**Status: integration committed and reproduced in a fresh clone at candidate C `09d353f5` — full suite
1,477/1,477 files and 14,043/14,043 tests with no skips, release gate 14/14 executed checks (live-deploy-health
skipped). This is source and local-package qualification on Darwin arm64 / Node v25.5.0; it is not platform,
published-package or deployed-release qualification.**

Standing order: `plans/2026-09-09-amc-execution-brief.md` plus Sid's 2026-09-12 `/goal`
directive to integrate the authored P01–P10 lane source into AMC end to end. Environment for
every root measurement: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. Fresh-clone
measurements name their own commit and environment in `fresh-clone/`.

## What was integrated

The dormant root authoring classified in
`../2026-09-09-worktree-audit/refresh-2026-09-12T131601Z/` (232 recoverable lane paths):
P01 native CLI chat/approvals/usage, P02 terminal/PTY, P03 MCP reconnect, P04 signed
executable extensions, P05 providers and modalities (DeepSeek, Gemini, Gemini audio, Ollama;
signed image, ordered and audio input), P06 Python SDK, P07 TypeScript SDK, P08 ACP, P09 Studio
console, P10 Studio backend, AMC-1512 human first-use protocol, batch-01/02 corrections.

Commits on `amc/gap-register-execution` from `4d2d69e5`: `a3467629` (P01/P02/P05),
`b0104235` (P03/P04), `858aaa08` (P06/P07/P08), `54c3ce6a` (P09/P10), `da626c52`
(AMC-1512, batch-01/02), `41180d62` (integration fixes), `c1b5cf9c` (records).
Then `24584211` (generated counts and OpenAPI artifact, produced in a fresh clone), `40f80de1`
(records; candidate B), `09d353f5` (gate repairs: line-cap extractions and opt-in registration;
candidate C). The records commit after C is documentation only.

## Integration defects found and fixed (product)

| Defect | Fix | Evidence |
|---|---|---|
| P05 added `audio` to `SurfaceKind` with no content block; closed-union proof failed | `AudioContentBlock` in `src/llm/streamChunk.ts`; assembler/recorder refuse it like `image` | `logs/tsc-src.txt` (11 errors) → `logs/tsc-src-5.txt` (0) |
| SDK event-buffer ceilings validated through a narrowed JSON view | validated from `unknown` in `src/sdk/nativeAgentClient.ts` | same |
| Studio descriptor stored a readonly validation selection | copies `checkIds` in `src/studio/nativeTaskService.ts` | same |
| Media above the 64 KiB signed per-event cap failed as a bare ledger error after admission | `src/session/sessionPayloadCap.ts` at `LoopInbox.insert` and `recordUserAttachment`; Studio `INPUT_TOO_LARGE` 413 and effective `maxSerializedPartsBytes`; new `amc ops sign` | `tests/sessionPayloadCap.test.ts`; mutations `logs/mut1.txt`, `logs/mut2.txt` RED, `logs/mut3.txt` GREEN |
| First-use guide offered deepseek but not gemini/gemini-audio/ollama | `src/setup/nativeFirstUseGuide.ts`, interactive prompt, CLI help | `tests/nativeFirstUseGuideProviders.test.ts` |
| Studio omitted deepseek/ollama and could not tell a keyless local server from the stub demo | provider entries carry `model: "fixed" \| "required"`; deepseek text-only, ollama local | `cosProduct10NativeTaskService` |
| Promoted guides linked to unpromoted guides | `website/docs/docs.js` promotes the five linked guides | `publicDocsGraph` |

## Executed in root (not receipts; reproduced in `fresh-clone/`)

| Check | Result | Log |
|---|---|---|
| `tsc -p tsconfig.json` / `tsconfig.tests.json` at capture | 11 / 57 errors | `logs/tsc-src.txt`, `logs/tsc-tests.txt` |
| same, fresh clone of HEAD `4d2d69e5` | 0 / 4 errors | `logs/tsc-src-head.txt`, `logs/tsc-tests-head.txt` |
| same, after integration | 0 / 0 | `logs/tsc-src-6.txt`, `logs/tsc-tests-10.txt` |
| P01–P10 lane files (27) | 26 pass, 1 browser-gated skip (after one fixture fix) | `logs/lane-tests-cos.txt`, `logs/p10-rerun.txt` |
| Python P06 lane files | 109 passed | `logs/py-lane-tests.txt` |
| 77 lane/native/touched files after fixes | 73 passed, 1 skipped, 3 failed (2 stale-dist, 1 fixed after) | `logs/lane-tests-all.txt`, `logs/rc5c.txt` |
| `pnpm build` | passed | `logs/build-2.txt` |
| dist-backed validation surfaces | 16/16 | `logs/dist-tests-2.txt` |
| Python suite vs `dist/cli.js` | 289 passed, 22 failed (21 need the wheel installed; 1 stale substring, fixed), 1 skipped | `logs/py-all-tests.txt` |
| Full `vitest run` (root) | 1,462/1,477 files, 14,025/14,057 tests; 17 failures classified below | `logs/full-suite-root.txt` |
| the 14 failing files at HEAD `4d2d69e5` (fresh built clone) | 6 files / 8 tests pre-existing | `logs/head-baseline-failing-files.txt` |
| Studio browser test | not executed: Playwright needs Chromium headless shell 1234 (download not performed) | `logs/studio-browser.txt` |

Failure classification of the 17: pre-existing at HEAD (8) — ACP output-bound tests writing
850–900 KB blocks the cap refuses (2), docs graph edges (1), README count drift (2), JSONL
writer-recovery semantics (3); lane/integration-caused (9) — v4 encoders bind provider tool
names (4 tests in 4 files), guide provider list (1), revision-0 schema refusal (1), typedoc
absent from root node_modules (1), perf floor under load (1; 2/2 in isolation,
`logs/perf-isolated.txt`). All are resolved in the tree except the two generator artifacts,
regenerated only in the fresh clone.

## Not done / blockers

- Spill-backed attachments above `retention.maxPayloadBytesPerEvent`; the cap refusal names the fix.
- Playwright Chromium download for `cosProduct09StudioPage` (needs Sid's confirmation).
- Python installed-wheel tests (`test_validation_installed.py`) need the wheel installed in an interpreter.
- Known-open still open: `studioState.ts:130` issues all four scopes to every agent token; no spawn path installs hook control.
- The Sep 9–11 sessions' audit receipts (8.3 MB, 119 paths) remain untracked under the ignored `AMC_OS/` path.

## Fresh-clone acceptance

`fresh-clone/README.md`: candidate C `09d353f5` — install, build, typechecks 0/0, OpenAPI check, full suite
1,477/1,477 files and 14,043/14,043 tests (0 failed, 0 skipped), Python 290 passed / 21 installed-wheel
failures / 1 skipped, release gate 14/14 executed checks passed with live-deploy-health skipped. Candidate B
failed the gate on two checks (new files over the 800-line cap; 15 opt-in skips in the mandatory profile),
repaired in C by extracting `src/sdk/nativeAgentErrors.ts` and `src/cli-agent-guide-commands.ts` and by
registering opt-in scenarios only under their documented conditions.
