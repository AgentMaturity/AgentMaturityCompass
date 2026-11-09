---
"agent-maturity-compass": minor
---

New native tool `ls` (SH-TOOLS-02): one directory level of the workspace, sorted by name, capped (`maxEntries`, default 500), under the same repository ignore rules as `glob` unless `includeIgnored` (an ignored directory lists nothing but a notice); symlinks are listed and never followed; `.git` and `.amc` entries of any kind are left out by name and identity. READ_ONLY with no path policy, like `glob` and `grep`; `defaultToolsConfig` lists it. `fs.read` without a line range now describes binary content (a NUL byte in the first 8 KB) by header media type, size and sha256 instead of decoding the bytes into the model's context, and labels NUL-free non-UTF-8 text shown with replacement characters. A signed MCP alias named `ls` now collides with a built-in and is refused at mount.

freeze-exception: SH-TOOLS — new built-in tool `ls`; no CLI command path is added
