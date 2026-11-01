---
"agent-maturity-compass": patch
---

Protected-data redaction (experimental, opt-in P2-02): a quoted secret member whose string value is cut off before its closing quote, as in truncated tool output (`{"password":"hunter2…` at the end of a line or of the text), is now detected and its value replaced, also when the quotes are escaped once (JSON inside a JSON string). Before, such a value was stored and sent as it was. A quoted value also no longer runs across a line break to a later quote. This applies only in workspaces that opted in (a processor registry exists); the detector-set digest changes accordingly.
