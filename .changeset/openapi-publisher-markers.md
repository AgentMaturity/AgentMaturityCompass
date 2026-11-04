---
"agent-maturity-compass": patch
---

The public OpenAPI document (`website/openapi.yaml`) is current again. A stray pair of generated-block markers had made `scripts/update-native-task-openapi.mjs` refuse to run, so routes and schemas landed since then were missing: the native task fork route, the execution phases and delegation on a native task, and the newer A4 and result-route entries. The document is regenerated from the build, and a test now fails whenever it differs from what the publisher writes.
