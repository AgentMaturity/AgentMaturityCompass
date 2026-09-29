---
"agent-maturity-compass": patch
---

Fix Windows signature/report parent paths and make composition inspection work in the installed package. Record the actual red-team payload transformations and leave uncalibrated attack confidence unavailable.

Gaming resistance now reports `assessmentStatus: "not_measured"` with null score/level; source-path inventory is returned separately and cannot satisfy the requested CI gate. Clients should check assessment availability before reading numeric scores. Explicitly opting out of this check does not establish gaming resistance.

Fix changelog landmark labels and homepage skip-link focus, exercise real language/theme controls, and retain bounded CI test diagnostics.
