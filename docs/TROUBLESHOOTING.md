# AMC Troubleshooting

Quick answers for the most common setup failures. The first section covers the messages new users meet on their first run, each with the exact text AMC prints and the fix.

## First thing to run

```bash
amc doctor
```

It checks the folder you are in and names a fix for each problem it finds. In a folder with no `.amc/` workspace yet, it checks the installation only and suggests `amc`.

## First-run problems

### `Vault unlock failed: incorrect passphrase or corrupted vault.`

The passphrase AMC was given does not open this folder's vault. Most often `AMC_VAULT_PASSPHRASE` is still set in your shell from another folder.

```bash
unset AMC_VAULT_PASSPHRASE
amc up
```

In a terminal, `amc up` then offers the passphrase AMC saved in `.amc/local-vault-passphrase` when it opens this vault, or asks you to type it. A wrong typed passphrase is refused with `That passphrase does not open this vault.` A vault cannot be opened without its passphrase; if nobody has it, start again in a new folder.

### `This workspace already has a vault, and no passphrase for it was found in …`

The folder has a vault, and `amc up` ran where it cannot ask you (a pipe, a script or CI) and found no passphrase. It never makes a new passphrase for a vault that exists, because a new one cannot open it.

- Run `amc up` in a terminal. It offers the saved passphrase or asks for it, then offers to remember it on this computer.
- Or give it the passphrase first, as the message says: `export AMC_VAULT_PASSPHRASE='<the vault passphrase>'`, then `amc up` again. For a folder that `amc` set up on this computer, the passphrase is in `.amc/local-vault-passphrase`.

### Claude Code: every tool call is denied

