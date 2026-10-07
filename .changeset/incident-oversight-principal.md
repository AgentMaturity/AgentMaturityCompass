---
"agent-maturity-compass": patch
---

Security: `POST /api/v1/incidents/:id/oversight` now needs the AUDITOR or OWNER role (it was open to OPERATOR). The reviewer is now the authenticated caller, not a `reviewerId` in the request body. A body `reviewerId` that differs from the caller is refused with 403, and a request with no authenticated principal is refused. Oversight records are signed with the workspace auditor key, and recording one is now refused in agent mode. Clock events recorded through the API name the caller as `api:<principal>`.
