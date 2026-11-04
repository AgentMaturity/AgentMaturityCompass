---
"agent-maturity-compass": patch
---

Recover interrupted native schedules with `native-schedule reset-failures <id> --close-interrupted <claim-id> --expect-digest <digest>`. This flag closes the exact reviewed occurrence as a failed, interrupted outcome instead of resetting failures. It requires owner mode, authenticated native claim evidence, and a demonstrably dead local owner. Unknown, remote, live, legacy, stale, and mismatched claims are refused. The operation preserves cadence, never re-runs a goal, and publishes a signed closure authorization before updating operational state. Failed state publication leaves that authorization and the interrupted claim visible for investigation.

Round-limit exhaustion now counts as an incomplete goal and increments consecutive failures. Three consecutive failures suspend future schedule claims until an operator resets them. Native schedule commands remain experimental and unqualified.
