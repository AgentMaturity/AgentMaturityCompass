---
"agent-maturity-compass": major
---

`amc compare-models` and `amc compare <model> <model>` no longer print a model comparison. They ran one diagnostic of the same agent evidence under each model name, so the per-model scores, the best and worst model and the layer deltas were invented. `compareModels` now throws "Model comparison is not evaluated", and the commands exit 1 with that message. To compare models, run the agent with each model and then use `amc compare <run-a> <run-b>`. `amc demo prospect` shows that command instead.
