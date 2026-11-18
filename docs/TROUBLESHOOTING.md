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

AMC's background service uses a few local ports. The gateway and proxy ports (3210 and 3211 by default) are one set per computer, so only one AMC folder can use the defaults at a time.

- `Studio daemon exited during startup (exit code 1): Port 3210 (from the default gateway port; set AMC_GATEWAY_PORT to change it) is already in use. Stop the other process or change the port. Another AMC folder may be running: stop it there with amc down, or give this folder its own ports.` Another AMC is running, usually from another folder. Either run `amc down` in that folder, then `amc up` here, or start this folder on free ports of its own:

  ```bash
  AMC_GATEWAY_PORT=<free port> AMC_PROXY_PORT=<another free port> amc up
  ```

  On macOS or Linux, `lsof -nP -iTCP:3210 -sTCP:LISTEN` shows which process holds the port.
- The `amc` menu does this for you. When another folder holds the default ports, it says `Another AMC folder is already running on this Mac and holds AMC's default ports.` and asks `Start AMC for this folder on its own ports?` On yes it picks free ports and names the gateway port this folder uses. Commands that send model traffic through this folder's gateway then need that `AMC_GATEWAY_PORT` set; `amc connect` prints the right address.
- `Port 3212 (from AMC_STUDIO_PORT) is already in use. Stop the other process or change the port.` You set that port yourself, and something else holds it. Stop the other process, or unset the variable.
- When you did not set a console port, `amc up` uses the port this folder used last time while it is free, otherwise 3212, otherwise any free port, and prints the change, for example `Studio API port 3212 was busy; listening on <port>` or `Studio API listening on <port>, the port this workspace used last time (the default is 3212)`. The console address it prints has the right port.
- Watch hooks send events to this folder's own AMC at the port it had when you installed them. If the port changed, `amc connect hooks status --provider claude-code` (or `amc connect hooks health`) says `the hook sends events to <old address>, but this workspace's Studio listens on <new address>` and prints the `amc connect hooks install` command that points the hook here again.
- The macOS app runs its own AMC on its own ports: the console on 3232 and the gateway on 3230 and 3231. If another program holds one of them, the window says `AMC could not start because another program on this Mac uses port <port>, often an AMC Studio started from Terminal.` Stop it (`amc down` in its folder), then click Retry.

### `AMC: adapting the database engine to Node …` or `NODE_MODULE_VERSION`

AMC's database engine (`better-sqlite3`) is built for one version of Node. When you run AMC under another Node version, AMC rebuilds it once and prints `AMC: adapting the database engine to Node v22.… (one-time, ~10s)…` and then `AMC: database engine ready.` That is normal; wait for it.

If the rebuild fails, AMC prints `AMC could not load its database engine under Node …` with two fixes: run the `npm rebuild better-sqlite3` command it prints, or reinstall AMC with this Node version active. `amc doctor` reports the same problem as `better-sqlite3 was compiled for a different Node version`. Use Node.js 22 or 24.

### `ROLLBACK_DETECTED: keyset.json is missing, but this machine committed generation 1`

You deleted (or replaced) the `.amc/` folder in a folder where AMC ran before. This computer remembers that the folder had signing keys, and refuses to start over there, so that a deleted or swapped workspace cannot pass as a new one. This is on purpose.

- Put the `.amc/` folder back from a backup, then run the command again. If AMC still refuses, run the `amc keys rotate --restore` command the message names.
- Or start in a new folder.

AMC has no command that starts such a folder over, because doing so would remove this computer's memory of the folder's keys, which is the protection itself. For the same reason `amc init --force` (and `amc init --coding --force`) is refused in a folder whose keys this computer created, before it deletes anything; it used to delete `.amc` and then stop at this error. To move a folder the `amc` menu set up to the coding setup, run `amc init --coding` without `--force`.

### The console or the app shows `Starting AMC…` for a long time

The page is waiting for its first answer from AMC. In a browser, press ⌘R (Ctrl+R on Windows and Linux) to reload. In the macOS app, press ⌘R too (Studio > Reload). If it still stays on `Starting AMC…` or blank, run `amc doctor` in the workspace folder and check `.amc/studio/logs/studio.log`. In the macOS app, Studio > Show Logs opens the launcher log (`~/Library/Logs/Agent Maturity Compass/studio-launcher.log`). The app's own workspace folder is `~/Library/Application Support/Agent Maturity Compass/workspace` (the demo is in `studio-workspace` next to it), and the app's own `amc` is `../runtime/node_modules/.bin/amc` from there ([Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md)).

### `Authentication required. Sign in` in the console

Your workspace has no console account yet, or you are signed out. Create the first account (an owner) in the workspace folder:

```bash
amc user init --username <you>
```

It asks for the password you will sign in with; then sign in at the console address `amc up` printed. If the workspace already has accounts, an owner adds yours with `amc user add --username <you> --role OWNER`. The macOS app signs you in to its own workspace as the owner, with a password it keeps in the Keychain (service `amc-console`); its demo workspace is view-only and needs no account.

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

Commands that sign records need the vault passphrase. In a terminal, a signing command such as `amc firewall enable` asks `Use the vault passphrase saved in <location> to sign amc firewall enable?` when one is remembered (the default is No; answer `y`), or asks you to type the passphrase when none is. In a script, set `AMC_VAULT_PASSPHRASE` first. `amc vault unlock` unlocks only its own process. In `amc agent-loop chat`, a locked vault ends the turn with `VAULT_LOCKED` and the words `The vault is locked, so the turn could not be signed.`; run chat from your own terminal, or export `AMC_VAULT_PASSPHRASE`.

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
