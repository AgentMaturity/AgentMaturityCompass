# CONSOLE

Compass Console is the interactive owner cockpit served by AMC Studio.

- URL: `http://127.0.0.1:3212/console` (default; the macOS app runs its own console on `http://127.0.0.1:3232/console`, see [Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md))
- Host binding: localhost only by default
- Auth: username/password login (`/auth/login`) with HttpOnly `amc_session` cookie
- Fallback auth: bootstrap admin token for CLI/emergency ops

## Start

```bash
amc up
amc status
```

`amc up` prints Studio, gateway, proxy, and dashboard URLs. When no port was configured, Studio listens on the port this folder used last time while it is free, otherwise 3212, otherwise a free port; it prints the change, and the printed console URL uses the port it bound. In a terminal, "Open the console in my browser" in the `amc` start menu runs `amc up` when AMC is not running, then opens the console.

The menu runs down the left side (on a phone it is a tab bar at the bottom, with **More** for every other page); its foot holds the colour theme (Auto, Light, Dark) and who is signed in. The top bar names the page, shows the workspace status as a dot and two words (press it once for the full status with its details; a problem, a kill switch or a freeze stays in sight; on a page without a status it names the workspace), and a **?** button, "How AMC works", that opens a three-step guide; it does not open by itself. Home asks "What would you like to do?" with three tiles: **Build an agent**, **Run a task** (**Try a demo task** in the demo workspace; it opens Run a task with a sample prompt) and **Check my agent**. Below them: **Waiting for you** (how many approval requests are open for your agent and your agent projects' agents, not only those you may decide; 50 or more reads "50+"), your latest agent project drawn as a route with **Continue**, and your first steps as a route with one button for the next step (**Connect an agent** while that is next). **Other ways in** holds **Watch an agent I already use** (it shows the `amc connect --agent=<agent>` command to run in your terminal; see [Connect](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/CONNECT.md)); everything else is under **More**. A signed-out page shows `Authentication required.` with a Sign in link; the first account comes from `amc user init` below.

## Accounts

```bash
amc user init --username <owner> [--password-file <path>] [--force]
amc user add --username <name> --role <roles> [--password-file <path>]
amc user password <name> [--password-file <path>]
```

Without a terminal, pass `--password-file` (a private file holding the password), and export `AMC_VAULT_PASSPHRASE` (or set `AMC_VAULT_PASSPHRASE_FILE`) first: these commands sign `.amc/users.yaml` with the vault, and a shell without a terminal does not use the remembered passphrase. AMC never takes a password as an argument. `amc user init` refuses when `.amc/users.yaml` exists unless `--force` is given, which replaces every account. `amc user password` sets a new password and revokes that user's signed-in sessions. A new password needs at least 12 characters and must not be the username; existing passwords keep working, and their stored hashes move to the current scrypt cost at the next sign-in.

## Security Model

- No external CDNs; console assets are local.
- Session cookies are `HttpOnly` + `SameSite=Strict`.
- Admin token is fallback-only and should not be shared with agents.
- RBAC enforced per endpoint (`OWNER`, `AUDITOR`, `APPROVER`, `OPERATOR`, `VIEWER`, `AGENT`).
- Console never displays provider keys, vault passphrases, or full lease tokens after initial issue.
- All write actions generate observed audit evidence in the ledger.

## Main Views

Every page shows the same navigation; a page's own links appear under **This section**; the A4 link shows on Home and
the A4 pages when the preview is on. On pages that do not load the A4 script the A4 link stays hidden even when the
preview is on; A4 is reached from Home. On a phone, the menu button at the top opens the navigation.

- `Home`: service health, fleet summary, trust/integrity tiles.
- `Sign in`: one card with the logo, user name, password and **Sign in**; a failed sign-in says why under the card. The pairing code, "No account yet?", the emergency admin token and pairing another device sit in closed sections.
- `Run a task`: asks "What should your agent do?" with one box, a model and tools picker, and three ideas that only fill the box. A task is drawn as a route (your task, working, answer, checked; a request waiting for approval shows as waiting, a task that did not finish as stopped), the conversation as tiles, and an answer with two chips that open their full notices ("Stand-in model", "Correctness not checked"); Answer is ticked only after a turn that completed, and Checked only after a full verification (a partial one reads "Partly checked"). The task's buttons stay in sight; task details, evidence, tool activity, the agent's plan, checks, usage, task settings and your earlier tasks are one click away.
- `My agent`: "How your agent is doing": the overall level as a dial out of 5 drawn in ink with its trust label and evidence label beside it (never a tick or a badge), integrity, evidence coverage and whether claims are allowed, each area as an ink bar, and the first three things to improve with their levels (all suggestions one click away). A run that fails its seal shows no score. Under it the agent's state (proposed, approved, active) as a route; its transitions, reassessments and the owner's change form are one click away.
- `Equalizer`: one slider per active diagnostic question with deterministic what-if preview and signed apply.
- `Governor`: action-class allow/deny matrix with reasons.
- `ToolHub`: allowed tools, recent executions, denials, receipt verify actions.
- `Approvals`: each request as a card: what it is, its path (asked, then its decision in words, then used), the people who decided as initials with their decision, the places still open, who may decide, and Approve, Dry run only and Deny where you may decide (unchanged). **Waiting** and **All** switch the list; search and filters, and each request's details, are one click away.
- `Records`: what AMC recorded about the agent: **Run the full score**, counts, the eight parts as tiles with their state in words, and every kind of record (with its count) one click away. The "Signature limits" chip says what a signature shows.
- `Industry Packs`: "Pick your field": the seven stations as tiles (and All); picking one shows its packs as cards with Open; the "AI-drafted, not legal advice" chip opens the full notice. An open pack asks one question at a time with **Score** always in reach; what the pack is for, its rules and how scoring works are one click away.
- `Live runs`: runs of connected agents as cards with their state in words; tool-call numbers, latest events, the table and recording a run by hand are one click away.
- `Users`: owner-managed user/role administration.
- `Leases`: active lease metadata (no token disclosure), expiry, revoke.
- `Budgets`: usage vs limits, consequences, signed update path.
- `Drift`: incidents, freezes, run drift checks, freeze lift flow.
- `Benchmarks`: imported ecosystem benchmarks, percentiles, scatter/heatmap.
- `Transparency`: append-only issuance log + client-side seal verification.
- `Policy Packs`: list/diff/apply signed golden configs by archetype+risk.

## Device Access

- Phone/tablet/desktop access is supported.
- Use local network routing only when intentionally exposing Studio; keep localhost default for safest operation.
- Pairing QR should contain URL only, never admin token.
