# Your First Five Minutes with AMC

This page walks you through your first run of AMC (Agent Maturity Compass), one screen at a time. It says what you will see, what to press, and what each new word means. You do not need to know anything about AMC first.

AMC records what an AI agent actually does on your computer, and turns that record into a score and a short list of gaps to fix.

## Before you start

- You need Node.js 22 or 24 and AMC from the current source build. The [README](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/README.md#install) has the six install commands. The hosted installers and npm give the older 1.1.1 release, which has no start menu.
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

## Step 2: AMC starts

The first time you choose "Watch" or "Open the console", AMC starts its background service on this computer:

```text
Starting AMC on this Mac...
✓ AMC is running. (agent: default)
  Open your report card:  http://127.0.0.1:<port>/console
```

**Vault.** The vault is a locked file in `.amc/` that holds the keys AMC uses to sign its records. A **passphrase** opens it. When you typed `amc`, AMC made the vault and kept its passphrase in `.amc/local-vault-passphrase` in this folder, so this step asks you nothing about it.

- If the folder came from someone else (copied or cloned), AMC asks for that vault's passphrase instead. Answer No to the saved-file question and type the passphrase they gave you.
- If another AMC folder is already running on this computer, AMC says so and asks `Start AMC for this folder on its own ports?` Press Enter (Yes). AMC then names the gateway port this folder uses.

From the menu, AMC skips the first full check, so no report card is printed yet. Step 5 shows your score.

## Step 3: watch your coding agent

If you chose "Watch Claude Code as it works", AMC asks two more questions:

1. `Add AMC's watch hook to this project's Claude Code settings? It sends what Claude Code does to AMC on this Mac (http://127.0.0.1:<port>).` Press Enter (Yes). AMC writes the hook into `.claude/settings.local.json` in this folder only, and prints each file it changed. If you answer No, nothing changes, and AMC prints the command that adds the hook later.
2. `Start Claude Code here now?` Press Enter to start Claude Code in this folder, and work as you normally would. When you quit Claude Code, AMC prints where to see what it recorded.

So a first run takes three answers: the menu line, the hook, and the start. The hook points at this folder's own AMC, at the port shown in the question. To check the hook later: `amc connect hooks status --provider claude-code`. If AMC later runs on a different port, that command says so and prints the command that points the hook at the new port.

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

It signs your account with the vault keys, so it may ask for the vault passphrase first. For a folder that `amc` set up on this computer, the passphrase is in `.amc/local-vault-passphrase`. If it asks instead `Use the vault passphrase saved in … to sign amc user init?`, type `y` (the default is No). Then it asks for a password. That password is for the console only. If the workspace already has accounts, an owner adds yours with `amc user add` instead.

After you sign in, the home page shows:

- one plain status line, with **Details** for the full status;
- a card titled "See what your AI agent really does.", with **Run a task** (runs a task right here, with no model or tools) and **Connect my agent** (shows the terminal command, `amc connect`, that connects your agent; in a terminal it first offers to watch the Claude Code or Codex you are signed in to, and for any other agent it writes the settings to a private file, `.amc/studio/connect/<agent>.env`, and prints one `source` line to run);
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

## Using the macOS app instead

If you built the macOS app ([Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md)), its first launch asks how to start: Set Up My Workspace, Try the Demo, or Quit. Setting up makes your own workspace, keeps its vault passphrase and your console password in the macOS Keychain, and opens the console signed in as you, so you need no terminal for Steps 2 and 4. The Studio menu has Reload (⌘R), Try the Demo or Open My Workspace, Stop AMC and Show Logs. When you quit, the app offers to stop AMC too. The app uses its own ports (the console on 3232), so it does not get in the way of `amc` in a terminal.

## When you are done

- `amc down` in the project folder stops AMC's background service.
- `amc` again brings back the menu, with your last choice selected.
- `amc --help` lists the commands you need first; `amc --help --all` lists every command.

## If something goes wrong

[Troubleshooting](TROUBLESHOOTING.md) lists the messages new users meet most often, each with the fix. `amc doctor` checks the folder and names each fix.

Next: [After your first score](AFTER_FIRST_SCORE.md) and [Getting started](GETTING_STARTED.md).
