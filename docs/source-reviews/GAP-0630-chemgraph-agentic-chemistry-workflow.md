# GAP-0630 source review: ChemGraph agentic computational chemistry workflows

Gap: `GAP-0630` / `eval-metric-validity`
Surfaces requested: Score, Shield, Watch
Assigned source: DOI <https://doi.org/10.1038/s42004-025-01776-9>; OpenAlex `W7119161162`
Assigned title: `ChemGraph as an agentic framework for computational chemistry workflows`

## Live source verification

Verified from the isolated `agent/gap-0630` worktree on 2026-06-21 using live DOI/Crossref and OpenAlex API requests. Only metadata was inspected; no paper prose, figures, tables, prompts, benchmark rows, chemistry data, workflows, or implementation details were copied into AMC.

### DOI / Crossref metadata

- Requesting `https://doi.org/10.1038/s42004-025-01776-9` with JSON negotiation returned HTTP 200 via Crossref transform.
- Crossref DOI: `10.1038/s42004-025-01776-9`.
- Crossref title: `ChemGraph as an agentic framework for computational chemistry workflows`.
- Venue: `Communications Chemistry`.
- Publisher: `Springer Science and Business Media LLC`.
- Type: `journal-article`.
- Published date reported by Crossref: `2026-01-08`.
- First listed authors in Crossref metadata: Thang D. Pham; Aditya Tanikanti; Murat Keçeli.
- License metadata includes CC-BY 4.0 URLs.

### OpenAlex metadata

- `https://api.openalex.org/works/W7119161162` returned HTTP 200.
- OpenAlex id: `https://openalex.org/W7119161162`.
- OpenAlex DOI: `https://doi.org/10.1038/s42004-025-01776-9`.
- OpenAlex title: `ChemGraph as an agentic framework for computational chemistry workflows`.
- Publication year/date: `2026` / `2026-01-08`.
- Source: `Communications Chemistry`.
- OpenAlex type: `article`.
- Open access status: gold OA; primary source reports `Communications Chemistry`.
- First listed OpenAlex authors: Thang D. Pham; Aditya Tanikanti; Murat Keçeli.

## Relevance / adoption decision

**Decision: metadata-only source review with existing AMC primitives.**

The source is relevant to AMC only at the public-methodology and metric-validity boundary: it is a paper about agentic computational chemistry workflows and benchmarked workflow/task execution. That makes it a useful external source-review signal for claims that Score, Shield, or Watch metric-validation rows are grounded in agentic workflow evaluation methodology.

AMC does **not** adopt a chemistry/domain subsystem, chemistry importer, connector, benchmark mirror, parity layer, ChemGraph adapter, simulation runner, task corpus, prompt, workflow, or paper data. Any AMC claim that cites ChemGraph must still fail closed unless it supplies AMC-owned evidence through existing primitives:

- validation table artifact;
- existing metric-validity primitive mapping, especially `scientificLiteratureCoverage`, plus `traceEvaluationCoverage` or `evaluatorSuiteCoverage` when those surfaces are claimed;
- metric owner;
- sample size;
- confidence interval;
- fail-closed threshold policy;
- signed evidence refs, artifact hashes, and row hashes;
- no-copy/source-review boundary proof.

## Public-methodology boundary added

GAP-0630 adds `chemgraph_agentic_chemistry_workflow_metric_validity` as a public methodology boundary and gate. The boundary explicitly treats DOI/OpenAlex metadata as source-review input only. It requires DOI/OpenAlex verification plus AMC-owned validation proof before Score, Shield, or Watch outputs can cite ChemGraph-style agentic computational chemistry workflow evidence.

## Copy/provenance boundary

No paper prose, abstract text beyond title/metadata facts, figures, tables, benchmark rows, chemistry data, prompts, workflows, screenshots, or implementation details were copied. The review records only metadata facts needed to bind a no-parity, no-subsystem source-review boundary to existing AMC metric-validity/public-methodology primitives.
