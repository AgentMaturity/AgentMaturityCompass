---
"agent-maturity-compass": minor
---

Trust on first use for workspace configuration: a native session in a workspace whose key set this machine did not commit is refused until the operator trusts it (`amc trust workspace`, `--trust-workspace` on `agent-loop run|chat`, `amc acp` and `native schedule execute`, `trustWorkspace` in the SDK, or `AMC_TRUST_WORKSPACE=1` for headless hosts). The consent record lives in the AMC home, binds the key set and the signed tools policy, and a changed surface is refused until trusted again.

freeze-exception: SH-SANDBOX — `amc trust workspace` and `--trust-workspace`: consent before a cloned repository's self-signed configuration is applied, which Claude Code, Gemini CLI and pi all have and AMC lacked
