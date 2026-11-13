---
"agent-maturity-compass": minor
---

`amc login status|claude|codex` runs the vendor's own sign-in for Claude Code and Codex and reports which are signed in; AMC never reads or stores a sign-in. `amc connect hooks install|status --provider codex` now prints the trust steps Codex requires before anything is observed. New guide: docs/SIGN_IN_WITH_CLAUDE_OR_CHATGPT.md.

freeze-exception: LIVE-UX — amc login status|claude|codex (4 paths): first-run sign-in help for Claude Code and Codex, found missing when the product was run end to end with a ChatGPT sign-in
