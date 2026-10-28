---
"agent-maturity-compass": minor
---

Retention floors per regime and a provider exit drill (P2-26 slice D, experimental).

- The active compiled plan's applicable logging-and-retention requirements bring in regime floors: AI Act Art. 26(6) deployer logs (183 days), CERT-In logs (180 days, kept in India) and SEC Rule 17a-4 records (six years, WORM). Signing an ops policy and running retention are refused with `REGIME_RETENTION_REFUSED`, naming the regime, when pruning would undercut a floor. Conflicting maximums are listed for a reviewer; a WORM rule without a configured target is `not_evaluated`. All rules are agent-drafted and pending expert review; AMC claims no conformity.
- `scripts/drills/provider-exit-drill.mjs` disables a provider at the gateway with a provider-scoped kill, checks calls fail closed, records whether the agent's change envelope admits an alternate, and writes a signed `amc.drill/1` receipt with a provider register. Runbook: `docs/runbooks/provider-exit.md`.
