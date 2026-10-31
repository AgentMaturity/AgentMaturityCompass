---
"agent-maturity-compass": minor
---

`amc bundle export --attest` adds the agent's AI bill of materials and a signed in-toto statement about the run to the evidence bundle. Both files are listed in the bundle's signed manifest. Without `--attest`, export is unchanged. See docs/ATTESTATIONS.md and docs/AIBOM.md.

- `attestations/aibom.cdx.json` is a CycloneDX 1.6 AIBOM, labelled experimental, built from the workspace's signed configuration. It lists:
  - the declared models, from the agent's profile in `adapters.yaml`;
  - tools and MCP servers, from `tools.yaml`;
  - the agent and its provider, from `agent.config.yaml`;
  - every signed configuration file, with its digest and signature status;
  - prompts and datasets, by digest only;
  - the AMC runtime.

  Facts come only from files whose signature verifies over the bytes read. Anything AMC has no record for is listed under `amc:unknown`, never guessed. The CERT-In field mapping in docs/AIBOM.md is a draft, not independently reviewed.
- `attestations/control-results.sigstore.json` is an in-toto Statement v1 with the predicate `https://agentmaturity.co/attestations/control-results/v0.1`:
  - It is wrapped in a DSSE envelope and a key-based Sigstore bundle v0.3, signed with the workspace's `artifact-seal` key. No network is needed.
  - Its subjects are the AIBOM and `run.json` by SHA-256. Its claim kind is the run's own seal-checked claim (`observed` or `self_reported`).
  - Synthetic example evidence is refused (`SYNTHETIC_NOT_ATTESTABLE`). Only a key admitted for `independent-attestation` may state `independently_reviewed`.
  - A signature proves who issued the statement and that it is unchanged, not that the statement is true. A workspace key is a local audit trail until a verifier pins it in a trust list.
- The standalone verifier `amc-verify` reads a new artifact kind, `dsse-intoto`, with six new normative fixtures (`spec/fixtures/v1/dsse-*`):
  - the DSSE signature over the PAE, by a key the trust lists admit for `artifact-seal`;
  - the payload type and the statement shape;
  - every subject and evidence digest against the supplied bytes;
  - the statement's expiry.

  A valid statement exits 3, because its declared result cannot be recomputed.
- Keyless signing (Fulcio, Rekor) exists only as an opt-in library seam. It needs `@sigstore/sign` and `@sigstore/bundle`, which await dependency review, so no package is added. It is not exercised.
