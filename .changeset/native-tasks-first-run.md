---
"agent-maturity-compass": patch
---

Native Tasks: a first task with the local stub now finishes and shows its result.

- The stub provider ran into the signed USD budget gate. A workspace whose `budgets.yaml` carries a daily `maxCostUsd` (the default for workspaces created before the token-only default, including older demo workspaces) refused every stub request with "USD request bound is missing or ambiguous", because the stub has no attested price bound. A stub dispatch goes only to `http://stub.invalid/v1/messages`, which never resolves and cannot reach a paid provider, so its signed reservation now records `usdExposure: "none-local-stub"` and reserves no USD. Any other destination, including one that names the stub provider, still needs an attested bound, and a forged exemption on another provider's reservation makes the budget projection fail closed.
- A task history page read that raced a concurrent append (`CHANGED`) answered 409 "Committed task evidence or its cursor could not be authenticated". The page read now reads again up to five times and, if the history keeps moving, says so instead of reporting an authentication failure. Evidence authentication is unchanged.
- The page puts the prompt and Run task directly under the provider choice. Attachments, prompt size, validation checks, run limits and scope are in closed disclosures with their wording unchanged. `?sample=1` prefills a short prompt for the stub and focuses it. One line beside Run task shows the result ("See what AMC recorded"), why a task failed, or, when a status read fails for good, that AMC could not check the task's record and what to try next.
- A demo viewer is told that public validation checks need signed workspace bash, rather than being asked to sign in.
