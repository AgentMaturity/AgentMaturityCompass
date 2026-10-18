# ADR-005: Free Core + Paid Industry Packs Business Model

## Status
Accepted

## Date
2026-03-10

## Context
Trust infrastructure for AI agents should be accessible to everyone. But regulated industries need specialized domain knowledge that requires ongoing research and maintenance.

## Decision
- **Free forever (MIT)**: The entire trust stack — Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport. All 14 adapters, 244 default diagnostic questions plus a 20-question lifecycle expansion, the registered assurance packs, CI gates, MCP server, dashboard.
- **Paid**: Industry Packs — 41 sector-specific domain packs across 7 verticals (Health, Wealth, Education, Mobility, Technology, Environment, Governance) with 676 sector-specific diagnostic questions.

Industry Packs contain regulatory-grounded assessments (HIPAA, MiFID II, FERPA, UNECE WP.29, etc.) that require domain expertise to create and maintain.

## Consequences
- **Positive**: No barrier to adoption — anyone can score their agent for free
- **Positive**: Sustainable revenue from enterprises in regulated verticals
- **Positive**: Open core creates community contributions (packs, adapters, modules)
- **Negative**: Industry pack maintenance requires ongoing regulatory research
- **Negative**: Competition could offer free alternatives to specific domain packs

## Notes
- 2026-10-11 (P0-28): the hand-typed assurance-pack count in the Decision had drifted and was removed; `scripts/gen-counts.mjs` reports the registered count. Nothing else in this record changed.
- 2026-10-18 (P1-51, D-06 = B): the paid Industry Packs gate stays. A licence gates access to pack questions and runs, never a result; pack answers are self-reported questionnaires; licences verify only against a key pinned in the operator's trust list; and checkout is offered only where it is configured. ADR-008 (P1-31) may supersede this record.
