---
"agent-maturity-compass": patch
---

`.amc/local-vault-passphrase` is read beside an existing vault only when this machine committed that vault's key set. Before, a cloned repository that shipped a vault and that file had its vault opened by bare `amc`, `amc run`, `amc init` or `amc monitor start`; opening a 1.x vault (or one without lease and session keys) migrates it and commits its key set on this machine, after which workspace trust read the clone as the operator's own and applied its signed configuration without consent. Such a workspace now scores unsigned (bare `amc`) or refuses (`amc monitor start`) and says why; export `AMC_VAULT_PASSPHRASE` to use its vault.
