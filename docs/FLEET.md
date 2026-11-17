# Fleet Mode

Fleet Mode lets one AMC workspace look after many agents. Each agent has its own context, targets and runs, and all
of them share one signed evidence ledger (the log of records AMC keeps).

## Files

- `.amc/fleet.yaml` + `.amc/fleet.yaml.sig`
- `.amc/current-agent`
- `.amc/agent.config.yaml` + `.sig` (the workspace's own agent, called `default`)
- `.amc/agents/<agentId>/agent.config.yaml` + `.sig` (each named agent, with its owner when one is set)
- `.amc/agents/<agentId>/context-graph.json`
- `.amc/agents/<agentId>/targets/*.target.json`
- `.amc/agents/<agentId>/runs/*.json`
- `.amc/agents/<agentId>/reports/*.md`
- `.amc/agents/<agentId>/incidents/*.json` (freezes)

## Setup

```bash
amc fleet init --org "Acme AI Ops"
amc agent add
amc agent list
amc agent use salesbot
amc fleet tag salesbot --owner "Priya Shah"
```

`amc fleet tag <agent> --owner "<name>"` names the person or team answerable for an agent. `--env` still sets the
environment, and both can be given together.

## Your agents at a glance

```bash
amc fleet status --inventory            # one block per agent, in words
amc fleet status --inventory --json     # the same as JSON
amc fleet status --csv > fleet.csv      # the same as a spreadsheet file
amc fleet status --inventory --window 7d
```

For each agent the inventory shows:

- **Owner**, and how many agents have none.
- **Runs on**: the runtime and its version, taken from the sessions that registered with AMC's hooks. A Claude Code
  or Pi release AMC has not qualified is marked as such.
- **Last seen**: the newest record that names the agent in AMC's ledger. AMC's own actions about the agent, such as a
  freeze, do not count.
- **Hooks**: which hook is installed, in which mode, and whether control is verified for a registered session.
- **Budget**: the daily limit from the signed budgets file, or "none".
- **Frozen**: yes or no.
- **Cost**: see below.
- **Still needs**: what the agent lacks from the fleet minimum: an owner, a budget, verified control and a qualified
  runtime release. This is a list for you to act on; nothing is blocked because of it.

The Compass Console shows the same table on the **Fleet** page, with **Download as CSV** and **Download as JSON**
buttons. Studio answers `GET /api/v1/fleet/inventory` (add `?format=csv` for the spreadsheet file, `?window=7d` for
another cost window). Reading the inventory writes nothing.

In the CSV, a cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet shows it as text and
does not run it as a formula.

### Cost

Cost per agent and per owner is an **estimate** from the token counts AMC recorded and the model price list, or the
cost the provider reported. It is the same count `amc usage --by agent` makes. A call to a model with no price, or a
call with no usage report, is shown as **not known**, never as zero. Only calls that went through AMC are counted. The
default window is the last 30 days.

## Agents AMC has seen but nobody registered

The inventory also lists names AMC found in its records or in a hook setup that are not registered agents. They are
shown as AMC recorded them, escaped, and they never become registered agents on their own. To add one on purpose:

```bash
amc agent add --from-observed support-bot --owner "Support team"
```

AMC refuses a name that is not a plain agent id (1 to 64 lower-case letters, digits, `-` and `_`; no `/`, `\` or
`.`). It fills in placeholders for the role, tasks and provider; edit them when you know them.

## Freeze an agent now

```bash
amc fleet status --freeze support-bot --reason "Sent refunds it should not have"
```

The console's Fleet page has a **Freeze now** button (it asks why), and Studio answers `POST /api/v1/fleet/freeze`
with `{"agentId": "...", "reason": "..."}`. The route takes a signed-in OWNER, like every other fleet change.

A freeze writes a signed freeze incident and a signed audit row (`FLEET_AGENT_FROZEN`) that names who froze which
agent and why. Every action above read-only is then refused for that agent until a person lifts the freeze:

```bash
amc freeze lift --agent support-bot --incident <incident id> --reason "<why it is safe again>"
```

**What a freeze does not do.** A freeze stops only calls that are routed through AMC (for example its tool hub, the
native agent's tools and hooks in control mode). An agent that calls a model or a tool directly, without AMC in the path, is not stopped.

Lifting a freeze needs a person. Every way of lifting one (`amc freeze lift`, the SDK, Studio's lift routes) is
refused in a process that carries an agent marker (for example one started by Claude Code, Codex, Gemini CLI or pi)
and in a workspace in agent mode, and Studio's lift routes also need an OWNER session, never an agent's lease. Run
`amc freeze lift` yourself, in your own terminal.

If AMC cannot read its records, the inventory says cost and last seen are **not known** (for each agent and each
owner) rather than showing zero or "never".

## Delegations: time-window overlap

`amc fleet trust-add-edge` declares that one agent hands work to another. `amc fleet trust-receipts` then counts, for
each declared delegation, how many of the first agent's recorded calls had any activity from the second agent within
60 seconds:

```bash
amc fleet trust-receipts --window 12h
```

This is a **time-window overlap**, a heuristic. It compares times only: it checks no signatures and does not show
that one call led to the other. `--window` takes a whole number and a unit: `30s`, `45m`, `12h` or `30d`. Anything
else is refused.

## Per-agent operations

Use the global `--agent` option or set the current agent with `amc agent use`:

```bash
amc --agent salesbot run --window 14d --target default
amc --agent salesbot target set --name default
amc --agent salesbot tune --target default
```

## Fleet report

```bash
amc fleet report --window 30d --output .amc/reports/fleet.md
```

The fleet report includes:

- overall score and IntegrityIndex per agent
- top target gaps
- model and provider usage
- a cross-agent heatmap over the default diagnostic question bank
- governance and honesty hotspots
- gaps in OBSERVED evidence
