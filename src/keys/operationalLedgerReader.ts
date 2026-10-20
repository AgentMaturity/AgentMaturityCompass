import { openLedger, type EvidenceLedgerReader } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { readEventRows } from "../persistence/jsonl/jsonlEventLog.js";
import type { EvidenceEvent, OutcomeEvent } from "../types.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { loadTrustContext, workspaceSelfTrust, type TrustContext } from "../trust/trustContext.js";
import { boundProviderKey, keysetDeclared } from "./keyset.js";
import { getSigningPublicKeyPem, readHistory } from "./signingKeys.js";
import { verifyOperationalRows, type DelegationRow, type DelegationRows } from "./operationalDelegation.js";
import { readOperationalDelegationState } from "./operationalDelegationState.js";
import { operationalDelegationReadProblem } from "./operationalErrors.js";

function evidence(row: EvidenceEvent, errors: string[]): DelegationRow {
  const metadata = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime, eventType: row.event_type,
    payloadPath: row.canonical_payload_path ?? row.payload_path, payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
  if (sha256Hex(`${row.prev_event_hash}${metadata}${row.payload_sha256}`) !== row.event_hash) errors.push(`Event ${row.id} event_hash mismatch`);
  return { id: row.id, ts: row.ts, hash: row.event_hash, previousHash: row.prev_event_hash, signature: row.writer_sig, metaJson: row.meta_json };
}

function outcome(row: OutcomeEvent, errors: string[]): DelegationRow {
  let value: unknown = row.value;
  try { value = JSON.parse(row.value); } catch { /* matches existing outcome verification */ }
  const digest = sha256Hex(`${row.prev_event_hash}${canonicalize({ outcome_event_id: row.outcome_event_id, ts: row.ts,
    agent_id: row.agent_id, work_order_id: row.work_order_id, category: row.category, metric_id: row.metric_id, value, unit: row.unit,
    trust_tier: row.trust_tier, source: row.source, meta_json: row.meta_json, payload_sha256: row.payload_sha256 })}`);
  if (digest !== row.event_hash) errors.push(`Outcome event ${row.outcome_event_id} event_hash mismatch`);
  return { id: row.outcome_event_id, ts: row.ts, hash: row.event_hash, previousHash: row.prev_event_hash, signature: row.signature, metaJson: row.meta_json };
}

/** Provider issuers never become raw legacy row keys; pre-P1-08 workspaces retain their existing role history. */
export function legacyLedgerRowKeys(workspace: string): string[] {
  if (!keysetDeclared(workspace)) return getPublicKeyHistory(workspace, "monitor");
  const current = getSigningPublicKeyPem(workspace, "ledger-row");
  const history = readHistory(workspace, "ledger-row", current);
  return [...new Set([...(history?.entries.map(entry => entry.publicKeyPem) ?? []), current])];
}

function outcomeRows(ledger: EvidenceLedgerReader): OutcomeEvent[] {
  if (hasTable(ledger.db, "outcome_events")) return ledger.db.prepare("SELECT * FROM outcome_events ORDER BY rowid").all() as OutcomeEvent[];
  const versions = hasTable(ledger.db, "schema_migrations")
    ? ledger.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }> : [];
  if (versions.length > 0 && versions.length < 4 && versions.every((row, index) => row.version === index + 1)) return [];
  throw new Error("outcome_events is missing from a current or unknown ledger schema");
}

/**
 * One metadata/signature context for the three complete global prefixes, never a payload or governance verdict.
 * `allowLegacyProvider` is only for preparing the first signed cutover from an old v1 provider binding.
 * A writer supplies its actual Ledger so an outer SQL transaction's own already-inserted rows remain visible.
 */
