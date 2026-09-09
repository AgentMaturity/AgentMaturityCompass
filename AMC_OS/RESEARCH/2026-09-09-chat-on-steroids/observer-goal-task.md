# Guided observer workflow — finite AMC implementation Goal

Use GPT-6 Pro for this task and every Goal continuation. No fallback, worker spawn or model switch. Sid wants CoS to keep implementing in parallel while Codex owns the broader program; do not wait for routine permission.

FIRST TOOL CALL: read /agentmaturitycompass/plans/2026-09-09-amc-execution-brief.md in full. Then read this task, root plans/ownership-manifest.md, AMC_OS/ROLEBOOKS/00_GLOBAL_STANDARDS.md and 10_REVENUE_DELIVERY.md. Approved virtual root /agentmaturitycompass maps to /Users/sid/AgentMaturityCompass; use the virtual path for connector read/apply_patch and native paths for exec_command.

The previous capture implementation is complete and merged at 3d1f464c842934ec73d0f68bf1fd30467c054e5f. Do not repeat or alter it. New isolated worktree: /Users/sid/AgentMaturityCompass/tmp/cos-observer-guide, branch codex/cos-observer-guide, base 3d1f464c842934ec73d0f68bf1fd30467c054e5f.

Write ONLY:
- scripts/human-first-use-observer.mjs
- tests/humanFirstUseObserver.test.ts
- docs/HUMAN_FIRST_USE_OBSERVER.md
- AMC_OS/INBOX/REV_IMPLEMENTATION_SPECIALIST.md inside this new worktree.

Read-only foundations: scripts/human-first-use-capture.mjs, scripts/human-first-use-intake.mjs and their guides/tests. All other paths, root and old worktrees are read-only. No installs, builds, tests, script execution/imports, generators, commits, stash/reset, package/lockfile edits, actual human data collection, credentials, harness/model calls, browser/server, uploads or publication. Ignore Graphify. Codex validates after the completed implementation batch.

## Implement an actual usable standalone workflow

AMC-1512 and AMC-1518 need observer collection support. Current capture requires manually authoring JSON for every observation; build a dependency-free guided terminal interface over its existing pure helpers and durable APIs. It must remain import-safe with injected prompt/output seams for tests and require no DSH/Pi components. Do not duplicate or weaken capture/intake validators, hashing or persistence. Do not require adding a package dependency or an npm alias.

1. Implement guided preparation: walk the operator through a complete planned roster and required metadata, pin actual source/artifact/model/settings identities from explicit inputs, print the existing common task/protocol, and create the journal through createCapture. Offer an explicit reviewed preparation-file path as a fast path if useful. Never infer human presence, affirmative consent/independence/first-use, actual model use, outcomes, source pins or observations. Show the full planned population for explicit confirmation before creating it. Unknown/empty must not silently become yes, zero or success; fields the core cannot represent remain visibly unready.
2. Implement a resumable observation loop for an existing planned session using loadCapture, captureStatus, projectSession and appendCapture. Show the existing first-task/recovery/voluntary-return state; offer only meaningful next event categories and a safe pause/exit. Prompt for the actual event fields in plain language; append each explicitly confirmed observation through the current expected head. Require explicit observed UTC timestamps or an explicit record-now choice that calls declareRecordNow and carries its declaration label. Close must use an explicit observed close timestamp plus at/after-close attestation, never automatic future times. Keep failed/incomplete outcomes, unknown refusal fixes/coverage and separate recovery/return. Do not overwrite, replace a roster, drop prior events, or auto-close on EOF/Ctrl-C. A conflict must show what remains unsaved and ask the operator to review/reconcile; never blindly retry or append an observation twice.
3. Implement readable status and guided export with all planned sessions/missing outcomes visible, explicit evidence-root/new-output paths and the reviewed current head. Delegate full-roster admission and actual recording verification to finalizeCapture. Clearly distinguish blocked export, completed roster export, successful task, human participation and issue completion. Do not launch a server, open a browser, run a harness or collect data unattended. Existing low-level correction CLI remains the reviewed escape hatch; do not invent a destructive repair flow.
4. Author focused synthetic-only terminal regressions with scripted prompts: meaningful preparation/observation/export call-through to real temporary capture storage, pause/EOF/cancellation without fabricated observations, explicit unknown handling, timestamp/close rules, conflict handling, no overwrite, plain refusal/help and no hidden execution. Write concise command examples and a guide explaining declarations, private journals and resumption. Do not run tests. Maintain a resumable handoff at each useful boundary with finished/remaining steps.

Automatically continue to the next unfinished step. Do actual implementation, not repeated audits or plans. If blocked by capability or exact path ownership, preserve partial files and state the concrete blocker; participant availability is not needed for implementation. When all code, authored tests, guide and handoff are complete, put this exact line in BOTH the final handoff and final response:

Implementation queue complete; ready for Codex integration and final validation

Then stop automatic work instead of replaying completed steps. This is not a passing-test, human-study, release or issue-Done claim. Codex will review and integrate; Sid asked Codex to check CoS only on completion, timeout or when instructions are required.
