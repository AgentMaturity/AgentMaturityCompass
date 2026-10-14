---
"agent-maturity-compass": patch
---

Align the release gate with CI's instrumented correctness suite and require a separate serial performance run. Include verifier sources in the existing per-file coverage ratchet without lowering its floors. Give complete signed-package, archive-budget, persistence-conformance, synthetic-event-label and key-rotation integration tests and their fixture cleanup bounded execution time while retaining their inputs and assertions.

Run the release gate and complete Playwright suite in dedicated CI jobs, with workflow and step-registry mutation checks. Retain failure coverage diagnostics and refresh generated test-source counts for the new contract file.
