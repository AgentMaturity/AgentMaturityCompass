---
"agent-maturity-compass": major
---

Breaking: emergency overrides require a verifiable auditor signature. `amc governor-override` and `amc emergency-override` (and the library calls `activateOverride` and `activateEmergencyOverride`) now fail with `BREAK_GLASS_UNSIGNED` and record nothing when the vault is locked or missing, in no-sign mode (`AMC_NO_SIGN=1`), or when the signature does not verify against the workspace auditor key history. They used to store the literal signature `unsigned`. `activateEmergencyOverride` called without a workspace now throws; its `workspace` parameter stays optional in the type, so this is a runtime change only.

Overrides are verified whenever they are read. Only an override whose activation-time hash and signature verify counts as active, can log actions, appears in the canary report's `activeOverrides` or is chased by governance drift. Unsigned, edited, replayed and foreign-key overrides are listed by `amc governor-override-alerts` as `INVALID_SIGNATURE`, and the canary report gains an `invalidOverrides` count; their files stay on disk as an audit trail.

Migration: overrides recorded unsigned by earlier versions are listed as invalid and are no longer counted as active. Overrides stored by `amc emergency-override` in 1.2.0 or earlier are invalid even when a key was present, because the record store replaced their override signature with its own. AMC never re-signs them; re-issue any override that is still needed with a signing key. A signature proves which workspace key recorded an override and that it is unchanged, not that the override was justified.
