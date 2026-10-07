---
"agent-maturity-compass": patch
---

Security: `amc federate import` is atomic and refuses replays and rollbacks.

- Every benchmark's signer and `benchId` are checked before anything is written, so a package refused for one of its benchmarks leaves nothing in the inbox. The package is staged beside its final place and renamed in one step.
- A `manifestId` already imported from the same publisher is refused instead of overwriting the earlier import.
- A package whose `createdTs` is older than one already imported from that publisher is refused as a rollback. An imported package whose `manifest.json` cannot be read blocks further imports from that publisher until it is restored or removed.
- `amc federate peer add` refuses a peer id that is not one safe path segment.
- The federation config's `orgId` must be one safe path segment when it is written or loaded. `amc federate init` already generates a UUID, which qualifies.
