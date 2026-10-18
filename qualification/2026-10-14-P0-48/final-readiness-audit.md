# P0-48 final readiness audit — 14 October 2026

P0-48’s log fix is already merged. The remaining readiness defect is the matrix’s default sibling cancellation. Accepted main `5ea5e866a` configures Node 22 and 24 but omits `strategy.fail-fast`. GitHub documents the default as true: a matrix failure cancels queued/running siblings. The smallest supported proposal is `fail-fast: false` under only `jobs.build-test.strategy`; the original runner, matrix, timeouts, failing exits, coverage and freeze checks remain intact. [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast).

[Merged PR40](https://github.com/AgentMaturity/AgentMaturityCompass/pull/40) explicitly requires its own build-test jobs to finish. Its historical Node 24 failure/Node 22 cancellation does not satisfy both-job completion. Current main run 38132701944 likewise records Node 22 failure at 11:10:55Z and Node 24 cancellation at 11:11:12Z; Node 24’s full-suite step is cancelled while diagnostics upload succeeds. This is consistent with fail-fast. The log states cancellation but does not name the matrix cause, so that causal attribution is an inference from source, documentation and timing. A future pinned run can prove current completion; it cannot rewrite the old PR’s evidence. [Current CI run](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/38132701944).

The acceptance boundary is runner survival and observed results on both Node versions. It does not turn genuine assertion/coverage failures green; those remain P0-33 and inherited issue debt. P0-48 expressly excludes product foreign-child stdout policy. No runtime cap or refusal behavior should change.

## Existing proof and tests

The immutable 7a81 Node 22 full report already passes all 12 foreign-runner tests, including the actual 5 MiB input refusal. The one-case stdout spy restores in finally; the recording cap remains 4 MiB. No new test was run here. The historical probe’s original redirected run measured 5,244,733 output bytes and a 5,242,903-byte longest line; its patched printing run passed. Neither the whole historical probe nor the current matrix is green.

Accepted main already has `tests/reconciliationDefectsReleaseGate.test.ts` named-step checks for both workflows and an `AMC_RECONCILE_ROOT` mutation seam. P0-33’s fuller `ciWorkflowContract` and `sourceQualityRatchet` files exist only on its held branch; they depend on broader P0-33 changes and must not be overlaid wholesale. Their YAML-selection and exact Bash/npm-shim patterns are reusable. No dedicated accepted test currently proves 4096 console clipping, full tee retention, producer exit propagation or matrix fail-fast policy.

For later qualification, execute each actual workflow test run block in a temporary directory with an npm shim emitting 5 MiB of ASCII and stderr. Capture console output to a file, measure the longest line, and verify full tee bytes and shell statuses 0/17 for success/failure producers under explicit bash pipefail. Then retain or obtain exact-source Node 24 foreign-runner proof. Both hosted matrix jobs still need completed full-suite results without sibling cancellation. Do not trigger npm-publish to qualify logging.

## Freeze and ownership

The D-15 manifest has no row for either workflow, the foreign-runner test or the existing reconciliation test. Exact archive metadata search finds no frozen row; the preserved comprehensive `needs-snapshot.mjs --paths ... --at 5ea...` returns `none`. No snapshot registration is currently required for these bounded paths; any actual newly discovered frozen dependency must be registered before edit, preserving originals. D-15’s live behavior versus archived freeze distinction remains mandatory.

The dated reservations name no CI/npm-publish/P0-48 claim. Claude session metadata remains idle; that grants no general clearance. Preserve all held work and perform any later authorized change only in a new isolated accepted-main branch. This audit performs no implementation, source change, build, test, hosted rerun, PR, publication or tracker mutation.

The JSON companion records exact PR40 acceptance, current source hashes, actual job/step timestamps, existing regression evidence, D-15 helper provenance, reservation sources and the precise one-line proposed patch.
