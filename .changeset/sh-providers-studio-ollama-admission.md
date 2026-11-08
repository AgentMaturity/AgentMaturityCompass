---
"agent-maturity-compass": patch
---

Studio native tasks on `ollama` start again. Studio offers its local model server with no credential reference, but task admission then refused every `ollama` task with "The selected provider's operator credential reference is not configured." Admission now refuses only a provider Studio does not offer or one whose operator reference is unset.
