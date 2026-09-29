# AMC completion and remote-development handoff — 2026-09-29

Candidate: `421859b0c9c3b961731f847870b35b9dfecca96d`, source version **1.2.0**. This records the verified current runtime scope, not completion of every historical research, commercial, or roadmap item. The initial [pending audit](pending-audit.md) and earlier failure receipts remain historical evidence; the dispositions below supersede their implementation status.

## Implemented and exercised

- Windows initialization now uses portable signer paths. Actual Ubuntu, macOS and Windows jobs passed on Node 22 and 24 at product commit `5e87d9bb`; subsequent candidate changes affect documentation links and the acceptance harness only. See [six-platform receipt](platform-matrix-5e87d9bb.json).
- Installed `amc composition` resolves the bundled kernel. Continuous red-team metadata describes the transformations actually applied and leaves uncalibrated confidence unavailable. Source-file inventory cannot satisfy a requested behavioral gaming-resistance gate; that gate now fails closed while measurement is unavailable.
- Tests write signed guard evidence into owned temporary workspaces. Readiness reads no longer create or alter a customer's ledger or signing state. Production dependency advisories and the separate QA lockfile advisories were repaired without changing dependency manifests.
- Public installation scripts now select the existing **1.1.1** release instead of requesting nonexistent 1.2.0 assets. An isolated macOS download, checksum verification, install and CLI smoke passed. This repairs the published channel; it does not publish the current native runtime.
- Website navigation, language/theme persistence, changelog landmarks and keyboard skip-link focus received actual browser checks. Promoted installation guides now link to valid repository resources.
- The installed 1.2.0 candidate passed 13 Studio browser scenarios, including authentication, agent binding, approvals, cancellation, retries, archive, release and resume, followed by cold verification. A real approved file write followed by writer termination recovered as an uncertain outcome without replaying the side effect. Process ownership and bounded cleanup are tested independently. See [installed acceptance](installed-acceptance/README.md).
- A separate clean source clone installed with the frozen pnpm lockfile, built, ran a signed keyless turn and resumed across processes. After its harness-only update to the candidate, it was rebuilt and all 3,985 packaged files were checked against the clone. Isolated `npm link`, CLI version and the native onboarding guide passed.

The installed artifact SHA-256 is `ac77c45bd07e186dc42fcb4d9a5e27044e388b5faeec47b9b6a55c691a7580d2`; its built CLI SHA-256 is `8e3b67d600a3559b940888f8e58634e1358cd022cb28c7cdd502f12d4405946c`. These are local artifact receipts, not a claim that this digest is publicly released.

## Final validation

The full instrumented suite passed **14,130/14,130 tests across 1,489 files**, zero failures, pending or todo (546.36 seconds). Coverage was **70.01% lines, 78.20% functions, 64.16% branches and 68.94% statements**, above the unchanged 65/75/59/64 floors. Console/dashboard exclusions remain explicit. See [coverage receipt](coverage-final.json).

The final [release gate](release-gate-final.json) passed **14/14 executed checks**, including both typechecks, build, fresh packed install, the normal full suite (**14,130/14,130**, zero skipped), command inventory, architecture, documentation, runtime audit, CLI/domain smoke and all installation personas. The sole skipped step is **live-deploy-health** because no deployment URL is configured; overall deployment qualification remains partial. Previous failed receipts are retained separately and are superseded for the corrected paths, not rewritten as passing runs.

The final [website browser run](website-final.json) passed **57/57 tests**, zero skipped, unexpected or flaky, in 31.97 seconds.

The [hosted snapshot](final-hosted-status.json) records successful Docker build/smoke/push at the candidate, successful Pages deployment of the latest website/docs commit, byte-identical live installer scripts and zero open Dependabot alerts. GitHub's full test jobs were still active and the npm workflow pending at that snapshot; hosted CI is **not** certified all-green. [Older CI diagnostics](older-ci-diagnostics.json) preserve the missing-log/cancellation evidence without assigning an unproven cause.

## Continue on another device

All 67 registered worktree heads and all 191 local branch tips are ancestors of this candidate. The same 93 local runtime/build paths in eight other worktrees are preserved; none is a missing source dependency. See [worktree audit](worktree-status-421859b0.json). Private credentials, runtime stores and previous sessions are not transferred by cloning source.

Use Node **22** (or the qualified Node 24) and pnpm **10.33.0**:

```sh
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass
git switch main
corepack enable
pnpm install --frozen-lockfile
pnpm run build
npm link
amc agent-loop guide
```

If Corepack is unavailable, install `pnpm@10.33.0` globally before the pnpm command. Root dependency installation uses pnpm because the repository contains `workspace:*` packages. For an existing clean clone, fetch and use a fast-forward-only pull. Rebuild `better-sqlite3` if changing Node major versions. [Installation](../../../docs/INSTALL.md) and [the native workflow](../../../docs/NATIVE_AGENT_WORKFLOW.md) describe provider setup and governed tasks. `npm run check:clean-source` repeats the portable keyless installation/continuation check.

## Remaining boundaries and next required inputs

| Item | Current disposition and next action |
|---|---|
| Real-model end-to-end acceptance / AMC-1512 | No provider access was configured in the inspected AMC credential layers/environment; see [provider readiness](provider-readiness.json). A selected provider/model and credential or reachable local endpoint are still required. Select a provider/model and provision access, then run the real governed-turn acceptance. Current stub/local MCP receipts prove runtime behavior, not model quality or independent human acceptance. |
| Public 1.2.0 distribution and live governed deployment | npm and GitHub releases still serve 1.1.1. Specify the release/publication identity and deployment target, complete their release gates, publish the qualified artifact and run the deployed authenticated governed-turn probe. A working static website or image build is not that probe. Live deployment health is a separate gate. |
| Hosted full-suite CI | Active/pending at the recorded snapshot. Inspect final jobs and diagnostics; the prior cancelled runs had insufficient logs to determine cause. Local receipts do not turn those hosted jobs green. |
| Behavioral gaming resistance | Explicitly `not_measured`, with null score/level. Source inventory is diagnostic only. Implement and independently qualify an actual behavioral measurement before requiring a positive gaming-resistance score. |
| Tracker reconciliation | Linear authorization was unavailable. No issue comments or transitions were sent. The historical 35-reconciliation queue is not a live defect count; reconnect and reconcile issue evidence against this handoff. |
| Independent outcomes / AMC-1518 | Human first-use, preregistered matched comparison and adoption claims still need actual participants, model access and independent review. No superiority claim is established here. |
| Historical production credentials | Current source fixes do not establish historical rotation or revocation. Owner-controlled rotation evidence remains unresolved. No production keys were changed. |
| Specification license / G5-18 | Owner decision remains open; the existing repository license remains in effect. |
| Explicit roadmap/maintenance scope | Execute action classes on leases, JSONL automatic retention, external-copy erasure and independent DSAR subject mapping, future session-format migration, optional native tool/provider breadth, monolith decomposition, UI coverage/lint and original QA-boundary acceptance remain separately scoped work. Their absence is not concealed by passing tests or by relabeling them complete. Supported session recovery and fail-closed unsupported-format handling are documented. |

The [initial audit](pending-audit.md) contains the historical issue references and narrower acceptance boundaries. This handoff closes the source defects listed above and records current execution evidence; it does not erase earlier failures or fabricate external acceptance.
