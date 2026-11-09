---
"agent-maturity-compass": patch
---

A Studio sign-in that meets a password hash made at an older scrypt cost now records what its re-hash did as `reason` in the `HUMAN_LOGIN_SUCCESS` audit payload (`password-rehashed`, `password-rehash-skipped-vault-locked`, `password-rehash-skipped-user-changed` or `password-rehash-failed`). A sign-in with a current hash carries no reason.
