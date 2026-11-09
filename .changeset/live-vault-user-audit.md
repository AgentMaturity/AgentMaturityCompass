---
"agent-maturity-compass": patch
---

Console account changes are now in the auth audit trail. `amc user init|add|revoke|role set|password` and `POST /users/add|revoke|roles` each write a `USER_CHANGE` audit event (signed ledger, mirrored as `HUMAN_USER_CHANGE` in `.amc/studio/audit/human.log`) with the action, the account, its roles and who made the change (the OS user for the CLI, or `uid:<n>` where that uid has no passwd entry, as in an arbitrary-UID container; the signed-in console user for the routes). No password or password hash is recorded. A failed audit write never undoes the change; it is reported on stderr.
