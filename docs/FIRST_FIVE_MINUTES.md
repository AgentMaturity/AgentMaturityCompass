# Your First Five Minutes with AMC

This page walks you through your first run of AMC (Agent Maturity Compass), one screen at a time. It says what you will see, what to press, and what each new word means. You do not need to know anything about AMC first.

AMC helps you build an AI agent for work that gets audited, run it, and check what it really did. The first run has two parts: build an agent for your industry, then watch or score an agent you already have. Words in **bold** are explained where they first appear, and [Words you will meet](#words-you-will-meet) at the end lists them all.

## Before you start

- You need git, Node.js (>=20, tested on 22 and 24) and AMC from the current source build. The [README](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/README.md#install) has the one install command, `curl -fsSL https://agentmaturity.co/install-source.sh | sh` (it works once the website is published from `main`; until then the README shows how to build by hand). The older `install.sh` installer and npm give the published 1.1.1 release, which has no start menu and no A4 Forge.
- You need a terminal (Terminal on macOS). Everything happens in the terminal and, if you want, in your web browser.
- Optional: Claude Code or Codex, if you want AMC to watch one of them. AMC uses their own sign-in. It never sees your password or your plan.

## Step 1: type `amc` in your project folder

Open a terminal, go to the folder of the project you want AMC to look at, and type:

```bash
amc
```

The first time, you see something like this. This is a real run on a computer where Codex is installed but signed out and Claude Code is not installed; the lines you see depend on what is installed on your computer:

```text
AMC set up this folder (.amc/).
? What do you want to do?
  Sign in to Codex first
❯ Try a demo chat (no account or key needed)
  Build an agent for my industry (A4 Forge preview)
  Open the console in my browser
  Just show my score (empty for now)
```

**Workspace.** "AMC set up this folder" means AMC made a hidden `.amc/` folder here. That folder is your AMC *workspace*: it holds AMC's settings, its keys and everything it records for this project. Keep `.amc/` out of version control (add it to `.gitignore`), because it holds secrets.

Use the up and down arrow keys to move, and press Enter to choose. The menu only shows what can work right now:

| Menu line | What it does |
|---|---|
| Build an agent for my industry (A4 Forge preview) | Starts AMC and offers to open the A4 page of the console, where you start an agent project for your industry (Step 4). |
| Watch Claude Code as it works | Starts AMC, adds a watch hook to this project's Claude Code settings, and can start Claude Code for you. |
| Watch Codex as it works | The same for Codex. Codex then needs two trust steps of its own (see Step 5). |
| Sign in to Claude Code first | Shown instead of the line above when Claude Code is installed but signed out. It runs Claude Code's own sign-in, then shows the menu again. |
| Chat with a model | Shown when an API key such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your shell. You chat with that model, and AMC records every turn. |
| Try a demo chat | The stand-in model, which gives canned replies. No account or key. Good for seeing what a recorded chat looks like; a result on the stand-in model says nothing about a real agent. |
| Open the console in my browser | Starts AMC if it is not running, then opens the console (AMC's web page) in your browser. |
| Just show my score | Prints the score for what AMC has recorded so far. On a new folder it is empty. |

AMC remembers your choice and selects it first next time.

## Step 2: AMC starts

The first time you choose "Build an agent", "Watch" or "Open the console", AMC starts its background service on this computer:

```text
Starting AMC on this Mac...
✓ AMC is running. (agent: default)
  Open your report card:  http://127.0.0.1:<port>/console
```

**Vault.** The vault is a locked file in `.amc/` that holds the keys AMC uses to sign its records. A **passphrase** opens it. When you typed `amc`, AMC made the vault and remembered its passphrase for this folder on this computer, so this step asks you nothing about it.

- If the folder came from someone else (copied or cloned), AMC asks for that vault's passphrase instead. If AMC offers a saved passphrase, answer No, then type the passphrase they gave you.
- If another AMC folder is already running on this computer, AMC says so and asks `Start AMC for this folder on its own ports?` Press Enter (Yes). AMC then names the gateway port this folder uses.

From the menu, AMC skips the first full check, so no report card is printed yet. Step 6 shows your score.

## Step 3: open the console and sign in

The console is AMC's web page on your own computer. Choose "Open the console in my browser", or open the address AMC printed (it ends in `/console`).

The console asks you to sign in. The first time, create your account in the terminal:

```bash
amc user init --username <you>
```

It signs your account with the vault keys. If it asks `Use the vault passphrase saved in … to sign amc user init?`, type `y` (the default is No); otherwise it asks you to type the vault passphrase. Then it asks for a password. That password is for the console only. If the workspace already has accounts, an owner adds yours with `amc user add` instead.

After you sign in, the home page shows:

- one plain status line, with **Details** for the full status;
- a card titled "See what your AI agent really does.", with **Run a task** (runs a task right here, with no model or tools) and **Connect my agent** (shows the terminal command, `amc connect`, that connects your agent; in a terminal it first offers to watch the Claude Code or Codex you are signed in to, and for any other agent it writes the settings to a private file, `.amc/studio/connect/<agent>.env`, and prints one `source` line to run);
- a progress line, such as "Your progress: 0 of 4.", that names the next step;
- everything else under **More**.

"How AMC works" at the top of the page opens a three-step guide whenever you want it.

## Step 4: build an agent for your industry

Choose "Build an agent for my industry (A4 Forge preview)" in the menu. AMC starts (Step 2) and asks:

```text
? Open http://127.0.0.1:<port>/console/a4?new=1 in your browser now? (Y/n)
```

Press Enter to open the A4 page, sign in (Step 3), pick your industry and start an agent project. **A4 Forge** takes the agent through four stages: Aspire (what the agent is for), Assemble (building it), Adapt (the rules for its markets and data) and Activate (getting it ready for an operator to run). Each step stops at a **gate** until an **approver** says yes.

- Alone, on a practice project (chosen on the start form under "Who approves each step?"), you can get as far as building the agent in Assemble. Assemble's final approval, Adapt and Activate each need two approvers who did not write, build or ask for that step: three people in all. A project started from an Industry Pack always needs a second person.
- On a laptop the walk ends after Adapt: Activate's release approval is refused when AMC does not run under Docker Compose or Helm.
- A4 Forge is a preview. Its records are signed and self-reported, and nothing it writes says the agent is safe, correct or lawful.
- An **Industry Pack** is a questionnaire for one sector, such as patient records or payments. Packs are grouped into seven **stations** (health, wealth, education, mobility, technology, environment, governance). Their content is experimental: drafted by AI, not reviewed by a qualified expert, and not legal advice. Their citations were checked by an AI agent on 2026-11-16, not by an expert. `amc domain pack describe --pack digital-health-record` prints, for example:

  ```text
    Citations:  39 of 42 citations checked; 39 of them by an AI agent, not an expert review; 2 sources could not be opened; 1 instrument replaced
    Content:    experimental, self-reported questionnaire. AI-drafted; not reviewed by a qualified expert; not legal advice.
  ```

[A4 Forge](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/A4_FORGE.md) has every stage and who may approve it.

## Step 5: watch your coding agent

If you chose "Watch Claude Code as it works", AMC asks two more questions:

1. `Add AMC's watch hook to this project's Claude Code settings? It sends what Claude Code does to AMC on this Mac (http://127.0.0.1:<port>).` Press Enter (Yes). AMC writes the hook into `.claude/settings.local.json` in this folder only, and prints each file it changed. If you answer No, nothing changes, and AMC prints the command that adds the hook later.
2. `Start Claude Code here now?` Press Enter to start Claude Code in this folder, and work as you normally would. When you quit Claude Code, AMC prints where to see what it recorded.

So a first run takes three answers: the menu line, the hook, and the start. The hook points at this folder's own AMC, at the port shown in the question. To check the hook later: `amc connect hooks status --provider claude-code`. If AMC later runs on a different port, that command says so and prints the command that points the hook at the new port.

**Observe and control.** The menu installs AMC in *observe* mode: AMC records each tool call the agent makes, and changes nothing. In *control* mode (Claude Code only, set up by hand) AMC can also refuse a tool call. Control mode needs Claude Code settings with no enabled plugin and no other hook that can change a tool call; otherwise it refuses every tool call. Start with observe mode. [Sign in with Claude or ChatGPT](SIGN_IN_WITH_CLAUDE_OR_CHATGPT.md) has both.

For Codex the questions are the same, and then Codex itself must trust the hook before anything is recorded:

1. Start `codex` in this folder and trust the folder when Codex asks.
2. In Codex, run `/hooks` and trust the hook labelled "AMC records this tool call".
3. Run a task in Codex. Each tool call it reports is then recorded.

## Step 6: read your score

Choose "Just show my score" in the menu (or type `amc --no-menu`). The first lines look like this:

```text
  Artifact seal: VALID | Evidence: INSUFFICIENT_EVIDENCE | Claims: BLOCKED

  Overall: L0.00 (0/100) UNRELIABLE — DO NOT USE FOR CLAIMS
  No range: not enough evidence to estimate one
  AMC has not seen your agent do anything yet, so this score is empty.
```

**Evidence.** A record of something your agent really did, saved by AMC as it happened. Watching your agent work is how evidence builds up.

**Score.** A **level** from L0 to L5, worked out only from evidence. With no evidence it is L0. Today 240 of the 244 questions cannot rise above L1, so a low score is expected.

**Signed.** Each record and report is sealed with a key, so anyone who has your public key can check later that nobody changed it and which key signed it. "Artifact seal: VALID" means only that. It does not mean the agent is good, that the record is true, or that the score is high.

**Claims: BLOCKED** means you should not quote this score to anyone yet. Let AMC watch real work, then score again.

## Using the macOS app instead

If you built the macOS app ([Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md)), its first launch asks how to start: Set Up My Workspace, Try the Demo, or Quit. Setting up makes your own workspace, keeps its vault passphrase and your console password in the macOS Keychain, and opens the console signed in as you, so you need no terminal for Steps 2 and 3. The Studio menu has Reload (⌘R), Try the Demo or Open My Workspace, Stop AMC and Show Logs. When you quit, the app offers to stop AMC too. The app uses its own ports (the console on 3232), so it does not get in the way of `amc` in a terminal.

## When you are done

- `amc down` in the project folder stops AMC's background service.
- `amc` again brings back the menu, with your last choice selected.
- `amc --help` lists the commands you need first; `amc --help --all` lists every command.

## If something goes wrong

[Troubleshooting](TROUBLESHOOTING.md) lists the messages new users meet most often, each with the fix. `amc doctor` checks the folder and names each fix.

Next: [After your first score](AFTER_FIRST_SCORE.md) and [Getting started](GETTING_STARTED.md).

## Words you will meet

| Word | What it means |
|---|---|
| Receipt | A small signed record AMC writes when it accepts or decides something, such as a watched tool call or an approval. It shows which key signed it and that it has not changed since. |
| Ledger | AMC's list of evidence for this workspace, kept in `.amc/`. Each row is linked to the one before, so `amc verify` notices a changed row. |
| Vault | A locked file in `.amc/` that holds the keys AMC signs with. |
| Passphrase | The secret that opens the vault. AMC can create and remember one for you; never share it or put it in a document. |
| Gate | A point where work stops until the right people approve it, for example each step of A4 Forge. |
| Approver | A person allowed to decide a gate. The person who wrote, built or asked for a step cannot approve it. |
| Pack | A set of questions or tests. An Industry Pack is a questionnaire for one sector (experimental, AI-drafted, not legal advice); an assurance pack is a set of attack tests run against an agent. |
| Station | One of the seven groups of Industry Packs: health, wealth, education, mobility, technology, environment and governance. |
| Level (L0 to L5) | How far one question is supported by evidence. L0: not evidenced. L1: self-declared. L2: configuration evidence AMC observed (4 of 244 questions can reach it today). L3: runtime evidence AMC observed (no question can reach it yet). L4 and L5: not evaluated yet. |
| Evidence tier | How much a piece of evidence counts: observed by AMC, attested, or self-reported. The tier decides the highest level a question can reach; a self-reported answer never counts above L1. |
| Bundle | A `.amcbundle` file: one scored run and its evidence, packed so a reviewer can check it with `amc bundle verify` or the standalone `amc-verify`. |
| Passport | A `.amcpass` file: a signed summary of an agent's results. It is self-issued: the workspace signs it about its own agent, so the signature shows who wrote it and that it is unchanged, not that its figures are true. |
