---
"agent-maturity-compass": major
---

`amc badge` no longer takes `--level`, `--score` or `--format`. Those flags rendered a shields.io, HTML or SVG maturity badge for any level or score the caller typed, which let anyone make a self-made badge. `amc badge [--agent <id>]` now prints only the agent's passport badge line from what AMC recorded (the same line as `amc passport badge`), with its claim line on stderr; the passed flags are refused as unknown options. With no passport it prints `No badge for agent '<id>': <reason>` and `Record an assessment first (amc run), then run amc badge again.` and exits 1. No sample or preview mode replaces the overrides; badges for a README will only come from a public registry (Gate G3). The command path is unchanged, so no freeze exception applies (check:freeze counts command paths, not flags).
