# AMC Examples — Reference Agent Implementations

These are reference implementations showing how to integrate AMC Python modules into AI agents. By integrating these modules, agents produce observable evidence (logs, receipts, policy decisions) that the TypeScript AMC CLI scores via its evidence-based system.

## Case Studies

### Content Moderation Bot (CMB)
`content_moderation_bot.py` — Demonstrates Shield (injection detection), Enforce (policy engine), and Watch (audit logging) integration.

### Data Pipeline Bot (DPB)
`data_pipeline_bot.py` — Demonstrates Vault (DLP, secrets management), Enforce (circuit breaker), and Watch (SIEM) integration.

### Legal Contract Analyzer Bot (LCAB)
`legal_contract_bot.py` — Demonstrates full-stack integration across all 6 module families for a high-stakes legal domain agent.

## How These Improve AMC Scores
These bots don't self-report scores. Instead, they integrate modules that produce OBSERVED evidence:
- Shield modules log scanning results → AMC observes pre-execution safety checks
- Enforce modules emit policy decisions → AMC observes runtime governance
- Vault modules create audit trails → AMC observes data protection behavior
- Watch modules publish receipts → AMC observes observability maturity

The TypeScript AMC CLI then scores these agents based on that observed evidence.
