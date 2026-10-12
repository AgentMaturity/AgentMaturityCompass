# Agent bill of materials (AIBOM)

**Status: experimental.** The CERT-In mapping below is a draft. It has not been independently reviewed, and no named expert has signed it off.

AMC describes a governed agent as a CycloneDX bill of materials: the AIBOM. It lists the models, prompts, tools, datasets, policies and AMC runtime the agent's own records name. `amc bundle export --attest` writes the AIBOM into the evidence bundle as `attestations/aibom.cdx.json` and binds it by digest to a signed in-toto statement ([ATTESTATIONS.md](ATTESTATIONS.md)).

The AIBOM is an inventory taken from AMC's records. It is not an inspection of the agent. It shows what the signed configuration declares, never what the agent actually ran.

## Where the facts come from

`collectAgentFacts` (`src/aibom/collect.ts`) reads each file once and checks its signature over those same bytes. Facts come only from files whose signature verifies. Every signed file under `.amc` (three levels deep; keys, logs, runs and other agents' folders are skipped) is also listed as a `file` component with its SHA-256 and an `amc:signature` property: `verified`, `invalid: <reason>` or `missing`.

| Component | CycloneDX | Source |
|---|---|---|
| The agent | `metadata.component`, type `application` | Agent id and workspace; role, domain, risk tier and provider (template, route, upstream) from the signed `agent.config.yaml` |
| Models | type `machine-learning-model` | The agent's profile in the signed `.amc/adapters.yaml`: `modelAllowlist` and `preferredModel`. The supplier is the agent's provider only when the model's route is that provider's route. |
| Prompts | type `data`, `amc:kind` `system-prompt` or `prompt-pack` | SHA-256 of the agent's `prompt-addendum.md` and of its latest prompt pack. Digests only, never text. |
| Tools and MCP servers | `services` | Each allowed tool in the signed `.amc/tools.yaml`, with its action class. An MCP tool also names its server id, name, version and transport. |
| Datasets | type `data`, `amc:kind` `dataset` | SHA-256 of each file under the agent's `datasets/` folder, named by digest, never by file name |
| Policies and configuration | type `file` | Every signed configuration file, with its digest and signature status |
| AMC runtime | type `application` | `agent-maturity-compass` and its version |

`dependencies` lists every component and service under the agent.

## Unknown is never guessed

AMC leaves out a field it has no record for and names it in an `amc:unknown` property on `metadata`. Examples:

- `model <id>: version`, `model <id>: modelCard`, `model <id>: licenses` and `model <id>: supplier`.
- `models: no model is declared for this agent in the signed adapters configuration`. The adapters schema's default model (`modelDefault`) is a default, not a declaration about this agent, so it never appears as a model.
- `datasets: none declared`, or `dataset provenance: none declared` when dataset files exist.
- `tools: .amc/tools.yaml did not verify (digest mismatch)`, when a configuration's signature fails. That file then supplies no facts.
- `agent-maturity-compass: package digest`.

## Formats and options

CycloneDX 1.6 JSON by default, with `buildAibom(facts, { specVersion: "1.7" })` for 1.7. Each document has a fresh `serialNumber` and the issuing server's time in `metadata.timestamp`.

The emitter is hand-written, like the npm SBOM in `src/release/releaseSbom.ts`. The tests check the CycloneDX rules the AIBOM relies on: format, spec version, component types, unique `bom-ref`s, a resolving dependency graph and SHA-256 hashes. They do not validate against the official CycloneDX JSON schema, which is not vendored. Adding `@cyclonedx/cyclonedx-library` for that awaits the dependency review ([security/dependency-reviews/attestations.md](security/dependency-reviews/attestations.md)).

## Sensitive values

Prompts and datasets appear as digests, and their components are named by digest prefix (`system-prompt:<16 hex>`, `dataset:<16 hex>`). No prompt text and no dataset file name reaches the AIBOM, so no redaction step is needed for them. Tool, MCP server and model names, and the paths of AMC's own configuration files, do appear. If those are sensitive in your deployment, do not share the AIBOM, or share only the statement, which carries the AIBOM's digest.

## CERT-In mapping (experimental, Needs-Expert)

The field names come from a planning research note on CERT-In's technical guidelines on SBOM, QBOM, CBOM, AIBOM and HBOM (version 2.0, 9 Jul 2025). They are still to be re-verified against the primary source before publication. This mapping is a draft, is not independently reviewed, and must not be presented as meeting CERT-In's guidelines.

| CERT-In minimum field (research note) | CycloneDX location | What AMC fills today |
|---|---|---|
| Model | component of type `machine-learning-model` | Declared model ids and, where the records support it, the supplier |
| Licences | `licenses` on each component | Nothing for models (`amc:unknown`) |
| Dependencies | top-level `dependencies` graph | The agent depends on every listed component and service |
| Metrics | `modelCard.quantitativeAnalysis.performanceMetrics` | Nothing (`amc:unknown`: modelCard) |
| Training-data provenance | `modelCard.modelParameters.datasets`, referencing `data` components | Nothing; dataset files are listed by digest with `dataset provenance: none declared` |
| Vulnerabilities | top-level `vulnerabilities` | Not emitted |

Follow-up (Needs-Expert): a named expert reviews this mapping against the primary source before the experimental label is removed.
