# FIX-9 Handoff: Evidence Export & Audit Trail

## Scope Completed
- Audited and patched ledger/evidence export gaps for verifier-readiness.
- Added full `amc evidence export` surface with `json|csv|pdf` support and optional `--include-chain` / `--include-rationale`.
- Added top-level `amc audit-packet` generator producing an external-auditor ZIP packet.
- Wired incident auto-linking at evidence write time for open incidents.
- Added correction-loop closure marking to link verified corrections back to evidence.

## New CLI Commands
- `amc evidence export --format json|pdf|csv --include-chain --include-rationale [--agent <id>] [--out <file>]`
- `amc audit-packet --output ./audit-YYYY-MM-DD.zip [--agent <id>] [--no-include-chain] [--no-include-rationale]`

## Key Implementation Details
- New `src/evidence/` module:
  - `exporter.ts`: verifier dataset collection + JSON/CSV/PDF rendering + export writer.
  - `auditPacket.ts`: packet assembly with manifest/signature, ledger verify result, incidents/corrections snapshots, keys, and raw ledger DB.
  - `zip.ts`: deterministic local ZIP builder (no external zip dependency).
- Ledger migration `v7` adds append-only tables:
  - `evidence_incident_links`
  - `evidence_corrections`
- Evidence append now auto-links to open incidents (agent + trigger/question/fallback heuristics) and writes causal edge linkage.
- Correction verification path fixed:
  - Removed delete/reinsert behavior that violated immutability triggers.
  - Now updates only verification/mutable fields.
  - On verified status, marks linked evidence in `evidence_corrections`.

## Exported Verifier Fields
Each evidence record now includes (for verifier outputs):
- hash chain fields (`prevEventHash`, `eventHash`, optional chain verification fields)
- signature (`writerSignature`)
- rationale and rationale chain (when requested)
- timestamp (`ts`, `isoTs`)
- actor ID (`actorId`)
- incident links and correction-closure links

## Files Added
- `src/evidence/zip.ts`
- `src/evidence/exporter.ts`
- `src/evidence/auditPacket.ts`
- `src/evidence/index.ts`
- `tests/evidenceAuditTrail.test.ts`
- `HANDOFF.md`

## Files Updated
- `src/ledger/ledger.ts`
- `src/corrections/correctionStore.ts`
- `src/corrections/correctionTracker.ts`
- `src/corrections/index.ts`
- `src/cli.ts`
- `src/index.ts`

## Validation
- Targeted test suite:
  - `npm test -- tests/evidenceAuditTrail.test.ts --reporter=verbose`
  - Result: PASS (3/3)
- Typecheck:
  - `npm run typecheck`
  - Result: PASS
- Required full test command:
  - `npm test -- --reporter=verbose 2>&1 | tail -30`
  - Result: FAIL in sandbox due `listen EPERM` integration tests binding `127.0.0.1` (known environment restriction).
