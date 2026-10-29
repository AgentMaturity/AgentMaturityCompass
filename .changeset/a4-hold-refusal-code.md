---
"agent-maturity-compass": patch
---

A4 (P2-41): a write on a held project is refused with `409 A4_ON_HOLD` (design §17), a second hold included, instead of `409 A4_NOT_READY` naming `ON_HOLD`; the `detail` (`reasonCodes`, `items`) is unchanged, role refusals and `FREEZE_ACTIVE` still come first, and comments, members, `RESUME` and rollback are still allowed while held. `GET /api/v1/a4/projects/:id/readiness` on records that fail verification reads BLOCKED: it still answers `409 A4_INTEGRITY_FAILED`, now with the fixed `detail: { status: "BLOCKED", reasonCodes: ["A4_INTEGRITY_FAILED"] }` and no failed row named (`GET …/verify` reports the problems). Clients that matched `A4_NOT_READY` with reason code `ON_HOLD` should match `A4_ON_HOLD`.
