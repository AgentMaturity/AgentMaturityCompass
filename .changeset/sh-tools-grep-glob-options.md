---
"agent-maturity-compass": minor
---

`grep` gains ripgrep's everyday options over the JavaScript engine (SH-TOOLS-04): `fixedStrings`, `multiline`, `context` (0 to 10, printed as `path-line-text` with `--` between groups), `mode` (`content`, `files`, `count`) and `offset` paging with `maxResults` as the page size, in files for `files` and `count` mode; the cap notice names the next offset (none when the output byte cap also cut the page), the count total covers only the files shown and says `on this page` when it is not the whole result, and a page past the end says how many matches or files exist. Skipped matches stay bounded by `maxScannedBytes`, the walk cap and the deadline. `glob` gains `sortBy` (`name`, the default, or `mtime` newest first). The pinned bash/search schema digest changes accordingly.
