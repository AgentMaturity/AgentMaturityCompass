---
"agent-maturity-compass": minor
---

New `amc vault passphrase` changes the vault passphrase without changing a key: every key id, signature and the key set stay as they are. It asks for the current passphrase (or uses `AMC_VAULT_PASSPHRASE`, or the remembered passphrase for an interactive operator) and for the new one twice, never on the command line, and refuses without a terminal. It re-seals the vault, locks it in the current process and forgets the remembered entry, which held the old passphrase. It is an owner command (refused in agent mode) and asks for confirmation when the vault was opened from the remembered store. Rotate keys too if a copy of the vault file may have been taken under the old passphrase (`docs/VAULT.md`, "When to rotate").

freeze-exception: LIVE-VAULT — a leaked passphrase must be replaceable without discarding the key set
