# Offline verification

1. Export an evidence bundle from the deployment and copy it, the standalone verifier (P1-06) and the published trust list to a machine with no network. A genuine bundle verifies as "valid as of T". (check OV-1)
2. On the same machine, the tampered, forged-embedded-key, unpinned-issuer and revoked-key fixtures must each fail. An artifact's own embedded key never vouches for it. (check OV-1)
3. Download exported retention segments (`amc evidence-stores worm-export`) and verify hashes, pinned signatures and segment chaining with `amc evidence-stores worm-verify`, without cluster access. (check OV-2)

Use a dedicated bucket with minimal retention for WORM tests: compliance-mode objects cannot be deleted.
