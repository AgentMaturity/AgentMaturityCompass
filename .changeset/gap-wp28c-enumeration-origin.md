---
"agent-maturity-compass": patch
---

Restrict remote model enumeration's default provider credential to the provider catalog's exact normalized origin. Custom origins require an explicit credential reference. Refuse unencrypted HTTP except for literal IPv4 loopback addresses and IPv6 loopback, while preserving residency checks and credential-echo refusal.
