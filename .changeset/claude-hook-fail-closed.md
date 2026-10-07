---
"agent-maturity-compass": major
---

Claude Code control hooks now run through absolute Node and CLI paths, deny with exit code 2 on every failure before the hook timeout, and `amc connect hooks status` verifies control with a probe.

Breaking for existing Claude Code installs: re-run `amc connect hooks install --provider claude-code` so the handler stops looking up `amc` on `PATH`; re-install also after upgrading AMC or switching Node, because the paths are absolute. A control install from the npx cache is refused. In control mode the hidden forwarder works under a 5 s deadline inside the 10 s hook timeout, and a policy deny, empty or invalid input, a Bridge error or the deadline now exits 2 (it exited 0 or 1 before, which Claude Code treats as non-blocking). `amc connect hooks status` and `health` print `Control: verified` only after the installed handler denied a probe, and print `Control: NOT VERIFIED` with exit 1 for a missing command, a failed probe, or `disableAllHooks` or `allowManagedHooksOnly` in settings. Control is enforced at the Claude Code `PreToolUse` hook only while Claude Code runs it. Gemini CLI outputs and exit codes are unchanged; its forwarder gains only the deadline.
