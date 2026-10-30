---
"agent-maturity-compass": patch
---

Allow reviewed MCP servers with different action classes in one agent-loop or ACP run. Each MCP tool keeps its own signed class for approvals and execution, while native tools retain the operator’s configured approval fallback. ACP accepts repeated config paths and matching exact-byte pins, and closes every earlier mount if later preparation fails.

Add optional operator-declared `alias` values on MCP grants. Alias-bearing configs require an authentic `<config>.sig` BUNDLE signature through AMC’s existing admitted signing provider, over the exact reviewed bytes. Aliases change provider-facing names while hashed allowlist identities remain stable. Refuse invalid, reserved, or colliding aliases; retain the real server, remote tool, canonical identity, and alias in evidence. Preserve signed catalog drift refusal and pinned egress behavior.
