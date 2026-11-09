---
"agent-maturity-compass": minor
---

`web_fetch` renders HTML (SH-TOOLS-03): a new `format` argument, `markdown` (default), `text` or `html`, applied to `text/html` and `application/xhtml+xml` bodies. The dependency-free renderer is linear in time and output on remote input (rows are not padded to the widest; lists indent at most eight levels) and stops at a two-second wall-clock backstop, saying so before the untrusted fence. It drops `script`, `style`, `noscript`, `template`, `svg`, `iframe`, `object`, `embed`, `title`, `math` and comments with their content (`head` is not dropped as an element, since its end tag is optional), keeps only `href`, `src` and `alt`, resolves links against the response URL and keeps only `http`, `https` and `mailto` targets. The `NATIVE_WEB_FETCH` receipt gains `format` (`raw` for a non-HTML body), `renderedBytes` and, for a rendered body, `renderComplete`; `contentSha256` still digests the body as received. Other content types ignore `format`.