export function readOperationalLedgerContext(workspace: string, options: { ledger?: EvidenceLedgerReader; trust?: TrustContext; allowLegacyProvider?: boolean } = {}) {
  const owned = options.ledger === undefined ? openLedger(workspace, { readonly: true }) : null;
  const ledger = options.ledger ?? owned!;
  try {
    const bound = boundProviderKey(workspace, "ledger-row");
    const state = bound?.binding.delegationSha256 === undefined && options.allowLegacyProvider ? null : readOperationalDelegationState(workspace);
    const errors: string[] = [];
    const rows: DelegationRows = {
      "sqlite-evidence": (ledger.db.prepare("SELECT * FROM evidence_events ORDER BY rowid").all() as EvidenceEvent[]).map(row => evidence(row, errors)),
      "jsonl-evidence": readEventRows(workspace).map(row => evidence(row, errors)),
      "sqlite-outcome": outcomeRows(ledger).map(row => outcome(row, errors))
    };
    // Local purpose history only. Provider archives are candidates for certs, never additional raw legacy row keys.
    const legacyKeys = legacyLedgerRowKeys(workspace);
    const checked = verifyOperationalRows(state?.chain ?? [], rows, legacyKeys, options.trust ?? workspaceSelfTrust(workspace));
    errors.push(...checked.errors);
    return { state, rows, errors, uses: checked.uses,
      usageFloor: (sha256: string): number => {
        if (errors.length) throw new Error(`delegation quota floor is unverified: ${errors.slice(0, 3).join("; ")}`);
        return checked.uses.get(sha256) ?? 0;
      } };
  } finally { owned?.close(); }
}

/** Shared public-verifier adapter: malformed or missing delegated authority is a reported failure, never raw fallback. */
export function operationalLedgerProblems(workspace: string, ledger?: EvidenceLedgerReader, trust?: TrustContext): string[] {
  try { return boundProviderKey(workspace, "ledger-row") === null ? [] : readOperationalLedgerContext(workspace, { ledger, trust: trust ?? loadTrustContext() }).errors; }
  catch (error) { return [operationalDelegationReadProblem(error)]; }
}

export interface OperationalEvidenceOptions { ledger?: EvidenceLedgerReader; trust?: TrustContext }

/** One internally read global context per synchronous inventory. A caller cannot supply a purportedly verified index. */
export function createOperationalEvidenceVerifier(workspace: string, options: OperationalEvidenceOptions = {}): (selectedRows: readonly EvidenceEvent[]) => string[] {
  try {
    if (boundProviderKey(workspace, "ledger-row") === null) return () => [];
    const context = readOperationalLedgerContext(workspace, { ledger: options.ledger, trust: options.trust ?? loadTrustContext() });
    const identity = (row: DelegationRow) => JSON.stringify([row.id, row.hash, row.signature]);
    const members = new Set([...context.rows["sqlite-evidence"], ...context.rows["jsonl-evidence"]].map(identity));
    return selectedRows => {
      const errors = [...context.errors], selected = new Set<string>();
      for (const row of selectedRows) {
        // Hash the caller's actual signed preimage before matching its commitment to stored evidence.
        let checked: DelegationRow;
        try { checked = evidence(row, errors); }
        catch { errors.push("Selected evidence preimage is invalid"); continue; }
        if (selected.has(row.id)) errors.push(`Event ${row.id} occurs more than once in the selected evidence`);
        selected.add(row.id);
        if (!members.has(identity(checked))) errors.push(`Event ${row.id} is not in a verified global delegation prefix`);
      }
      return errors;
    };
  } catch (error) {
    const failure = operationalDelegationReadProblem(error);
    return () => [failure];
  }
}

/** Authenticate a selection against all actual streams, including their shared quota; never pad a subset with empty streams. */
export function operationalEvidenceProblems(workspace: string, selectedRows: readonly EvidenceEvent[], options: OperationalEvidenceOptions = {}): string[] {
  return createOperationalEvidenceVerifier(workspace, options)(selectedRows);
}

/** A caller-supplied row array must be the actual verified global stream, not a fresh raw-signed alternate history. */
export function operationalSessionProblems(workspace: string, rows: readonly EvidenceEvent[], trust?: TrustContext): string[] {
  try {
    if (boundProviderKey(workspace, "ledger-row") === null) return [];
    const context = readOperationalLedgerContext(workspace, { trust: trust ?? loadTrustContext() });
    const same = (["sqlite-evidence", "jsonl-evidence"] as const).some(stream => context.rows[stream].length === rows.length
      && context.rows[stream].every((row, index) => row.id === rows[index]!.id && row.hash === rows[index]!.event_hash && row.signature === rows[index]!.writer_sig));
    return [...context.errors, ...(same ? [] : ["supplied session rows are not the verified global delegation prefix"])];
  } catch (error) { return [operationalDelegationReadProblem(error)]; }
}
