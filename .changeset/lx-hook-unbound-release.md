---
"agent-maturity-compass": patch
---

A Claude Code control hook whose installation is at fault (no qualified Claude Code release bound, a missing signed manifest, an agent, Bridge or lease-path mismatch, or a removed .gitignore block) now denies with "AMC hook installation unusable" and names the cause instead of misreporting a valid payload as invalid input, and `connect hooks install --mode control` warns, in its text and in a JSON `warnings` field, when no qualified Claude Code release was bound.
