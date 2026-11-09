---
"agent-maturity-compass": patch
---

A Studio API or metrics port that you configured (a `--port` flag, `AMC_STUDIO_PORT`, `AMC_METRICS_PORT` or the signed LAN port) and that is already in use now stops the start with `Port <n> (from <source>) is already in use. Stop the other process or change the port.` (LIVE-RUNTIME-10). Before, Studio silently listened on a random port, so probes and documented URLs reached nothing or another process. A default port that is busy still falls back to a free port, and the start now prints which one. Host mode is unchanged: it never falls back. The host router reports the port it is bound to, and each workspace API binds a kernel-chosen loopback port at listen time instead of probing for one first.
