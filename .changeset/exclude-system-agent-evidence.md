---
"agent-maturity-compass": patch
---

Named-agent evidence exports now exclude shared system-session rows, including rows whose camel-case or snake-case metadata names the agent. Export counts report those exclusions, and `agentFilter` states `systemSession: "excluded"` and `insufficientFor: ["requires_no_audit"]` (system rows can count against an agent); unfiltered exports retain every system row.
