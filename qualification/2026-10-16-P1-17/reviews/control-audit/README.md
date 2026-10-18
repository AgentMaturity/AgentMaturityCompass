# P1-17 source-control audit

All three required controls were detected by intended semantic assertions. Each restored run passed 68/68. These are repeated runs of the same 68-case corpus.

| Control | Mutant passed / failed | Restored |
| --- | ---: | ---: |
| NYDFS 72 to 71 hours | 62 / 6 | 68 / 0 |
| Skip row signature verification | 65 / 3 | 68 / 0 |
| Drop createdTs guard | 66 / 2 | 68 / 0 |

The NYDFS control produces a one-hour-early due date at lines 153, 166, 212 and 273. The at-due case also becomes SATISFIED_LATE. Event counts after the failing composite assertion are masked.

Signature removal causes real no-throw failures for timestamp tampering (227), station tampering (238) and the wrong key (247). Independent Node signature checks before the first two failures reached; the healthy original-database assertion at 228 is masked. The station test is not a fourth control.

The decisive createdTs case is the unstarted-clock NOTIFIED call at 173, which returns without the required refusal. Empty-row assertion 174 is masked, so no appended-row measurement is claimed. The second failure at 178 is diagnostic only: the ordinary trigger still refuses through its existing before-incident guard but no longer says backdated. It is not a second unsafe admission.

All eleven errors are genuine AssertionErrors with matching raw/observer stacks. The six runs preserve the 68-registration identity multiset, all 30 hooks pass per run, and no collection, suite, unhandled, pending/todo or late lifecycle error was found. All owned groups closed with positive ESRCH. Repeated compiled surface controls supply 18 matching markers, 54 closed children and 108 matching captures.

R and Q are clean at 3ebf7cbae4023a130ce9db5c9fe304010cd2e5db. Selected source/tests are restored, all five bound compiled modules remain unchanged, and native pins, guards, deadlines, freeze and coverage baselines match. Compiled surface behavior was not mutated; no full dist inventory or mutant build is claimed.

The original metadata reader is preserved. Its title mismatch was corrected with an explicit quoted-title alias against the already closed raw result; no test rerun or criterion change occurred. No runtime, SQL, source write or producer edit was performed by the reviewer. Full acceptance remains open. All reads finished.
