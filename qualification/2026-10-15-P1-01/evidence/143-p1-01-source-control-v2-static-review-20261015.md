# P1-01 source-control v2 static review

No blocking static finding in v2 `b5985003cd2d469ceb6800b84938e3389a09664414d35fc46a2425d9b8511205` (9,978 bytes). The complete diff closes v1 F1: only successful exclusive BASE creation sets ownership, and only that invocation may write `HALTED.json`. Rejection of an existing namespace writes nothing. V1 stays unchanged and unexecuted.

The previous review's F1 line array contained incorrect locators; the actual v1 handler is lines 186–190 and the v2 handler is lines 189–193. The code hashes and finding were correct; the frozen report is preserved.

Existing limitations remain: borrowed dependencies; manifest-listed preservation rather than all-file membership; allowed existing `.d.ts` changes; no outer child deadline; unknown observed PGID cannot count as positive. Actual error/observation and preservation auditing remains necessary after execution.

All reads finished. No parser, import, compile, product runtime, source copy or mutation by this reviewer. This is static clearance only; root retains execution authority and formal acceptance remains open.
