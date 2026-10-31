# P0-20 signing independent review

No actionable findings in the assigned new test and retained signing evidence. Review is read-only and does not approve Done or a source release.

The raw source-helper report records 21 tests, 21 passed, 0 failed, 0 pending and 0 todo. The independently captured A/B artifact-seal pins precede all actual signing calls. Public envelopes match those recorded public keys; the B-key positive controls prove the foreign and attacker-envelope signatures are genuine. The attacker retains A’s exact unsigned body. The tamper fixture changes one control from L3 ADEQUATE to L5 PASS, recomputes its checksum and retains A’s original signature. It is refused by the current verifier. All claim and report observations preserve self-reported/eligible-L1 and not-evaluated semantics.

The retained private baseline is 4/4. Removing only the explicit digest diagnostic yields 3/4: the changed body still fails its signature and remains refused; only the DIGEST_MISMATCH diagnostic disappears. Auto-pinning the embedded envelope key yields 2/4: foreign and attacker signatures are incorrectly admitted, while untouched and tamper controls retain their expected behavior. Restoration is 4/4 and the active private module exactly equals the original normalized baseline. All phase input hashes match the retained public files. Each private copy routes the same ten static imports to exact pinned original built paths; captured before/after dependency/source/test pins match.

The asserted admission exit codes are 0 for explicitly admitted signers, 1 for strict foreign/unsigned/tamper refusals, and 2 for valid unpinned signatures with allow-unpinned. Allow-unanchored alone does not admit the foreign issuer.

This is a helper test and standalone observer review, not final CLI or whole qualification. No product runtime, test execution, builds, live dist reads, source edits or guard mutations occurred. Built dependency integrity is assessed from retained before/after records; cryptographic outcomes are assessed from the retained actual producer and passing test controls.

Detailed file hashes, phase results and limits are in the companion JSON.
