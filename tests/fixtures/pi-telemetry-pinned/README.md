# Pinned Pi telemetry fixtures

These unchanged files come from the preserved Pi 0.85.1 conformance source at
commit `b2602be77cb7b0de45dd616407fd210daa48aa75`. Their original paths and
SHA-256 digests are recorded in `source-receipt.json`; the upstream MIT license
is retained. TypeScript files use the `.ts.txt` suffix so AMC does not typecheck
vendor source as its own code. The conformance test compiles them in an isolated
temporary directory without network access or package installation.

The nine cases execute against the original AMC callback document v1 bridge.
The separate current-profile fixture never changes this historical ABI or source
contract. Conformance uses an explicit synthetic attribute/error-details opt-in;
separate boundary tests exercise default privacy admission.
