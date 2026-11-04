# Harness comparison: p1-47-pilot-live

These are automated execution and independent-oracle records. There is no inferred ranking, maturity score, human usability rating or superiority factor.

Manifest SHA-256: `f53860ee3c4e4bd2923448c7122bdc13a2dea527ba126cb90f4ef7b7ae58b27c`. Started 2026-10-18T11:44:52.705Z; finished 2026-10-18T11:44:52.759Z.

| Target | Lane | Requested | Ran | Determinate | Qualified pass | Qualified fail | Unavailable | Inconclusive | Command wall median ms | Timing samples |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| amc-native | live (live-provider) | 60 | 0 | 0 | 0 | 0 | 60 | 0 | N/A | 0 |
| pi-contained | live (live-provider) | 60 | 0 | 0 | 0 | 0 | 60 | 0 | N/A | 0 |
| pi-contained-amc | live (live-provider) | 60 | 0 | 0 | 0 | 0 | 60 | 0 | N/A | 0 |
| pi-contained-tuned | live (live-provider) | 60 | 0 | 0 | 0 | 0 | 60 | 0 | N/A | 0 |
| pi-contained-amc-tuned | live (live-provider) | 60 | 0 | 0 | 0 | 0 | 60 | 0 | N/A | 0 |

Timing includes failed/inconclusive executions and adapter startup/cleanup wait. Missing timings, usage, cache, costs and interventions remain unknown; `summary.json` includes each metric's actual sample count and missing count. Cost observations retain their source URL/date. Human actions and automated fixture actions are separate.

## Observed task outcomes before qualification

These independent oracle outcomes passed the input-integrity checks. They do not imply verified budgets or successful cleanup. A local model call is an attributed adapter observation, not model-identity or quality attestation; missing token usage keeps the qualification above inconclusive.

| Target | Lane | Task pass | Task fail | Outcome unknown | Model called (reported) | Model call unknown | Budget unknown |
|---|---|---:|---:|---:|---:|---:|---:|
| amc-native | live | 0 | 0 | 60 | 0 | 60 | 60 |
| pi-contained | live | 0 | 0 | 60 | 0 | 60 | 60 |
| pi-contained-amc | live | 0 | 0 | 60 | 0 | 60 | 60 |
| pi-contained-tuned | live | 0 | 0 | 60 | 0 | 60 | 60 |
| pi-contained-amc-tuned | live | 0 | 0 | 60 | 0 | 60 | 60 |

## Repeat

Invoke `runHarnessComparison` with the original manifest path recorded in `report.json`, a new output directory and the recorded execution opt-ins. The redacted manifest copy is for inspection; it is not a replacement for the original pinned input. Verify the same original manifest digest and exact platform/runtime before comparing a repeat.

Registered CLI repeat argv (replace the output placeholder): `["amc","bench","harness-compare","--manifest","/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/P1-47-runs/f2-live-no-credentials/inputs/manifest.json","--out","<NEW_OUTPUT_DIRECTORY>","--allow-adapter-execution","--live"]`.

## Limits

- Automated conformance is not a human usability study or a coding-performance ranking.
- Shared manifest settings match requested conditions; effective model, permission and token/spend enforcement remain the pinned adapter's responsibility.
- The runner enforces wall time, isolated HOME/work directories, bounded capture and process-group termination; it is not an OS filesystem/network sandbox.
- Source commits are declared provenance. Determinate trials require artifact, executable, fixture, adapter and oracle file digests to match before and after execution; this does not attest a build-to-source relationship or every dynamic dependency.
- Latency is complete target-command wall time including adapter startup and process-group wait, not model-only latency. Failed and inconclusive executions retain their timing.
- Token/cache/cost/action counters remain attributed observations; missing values are unknown, and token/spend comparisons are retrospective rather than a substitute for live budget enforcement.
- Local-provider lanes declare literal loopback origins and operator model/runtime digests; the pinned adapter must enforce actual upstream/redirect boundaries and verify those identities. Loopback can still host a proxy; the runner does not attest where inference occurred.
- A reported model call and an observed task result are separate from qualification. Missing local token usage leaves the bounded trial inconclusive; no monetary observation or scripted-backend quality claim is manufactured.
- Durable raw captures are bounded and redacted; digests identify those retained bytes, not an undisclosed original. No superiority factor is inferred.

## Unavailable and inconclusive trials

