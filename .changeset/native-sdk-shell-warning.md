---
"agent-maturity-compass": patch
---

Forward the native macOS unconfined shell warning from `AMCNativeClient` to operator stderr while keeping other child diagnostics private. Report an operator stderr write failure through the existing client failure lifecycle; a backpressured write is queued and never fails a healthy client.
