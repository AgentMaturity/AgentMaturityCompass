---
"agent-maturity-compass": minor
---

Declarative config provenance: `resolveConfigOverlays` and `loadDeclarativeConfig` now return `history`, every value each amcconfig.yaml leaf was given in layer order, and `amc config provenance [pointer]` shows each leaf's layer and file and, for one JSON Pointer, the winning value and every shadowed one.

freeze-exception: SH-EXT — `amc config provenance` (1 command path): the human view of per-leaf provenance and shadowed values, which `config validate --json` carries only as raw JSON.
