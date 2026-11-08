---
"agent-maturity-compass": patch
---

Compass Console sign-in: the login card now says how an account is created. On a local workspace it names `amc user add` (an OWNER adds you) and, for a brand-new workspace only, `amc user init` with the warning that it replaces every existing login; under host mode (`/w/<id>/console`) it names `amc host user add`. When the workspace has no `.amc/users.yaml` yet, Studio answers `users config missing; login blocked` (every other invalid users-config verdict keeps the generic `users config signature invalid; login blocked`), and the console turns that reply into the next step instead of a message that reads like corruption. The fields are a real form with visible labels and autocomplete hints, so Enter signs in; the other buttons never submit it; the status line is announced to screen readers; and pairing another device is a labelled, collapsed section.
