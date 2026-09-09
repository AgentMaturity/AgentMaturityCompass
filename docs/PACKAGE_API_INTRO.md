# AMC package API

Find exported functions, classes and types through the module list or search. Each declaration links to its source. Inline type hierarchies show inheritance alongside the declaration.

Start with `sdk/nativeAgentClient` for native sessions, turns, cancellation and recorded updates. The `index` module contains AMC's library exports. `standard/externalEvidenceProfile` provides the standalone external-evidence contract and verifier, and `sdk/mobileFetch` contains fetch-based client helpers. `importers/piTelemetryCallbacks` is an optional telemetry bridge whose imported observations retain their explicit provenance.

AMC's native runtime and SDK work without DSH or Pi. An exported API describes available code; it does not establish a task result, verified evidence, platform compatibility or a deployed release.

Use the [guides](https://agentmaturity.co/docs/) for setup and daily workflows, and the [HTTP API reference](https://agentmaturity.co/openapi.yaml) for server contracts.
