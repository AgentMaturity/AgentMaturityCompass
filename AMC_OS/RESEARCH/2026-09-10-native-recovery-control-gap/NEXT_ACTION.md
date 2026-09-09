# Native recovery/control gap — instruction-needed safe checkpoint

Task: `native-recovery-control-gap-batch`. Checkpoint: `2026-09-09T21:40:51.909515+00:00`.
Repo/branch: `/Users/sid/AgentMaturityCompass`, `amc/gap-register-execution`.
Owner: `cos-native-recovery-control-gap-prime`, **released**.

## Delivered implementation

Runtime `efb4b638f4814637086d3fe076a6eba5685d6cad` implements real same-Studio reattachment after actual ACP
process exit and original configuration/controller preservation for SQLite and
JSONL. Test-only correction `8d09ddd4517ff86298ccc1a563dbdb945a28bf88` requires the existing failed-task
response rather than an incorrect HTTP 409 assumption. Exact owned paths and
contract are in ownership.json and SCOPE.md. No external callback or parent
controller is fabricated; native approvals/validation retain original bindings.

## Exact stopping gate

`write_stdin(session_id=3263, chars="", yield_time_ms=1000)` was blocked:

> This tool call was blocked by OpenAI because we couldn't determine the safety status of the request.

No retry or alternate acceptance-result route was used. Later CoS metadata
automatically reported that session 3263 finished with exit 0. This is process
closure, not a promoted qualification. Independent cleanup-only inspection
confirmed no owned runner/group remained and recorded all fixture servers and
browsers closed. See process-closure.json; no signals were needed.

## Evidence boundaries

Candidate01, source `efb4b638f4814637086d3fe076a6eba5685d6cad`: fresh clone/build; new scope **20 passed,
2 failed**, unqualified. Exact logs/report retained under
`tmp/cos-native-recovery-control-gap-01/candidate01/receipts/`.

Candidate02, source `8d09ddd4517ff86298ccc1a563dbdb945a28bf88`: separate fresh clone, run ended; acceptance
contents remain **unreviewed after the tool gate**, not a current pass/fail claim.
Retain `tmp/cos-native-recovery-control-gap-01/candidate02/receipts/`.

Security mutations: helper authored, **not executed**. Installed acceptance:
**not started**; installed-case.mjs is declared but **not authored**. Source-only
individual Chromium recovery is not installed cookie/browser/tool approval or a
human trial. No full-suite, release-gate, other-platform, provider, key-rotation,
publish/deploy or full-program claim. Do not use historical counts as substitutes.

## Actual tracker/vault results

AMC-1511 checkpoint: `74bb5573-626d-4bf8-9c70-003361b41a1c`.
AMC-1538 checkpoint: `d494c0bb-5259-47c4-a406-8e93d22ed747`.
AMC-1540 checkpoint: `0674270f-ff06-4f69-a618-95f52348d311`.
All batch comments are delivered; no state transitions.
Vault note actually updated: `Evidence/2026-09-10 Native Recovery Control Gap.md`.
Home/Now/Roadmap and old checkpoints were unchanged.

## Next real action

After legitimate resolution of the review gate, reconcile the retained candidate02 acceptance evidence without assuming success from process closure; run restored security mutations at the pinned candidate and author/execute separate installed cookie/browser/tool-approval acceptance. Preserve the failed first attempt. Do not rerun old platform or erasure lanes.

`instructionNeeded=true`; `ownershipReleased=true`; `activeOwnedExecution=null`;
`workers=[]`; `remainingOperation=null`. No hidden next batch, browser, server,
VM, worker or background writer. Central execution status remains stale and is
not authoritative. Prior refusals, unowned dirty paths, old helper repin, shared
stash and every worktree remain preserved. No predecessor conversation was
prompted. GPT-6 Pro was requested; prime tool metadata cannot independently
attest its model, and no worker model was assumed. Bridge remains Unattributed.
