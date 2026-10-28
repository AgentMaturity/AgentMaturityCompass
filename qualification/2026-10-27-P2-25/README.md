# P2-25 qualification: workload identity, delegation chains, decision logs

Branch `rtd/w3-p2-25`, based on `93ccb82b5`.

- `sample-chain.json`: a two-link delegation chain (human root, one narrowing child) from fixture values, signed by a
  throwaway workspace's lease key. It verifies only in that workspace; it is a format sample, not evidence.
- `sample-decision-log.json`: three AuthZEN-shaped `AUTHZ_DECISION` entries from fixtures: an allow under a v2 lease, a
  pipeline deny and a toolhub-intent deny (the toolhub sample uses a fixture policy digest).
- `mutations.json`: each guard broken locally, the test that failed, and the source restored.
- `receipt.json`: commit, environment, commands and test totals.

Round 2 (coordinator follow-up): issuance wiring (session and child v2 leases), chain display in receipts and Studio's
native-task detail, `amc identity workload-trust publish|verify|show` (freeze exception P2-25), and the security-review
fix that applies the plan's lease lifetime cap on every verification path.

Pending, not faked:

- The research note in docs/AGENT_IDENTITY.md lists the external specifications; each pin (SPIFFE commit, WIMSE draft
  revision, AuthZEN revision, Entra Agent ID and AgentCore token documentation) must be re-checked against its primary
  source by a person and recorded with its exact revision.
- Interop runs against a real SPIRE server, a real Entra Agent ID tenant and a real AgentCore identity need that
  infrastructure; the tests here use generated fixture certificates and keys.
- NYDFS Part 500 and HIPAA §164.312 mappings wait for expert review (Needs-Expert).
- A shipped catalog control setting `toolPipeline.maxLeaseTtlMinutes` (catalog content; needs review).
- The P2-25 entry in `allowedExceptionKeys` (the integrator lands it on the held line).
- No end-to-end Studio native-task test drives a runtime under an identity-binding plan; the wiring shares
  `issueSessionLease` with the tested CLI path, and the view is covered by `delegationChainView`/`renderTaskDelegation` tests.
