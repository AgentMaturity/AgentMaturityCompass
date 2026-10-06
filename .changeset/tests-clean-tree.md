---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the test suite now fails if any test writes to the repository's own `.amc/` directory, and CI fails `build-test` when tests leave the checkout dirty.
