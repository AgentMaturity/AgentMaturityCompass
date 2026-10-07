---
"agent-maturity-compass": patch
---

Issuing an assurance certificate (`amc assurance cert issue` and the API) still refuses a `synthetic_example` run; the error now reads "synthetic_example results cannot be issued a certificate" instead of using the word "certified", so the certificate module no longer needs an exemption from the repository's certification-wording check.
