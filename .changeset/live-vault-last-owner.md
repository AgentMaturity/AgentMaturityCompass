---
"agent-maturity-compass": patch
---

A workspace always keeps one active OWNER: revoking or re-roling the last active OWNER (`amc user revoke`, `amc user role set`, `POST /users/revoke`, `POST /users/roles`) is refused with `refused: this would leave no active OWNER` (HTTP 409) and `users.yaml` is left unchanged. A revoked account cannot be reactivated, so this keeps the console from locking out every owner.
