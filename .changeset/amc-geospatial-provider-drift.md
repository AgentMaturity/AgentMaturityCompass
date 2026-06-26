---
"agent-maturity-compass": patch
---

Add GeoBenchX-style geospatial tool-calling proof to provider/model drift canaries.

Provider-drift rows can now bind geospatial benchmark ids, task-set hashes, dataset snapshots, tool registries, reference solutions, trace exports, judge panels/configs, human calibration, result reports, token-cost reports, complexity groups, solvable/unsolvable task counts, tool counts, and max tool iterations. Missing geospatial proof emits a fail-closed Watch/API alert and is included in eval-pack row hashes, CI/lifecycle gates, public methodology, and docs.
