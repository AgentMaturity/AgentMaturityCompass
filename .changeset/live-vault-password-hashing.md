---
"agent-maturity-compass": patch
---

Console passwords are hashed with scrypt at N=2^15 (twice the previous work), with Node's memory limit set explicitly so the stronger setting cannot fail at runtime. A new password must have at least 12 characters and must not be the username (`amc user init|add|password`, `POST /users/add`, `amc bootstrap`); the route answers a refused password with 400 and the message. Existing passwords keep working, and an account's stored hash moves to the new cost at its next successful sign-in while Studio holds the unlocked vault. `users.yaml` and its signature are now written with mode 0600. A stored hash asking for scrypt parameters above N=2^20 or r=32 is refused.
