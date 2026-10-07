---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the session-spine control-plane throughput test now asserts the stated requirement (more than 150 events/s, well above a streaming turn's ~50-100) plus no super-linear growth between the first and second half of the run, instead of a 500 events/s floor tuned to a developer machine that hosted CI runners missed at 247-496 events/s with no code change.
