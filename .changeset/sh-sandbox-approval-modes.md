---
"agent-maturity-compass": minor
---

`amc agent-loop run` and `agent-loop chat` take `--approval-mode <plan|default|accept-edits|untrusted>`: `plan` runs nothing outside READ_ONLY (every other call enters as SIMULATE, delegated children included), `default` asks about every call outside READ_ONLY, `accept-edits` also lets WRITE_LOW file edits run unasked, `untrusted` asks about everything. A mode only narrows: signed policy, compiled-policy approval classes, guards, freezes and the Action Policy apply in every mode, and bypass modes (`never`, `yolo`, `auto`, `danger-full-access`) are refused by name. A mode is refused with an out-of-process `--delegate-provider` (the child would run outside the mode) and, under a compiled policy, when it would leave a class that policy requires approval for unasked. The mode, its gated classes and its exempt tools are in the signed composition digest and the child hook-control row.

freeze-exception: SH-SANDBOX — operator-selectable approval modes comparable to Claude Code and Codex, mapped onto the existing signed approval gate without weakening it
