# P2-26 qualification: regulatory runtime

Branches `rtd/p2-26a-clocks` → `rtd/p2-26b-kill-switch` → `rtd/p2-26c-envelopes` → `rtd/p2-26d-retention`, stacked on `18b7ead85`.

- `kill-switch.json`: signed `amc.drill/1` kill-switch drill receipt (5/5 denied, 0 effects after activation). Signed by a throwaway drill workspace's artifact-seal key; `signerPublicKeyPem` is for reference only. **Pending:** the manual-fallback rehearsal on a kind cluster (`manualFallbackRehearsal.status: pending`), a step for a person with a cluster.
- `provider-exit.json`: signed provider-exit drill receipt (provider `openai` fails closed; the alternate is `blocked_no_envelope` in a fresh workspace with no envelope). The envelope-admitted switch is covered by `tests/runtime/providerExitDrill.test.ts`.
- `sample-notice-draft.md` / `.json`: a NYDFS 500.17 notice draft for a fixture incident. Draft for human review; AMC does not file notices.
- `mutations.json`: guards broken and the tests that failed.
- `receipt.json`: commit, environment, commands and test totals.

Pending for people (not faked): D-08 expert review of every clock, mapping and retention floor; Sid and the P2-03 partner agree the drill cadence; the kind-cluster fallback rehearsal.
