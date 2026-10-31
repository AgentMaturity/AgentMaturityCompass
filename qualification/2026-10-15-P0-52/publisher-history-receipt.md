# P0-52 publisher-history witnesses — 15 October 2026

The corrected actual run passes nine of 13 cases and retains four genuine failures, with zero pending or todo cases. It takes 11.683 seconds on Node 22.23.3 at source 4c8f39b583a51c7bc1b2bba180c8aef60a94263f. Final test typecheck passes. Only the new federationPublisherHistoryQualification test was edited; its current bytes match the input receipt.

The passing controls prove exact same-publisher replay refusal, older distinct-ID rollback refusal, newer and equal-time distinct-ID acceptance, cross-publisher independence including an ID collision, and blocking by missing/invalid-JSON/invalid-schema prior manifests. Each refusal captures every recipient name, regular-file content hash, history file and link/inode metadata before and after the call.

All four alias transitions fail: a signed-list-only key bucket followed by adding a peer, and an existing peer followed by adding a lexically earlier duplicate-key peer. Both exact replays and older distinct-ID packages are accepted under peer-a and alter recipient snapshots. federationSync.ts:369–375 selects the current display bucket, and 391–447 consults only that bucket rather than all history of the same signing publisher. No assertion or production behavior was changed to green.

The fixtures use real exports and separately captured operator keys, change only controlled claimed history metadata, and seal again through the actual signFederationDigest. signedTs remains genuine current local signing time. No clock, exporter, importer, verifier or successful response mock is used. Independent Node crypto validates all 23 retained public archive seals and member hashes against separate operator PEMs. Claimed createdTs is fixture input, not a TSA or observed real-org timestamp.

The first 13-case run failed entirely before admission because my fixture assumed a nested federation root; the real exporter writes a flat root. That phase remains preserved as a fixture failure, not a product RED. The one-line layout correction retains all criteria.

Raw reports, complete effects, production/test pins and public inputs are linked in the JSON receipt. Fresh workspace/key stores and operator homes were cleaned up, while public archives and receipts remain private. These serial snapshots make no global no-effects or race guarantee. Production repair, final commit and broader acceptance remain root-owned; held work, original tests, D-15 and prior unresolved debt remain unchanged.
