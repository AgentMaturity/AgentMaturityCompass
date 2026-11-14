# Try AMC with a Claude or ChatGPT sign-in

You do not need an API key to try AMC. If you have a Claude plan or a ChatGPT plan, sign in to the vendor's own
coding agent (Claude Code or Codex) and let AMC watch it.

AMC holds no subscription sign-in. `amc login` starts the vendor's own sign-in command and reads the vendor's own
status answer. It never reads a password, a token, a credentials file or a keychain item. AMC's native agent
(`amc agent-loop run`) still needs a provider credential reference or a local model; a plan sign-in does not feed it.

## Steps

```bash
amc login status            # which of Claude Code and Codex are installed and signed in
amc login claude            # runs: claude auth login
amc login codex             # runs: codex login

amc init --minimal          # in the project folder; save the vault passphrase it prints
amc up                      # starts AMC on this machine (loopback only)
```

### Claude Code (control: AMC can deny a tool call)

```bash
amc connect hooks install --provider claude-code --mode control --agent default
amc connect hooks status --provider claude-code
claude                      # work as usual in this folder
amc connect hooks health --provider claude-code
```

Control is claimed for the qualified Claude Code release only; see [claude-code-hooks.md](adapters/claude-code-hooks.md).

Control needs Claude Code settings with no enabled plugin and no other hook that can change a tool call. With either present, AMC refuses the session registration and the hook denies every tool call; the install command prints a warning that names the setting. To watch Claude Code without blocking, install observe mode instead, which `amc login status` suggests:

```bash
amc connect hooks install --provider claude-code --mode observe --agent default
```

### Codex (observe: AMC records, it does not control)

```bash
amc connect hooks install --provider codex --mode observe --agent default
codex                       # trust the folder when Codex asks, then run /hooks and trust the AMC hook
```

Codex runs a project hook only after you trust the folder and the hook in Codex. Until then nothing is observed and
AMC says so. Measured on 2026-11-13 with codex-cli 0.167.0 signed in with ChatGPT on macOS arm64: `codex exec` did not
load the project hook before that trust, and once Codex ran the hook AMC recorded the tool call as an observed event.
No Codex release is qualified yet; see [codex.md](adapters/codex.md).

## What you can claim afterwards

- Claude Code, control mode: tool calls in registered sessions passed AMC's signed decision, and outcomes were observed.
- Codex: the tool calls Codex reported were observed. Nothing was controlled.
- Neither is a certification, and neither says anything about answer quality.
