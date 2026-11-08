---
"agent-maturity-compass": patch
---

The Studio admin token (`.amc/studio/admin.token`) is valid only as 64 hexadecimal characters: a token file holding anything else (for example an empty file, which matched an empty header) is replaced with a fresh token when Studio starts, with one line on stderr. `amc doctor` has a new `studio-admin-token` check that fails when the file is open to group or other users (`chmod 600 .amc/studio/admin.token`) or is not 64 hex characters. `docs/STUDIO.md` documents the token's lifecycle and rotation (`amc down`, delete the file, `amc up`).
