---
"agent-maturity-compass": patch
---

Protected-data admission on native model requests is opt-in. It applies only when the workspace has a processor registry (`.amc/dataflow/processors.yaml` or its `.sig`); a workspace with neither file is not scanned. A registry that is present but invalid refuses only a request in which something was detected. The minor entry for experimental protected-data admission describes the full behaviour.
