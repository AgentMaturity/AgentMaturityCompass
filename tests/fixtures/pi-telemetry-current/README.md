# Current Pi telemetry fixtures

These are unchanged source files from `earendil-works/pi` at commit
`6c384aa30f619d7b28963f2bab24d8dacbe73cb6`, retained under the upstream MIT license.
`source-receipt.json` pins the original paths and SHA-256 digests. TypeScript
sources use the `.ts.txt` suffix to keep vendor code outside AMC's typecheck.
`piTelemetryUpstreamConformance.test.ts` compiles the retained telemetry module
and runner-independent conformance kit into an isolated temporary directory.
No network, package installation, external exporter, or live Pi session is used.

The current AMC profile supports bounded span links and content-free operational
AI/Durable attributes. Metrics and propagation are optional, explicitly
unsupported capabilities; the upstream kit's capability-specific cases return
without exercising those surfaces. Durable watch bindings retain initial-state,
update, retirement, replacement and terminal metadata. They do not import values
or delta contents, validate complete durable history, or infer a source revision
number from callback order. In-process reports remain `SELF_REPORTED`, unsigned
and `NOT_EVALUATED`.
