---
"agent-maturity-compass": patch
---

Forward the native macOS unconfined shell warning from `AMCNativeClient` to operator stderr while keeping other child diagnostics private. Report operator stderr write failure or backpressure through the existing client failure lifecycle.
