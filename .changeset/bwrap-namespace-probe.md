---
"agent-maturity-compass": patch
---

Report the Linux Bubblewrap backend as available only after an actual namespace launch succeeds on the host, so an AppArmor-restricted Ubuntu host refuses the native shell with the launcher's own diagnostic instead of claiming a sandbox it cannot start, and record that a refused sandboxed run launched nothing.
