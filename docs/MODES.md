# MODES

AMC supports two CLI roles:
- `owner` (default)
- `agent`

Mode file:
- `.amc/mode.json`

## Switch Mode

```bash
amc mode owner
amc mode agent
amc mode
```

Leaving agent mode needs owner proof: `amc mode owner` prompts for the vault passphrase (it does not read `AMC_VAULT_PASSPHRASE`) and refuses a wrong passphrase or a workspace with no vault.

The mode fails closed. A missing `.amc/mode.json` is owner (a workspace that never entered agent mode); a file that exists but cannot be read, does not parse or names no known mode is agent. The file is not signed: because a missing file must read as owner for fresh workspaces, anyone able to forge it could delete it instead, so keeping `.amc` out of the agent's write reach is the confinement layer's job.

## Owner Mode

Can modify signed posture and governance:
- set targets
- rotate vault keys
- apply archetypes/tuning/upgrades
- sign artifacts (bundles/certs/configs)

## Agent Mode

Read-only/self-check focused. Owner-only commands are blocked (for example `target set`, `vault rotate-keys`, `bundle export`, `certify`, `fix-signatures`).

Agent mode can still run evidence collection + diagnostics:
- `amc run`
- `amc report`
- `amc history`
- `amc compare`
- `amc learn`
