---
"agent-maturity-compass": patch
---

Add Opik-style provider observability pipeline proof to provider/model drift canaries.

Provider-drift rows can now bind pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content dataset, summary artifact, QA dataset, trace export, metric report, and pipeline config proof. Missing observability-pipeline evidence emits a fail-closed Watch/API alert and is included in eval-pack row hashes, CI/lifecycle gates, public methodology, and docs.
