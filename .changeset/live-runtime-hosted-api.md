---
"agent-maturity-compass": patch
---

The hosted API (Vercel, Railway or a direct `api:start`) now rate limits POST routes to 120 a minute per client and answers 429 `{"error":"rate limited"}` past that (LIVE-RUNTIME-16). Behind a platform proxy every request comes from the proxy, so set `AMC_API_TRUSTED_CLIENT_IP_HEADER` to the header the platform writes the client address into (for example `x-vercel-forwarded-for` or `x-forwarded-for`); without it the limit protects direct runs only. The limiter is in memory, so on serverless platforms it counts per instance. A failed licence issue now answers 503 `{"error":"licence issuing is not configured"}` with the required variables; the underlying reason goes to the server log only.
