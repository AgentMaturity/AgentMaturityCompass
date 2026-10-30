# Existing P1-25 packet static metadata audit

The packet is complete against Git base `e2cbdb909ad2ff4cf0b97577a3be3e66a70241b7`. All 340 receipt-listed artifacts match their declared SHA-256 hashes and current Git blobs. The receipt itself makes 341 tracked files, with no missing paths, duplicate artifact paths, extras or working-tree packet diff. Total packet size is 1618344 bytes.

The receipt is 66,214 bytes with SHA-256 `c2064956af3bcde63fa631bfb20aa63250e2fd68e94aa055da70ceffc9b10496`. README is 9,421 bytes with SHA-256 `d3b5255d6679c1d00494ade4b4818dbe2c5c97a786879de3ae4f1ca6545e7127`.

Existing assembler: `/private/tmp/p1-25-time-qualification-20261016/receipt-preparation/assemble-receipt.py` (21,413 bytes; SHA-256 `28ddcb18ec76480886dc6856dee2a976adf15d2282c1b72d58c26ba22269a5c7`). Its bound manifest is `/private/tmp/p1-25-time-qualification-20261016/actual-receipt-inputs.json`. The preserved lossless representation at `/private/tmp/p1-25-time-qualification-20261016/private-receipt-root-v2/2026-10-17-P1-25` matches every current packet file byte for byte.

`report.json` records scope, base, completeness and assembly identities. `artifact-pins.json` lists every active file's size, SHA-256, declared hash, current Git blob and independently computed working-byte Git blob. `pins.json` seals those outputs. This is static completeness only: no validator or qualification command ran, and no source allocation, ownership release, historical command acceptance or new qualification credit is inferred.
