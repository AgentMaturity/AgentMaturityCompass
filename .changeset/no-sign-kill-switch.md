---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1` the kill switch now activates with an unsigned record that every enforcement point treats as active for the scope it names, while a kill release and the kill-switch and provider-exit drills refuse, and the shared purpose-key signer refuses every purpose except the session credential instead of producing a real signature.
