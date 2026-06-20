# Accessibility Release Evidence Runbook

AMC does not treat automated accessibility checks as full WCAG conformance. W3C WAI evaluation guidance says tools help find issues, but knowledgeable human evaluation is still required. This runbook records the automated axe run status for a release and keeps the manual assistive-technology boundary explicit.

## Generate The Artifact

Run the axe-backed Playwright accessibility suite and capture the JSON report:

```bash
mkdir -p tmp
npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/accessibility.spec.ts --reporter=json > tmp/accessibility-playwright.json
```

Then write the release evidence artifact:

```bash
npm run accessibility:release-evidence
```

The default artifact path is:

```text
docs/runbooks/accessibility-release-evidence-latest.md
```

For a dated release artifact, pass explicit paths:

```bash
node scripts/write-accessibility-release-evidence.mjs \
  --report tmp/accessibility-playwright.json \
  --out docs/runbooks/accessibility-release-evidence-2026-06-16.md \
  --run-id 2026-06-16-release-candidate
```

## What The Artifact Means

- Automated axe status: PASS means the Playwright axe suite had no unexpected or flaky tests.
- Manual assistive-technology review remains required before making a full WCAG conformance claim.
- Manual review should cover modal behavior, dense generated reports, terminal prompts, keyboard-only operation, screen-reader output, and any known customer assistive-technology stack.

## Sources

- W3C WAI Evaluating Web Accessibility Overview: https://www.w3.org/WAI/test-evaluate/
- W3C WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/
- Deque axe API documentation: https://www.deque.com/axe/core-documentation/api-documentation/
