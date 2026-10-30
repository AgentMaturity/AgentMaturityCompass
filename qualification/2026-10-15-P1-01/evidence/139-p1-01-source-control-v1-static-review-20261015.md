# P1-01 source-control static review: v1 blocked

One preparation blocker in driver `4369a2058ecf174edd74036ec322180257aefbd62a0d4ec1df8340df70b8a0c0` (9,918 bytes): its outer exception handler may write `HALTED.json` into a pre-existing BASE even when this invocation rejected that BASE before acquiring ownership. Track successful exclusive directory creation and restrict exception writes to that owned namespace. Preserve these original bytes before revision.

The source mutation, real compile, retained changed inputs, named receipt/schema failures, normal child exits, group-absence ordering and restoration checks are otherwise statically consistent. Allowed compiled deltas include all existing `.d.ts` files; actual changed files must be audited. The mutation appends `.passthrough()` to the first strict state branch, which the installed Zod implementation supports.

The child wait has no outer timeout; only group probing after exit is bounded. Borrowed dependencies, corresponding-file physical checks and native preservation do not prove universal isolation or all-file membership. Unknown observed PGID is accepted by this code and cannot be reported as a positive observation. Actual stderr attribution remains a later requirement.

No import, parser, compile, test, copy, source mutation or runtime was performed by this reviewer. All reads finished. Runtime is not cleared by this review; formal acceptance remains open.
