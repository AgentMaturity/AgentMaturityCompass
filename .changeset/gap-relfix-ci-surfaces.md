---
"agent-maturity-compass": patch
---

The GitHub Action (`amc-action`) and the reusable `amc-score` workflow now set up a fresh checkout without prompting and report a workspace without evidence as "no evidence yet" instead of crashing or showing a score of 0; a required target level then fails with that reason.

When the checkout has no `.amc` workspace, both run `amc init --minimal --profile ci` with a vault passphrase generated for the job and masked in the log; a committed workspace is used as it is, with `AMC_VAULT_PASSPHRASE` from the caller. With no evidence yet, the `score` and `level` outputs are empty, and the step summary, PR comment and badge say so. A result without a score or level, or a base branch without evidence, is no longer read as 0 or L0.

Building the Python SDK wheel from a checkout (`python -m build --wheel sdk/python`) now packages the current `amc_sdk` sources: a stale tracked setuptools build copy, which made the wheel ship an old `client.py` without the `new_session` mapping, is removed.

`npm run check:catalog-changelog` accepts a pushed range that carries several catalog changes when it appends one `catalog/CHANGELOG.md` entry per change, in order; each entry is checked for its own step exactly as a single entry is.
