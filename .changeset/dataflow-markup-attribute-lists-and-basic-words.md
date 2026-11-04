---
"agent-maturity-compass": patch
---

The protected-data walk now reads a secret-named element or input after a long attribute list or a comment, keeps a line whose JSON NFKC lengthens past the leaf limit instead of refusing it, no longer takes headings such as "Basic Overview" for a Basic credential, and the shared redaction also replaces a Basic header in escaped JSON.
