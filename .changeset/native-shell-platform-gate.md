---
"agent-maturity-compass": major
---

Breaking: the native shell is refused on macOS and Windows unless `--unsafe-unconfined-shell` or a signed `runtime.shell.allowUnconfined` is set; opted-in sessions record enforcement none.

On macOS the `bash` tool used to run `/bin/sh` with your full user rights on every `--tools workspace` run, and nothing recorded that it was unconfined. It is now offered only after an explicit opt-in: `--unsafe-unconfined-shell` on `amc agent-loop run`, `amc agent-loop chat` and `amc acp`, `allowUnconfinedShell` in the SDK, or `runtime.shell.allowUnconfined: true` in an auditor-signed `.amc/amc.config.yaml` (the only opt-in Studio accepts). Each opted-in session prints a warning on stderr and records `NATIVE_SHELL_UNCONFINED_ENABLED`; each unconfined call records `enforcementLevel: "none"`. Windows and other platforms are refused even with the flag. Linux without a usable `/usr/bin/bwrap` no longer offers the shell at all, and the opt-in never enables an unconfined Linux shell. `amc verify --sign-config` signs the config, as earlier messages already advised. Studio's native-task options now include `shell`, and task setup shows its refusal or warning text as a banner. `AMCNativeClient` does not surface the spawned process's stderr, so SDK callers see the receipts but not the printed warning.
