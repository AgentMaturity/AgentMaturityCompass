---
"agent-maturity-compass": patch
---

Delay newly resolved registry dependencies for 48 hours and run nightly production vulnerability and registry signature audits. The scheduled signature check uses an isolated installation of the packed production artifact, and audit failures fail the workflow.