Claude Code shows `This Claude Code session has no AMC registration, so it is not governed; AMC denied the call.` This happens in **control** mode only. Control needs Claude Code settings with no enabled plugin and no other hook that can change a tool call (a `PreToolUse` or `PermissionRequest` hook that is not AMC's). With either present, AMC refuses to register the session and denies every call. The install printed a warning that starts `Claude Code's settings keep AMC from registering sessions` and names the setting.

To watch without blocking, switch to observe mode, as that warning suggests:

```bash
amc connect hooks install --provider claude-code --mode observe --agent default
```

To keep control instead, turn off the plugin or remove the other hook that the warning names, then start a new Claude Code session. `amc connect hooks status --provider claude-code` checks the installed hook. The start menu always installs observe mode.

### Codex: nothing is recorded

Codex runs a project hook only after you trust the folder and the hook inside Codex. Until then AMC records nothing. After `amc connect hooks install --provider codex --mode observe --agent default` (or "Watch Codex as it works" in the menu):

1. Sign in to Codex if you have not: `codex login` (AMC never sees or stores the sign-in).
2. Start `codex` in this folder and trust the folder when Codex asks.
3. In Codex, run `/hooks` and trust the hook labelled "AMC records this tool call".
4. Run a task in Codex. Each tool call it reports is then recorded as observed.

`amc connect hooks status --provider codex` prints these steps again. AMC never controls Codex calls; see [codex.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adapters/codex.md).

### A port is already in use

AMC's background service uses a few local ports. Only one AMC can hold them at a time on one computer.

- `Studio daemon exited during startup (exit code 1): Port 3210 (from the default gateway port; set AMC_GATEWAY_PORT to change it) is already in use.` Another AMC is running, usually from another folder. Run `amc down` in that folder, then `amc up` here. On macOS or Linux, `lsof -nP -iTCP:3210 -sTCP:LISTEN` shows which process holds the port.
- `Port 3212 (from AMC_STUDIO_PORT) is already in use. Stop the other process or change the port.` You set that port yourself, and something else holds it. Stop the other process, or unset the variable.
- When the default console port 3212 is busy and you did not set one, `amc up` picks a free port and prints the console address with that port. `.amc/studio/logs/studio.log` records `Studio API port 3212 was busy; listening on <port>`.
- The macOS app uses 3212 (unless `AMC_HOST_PORT` is set). If that port is busy it says `AMC Studio could not start because another program is using its port`. Stop the other AMC (`amc down` in its folder) and open the app again.

### `AMC: adapting the database engine to Node …` or `NODE_MODULE_VERSION`

AMC's database engine (`better-sqlite3`) is built for one version of Node. When you run AMC under another Node version, AMC rebuilds it once and prints `AMC: adapting the database engine to Node v22.… (one-time, ~10s)…` and then `AMC: database engine ready.` That is normal; wait for it.

If the rebuild fails, AMC prints `AMC could not load its database engine under Node …` with two fixes: run the `npm rebuild better-sqlite3` command it prints, or reinstall AMC with this Node version active. `amc doctor` reports the same problem as `better-sqlite3 was compiled for a different Node version`. Use Node.js 22 or 24.

### `ROLLBACK_DETECTED: keyset.json is missing, but this machine committed generation 1`

You deleted (or replaced) the `.amc/` folder in a folder where AMC ran before. This computer remembers that the folder had signing keys, and refuses to start over there, so that a deleted or swapped workspace cannot pass as a new one. This is on purpose.

- Put the `.amc/` folder back from a backup, then run the command again. If AMC still refuses, run the `amc keys rotate --restore` command the message names.
- Or start in a new folder.

### The console or the app shows `Starting AMC…` for a long time

The page is waiting for its first answer from AMC. In a browser, press ⌘R (Ctrl+R on Windows and Linux) to reload. In the macOS app, quit with ⌘Q and open it again. If it still stays on `Starting AMC…` or blank, run `amc doctor` in the workspace folder and check `.amc/studio/logs/studio.log`. For the macOS app, the workspace folder is `~/Library/Application Support/Agent Maturity Compass/studio-workspace`, and the app's own `amc` is `../runtime/node_modules/.bin/amc` from there ([Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md)).

### `Authentication required. Sign in` in the console

Your workspace has no console account yet, or you are signed out. Create the first account (an owner) in the workspace folder:

```bash
amc user init --username <you>
```

It asks for the password you will sign in with; then sign in at the console address `amc up` printed. If the workspace already has accounts, an owner adds yours with `amc user add --username <you> --role OWNER`. The demo workspace in the desktop app needs no account.

## Other common problems

### `amc` command not found

Install AMC first. The current build, with the start menu, installs from source ([README](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/README.md#install)); `npm link` at the end puts `amc` on your PATH. The hosted installer gives the published 1.1.1 release:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

### Install fails on Node version / native module issues

Use Node 22 or 24, AMC's production qualification targets. The Node 20 package floor indicates compatibility only; see [platform qualification](PLATFORM_QUALIFICATION.md) for actual environment receipts.

### Studio or gateway does not start

`amc up` prints the reason, and `.amc/studio/logs/studio.log` has the details. Then:

```bash
amc doctor
```

If you use Docker, Compose or Helm, see the related deployment docs.

### Vault is locked

Commands that sign records need the vault passphrase. In a terminal, AMC uses the one it remembered after `amc up`, or asks. In a script, set `AMC_VAULT_PASSPHRASE` first. `amc vault unlock` unlocks only its own process.

### Full score works, but deeper workflows feel confusing

Read these in order:
- `docs/QUICKSTART.md`
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/STARTER_BLUEPRINTS.md`

### Example project does not run

Check:
1. framework-specific dependencies are installed
2. provider credentials are present if required
3. you are using the example's setup script when provided
4. you are not assuming every example is zero-credential

### Docs and CLI seem inconsistent

Prefer:
- current stable docs
- commands confirmed by `amc --help` (or `amc --help --all` for every command)
- changelog for recent renames/deprecations

If you find a mismatch, file an issue.

## Recommended fix flow

```bash
amc doctor
amc up
amc fix-signatures
amc adapters verify
```

## Getting unstuck

If you still hit a wall:
- search existing GitHub issues/discussions
- include your install path, OS, Node version, and exact command/output
- include whether you are using npm, Docker, the desktop app or a source install
