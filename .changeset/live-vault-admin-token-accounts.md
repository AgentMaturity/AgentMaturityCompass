---
"agent-maturity-compass": patch
---

The Studio admin token (`.amc/studio/admin.token`) can no longer create, revoke or re-role console accounts: `POST /users/add`, `/users/revoke` and `/users/roles` answer `403 {"error":"the admin token cannot change console accounts; sign in as an OWNER"}` and leave `users.yaml` unchanged. A process that can read the token file could otherwise mint an OWNER account and sign in. Sign in as an OWNER to manage accounts; the first owner comes from `amc user init` or `amc bootstrap`.
