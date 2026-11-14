# Your First Five Minutes with AMC

This page walks you through your first run of AMC (Agent Maturity Compass), one screen at a time. It says what you will see, what to press, and what each new word means. You do not need to know anything about AMC first.

AMC records what an AI agent actually does on your computer, and turns that record into a score and a short list of gaps to fix.

## Before you start

- You need Node.js 22 or 24 and AMC from the current source build. The [README](../README.md#install) has the six install commands. The hosted installers and npm give the older 1.1.1 release, which has no start menu.
- You need a terminal (Terminal on macOS). Everything happens in the terminal and, if you want, in your web browser.
- Optional: Claude Code or Codex, if you want AMC to watch one of them. AMC uses their own sign-in. It never sees your password or your plan.

## Step 1: type `amc` in your project folder

Open a terminal, go to the folder of the project you want AMC to look at, and type:

```bash
amc
```

The first time, you see something like this (the exact lines depend on what is installed on your computer):

```text
AMC set up this folder (.amc/).
? What do you want to do?
❯ Watch Claude Code as it works (signed in)
  Watch Codex as it works (signed in)
  Try a demo chat (no account or key needed)
  Open the console in my browser
  Just show my score (empty for now)
```

**Workspace.** "AMC set up this folder" means AMC made a hidden `.amc/` folder here. That folder is your AMC *workspace*: it holds AMC's settings, its keys and everything it records for this project. Keep `.amc/` out of version control (add it to `.gitignore`), because it holds secrets.

Use the up and down arrow keys to move, and press Enter to choose. The menu only shows what can work right now:

| Menu line | What it does |
|---|---|
| Watch Claude Code as it works | Starts AMC, adds a watch hook to this project's Claude Code settings, and can start Claude Code for you. |
| Watch Codex as it works | The same for Codex. Codex then needs two trust steps of its own (see Step 3). |
| Sign in to Claude Code first | Shown instead of the line above when Claude Code is installed but signed out. It runs Claude Code's own sign-in, then shows the menu again. |
| Chat with a model | Shown when an API key such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your shell. You chat with that model, and AMC records every turn. |
| Try a demo chat | A built-in demo model that gives canned replies. No account or key. Good for seeing what a recorded chat looks like. |
| Open the console in my browser | Starts AMC if it is not running, then opens the console (AMC's web page) in your browser. |
| Just show my score | Prints the score for what AMC has recorded so far. On a new folder it is empty. |

AMC remembers your choice and selects it first next time.

## Step 2: the vault question

The first time AMC starts its background service (for "Watch" or "Open the console"), it asks about the vault:

```text
Starting AMC (amc up)...

🔐 This workspace already has a vault
  AMC needs that vault's passphrase. A new one cannot open it.

? The passphrase AMC saved in .amc/local-vault-passphrase opens this vault. Use it? (Answer no if this folder was copied or cloned from someone else.) (Y/n)
```

**Vault.** The vault is a locked file in `.amc/` that holds the keys AMC uses to sign its records. A **passphrase** opens it. When you typed `amc`, AMC made the vault and saved a passphrase for it in `.amc/local-vault-passphrase`.

- If you made this folder yourself, press Enter (Yes).
- If the folder came from someone else, answer No and type the passphrase they gave you.

Next AMC asks whether to remember the passphrase on this computer. Press Enter (Yes). On macOS it goes into the Keychain; on other systems into `~/.config/amc/vault-credentials.json`. `amc vault forget` removes it again.

AMC then starts and prints `✓ AMC is running.` On a new folder it also runs a first check of all eight areas and prints a report card. **Expect a low grade.** AMC has not seen your agent do anything yet, so there is little to score.

## Step 3: watch your coding agent

If you chose "Watch Claude Code as it works", AMC asks three more questions:

1. `Add AMC's watch hook to this project's Claude Code settings? (Y/n)` Press Enter. AMC writes the hook into `.claude/settings.local.json` in this folder only, and prints each file it changed.
2. `Sign connect hooks install with the vault passphrase remembered in the macOS Keychain (service amc-vault)? (y/N)` Type `y` and press Enter. (The default here is No. If you answer No, AMC asks you to type the vault passphrase instead.)
3. `Start Claude Code here now? (Y/n)` Press Enter to start Claude Code in this folder, and work as you normally would. When you quit Claude Code, AMC prints where to see what it recorded.

To check the hook later: `amc connect hooks status --provider claude-code`.

**Observe and control.** The menu installs AMC in *observe* mode: AMC records each tool call the agent makes, and changes nothing. In *control* mode (Claude Code only, set up by hand) AMC can also refuse a tool call. Control mode needs Claude Code settings with no enabled plugin and no other hook that can change a tool call; otherwise it refuses every tool call. Start with observe mode. [Sign in with Claude or ChatGPT](SIGN_IN_WITH_CLAUDE_OR_CHATGPT.md) has both.

For Codex the questions are the same, and then Codex itself must trust the hook before anything is recorded:

1. Start `codex` in this folder and trust the folder when Codex asks.
2. In Codex, run `/hooks` and trust the hook labelled "AMC records this tool call".
3. Run a task in Codex. Each tool call it reports is then recorded.

## Step 4: open the console

The console is AMC's web page on your own computer. Choose "Open the console in my browser", or open the address AMC printed (it ends in `/console`).

The console asks you to sign in. The first time, create your account in the terminal:

```bash
amc user init --username <you>
```

If it asks whether to use the remembered vault passphrase, type `y`. Then it asks for a password. That password is for the console only. If the workspace already has accounts, an owner adds yours with `amc user add` instead.

After you sign in, the home page shows:

- one plain status line, with **Details** for the full status;
- a card titled "See what your AI agent really does.", with **Run a task** (runs a task right here, with no model or tools) and **Connect my agent** (shows the terminal command that connects your agent);
- a progress line, such as "Your progress: 0 of 4.", that names the next step;
- everything else under **More**.

"How AMC works" at the top of the page opens a three-step guide whenever you want it.

## Step 5: read your score

Choose "Just show my score" in the menu (or type `amc --no-menu`). The first lines look like this:

```text
  Artifact seal: VALID | Evidence: INSUFFICIENT_EVIDENCE | Claims: BLOCKED
  Overall: L0.00 (0/100) UNRELIABLE — DO NOT USE FOR CLAIMS
  AMC has not seen your agent do anything yet, so this score is empty.
```

**Evidence.** A record of something your agent really did, saved by AMC as it happened. Watching your agent work is how evidence builds up.

**Score.** A level from L0 to L5, worked out only from evidence. With no evidence it is L0.

**Signed.** Each record and report is sealed with a key, so anyone can check later that nobody changed it. "Artifact seal: VALID" means only that. It does not mean the agent is good or that the score is high.

**Claims: BLOCKED** means you should not quote this score to anyone yet. Let AMC watch real work, then score again.

## When you are done

- `amc down` in the project folder stops AMC's background service.
- `amc` again brings back the menu, with your last choice selected.
- `amc --help` lists the commands you need first; `amc --help --all` lists every command.

## If something goes wrong

[Troubleshooting](TROUBLESHOOTING.md) lists the messages new users meet most often, each with the fix. `amc doctor` checks the folder and names each fix.

Next: [After your first score](AFTER_FIRST_SCORE.md) and [Getting started](GETTING_STARTED.md).
