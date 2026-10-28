---
"agent-maturity-compass": patch
---

Codex observe mode (P2-17): `amc connect hooks install --provider codex --mode observe` writes `.codex/hooks.json` with one PostToolUse command hook that runs AMC's forwarder, plus a signed manifest and a dedicated observe lease. It never edits a `.codex/hooks.json` it did not write. The forwarder posts what Codex reports to the Bridge's new loopback, lease-authenticated route `/bridge/hooks/codex/v1`. AMC records the tool name, call id and SHA-256 of the session id, tool input and tool output (never their contents) with a signed receipt, and claims "observed" only. Control mode is refused for Codex, because Codex 0.165.0's PreToolUse hook lets a call run when the hook fails, and the hook control route never accepts Codex. No Codex binary has been run against it yet, so no Codex version is qualified.
