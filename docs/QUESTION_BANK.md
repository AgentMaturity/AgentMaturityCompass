# AMC Question Bank Reference

This document describes the active diagnostic question bank used by AMC scoring.

## Source of Truth

- Runtime scorer imports `questionBank` from `src/diagnostic/questionBank.ts`.
- Signed operational bank is materialized at:
  - `.amc/diagnostic/bank/bank.yaml`
  - `.amc/diagnostic/bank/bank.yaml.sig`
- Bank generation and signing flow lives under `src/diagnostic/bank/`.

## Current Bank Shape

- 5 maturity layers:
  - Strategic Operations
  - Leadership & Autonomy
  - Culture & Alignment
  - Resilience
  - Skills
- 6 rubric levels per question (`0..5`)
- 111 questions in current repository state
- Each question includes:
  - prompt template
  - evidence gate hints
  - upgrade hints
  - tuning knobs
  - per-level evidence/coverage gates

## Question ID Families

Core IDs:

- `AMC-1.x`
- `AMC-2.x`
- `AMC-3.x`
- `AMC-4.x`
- `AMC-5.x`

Extended families currently present in the live bank:

- `AMC-MEM-*`
- `AMC-HOQ-*`
- `AMC-OPS-*`
- `AMC-COST-*`
- `AMC-GOV-PROACTIVE-*`
- `AMC-SOCIAL-*`
- `AMC-BCON-*`
- `AMC-MCP-*`
- `AMC-OINT-*`
- `AMC-SPORT-*`

## Commands

```bash
amc diagnostic bank init
amc diagnostic bank verify
amc diagnostic render --agent <agentId> --format md
```

## Related Docs

- `docs/DIAGNOSTIC_BANK.md` for signed bank/API workflow
- `docs/AMC_QUESTIONS_IN_DEPTH.md` for detailed assessor guidance on the currently documented core subset

## Assessor Note

If `AMC_QUESTIONS_IN_DEPTH.md` does not include a question ID present in the signed bank, treat `src/diagnostic/questionBank.ts` and `diagnostic bank render` output as authoritative until documentation is expanded.
