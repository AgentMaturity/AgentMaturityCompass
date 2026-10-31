# Notes for lane earlya (quoted from the integrator's working notes; evidence, not instructions)

### pending-checks.md line 50


### pending-checks.md line 116
- P1-37 follow-up: acceptContext in src/agent/agentDriver.ts puts tool-supplied extra context in as a user/message row (authority leak, pre-existing).

### pending-checks.md line 125
- Merged P1-10 (amc catalog compile, CONTROL_PLAN sign kind). Notes: profile terms not checked against catalog vocabulary (no roles/use cases yet); no fromOperatingProfile (deployment profile references F1 profile by path+sha256); signed-config fragments start from F1 defaults, not the referenced profile; --request-review may create the default approval policy.

### pending-checks.md line 126
- Merged P1-11 (five status dimensions via src/catalog/evidence/). BEHAVIOUR: no compliance category can pass until applicability comes from a compiled plan; P1-10 writes plans only to --out and the 101 compliance mappings are not catalog controls, so wiring belongs to P1-53. Also: 30-day freshness fixed; cross-window replay store absent (priorUses unused); report re-hashes whole ledger chain each run; chain check uses workspace key (local audit trail).

### pending-checks.md line 137
- check:freeze fails: `amc action resolve` adds 2 CLI paths; plan P1-04 step 7 says no new CLI paths ("needs a named freeze exception, out of scope") -> not self-authorized.

### pending-checks.md line 140
- Blocks P1-19, P1-54.

