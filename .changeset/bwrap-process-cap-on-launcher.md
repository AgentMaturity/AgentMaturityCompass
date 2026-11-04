---
"agent-maturity-compass": patch
---

On Linux the native shell's process cap is now set on the Bubblewrap launcher before it creates the sandbox's user namespace, so the kernel holds the user's process count to the signed allowance; set inside the new namespace, the count started from zero and the cap never took effect.
