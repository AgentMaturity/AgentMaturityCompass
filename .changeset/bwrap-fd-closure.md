---
"agent-maturity-compass": patch
---

Stop the Linux native shell and terminal from leaking Bubblewrap's mount-source descriptors into the confined command, refuse a Bubblewrap older than 0.8.0, name the kernel or AppArmor namespace refusal instead of asking to install Bubblewrap, and record no process cap when the shell runs as root.
