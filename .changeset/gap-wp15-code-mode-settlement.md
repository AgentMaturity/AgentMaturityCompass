---
"agent-maturity-compass": patch
---

Code Mode (`run_code`) admission and settlement are now bounded and observable (WP15).

- A program can no longer exceed its tool-call limit with concurrent calls: each call is counted when it arrives, before it is dispatched, so a `Promise.all` burst admits exactly the configured number. Malformed call ids (non-integer, negative, unsafe) are dropped.
- The enclosing call's cancellation now reaches the program and every in-flight sub-call through the same tool pipeline. Any verdict (return, throw, timeout, call budget, cancellation) stops admission, cancels the sub-calls, waits for the worker to actually exit and then waits for accepted sub-calls within the loop's bounded abandon grace. A sub-call still running after that is listed as `unknown`, and `run_code` then reports `TOOL_OUTCOME_UNKNOWN` instead of a clean result. Late results never change a published result and are never posted to an exited worker.
- Program `console` output (stdout and stderr) is captured, bounded to 64 KiB, and returned to the model with the result, including on failure. It no longer reaches AMC's own stdout, where it could be mistaken for machine output.
- Write-class calls (`WRITE_LOW` and above) are serialized in the tool pipeline, so write sub-calls from one program or from parallel `run_code` calls never overlap, matching the step barrier direct calls already had.
- Time spent waiting on an approval no longer counts against the 30 s wall budget. A program also has a hard cap that never pauses: the wall budget (or the narrowed `timeoutMs`) plus a 2-minute approval allowance, so a program cannot stretch its run by computing while a sub-call waits; at the cap it is stopped and in-flight sub-calls are reported unknown. A sub-call whose program timed out while it waited is never run, even if the approval is granted later: the pending approval is withdrawn through the sub-call's signal, and the pipeline re-checks cancellation before every body.
- A rejected sub-call carries `status` (`failed`, `denied`, `cancelled` or `unknown`), `exitCode` and `timedOut`, so a program can branch on a nonzero exit. The call summary lists each sub-call by status and exit code rather than calling every failure `denied`.
- `run_code` accepts an optional `description` (recorded with the call) and `timeoutMs`, which can narrow the configured wall budget but never raise it.
- The program result cap is raised from 256 KB to 16 MiB as a runaway guard; the session's spill policy shapes what the model sees.
- At most four Code Mode workers run at once per process. A program waits at most 10 s for a free worker and is then refused (`worker-capacity`) instead of queueing without bound. A slot is released when its worker exits, or after the abandon grace when a terminate fails or the exit is never observed.
