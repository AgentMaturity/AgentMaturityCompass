---
"agent-maturity-compass": minor
---

`web_fetch` renders HTML (SH-TOOLS-03): a new `format` argument, `markdown` (default), `text` or `html`, applied to `text/html` and `application/xhtml+xml` bodies. The dependency-free, linear-time renderer drops `script`, `style`, `noscript`, `template`, `svg`, `iframe`, `object`, `embed`, `title` and comments with their content (`head` is not dropped as an element, since its end tag is optional), keeps only `href`, `src` and `alt`, resolves links against the response URL and keeps only `http`, `https` and `mailto` targets. The `NATIVE_WEB_FETCH` receipt gains `format` (`raw` for a non-HTML body) and `renderedBytes`; `contentSha256` still digests the body as received. Other content types ignore `format`.
