# Tenant onboarding

The reference tenant model is one Helm release per namespace, each with its own workspace volume, `amc-bootstrap` Secret, monitor key and pairing codes. Never share a workspace volume, a Secret or a lease between tenants.

1. Create the tenant namespace and install a release in it with [INSTALL.md](INSTALL.md). Tenant A's user calling every tenant-B route in `src/studio/openapi.ts` gets 401 or 403 and no B data. (check TS-1)
2. Issue leases and agent tokens per tenant. A's lease or agent token presented to B's gateway, ToolHub or Studio is refused. (check TS-2)
3. Keep evidence per tenant. B's verifier rejects A's events (the P1-11 cross-tenant fixture). (check TS-3)
4. Apply the chart's NetworkPolicy and a policy-enforcing CNI. B's pod cannot read A's volume, database role or schema, and pod-to-pod traffic across namespaces is blocked. (check TS-4)
5. Guard events and Studio stream messages created in A are never visible in B. (check TS-5)