- t1-amc-native-coding-range-normalization-r1: unavailable; Required named live credentials are unavailable.
- t2-pi-contained-coding-range-normalization-r1: unavailable; Required named live credentials are unavailable.
- t3-pi-contained-amc-coding-range-normalization-r1: unavailable; Required named live credentials are unavailable.
- t4-pi-contained-tuned-coding-range-normalization-r1: unavailable; Required named live credentials are unavailable.
- t5-pi-contained-amc-tuned-coding-range-normalization-r1: unavailable; Required named live credentials are unavailable.
- t6-amc-native-coding-quoted-csv-r1: unavailable; Required named live credentials are unavailable.
- t7-pi-contained-coding-quoted-csv-r1: unavailable; Required named live credentials are unavailable.
- t8-pi-contained-amc-coding-quoted-csv-r1: unavailable; Required named live credentials are unavailable.
- t9-pi-contained-tuned-coding-quoted-csv-r1: unavailable; Required named live credentials are unavailable.
- t10-pi-contained-amc-tuned-coding-quoted-csv-r1: unavailable; Required named live credentials are unavailable.
- t11-amc-native-coding-stable-dependencies-r1: unavailable; Required named live credentials are unavailable.
- t12-pi-contained-coding-stable-dependencies-r1: unavailable; Required named live credentials are unavailable.
- t13-pi-contained-amc-coding-stable-dependencies-r1: unavailable; Required named live credentials are unavailable.
- t14-pi-contained-tuned-coding-stable-dependencies-r1: unavailable; Required named live credentials are unavailable.
- t15-pi-contained-amc-tuned-coding-stable-dependencies-r1: unavailable; Required named live credentials are unavailable.
- t16-amc-native-cod-bug-fix-r1: unavailable; Required named live credentials are unavailable.
- t17-pi-contained-cod-bug-fix-r1: unavailable; Required named live credentials are unavailable.
- t18-pi-contained-amc-cod-bug-fix-r1: unavailable; Required named live credentials are unavailable.
- t19-pi-contained-tuned-cod-bug-fix-r1: unavailable; Required named live credentials are unavailable.
- t20-pi-contained-amc-tuned-cod-bug-fix-r1: unavailable; Required named live credentials are unavailable.
- t21-amc-native-cod-dependency-upgrade-r1: unavailable; Required named live credentials are unavailable.
- t22-pi-contained-cod-dependency-upgrade-r1: unavailable; Required named live credentials are unavailable.
- t23-pi-contained-amc-cod-dependency-upgrade-r1: unavailable; Required named live credentials are unavailable.
- t24-pi-contained-tuned-cod-dependency-upgrade-r1: unavailable; Required named live credentials are unavailable.
- t25-pi-contained-amc-tuned-cod-dependency-upgrade-r1: unavailable; Required named live credentials are unavailable.
- t26-amc-native-cod-docs-consistency-r1: unavailable; Required named live credentials are unavailable.
- t27-pi-contained-cod-docs-consistency-r1: unavailable; Required named live credentials are unavailable.
- t28-pi-contained-amc-cod-docs-consistency-r1: unavailable; Required named live credentials are unavailable.
- t29-pi-contained-tuned-cod-docs-consistency-r1: unavailable; Required named live credentials are unavailable.
- t30-pi-contained-amc-tuned-cod-docs-consistency-r1: unavailable; Required named live credentials are unavailable.
- t31-amc-native-cod-multi-file-r1: unavailable; Required named live credentials are unavailable.
- t32-pi-contained-cod-multi-file-r1: unavailable; Required named live credentials are unavailable.
- t33-pi-contained-amc-cod-multi-file-r1: unavailable; Required named live credentials are unavailable.
- t34-pi-contained-tuned-cod-multi-file-r1: unavailable; Required named live credentials are unavailable.
- t35-pi-contained-amc-tuned-cod-multi-file-r1: unavailable; Required named live credentials are unavailable.
- t36-amc-native-cod-test-writing-r1: unavailable; Required named live credentials are unavailable.
- t37-pi-contained-cod-test-writing-r1: unavailable; Required named live credentials are unavailable.
- t38-pi-contained-amc-cod-test-writing-r1: unavailable; Required named live credentials are unavailable.
- t39-pi-contained-tuned-cod-test-writing-r1: unavailable; Required named live credentials are unavailable.
- t40-pi-contained-amc-tuned-cod-test-writing-r1: unavailable; Required named live credentials are unavailable.
- t41-amc-native-fin-cross-tenant-r1: unavailable; Required named live credentials are unavailable.
- t42-pi-contained-fin-cross-tenant-r1: unavailable; Required named live credentials are unavailable.
- t43-pi-contained-amc-fin-cross-tenant-r1: unavailable; Required named live credentials are unavailable.
- t44-pi-contained-tuned-fin-cross-tenant-r1: unavailable; Required named live credentials are unavailable.
- t45-pi-contained-amc-tuned-fin-cross-tenant-r1: unavailable; Required named live credentials are unavailable.
- t46-amc-native-fin-duplicate-capture-r1: unavailable; Required named live credentials are unavailable.
- t47-pi-contained-fin-duplicate-capture-r1: unavailable; Required named live credentials are unavailable.
- t48-pi-contained-amc-fin-duplicate-capture-r1: unavailable; Required named live credentials are unavailable.
- t49-pi-contained-tuned-fin-duplicate-capture-r1: unavailable; Required named live credentials are unavailable.
- t50-pi-contained-amc-tuned-fin-duplicate-capture-r1: unavailable; Required named live credentials are unavailable.
- t51-amc-native-fin-error-before-commit-r1: unavailable; Required named live credentials are unavailable.
- t52-pi-contained-fin-error-before-commit-r1: unavailable; Required named live credentials are unavailable.
- t53-pi-contained-amc-fin-error-before-commit-r1: unavailable; Required named live credentials are unavailable.
- t54-pi-contained-tuned-fin-error-before-commit-r1: unavailable; Required named live credentials are unavailable.
- t55-pi-contained-amc-tuned-fin-error-before-commit-r1: unavailable; Required named live credentials are unavailable.
- t56-amc-native-fin-receipt-lost-r1: unavailable; Required named live credentials are unavailable.
- t57-pi-contained-fin-receipt-lost-r1: unavailable; Required named live credentials are unavailable.
- t58-pi-contained-amc-fin-receipt-lost-r1: unavailable; Required named live credentials are unavailable.
- t59-pi-contained-tuned-fin-receipt-lost-r1: unavailable; Required named live credentials are unavailable.
- t60-pi-contained-amc-tuned-fin-receipt-lost-r1: unavailable; Required named live credentials are unavailable.
- t61-amc-native-fin-reconcile-readonly-r1: unavailable; Required named live credentials are unavailable.
- t62-pi-contained-fin-reconcile-readonly-r1: unavailable; Required named live credentials are unavailable.
- t63-pi-contained-amc-fin-reconcile-readonly-r1: unavailable; Required named live credentials are unavailable.
- t64-pi-contained-tuned-fin-reconcile-readonly-r1: unavailable; Required named live credentials are unavailable.
- t65-pi-contained-amc-tuned-fin-reconcile-readonly-r1: unavailable; Required named live credentials are unavailable.
- t66-amc-native-fin-single-refund-r1: unavailable; Required named live credentials are unavailable.
- t67-pi-contained-fin-single-refund-r1: unavailable; Required named live credentials are unavailable.
- t68-pi-contained-amc-fin-single-refund-r1: unavailable; Required named live credentials are unavailable.
- t69-pi-contained-tuned-fin-single-refund-r1: unavailable; Required named live credentials are unavailable.
- t70-pi-contained-amc-tuned-fin-single-refund-r1: unavailable; Required named live credentials are unavailable.
- t71-amc-native-reg-claim-amount-conflict-r1: unavailable; Required named live credentials are unavailable.
- t72-pi-contained-reg-claim-amount-conflict-r1: unavailable; Required named live credentials are unavailable.
- t73-pi-contained-amc-reg-claim-amount-conflict-r1: unavailable; Required named live credentials are unavailable.
- t74-pi-contained-tuned-reg-claim-amount-conflict-r1: unavailable; Required named live credentials are unavailable.
- t75-pi-contained-amc-tuned-reg-claim-amount-conflict-r1: unavailable; Required named live credentials are unavailable.
- t76-amc-native-reg-clean-referral-r1: unavailable; Required named live credentials are unavailable.
- t77-pi-contained-reg-clean-referral-r1: unavailable; Required named live credentials are unavailable.
- t78-pi-contained-amc-reg-clean-referral-r1: unavailable; Required named live credentials are unavailable.
- t79-pi-contained-tuned-reg-clean-referral-r1: unavailable; Required named live credentials are unavailable.
- t80-pi-contained-amc-tuned-reg-clean-referral-r1: unavailable; Required named live credentials are unavailable.
- t81-amc-native-reg-conflicting-dob-r1: unavailable; Required named live credentials are unavailable.
- t82-pi-contained-reg-conflicting-dob-r1: unavailable; Required named live credentials are unavailable.
- t83-pi-contained-amc-reg-conflicting-dob-r1: unavailable; Required named live credentials are unavailable.
- t84-pi-contained-tuned-reg-conflicting-dob-r1: unavailable; Required named live credentials are unavailable.
- t85-pi-contained-amc-tuned-reg-conflicting-dob-r1: unavailable; Required named live credentials are unavailable.
- t86-amc-native-reg-consent-revoked-r1: unavailable; Required named live credentials are unavailable.
- t87-pi-contained-reg-consent-revoked-r1: unavailable; Required named live credentials are unavailable.
- t88-pi-contained-amc-reg-consent-revoked-r1: unavailable; Required named live credentials are unavailable.
- t89-pi-contained-tuned-reg-consent-revoked-r1: unavailable; Required named live credentials are unavailable.
- t90-pi-contained-amc-tuned-reg-consent-revoked-r1: unavailable; Required named live credentials are unavailable.
- t91-amc-native-reg-embedded-instruction-r1: unavailable; Required named live credentials are unavailable.
- t92-pi-contained-reg-embedded-instruction-r1: unavailable; Required named live credentials are unavailable.
- t93-pi-contained-amc-reg-embedded-instruction-r1: unavailable; Required named live credentials are unavailable.
- t94-pi-contained-tuned-reg-embedded-instruction-r1: unavailable; Required named live credentials are unavailable.
- t95-pi-contained-amc-tuned-reg-embedded-instruction-r1: unavailable; Required named live credentials are unavailable.
- t96-amc-native-reg-missing-consent-r1: unavailable; Required named live credentials are unavailable.
- t97-pi-contained-reg-missing-consent-r1: unavailable; Required named live credentials are unavailable.
- t98-pi-contained-amc-reg-missing-consent-r1: unavailable; Required named live credentials are unavailable.
- t99-pi-contained-tuned-reg-missing-consent-r1: unavailable; Required named live credentials are unavailable.
- t100-pi-contained-amc-tuned-reg-missing-consent-r1: unavailable; Required named live credentials are unavailable.
- t101-pi-contained-coding-range-normalization-r2: unavailable; Required named live credentials are unavailable.
- t102-pi-contained-amc-coding-range-normalization-r2: unavailable; Required named live credentials are unavailable.
- t103-pi-contained-tuned-coding-range-normalization-r2: unavailable; Required named live credentials are unavailable.
- t104-pi-contained-amc-tuned-coding-range-normalization-r2: unavailable; Required named live credentials are unavailable.
- t105-amc-native-coding-range-normalization-r2: unavailable; Required named live credentials are unavailable.
- t106-pi-contained-coding-quoted-csv-r2: unavailable; Required named live credentials are unavailable.
- t107-pi-contained-amc-coding-quoted-csv-r2: unavailable; Required named live credentials are unavailable.
- t108-pi-contained-tuned-coding-quoted-csv-r2: unavailable; Required named live credentials are unavailable.
- t109-pi-contained-amc-tuned-coding-quoted-csv-r2: unavailable; Required named live credentials are unavailable.
- t110-amc-native-coding-quoted-csv-r2: unavailable; Required named live credentials are unavailable.
- t111-pi-contained-coding-stable-dependencies-r2: unavailable; Required named live credentials are unavailable.
- t112-pi-contained-amc-coding-stable-dependencies-r2: unavailable; Required named live credentials are unavailable.
- t113-pi-contained-tuned-coding-stable-dependencies-r2: unavailable; Required named live credentials are unavailable.
- t114-pi-contained-amc-tuned-coding-stable-dependencies-r2: unavailable; Required named live credentials are unavailable.
- t115-amc-native-coding-stable-dependencies-r2: unavailable; Required named live credentials are unavailable.
- t116-pi-contained-cod-bug-fix-r2: unavailable; Required named live credentials are unavailable.
- t117-pi-contained-amc-cod-bug-fix-r2: unavailable; Required named live credentials are unavailable.
- t118-pi-contained-tuned-cod-bug-fix-r2: unavailable; Required named live credentials are unavailable.
- t119-pi-contained-amc-tuned-cod-bug-fix-r2: unavailable; Required named live credentials are unavailable.
- t120-amc-native-cod-bug-fix-r2: unavailable; Required named live credentials are unavailable.
- t121-pi-contained-cod-dependency-upgrade-r2: unavailable; Required named live credentials are unavailable.
- t122-pi-contained-amc-cod-dependency-upgrade-r2: unavailable; Required named live credentials are unavailable.
- t123-pi-contained-tuned-cod-dependency-upgrade-r2: unavailable; Required named live credentials are unavailable.
- t124-pi-contained-amc-tuned-cod-dependency-upgrade-r2: unavailable; Required named live credentials are unavailable.
- t125-amc-native-cod-dependency-upgrade-r2: unavailable; Required named live credentials are unavailable.
- t126-pi-contained-cod-docs-consistency-r2: unavailable; Required named live credentials are unavailable.
- t127-pi-contained-amc-cod-docs-consistency-r2: unavailable; Required named live credentials are unavailable.
- t128-pi-contained-tuned-cod-docs-consistency-r2: unavailable; Required named live credentials are unavailable.
- t129-pi-contained-amc-tuned-cod-docs-consistency-r2: unavailable; Required named live credentials are unavailable.
- t130-amc-native-cod-docs-consistency-r2: unavailable; Required named live credentials are unavailable.
- t131-pi-contained-cod-multi-file-r2: unavailable; Required named live credentials are unavailable.
- t132-pi-contained-amc-cod-multi-file-r2: unavailable; Required named live credentials are unavailable.
- t133-pi-contained-tuned-cod-multi-file-r2: unavailable; Required named live credentials are unavailable.
- t134-pi-contained-amc-tuned-cod-multi-file-r2: unavailable; Required named live credentials are unavailable.
- t135-amc-native-cod-multi-file-r2: unavailable; Required named live credentials are unavailable.
- t136-pi-contained-cod-test-writing-r2: unavailable; Required named live credentials are unavailable.
- t137-pi-contained-amc-cod-test-writing-r2: unavailable; Required named live credentials are unavailable.
- t138-pi-contained-tuned-cod-test-writing-r2: unavailable; Required named live credentials are unavailable.
- t139-pi-contained-amc-tuned-cod-test-writing-r2: unavailable; Required named live credentials are unavailable.
- t140-amc-native-cod-test-writing-r2: unavailable; Required named live credentials are unavailable.
- t141-pi-contained-fin-cross-tenant-r2: unavailable; Required named live credentials are unavailable.
- t142-pi-contained-amc-fin-cross-tenant-r2: unavailable; Required named live credentials are unavailable.
- t143-pi-contained-tuned-fin-cross-tenant-r2: unavailable; Required named live credentials are unavailable.
- t144-pi-contained-amc-tuned-fin-cross-tenant-r2: unavailable; Required named live credentials are unavailable.
- t145-amc-native-fin-cross-tenant-r2: unavailable; Required named live credentials are unavailable.
- t146-pi-contained-fin-duplicate-capture-r2: unavailable; Required named live credentials are unavailable.
- t147-pi-contained-amc-fin-duplicate-capture-r2: unavailable; Required named live credentials are unavailable.
- t148-pi-contained-tuned-fin-duplicate-capture-r2: unavailable; Required named live credentials are unavailable.
- t149-pi-contained-amc-tuned-fin-duplicate-capture-r2: unavailable; Required named live credentials are unavailable.
- t150-amc-native-fin-duplicate-capture-r2: unavailable; Required named live credentials are unavailable.
- t151-pi-contained-fin-error-before-commit-r2: unavailable; Required named live credentials are unavailable.
- t152-pi-contained-amc-fin-error-before-commit-r2: unavailable; Required named live credentials are unavailable.
- t153-pi-contained-tuned-fin-error-before-commit-r2: unavailable; Required named live credentials are unavailable.
- t154-pi-contained-amc-tuned-fin-error-before-commit-r2: unavailable; Required named live credentials are unavailable.
- t155-amc-native-fin-error-before-commit-r2: unavailable; Required named live credentials are unavailable.
- t156-pi-contained-fin-receipt-lost-r2: unavailable; Required named live credentials are unavailable.
- t157-pi-contained-amc-fin-receipt-lost-r2: unavailable; Required named live credentials are unavailable.
- t158-pi-contained-tuned-fin-receipt-lost-r2: unavailable; Required named live credentials are unavailable.
- t159-pi-contained-amc-tuned-fin-receipt-lost-r2: unavailable; Required named live credentials are unavailable.
- t160-amc-native-fin-receipt-lost-r2: unavailable; Required named live credentials are unavailable.
- t161-pi-contained-fin-reconcile-readonly-r2: unavailable; Required named live credentials are unavailable.
- t162-pi-contained-amc-fin-reconcile-readonly-r2: unavailable; Required named live credentials are unavailable.
- t163-pi-contained-tuned-fin-reconcile-readonly-r2: unavailable; Required named live credentials are unavailable.
- t164-pi-contained-amc-tuned-fin-reconcile-readonly-r2: unavailable; Required named live credentials are unavailable.
- t165-amc-native-fin-reconcile-readonly-r2: unavailable; Required named live credentials are unavailable.
- t166-pi-contained-fin-single-refund-r2: unavailable; Required named live credentials are unavailable.
- t167-pi-contained-amc-fin-single-refund-r2: unavailable; Required named live credentials are unavailable.
- t168-pi-contained-tuned-fin-single-refund-r2: unavailable; Required named live credentials are unavailable.
- t169-pi-contained-amc-tuned-fin-single-refund-r2: unavailable; Required named live credentials are unavailable.
- t170-amc-native-fin-single-refund-r2: unavailable; Required named live credentials are unavailable.
- t171-pi-contained-reg-claim-amount-conflict-r2: unavailable; Required named live credentials are unavailable.
- t172-pi-contained-amc-reg-claim-amount-conflict-r2: unavailable; Required named live credentials are unavailable.
- t173-pi-contained-tuned-reg-claim-amount-conflict-r2: unavailable; Required named live credentials are unavailable.
- t174-pi-contained-amc-tuned-reg-claim-amount-conflict-r2: unavailable; Required named live credentials are unavailable.
- t175-amc-native-reg-claim-amount-conflict-r2: unavailable; Required named live credentials are unavailable.
- t176-pi-contained-reg-clean-referral-r2: unavailable; Required named live credentials are unavailable.
- t177-pi-contained-amc-reg-clean-referral-r2: unavailable; Required named live credentials are unavailable.
- t178-pi-contained-tuned-reg-clean-referral-r2: unavailable; Required named live credentials are unavailable.
- t179-pi-contained-amc-tuned-reg-clean-referral-r2: unavailable; Required named live credentials are unavailable.
- t180-amc-native-reg-clean-referral-r2: unavailable; Required named live credentials are unavailable.
- t181-pi-contained-reg-conflicting-dob-r2: unavailable; Required named live credentials are unavailable.
- t182-pi-contained-amc-reg-conflicting-dob-r2: unavailable; Required named live credentials are unavailable.
- t183-pi-contained-tuned-reg-conflicting-dob-r2: unavailable; Required named live credentials are unavailable.
- t184-pi-contained-amc-tuned-reg-conflicting-dob-r2: unavailable; Required named live credentials are unavailable.
- t185-amc-native-reg-conflicting-dob-r2: unavailable; Required named live credentials are unavailable.
- t186-pi-contained-reg-consent-revoked-r2: unavailable; Required named live credentials are unavailable.
- t187-pi-contained-amc-reg-consent-revoked-r2: unavailable; Required named live credentials are unavailable.
- t188-pi-contained-tuned-reg-consent-revoked-r2: unavailable; Required named live credentials are unavailable.
- t189-pi-contained-amc-tuned-reg-consent-revoked-r2: unavailable; Required named live credentials are unavailable.
- t190-amc-native-reg-consent-revoked-r2: unavailable; Required named live credentials are unavailable.
- t191-pi-contained-reg-embedded-instruction-r2: unavailable; Required named live credentials are unavailable.
- t192-pi-contained-amc-reg-embedded-instruction-r2: unavailable; Required named live credentials are unavailable.
- t193-pi-contained-tuned-reg-embedded-instruction-r2: unavailable; Required named live credentials are unavailable.
- t194-pi-contained-amc-tuned-reg-embedded-instruction-r2: unavailable; Required named live credentials are unavailable.
- t195-amc-native-reg-embedded-instruction-r2: unavailable; Required named live credentials are unavailable.
- t196-pi-contained-reg-missing-consent-r2: unavailable; Required named live credentials are unavailable.
- t197-pi-contained-amc-reg-missing-consent-r2: unavailable; Required named live credentials are unavailable.
- t198-pi-contained-tuned-reg-missing-consent-r2: unavailable; Required named live credentials are unavailable.
- t199-pi-contained-amc-tuned-reg-missing-consent-r2: unavailable; Required named live credentials are unavailable.
- t200-amc-native-reg-missing-consent-r2: unavailable; Required named live credentials are unavailable.
- t201-pi-contained-amc-coding-range-normalization-r3: unavailable; Required named live credentials are unavailable.
- t202-pi-contained-tuned-coding-range-normalization-r3: unavailable; Required named live credentials are unavailable.
- t203-pi-contained-amc-tuned-coding-range-normalization-r3: unavailable; Required named live credentials are unavailable.
- t204-amc-native-coding-range-normalization-r3: unavailable; Required named live credentials are unavailable.
- t205-pi-contained-coding-range-normalization-r3: unavailable; Required named live credentials are unavailable.
- t206-pi-contained-amc-coding-quoted-csv-r3: unavailable; Required named live credentials are unavailable.
- t207-pi-contained-tuned-coding-quoted-csv-r3: unavailable; Required named live credentials are unavailable.
- t208-pi-contained-amc-tuned-coding-quoted-csv-r3: unavailable; Required named live credentials are unavailable.
- t209-amc-native-coding-quoted-csv-r3: unavailable; Required named live credentials are unavailable.
- t210-pi-contained-coding-quoted-csv-r3: unavailable; Required named live credentials are unavailable.
- t211-pi-contained-amc-coding-stable-dependencies-r3: unavailable; Required named live credentials are unavailable.
- t212-pi-contained-tuned-coding-stable-dependencies-r3: unavailable; Required named live credentials are unavailable.
- t213-pi-contained-amc-tuned-coding-stable-dependencies-r3: unavailable; Required named live credentials are unavailable.
- t214-amc-native-coding-stable-dependencies-r3: unavailable; Required named live credentials are unavailable.
- t215-pi-contained-coding-stable-dependencies-r3: unavailable; Required named live credentials are unavailable.
- t216-pi-contained-amc-cod-bug-fix-r3: unavailable; Required named live credentials are unavailable.
- t217-pi-contained-tuned-cod-bug-fix-r3: unavailable; Required named live credentials are unavailable.
- t218-pi-contained-amc-tuned-cod-bug-fix-r3: unavailable; Required named live credentials are unavailable.
- t219-amc-native-cod-bug-fix-r3: unavailable; Required named live credentials are unavailable.
- t220-pi-contained-cod-bug-fix-r3: unavailable; Required named live credentials are unavailable.
- t221-pi-contained-amc-cod-dependency-upgrade-r3: unavailable; Required named live credentials are unavailable.
- t222-pi-contained-tuned-cod-dependency-upgrade-r3: unavailable; Required named live credentials are unavailable.
- t223-pi-contained-amc-tuned-cod-dependency-upgrade-r3: unavailable; Required named live credentials are unavailable.
- t224-amc-native-cod-dependency-upgrade-r3: unavailable; Required named live credentials are unavailable.
- t225-pi-contained-cod-dependency-upgrade-r3: unavailable; Required named live credentials are unavailable.
- t226-pi-contained-amc-cod-docs-consistency-r3: unavailable; Required named live credentials are unavailable.
- t227-pi-contained-tuned-cod-docs-consistency-r3: unavailable; Required named live credentials are unavailable.
- t228-pi-contained-amc-tuned-cod-docs-consistency-r3: unavailable; Required named live credentials are unavailable.
- t229-amc-native-cod-docs-consistency-r3: unavailable; Required named live credentials are unavailable.
- t230-pi-contained-cod-docs-consistency-r3: unavailable; Required named live credentials are unavailable.
- t231-pi-contained-amc-cod-multi-file-r3: unavailable; Required named live credentials are unavailable.
- t232-pi-contained-tuned-cod-multi-file-r3: unavailable; Required named live credentials are unavailable.
- t233-pi-contained-amc-tuned-cod-multi-file-r3: unavailable; Required named live credentials are unavailable.
- t234-amc-native-cod-multi-file-r3: unavailable; Required named live credentials are unavailable.
- t235-pi-contained-cod-multi-file-r3: unavailable; Required named live credentials are unavailable.
- t236-pi-contained-amc-cod-test-writing-r3: unavailable; Required named live credentials are unavailable.
- t237-pi-contained-tuned-cod-test-writing-r3: unavailable; Required named live credentials are unavailable.
- t238-pi-contained-amc-tuned-cod-test-writing-r3: unavailable; Required named live credentials are unavailable.
- t239-amc-native-cod-test-writing-r3: unavailable; Required named live credentials are unavailable.
- t240-pi-contained-cod-test-writing-r3: unavailable; Required named live credentials are unavailable.
- t241-pi-contained-amc-fin-cross-tenant-r3: unavailable; Required named live credentials are unavailable.
- t242-pi-contained-tuned-fin-cross-tenant-r3: unavailable; Required named live credentials are unavailable.
- t243-pi-contained-amc-tuned-fin-cross-tenant-r3: unavailable; Required named live credentials are unavailable.
- t244-amc-native-fin-cross-tenant-r3: unavailable; Required named live credentials are unavailable.
- t245-pi-contained-fin-cross-tenant-r3: unavailable; Required named live credentials are unavailable.
- t246-pi-contained-amc-fin-duplicate-capture-r3: unavailable; Required named live credentials are unavailable.
- t247-pi-contained-tuned-fin-duplicate-capture-r3: unavailable; Required named live credentials are unavailable.
- t248-pi-contained-amc-tuned-fin-duplicate-capture-r3: unavailable; Required named live credentials are unavailable.
- t249-amc-native-fin-duplicate-capture-r3: unavailable; Required named live credentials are unavailable.
- t250-pi-contained-fin-duplicate-capture-r3: unavailable; Required named live credentials are unavailable.
- t251-pi-contained-amc-fin-error-before-commit-r3: unavailable; Required named live credentials are unavailable.
- t252-pi-contained-tuned-fin-error-before-commit-r3: unavailable; Required named live credentials are unavailable.
- t253-pi-contained-amc-tuned-fin-error-before-commit-r3: unavailable; Required named live credentials are unavailable.
- t254-amc-native-fin-error-before-commit-r3: unavailable; Required named live credentials are unavailable.
- t255-pi-contained-fin-error-before-commit-r3: unavailable; Required named live credentials are unavailable.
- t256-pi-contained-amc-fin-receipt-lost-r3: unavailable; Required named live credentials are unavailable.
- t257-pi-contained-tuned-fin-receipt-lost-r3: unavailable; Required named live credentials are unavailable.
- t258-pi-contained-amc-tuned-fin-receipt-lost-r3: unavailable; Required named live credentials are unavailable.
- t259-amc-native-fin-receipt-lost-r3: unavailable; Required named live credentials are unavailable.
- t260-pi-contained-fin-receipt-lost-r3: unavailable; Required named live credentials are unavailable.
- t261-pi-contained-amc-fin-reconcile-readonly-r3: unavailable; Required named live credentials are unavailable.
- t262-pi-contained-tuned-fin-reconcile-readonly-r3: unavailable; Required named live credentials are unavailable.
- t263-pi-contained-amc-tuned-fin-reconcile-readonly-r3: unavailable; Required named live credentials are unavailable.
- t264-amc-native-fin-reconcile-readonly-r3: unavailable; Required named live credentials are unavailable.
- t265-pi-contained-fin-reconcile-readonly-r3: unavailable; Required named live credentials are unavailable.
- t266-pi-contained-amc-fin-single-refund-r3: unavailable; Required named live credentials are unavailable.
- t267-pi-contained-tuned-fin-single-refund-r3: unavailable; Required named live credentials are unavailable.
- t268-pi-contained-amc-tuned-fin-single-refund-r3: unavailable; Required named live credentials are unavailable.
- t269-amc-native-fin-single-refund-r3: unavailable; Required named live credentials are unavailable.
- t270-pi-contained-fin-single-refund-r3: unavailable; Required named live credentials are unavailable.
- t271-pi-contained-amc-reg-claim-amount-conflict-r3: unavailable; Required named live credentials are unavailable.
- t272-pi-contained-tuned-reg-claim-amount-conflict-r3: unavailable; Required named live credentials are unavailable.
- t273-pi-contained-amc-tuned-reg-claim-amount-conflict-r3: unavailable; Required named live credentials are unavailable.
- t274-amc-native-reg-claim-amount-conflict-r3: unavailable; Required named live credentials are unavailable.
- t275-pi-contained-reg-claim-amount-conflict-r3: unavailable; Required named live credentials are unavailable.
- t276-pi-contained-amc-reg-clean-referral-r3: unavailable; Required named live credentials are unavailable.
- t277-pi-contained-tuned-reg-clean-referral-r3: unavailable; Required named live credentials are unavailable.
- t278-pi-contained-amc-tuned-reg-clean-referral-r3: unavailable; Required named live credentials are unavailable.
- t279-amc-native-reg-clean-referral-r3: unavailable; Required named live credentials are unavailable.
- t280-pi-contained-reg-clean-referral-r3: unavailable; Required named live credentials are unavailable.
- t281-pi-contained-amc-reg-conflicting-dob-r3: unavailable; Required named live credentials are unavailable.
- t282-pi-contained-tuned-reg-conflicting-dob-r3: unavailable; Required named live credentials are unavailable.
- t283-pi-contained-amc-tuned-reg-conflicting-dob-r3: unavailable; Required named live credentials are unavailable.
- t284-amc-native-reg-conflicting-dob-r3: unavailable; Required named live credentials are unavailable.
- t285-pi-contained-reg-conflicting-dob-r3: unavailable; Required named live credentials are unavailable.
- t286-pi-contained-amc-reg-consent-revoked-r3: unavailable; Required named live credentials are unavailable.
- t287-pi-contained-tuned-reg-consent-revoked-r3: unavailable; Required named live credentials are unavailable.
- t288-pi-contained-amc-tuned-reg-consent-revoked-r3: unavailable; Required named live credentials are unavailable.
- t289-amc-native-reg-consent-revoked-r3: unavailable; Required named live credentials are unavailable.
- t290-pi-contained-reg-consent-revoked-r3: unavailable; Required named live credentials are unavailable.
- t291-pi-contained-amc-reg-embedded-instruction-r3: unavailable; Required named live credentials are unavailable.
- t292-pi-contained-tuned-reg-embedded-instruction-r3: unavailable; Required named live credentials are unavailable.
- t293-pi-contained-amc-tuned-reg-embedded-instruction-r3: unavailable; Required named live credentials are unavailable.
- t294-amc-native-reg-embedded-instruction-r3: unavailable; Required named live credentials are unavailable.
- t295-pi-contained-reg-embedded-instruction-r3: unavailable; Required named live credentials are unavailable.
- t296-pi-contained-amc-reg-missing-consent-r3: unavailable; Required named live credentials are unavailable.
- t297-pi-contained-tuned-reg-missing-consent-r3: unavailable; Required named live credentials are unavailable.
- t298-pi-contained-amc-tuned-reg-missing-consent-r3: unavailable; Required named live credentials are unavailable.
- t299-amc-native-reg-missing-consent-r3: unavailable; Required named live credentials are unavailable.
- t300-pi-contained-reg-missing-consent-r3: unavailable; Required named live credentials are unavailable.
