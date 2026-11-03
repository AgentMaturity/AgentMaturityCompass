---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1` key revocation and the shared revocation-list signer now refuse instead of producing a real revocation-list signature, as key rotation and lease revocation already did.
