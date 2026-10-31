---
"agent-maturity-compass": patch
---

The macOS native shell's Seatbelt profile now denies creating or writing named POSIX shared memory, System V IPC (attaching, writing or removing a segment) and opening IOKit user clients, so a confined command can no longer leave shared-memory state that outlives it or drive a kernel driver such as power management. With a signed egress allowlist the shell also sets `NODE_USE_ENV_PROXY=1`, so Node's built-in `fetch` uses AMC's proxy instead of connecting directly and being denied. Measured on macOS 26.6.2 and recorded in the receipt's limitations: reads outside the deny-list stay open by design; the kernel still lets a System V segment be created, empty and unattachable; POSIX semaphores and IOKit registry reads stay available; keychain lookups and Security.framework trust evaluation through trustd fail closed.
