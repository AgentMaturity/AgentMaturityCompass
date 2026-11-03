---
"agent-maturity-compass": patch
---

The shared secret redaction and protected-data detection now read a Basic or Bearer token whose `/` is escaped as `\/` to its end, count a free-text Basic pair shorter than eight base64 characters when its padding is written, and fold long text that hardly grows instead of replacing text over 16 MiB whole: the 16 MiB cap now applies to the fold's growth only. The folded view is built without one string per character (about half the time and memory on 1 MB of non-ASCII text).
