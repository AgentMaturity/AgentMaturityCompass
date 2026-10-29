# KeyProvider outage

The reference chart runs the file KeyProvider inside the workspace volume. The P2-08 providers (PKCS#11, AWS KMS, GCP KMS, Azure Key Vault) are not wired into the chart yet, so this runbook describes the expected behaviour for when they are.

1. Block the KeyProvider (network policy, HSM unplugged, KMS permission removed). No new protected effect may be signed or executed; Studio reports the provider error instead of falling back to another key. (check CR-4)
2. Restore the provider. Signing resumes without restarting Studio. (check CR-4)
3. Record the window in the incident log and confirm the ledger verifies across it ([docs/runbooks/evidence-corruption.md](../../runbooks/evidence-corruption.md) if it does not). (check CR-4)

Monitoring: a KeyProvider error metric does not exist yet; [MONITORING.md](MONITORING.md) lists it as a follow-up.
