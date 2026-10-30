---
"agent-maturity-compass": patch
---

Add `/bookmark` and `/bookmarks` to native interactive chat. Bookmarks sign an exact session and sealed turn hash through the existing async policy signer. Reads verify the bookmark signature; navigation rechecks session evidence, payloads, and the turn's Merkle commitment before displaying its event spine. Bookmark creation uses the signed mutating-command audit and leaves conversation history unchanged.
