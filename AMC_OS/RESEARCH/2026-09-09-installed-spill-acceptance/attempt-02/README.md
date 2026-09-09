# Installed spill attempt 02 — unqualified

Actual runtime/package source `a5987643ef6c26b01f687226fbc6a6709fc182cb`,
helper commit `446087ca8510c27e83c2465bab9946634a88724b`; Darwin ARM64,
Node v22.22.0, npm 10.9.4. Exact package, helper, interpreter, configuration,
preparation-failure and process records are indexed in `disposition.json`.

All SQLite scenario groups passed, including real native capture, cold
verification, authenticated inventory, exact bounded reads, encrypted export,
overwrite refusal, tamper/missing refusals, existing-history restore and
separately reviewed exact-scope erasure. These are scripted loopback transport
fixtures, not real-provider or human-quality measurements.

JSONL's A fixture completed a native read. The second `session/new` returned
`AMCNativeRefusedError: the method failed` before B had a session ID. No JSONL
cold verification or downstream lifecycle/API group was reached. The generic
SDK error did not expose the internal reason. Source review identifies that
the helper kept A's writer open despite JSONL's declared single-writer
contract. No runtime lock or accounting guard was weakened.

Aggregate `qualified` is false. Both inner and outer supervisors recorded all
observed command processes closed. This is sampled process evidence, not
kernel containment. The original attempt 01 receipt is unchanged. The first
attempt-02 preparation refusal (parent mode 0755) and distinct corrected
mode-0700 preflight are both preserved; neither is installed qualification.

The safe mirror excludes fixture secrets, vault/private keys, raw workspace
databases, caches and node_modules. Originals remain in the private attempt.
Linear and Obsidian updates are explicitly pending in the disposition because
their current tool/access boundaries do not permit them. No issue Done,
full-suite pass at a new commit, release or deployment is claimed.
