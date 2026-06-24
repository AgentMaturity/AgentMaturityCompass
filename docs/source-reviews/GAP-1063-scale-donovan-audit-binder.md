# GAP-1063 - Scale Donovan audit-binder boundary

- Gap: `GAP-1063`
- Dimension: `gov-auditor-binder`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `Scale Donovan`
- Retrieval: live Scale Donovan page headers and static page metadata on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Auditor-ready evidence binder

## Relevance decision

GAP-1063 is relevant to AMC because enterprise and public-sector buyers need reviewable, signed, privacy-safe evidence packages that map controls to evidence. The Scale Donovan page is a competitor context signal for mission AI agent deployment, evaluation, traceability, secure environments, and cloud/container deployment. It is not evidence that AMC should add a Scale Donovan integration, public-sector workflow clone, agent marketplace, scraper, or product parity claim.

AMC already has the right generic primitive: signed `.amcaudit` artifacts. The accepted AMC closure is to prove the existing audit binder produces an auditor-ready evidence binder with a Binder manifest, control index, receipt hashes, reviewer notes fields, signed artifact verification, PII/secret scanning, proof bindings, and evidence lineage. Competitor website metadata alone fails closed.

Reviewed source facts:

- Source URL: `https://scale.com/donovan`
- Canonical: canonical `https://scale.com/donovan`
- Page title: `Donovan: Empowering the Public Sector with AI Agents | Scale AI | Scale AI`
- Page description: `Scale Donovan empowers the public sector to field specialized AI Agents for mission-critical workflows.`
- HEAD returned HTTP/2 `200`, content-type `text/html; charset=utf-8`, server `Vercel`, `x-matched-path `/donovan``, and `x-nextjs-prerender: 1`
- Static metadata includes `og:title` `Donovan: Empowering the Public Sector with AI Agents | Scale AI` and the same description as the page meta description.
- Page text includes short product labels such as `Deploy specialized AI Agents`, `Customize, Evaluate, and Deploy AI Agents`, `Traceability`, `Trusted & Secure`, `DISA IL4`, `FedRAMP High Authorized`, and `Kubernetes containerized platform`.
- The extracted page text did not include `audit`, `evidence`, or `governance` as product claims. AMC uses the page only as source-review context for the local backlog dimension.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only. Binder maturity sections include score summaries, but scoring semantics do not change. |
| Shield | Indirect only. Binder sections can include assurance findings, but no Shield detector changed. |
| Enforce | No runtime enforcement, deployment gateway, or public-sector workflow changed. |
| Vault | Relevant because `.amcaudit` exports are signed, PII/secret scanned, hash-bound, and privacy-safe. |
| Watch | No observability or live-monitoring surface changed. |
| Fleet | No agent marketplace, mission-agent routing, or fleet orchestration changed. |
| Passport | Relevant because binder artifacts bind trust evidence, proof hashes, and portable review material. |
| Comply | Primary surface. Existing audit binders package maturity, governance, controls, assurance, supply chain, recurrence, proof bindings, and signed artifact verification for review. |

## Product closure

No product module changed. GAP-1063 is covered by the existing generic AMC audit-binder primitive:

- `createAuditBinderArtifact`
- `verifyAuditBinderFile`
- `inspectAuditBinder`
- `scanBinderForPii`
- signed binder cache/export lifecycle
- console audit binder pages and audit request workflow

The focused regression creates a temporary AMC workspace, exports a signed `.amcaudit` artifact, verifies it offline, inspects the binder manifest and control index, checks proof/receipt hashes, checks reviewer notes fields, and confirms the PII scan passes. It then tampers with `binder.json` and verifies that digest/signature checks fail closed.

## Fail-closed rule

The audit binder fails closed when the audit policy or active map signature is invalid, `binder.json` or `binder.sig` is missing, the binder digest mismatches the signature, the signature is invalid, the PII scan is missing or fails, PII scan hashes mismatch, proof files are invalid, proof IDs mismatch, transparency or Merkle root hashes mismatch, or the calculation manifest is missing or hash-mismatched.

Metadata-only evidence fails closed. Scale page metadata, title, description, marketing labels, secure-environment labels, traceability labels, public-sector positioning, cloud/container labels, local backlog metadata, or competitor identity cannot satisfy auditor-ready evidence-binder proof without an AMC-owned signed binder, manifest, control index, proof hashes, reviewer notes fields, PII/secret scan, and verifiable evidence lineage.

## No-bloat boundary

No Scale Donovan integration, adapter, scraper, importer, source-specific binder, agent marketplace, mission workflow, public-sector workflow clone, classified-network claim, model/provider connector, Kubernetes deployer, FedRAMP assertion, API route, CLI command, methodology version bump, or legal-certification claim was added.

No Scale page prose beyond minimal metadata facts, screenshots, images, UI, prompts, examples, datasets, configs, partner logos, generated outputs, or page assets were copied.

## Verification

Commands run:

- `curl -sSIL https://scale.com/donovan` - passed, HTTP/2 `200`
- Static page metadata extraction from `https://scale.com/donovan` with a browser-like user agent - passed
- `npx vitest run tests/gap1063ScaleDonovanAuditBinderBoundary.test.ts --reporter=dot` - expected red on missing source-review doc after aligning test fixture assumptions to existing AMC binder IDs and built-in control counts; existing product primitive otherwise worked
- `npx vitest run tests/gap1063ScaleDonovanAuditBinderBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1063ScaleDonovanAuditBinderBoundary.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts tests/vault-extensions.test.ts --reporter=dot` - passed, 4 files / 43 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic audit-binder, passport, vault, and audit-binder docs files returned no GAP-1063 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 910 files / 7,623 tests

Final verification is recorded in the progress ledger for the committed slice.
