# P2-25 qualification: workload identity, delegation chains, decision logs

Branch `rtd/w3-p2-25`, based on `93ccb82b5`.

- `sample-chain.json`: a two-link delegation chain (human root, one narrowing child) from fixture values, signed by a
  throwaway workspace's lease key. It verifies only in that workspace; it is a format sample, not evidence.
- `sample-decision-log.json`: three AuthZEN-shaped `AUTHZ_DECISION` entries from fixtures: an allow under a v2 lease, a
  pipeline deny and a toolhub-intent deny (the toolhub sample uses a fixture policy digest).
- `mutations.json`: each guard broken locally, the test that failed, and the source restored.
- `receipt.json`: commit, environment, commands and test totals.

Pending, not faked:

- The research note in docs/AGENT_IDENTITY.md lists the external specifications; each pin (SPIFFE commit, WIMSE draft
  revision, AuthZEN revision, Entra Agent ID and AgentCore token documentation) must be re-checked against its primary
  source by a person and recorded with its exact revision.
- Interop runs against a real SPIRE server, a real Entra Agent ID tenant and a real AgentCore identity need that
  infrastructure; the tests here use generated fixture certificates and keys.
- NYDFS Part 500 and HIPAA §164.312 mappings wait for expert review (Needs-Expert).
