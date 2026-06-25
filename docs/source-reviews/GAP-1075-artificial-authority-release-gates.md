# GAP-1075 - Artificial Authority release gates

- Gap: `GAP-1075`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7124460067`, OpenAlex API `https://api.openalex.org/works/W7124460067`, DOI `https://doi.org/10.3390/bioengineering13010108`, MDPI landing page `https://www.mdpi.com/2306-5354/13/1/108`, and MDPI PDF `https://www.mdpi.com/2306-5354/13/1/108/pdf?version=1768556216`
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:26:16.000+05:30`
- Status: Done

## Relevance decision

The OpenAlex source identifies `Artificial Authority: The Promise and Perils of LLM Judges in Healthcare` as an `article` in `Bioengineering` with publication_year `2026`, publication_date `2026-01-16`, DOI `https://doi.org/10.3390/bioengineering13010108`, open-access status `gold`, license `cc-by`, and PDF URL `https://www.mdpi.com/2306-5354/13/1/108/pdf?version=1768556216`. The metadata lists concepts including `Corporate governance`, `Health care`, `Engineering ethics`, `Clinical governance`, `Medicine`, `Patient care`, `Public relations`, and `Nursing`, with authors affiliated to `Mayo Clinic`, `Mayo Clinic in Florida`, and `Mayo Clinic in Arizona`.

This is relevant to AMC only as governance and audit context for high-risk release decisions. It maps to AMC's existing CI/release gate surface because the backlog acceptance requires `gate config`, `environment`, `run receipt`, `failure reason`, and `override status`. It does not justify a healthcare LLM-judge subsystem, a paper adapter, a clinical benchmark, a medical claim, or an upstream article importer.

Live access boundary: `https://api.openalex.org/works/W7124460067` returned HTTP/2 `200`. `https://openalex.org/W7124460067` returned HTTP/2 `403` in this environment. The DOI returned HTTP/2 `302` to the MDPI landing page, and MDPI returned HTTP/2 `403` with page title `Access Denied`. The MDPI PDF URL also returned HTTP/2 `403`. AMC therefore treats OpenAlex API metadata as source-review metadata, not as proof of article contents beyond the retrieved metadata fields.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing release maturity and evidence quality gates. No scoring thresholds or methodology semantics changed for this source. |
| Shield | No new red-team pack or LLM-judge safety evaluator was added. Release gates can carry Shield evidence refs when they exist. |
| Enforce | No runtime enforcement policy changed. Gate outcomes can block release workflows through existing CI gate behavior. |
| Vault | Relevant because release-gate receipts can reference signed evidence without embedding sensitive run payloads. |
| Watch | No Watch monitor changed. Observability evidence can be attached to the generic release-gate receipt. |
| Fleet | Relevant as deployment context: receipts bind agent id and target `environment` such as production. |
| Passport | Relevant because auditor-ready export preserves signed release-gate proof, row hashes, and receipt hashes. |
| Comply | Relevant because high-risk release decisions require explicit failure reasons and override status before audit claims can pass. |

## Product closure

AMC now has a generic release-gate receipt primitive in `src/ci/gate.ts` and exports it from `src/index.ts`:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`
- release-gate receipt types for source citations, evidence links, override status, run records, rows, receipts, and verification results

The receipt records the gate config, gate config hash, agent id, target environment, policy path, bundle path, evaluated timestamp, pass/fail result, failure reason list, run receipt ref, run receipt hash, override status, override id, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash. This strengthens the existing `runBundleGate` behavior without changing existing gate outcomes or adding a source-specific workflow.

## Fail-closed rule

metadata-only Artificial Authority evidence must fail closed. A source title, DOI, OpenAlex id, publication date, healthcare label, clinical-governance concept, author affiliation, open-access label, license label, or MDPI URL cannot satisfy a release gate. A passing receipt requires a valid gate config, target environment, evaluated timestamp, signed evidence refs, run receipt ref, run receipt hash, failure reasons for failed gates, and signed override evidence when an override is requested, approved, rejected, or expired.

The implemented receipt fails closed when:

- source citations are missing or unknown
- the gate config is invalid
- the target environment is invalid
- a failed gate has no failure reason
- the run receipt ref or hash is missing
- signed evidence refs are missing or malformed
- an override lacks approver, decision timestamp, signed evidence ref, or signature hash
- row or receipt hashes do not verify

## No-bloat boundary

No Artificial Authority adapter, OpenAlex importer, MDPI importer, healthcare LLM-judge release gate, clinical evaluator, clinical benchmark, paper parser, article scraper, source-specific API route, source-specific CLI command, clinical governance module, medical claim, upstream article content, prompts, figures, tables, datasets, screenshots, model outputs, or implementation details were added. The product change is a source-neutral CI/release-gate receipt that can be reused by any AMC release workflow.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts --reporter=dot` failed because `docs/source-reviews/GAP-1075-artificial-authority-release-gates.md` did not exist and `buildReleaseGateReceipt` was not exported; 1 no-bloat test passed.
- Product-focused test after implementation before doc: `npx vitest run tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts --reporter=dot` had 3 passing product/no-bloat tests and failed only on the missing source-review doc.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7124460067` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.3390/bioengineering13010108` returned HTTP/2 `302` to MDPI, followed by HTTP/2 `403`.
  - `curl -sSL https://doi.org/10.3390/bioengineering13010108` returned title `Access Denied`.
  - `curl -sSIL 'https://www.mdpi.com/2306-5354/13/1/108/pdf?version=1768556216'` returned HTTP/2 `403`.
- Focused test: `npx vitest run tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
