---
"agent-maturity-compass": patch
---

Docs: the README's "60 Seconds to Your First Score" block and the website's getting-started page now include the console sign-in step, `amc user init --username <you>` (new workspace only; an OWNER adds further logins with `amc user add`). The README and GETTING_STARTED sign-in paragraphs now say that after `amc up` the remembered vault passphrase is used and that `AMC_VAULT_PASSPHRASE` is the fallback when `amc user init` reports `Vault locked`. The README also says that `.amc/users.yaml` (console password hashes) is not covered by the workspace's `.amc/.gitignore`.
