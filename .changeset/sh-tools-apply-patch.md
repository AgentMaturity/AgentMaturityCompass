---
"agent-maturity-compass": minor
---

New native tool `apply_patch` (SH-TOOLS-01): the Codex `*** Begin Patch` grammar (Add File, Delete File, Update File with optional Move to, `@@` hunks, `*** End of File`) applied to several workspace files in one call through the same read-before-edit ledger, workspace bound and signed path policy as `fs.edit`. Every section is parsed, resolved, read and planned before any file is written; a hunk must match exactly once (one trailing-whitespace fallback, reported); line endings, BOM and final newline are preserved; paths through a symlink below the workspace root are refused for every section. The paths a patch names are projected onto `path` before the allowlist guard, so `allow.paths` decides where it may write, move or delete. `defaultToolsConfig` lists it with `fs.edit`'s scope (`./workspace/output/**`) and the protected deny globs; existing signed policies do not change until an operator adds it and re-signs. A signed MCP alias named `apply_patch` now collides with a built-in and is refused at mount.

freeze-exception: SH-TOOLS — new built-in tool `apply_patch` for the state-of-the-art harness program; no CLI command path is added
