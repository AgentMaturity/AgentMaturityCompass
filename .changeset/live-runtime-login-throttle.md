---
"agent-maturity-compass": patch
---

Studio's `/auth/login`, the host router's `/host/api/login` and the workspace `/w/<id>/login` now throttle failed logins per account and client address (LIVE-RUNTIME-04). Ten failures for one username from one address within 15 minutes refuse that pair with 429 `too many failed logins for this account from this address` and a `Retry-After` header, and the first refusal is audited as `HUMAN_LOGIN_THROTTLED`. The same account from another address is not refused, so a co-tenant cannot lock an owner out of their own address. Thirty failures for one username from any addresses add a 2 second delay to every attempt for that username until the window passes; that is never a refusal. The throttle is in memory: a restart clears it, and replicas do not share it. Behind a reverse proxy the client address comes from `X-Forwarded-For` only when `AMC_TRUSTED_PROXY_HOPS` is set and the proxy is in `AMC_ALLOWED_CIDRS`; otherwise every client shares the proxy's address and the pair key becomes per account and proxy.

Every login failure now answers 401 with exactly `{"error":"invalid credentials"}`, including a revoked or disabled account and a users file that fails to load (LIVE-RUNTIME-06). The reason goes to the audit record and the server log. Policy refusals keep their text: 403 for an invalid users signature or for local password login disabled by identity policy, and 429 from the limiters.

The in-memory request limiters now prune expired buckets once they hold 10,000 keys and refuse new keys past 50,000, so spoofed client keys cannot grow memory without bound.
