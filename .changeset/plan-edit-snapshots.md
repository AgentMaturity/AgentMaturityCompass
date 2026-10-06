---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: when a change edits a file that a restoration parity test freezes, `node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <rev> <path>` archives the file's pre-edit bytes and registers them in `unused-code/plan-edits/manifest.json`, and the parity tests compare that archived copy instead of the live file (decision D-15).
