---
"agent-maturity-compass": patch
---

Correct evaluator missingness and comparison reporting. Empty diagnostic EXECUTE populations now have unavailable duality compliance. Continuous red-team scoring shares assurance scenario aggregation and excludes ungraded evaluator outcomes while retaining their counts.

Cognition lab comparisons retain unmatched/repeated results, omit missing dimension deltas and label descriptive single-sample comparisons without statistical significance. Drift checks compare against the latest five verified runs when available and sign the comparison window; single-run and missing-assurance triggers remain explicitly unconfirmed.

Experiment gate presets now use explicit 0..100 point units (strict 5 points, balanced 2 points). Zero-over-zero cost ratios and malformed confidence intervals are inconclusive. Incompatible value units do not establish a value threshold failure. Casebook reports reflect configured success points and preserve unavailable scores as null. Sealed experiment reports carry comparability warnings, and the existing analyze command accepts --all for verified, read-only run history.

A drift interval the bootstrap cannot estimate keeps the observed drop and is reported as unconfirmed INSUFFICIENT_EVIDENCE. `lab-compare` still exits 1 when no probe matches, after listing the unmatched rows.
