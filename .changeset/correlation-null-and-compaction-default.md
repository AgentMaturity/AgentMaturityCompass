---
"agent-maturity-compass": minor
---

A window in which no trace carried a receipt now reports its trace correlation as not measured (`correlationRatio: null`) instead of 0. A 0 read as a measured total failure, so every empty window failed each correlation gate as if receipts had been forged.

- Diagnostic reports carry `correlationRatio: number | null`. Reports sealed before this change keep their number and stay valid. The Markdown report and the eval HTML report print "not measured". The question-level correlation caps still apply, because an unmeasured correlation never lifts a cap.
- Forecasts add no correlation point for an unmeasured run. `latestCorrelationRatio` is nullable, and the evidence gate reports `CORRELATION_NOT_MEASURED` instead of `CORRELATION_BELOW_MIN`. The forecast Markdown prints "Correlation (now): not measured".
- Assurance certificates, value reports and forecasts treat a null ratio as failing any minimum above 0. A minimum of 0 still sets no requirement. Assurance pack runs, which measure no trace correlation, now record `evidenceGates.correlationRatio: null` instead of a hard-coded 0. The assurance, value and forecast schemas accept null, and old artifacts holding a number still parse.
- Drift rules accept a run with an unmeasured correlation. They leave such runs out of the correlation baseline, and they report `correlation not measured (INSUFFICIENT_EVIDENCE)` only for a rule that sets a correlation threshold above 0. The governor's trust summary carries `correlationRatio: null` when there is no run. The org rollup leaves unmeasured runs out of its median.
- Rates over zero events are null, not 0: a cost report with no calls (`errorRate`), and a support bot's escalation and SLA breach rates with no tickets.
- `amc agent-loop run`, `amc agent-loop chat` and `amc acp` take `--no-auto-compact`. Automatic compaction is already on by default, with a 16,384-token reserve for a reviewed route's context window. The new flag turns compaction off for the session, overriding both the route default and any signed preset field. It cannot be combined with `--context-window`, `--compact-threshold` or `--no-auto-summary`.
- The bash tool's own `description` argument is now recorded on its `NATIVE_SHELL_CONFINEMENT` receipt as `agentSuppliedDescription`. It is also quoted in the approval question as the agent's unverified words. A description that contains control or format characters is dropped from both.
- `amc demo run` against a running gateway now sends its scripted traffic inside the workspace for which it issued the demo lease.
