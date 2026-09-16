---
"agent-maturity-compass": patch
---

Bind governed tool evidence to the session whose turn produced it. `agentToolset` defaulted its evidence rows to `toolset-<agentId>`, a session id nothing ever starts, so `amc agent-loop run --tools workspace` and every delegated child that used a tool left rows referencing a missing session and `amc verify` failed with "references missing session". `sessionId` is now a required option, `amc agent-loop` mints the id and hands it to both the toolset and the turn (`runComposedTurn` accepts a caller-supplied `sessionId`), and a delegated child's tool evidence lands in the child's own session.
