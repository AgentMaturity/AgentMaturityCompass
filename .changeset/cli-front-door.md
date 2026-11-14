---
"agent-maturity-compass": minor
---

Bare `amc` in your own terminal now opens a start menu instead of printing an empty score. It lists only what can work right now, with the best choice pre-selected so Enter works: watch Claude Code or Codex as it works (when signed in; a signed-out agent appears as "Sign in to ... first" and runs the vendor's own sign-in), chat with a model when a provider key is in the shell, a demo chat that needs no account or key, opening the console in your browser, or just the score. Each choice runs the existing command (`amc up`, `amc connect hooks install --mode observe`, `amc agent-loop chat`, `amc login`) with the terminal attached, so its vault gates and confirmations still ask; the watch hook is written only after a yes to "Add AMC's watch hook to this project's ... settings?", and only in observe mode. The last choice is remembered in `.amc/front-door.json` and pre-selected next time. Without a terminal on stdin and stdout, under an agent marker or in agent mode, with any argument, with `amc --no-menu` or with `AMC_NO_MENU=1`, bare `amc` prints the score as before.

- The score keeps its UNRELIABLE label and now says why when there is no evidence ("AMC has not seen your agent do anything yet, so this score is empty."). The eight artifact paths are replaced by one line ("Details saved under .amc/ ..."; `--json` still lists every path), and the three Next lines by one next step chosen from what AMC found.
- `amc --help` is a short task list (start with `amc`, `amc up`/`amc down`, `amc login status`, `amc agent-loop chat`, `amc connect`, `amc doctor`, `amc domain pack list`, `amc user init`); `amc --help --all` still lists every command.
- `amc init` prints plain next steps (start with `amc`, a demo chat, `amc firewall enable`); pinning the monitor key is kept as an optional last step.
- The `[diagnostic] untagged evidence ...` note is printed only with `AMC_LOG_LEVEL=debug`.
- `amc setup` no longer asks which provider to configure when no provider key is set.
- `amc user init` in a terminal uses your OS user name when `--username` is omitted, and says which; `amc domain pack run` in a terminal without `--pack` lets you pick the pack. Without a terminal both options stay required.
