---
"agent-maturity-compass": patch
---

The generic macOS Seatbelt sandbox backend confines writes only. It now refuses, with nothing launched, a run that asks it for a boundary it cannot enforce (network deny, a read deny-list, an egress allowlist or a process cap) instead of reporting a confined run that left that boundary open, and it now stops the command when the caller cancels. `npm run qualify:platform` records the Node module ABI and every installed native addon with its digest. `scripts/gen-platform-matrix.mjs` renders a lane the recording host cannot run as "unavailable on this host" with its reason, never as a pass, and fills the Native shell column from an OS shell-sandbox lane receipt (GAP-WP32).
