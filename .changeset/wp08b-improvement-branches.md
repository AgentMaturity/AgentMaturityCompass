---
"agent-maturity-compass": patch
---

`runImprovementLoop` now explores several branches per round. A proposal may name a `domain`. A round admits up to `width` branches: domains in a seeded order (`seed`, default the loop id) that is recorded in the signed journal, and every domain gets a branch before any domain gets a second. `limits.concurrency` (1 to 8, default 1) bounds the branches in flight. Each branch holds its whole execution reservation from admission, so parallel branches never overrun `maxExecutions` together. Probes still run one at a time, because every candidate is judged on the same frozen holdout. A resumed loop reuses completed branches whatever its concurrency.

`limits.repairs` (0 to 3, default 0) gives an invalid edit at most that many re-edits from the same parent, each told why the previous edit was refused. After that the branch keeps its parent. An unchanged edit is not repaired.

With `compose: true`, the loop hands the editor the round's two best candidates that both pass the gate and both beat the parent by measured uplift, as `contrast-a.txt` and `contrast-b.txt`. The composite is a new candidate. It is executed and judged like any other, needs its own execution budget, and is selected only if it is strictly and uniquely better. Nothing is auditor-signed or promoted, and the unchanged baseline stays eligible.
