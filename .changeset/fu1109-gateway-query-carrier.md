---
"agent-maturity-compass": patch
---

The gateway's main handler now honours `AMC_QUERY_LEASE_CARRIER_ENABLED` (as Studio passes it, with signed LAN mode) the same way the forward proxy does. Before, it read the gateway config's own `lease.allowQueryCarrier`, so a query-carried lease was refused when Studio enabled the carrier, and accepted when Studio had disabled it.
