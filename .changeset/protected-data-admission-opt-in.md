---
"agent-maturity-compass": patch
---

Protected-data admission on native model requests is now opt-in. It applies only when the workspace has a processor registry (`.amc/dataflow/processors.yaml` or its `.sig`). Before this fix, every workspace refused any request whose history matched a detector (for example a clock time, an IP address, an email or a long numeric timestamp), and no command could create the registry, so ordinary agent sessions could become permanently unsendable. A registry that is present but invalid still refuses.
