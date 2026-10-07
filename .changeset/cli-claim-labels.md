---
"agent-maturity-compass": major
---

CLI results and reports now show a claim kind and status dimensions. Every command that prints a score, level, verdict, compliance status, certificate, passport, bundle verification or attestation (172 command paths, listed in `src/cli/resultCommandRegistry.ts`) prints a line such as `Claim: Self-reported · Result: not evaluated · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: applicable` right after its title, and adds `claimKind`, `statusDimensions` and `claimLabel` to its `--json` output (on each row of a JSON array). CSV and badge outputs print the claim line on stderr. Breaking for scripts that parse CLI text: they see the new line. The JSON change is additive.

The claim follows docs/CLAIM_KINDS.md: a diagnostic run counts as observed only when its seal verifies and it has observed evidence; a run, certificate or bundle stored by AMC before 1.2.0 reads "Legacy (1.x), self-reported"; questionnaire answers, imports, caller-supplied files and receipts, attestations and static scans are self-reported; `demo`, `mirofish`, `lab-simulate` and `--example` output is a synthetic example; totals claim no more than their weakest member; a valid signature never raises the kind.

Reports print a claim line, a claim kind per result and a "How to read claim kinds" legend: `amc report` (Markdown and HTML), the executive brief, `eval run`, domain and industry-pack audit reports, the transparency report, compliance reports and the coverage matrix, assurance reports, fleet scoring and fleet reports, benchmark run and compare, the data residency report and `leaderboard export`. Fleet, assurance, benchmark, compliance-matrix and leaderboard tables gain a Claim column, and the transparency report JSON gains `claimKind`, `statusDimensions` and `claimLabel`.

A registered command that succeeds without a claim label prints `Claim: not labelled — treat as self-reported`; with `AMC_CLAIM_LABELS_STRICT=1` it fails with exit code 70 instead.

Other changes: the REPL and dashboard no longer call L5 "Certified" (L5 is Optimizing, and the dashboard ladder uses the methodology names); `amc unknowns` and `amc meta-confidence` read the agent's latest run (they looked for a run named after the agent and always failed); `amc badge` with no cached score and no `--level` or `--score`, and `amc lab-simulate` for an unknown experiment, now exit 1; the `amc report` HTML renderer moved to `src/cli/reportRenderers.ts`; compliance categories record `countedObserved`; `verifyEvidenceBundle` returns the run it checked.
