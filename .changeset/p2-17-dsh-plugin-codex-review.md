---
"agent-maturity-compass": patch
---

P2-17 parts B and C, no runtime change to AMC itself. Codex 0.165.0's hooks were reviewed from source (`docs/source-reviews/P2-17-codex-hooks.md`): its PreToolUse hook lets a call run when the handler errors, times out, exits other than 0 or 2, or is untrusted, so AMC claims no Codex enforcement and installs no Codex hook. A new private package, `packages/dsh-amc-plugin`, gates DeepSeek Harness tool calls at DSH 0.2.1-rc.2's `tools/pre-execute` waterfall with a guard behind it. It denies on an unqualified DSH version, missing arguments, an AMC outage or timeout, or any answer but an exact allow. It is tested only against a fake Cordis context, has no AMC transport yet, and supports no DSH claim. The support matrix states both.
