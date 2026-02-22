# Fleet Mode

Fleet Mode lets one AMC workspace supervise many agents with separate context/targets/runs while sharing one signed evidence ledger.

## Files

- `.amc/fleet.yaml` + `.amc/fleet.yaml.sig`
- `.amc/current-agent`
- `.amc/agents/<agentId>/context-graph.json`
- `.amc/agents/<agentId>/targets/*.target.json`
- `.amc/agents/<agentId>/runs/*.json`
- `.amc/agents/<agentId>/reports/*.md`
- `.amc/agents/<agentId>/agent.config.yaml` + `.sig`

## Setup

```bash
amc fleet init --org "Acme AI Ops"
amc agent add
amc agent list
amc agent use salesbot
```

## Per-Agent Operations

Use global `--agent` or set current agent via `amc agent use`:

```bash
amc --agent salesbot run --window 14d --target default
amc --agent salesbot target set --name default
amc --agent salesbot tune --target default
```

## Fleet Dashboard

```bash
amc fleet report --window 30d --output .amc/reports/fleet.md
```

Fleet report includes:

- overall score + IntegrityIndex per agent
- top target gaps
- model/provider usage summary
- 67-question cross-agent heatmap
- governance/honesty hotspots
- OBSERVED evidence gaps

