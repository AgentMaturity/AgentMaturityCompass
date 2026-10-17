/** What a kind module returns, and the helpers every kind shares. */
import { parseJson, sha256Hex, same } from "./bytes.js";
import type { Dimension, DimensionStatus, Finding } from "./codes.js";
import type { Admission, TrustContext } from "./trust.js";

export type ArtifactKind = "scoped-attestation" | "receipt" | "external-evidence" | "trust-list" | "key-rotation" | "root-rotation"
  | "revocation-list" | "dsse-intoto" | "unknown";

export interface DimResult<D extends Dimension> {
  status: DimensionStatus;
  findings: Finding<D>[];
  /** Why a dimension is not evaluated, when it is not. */
  note: string | null;
}

export interface ScopeExpectation {
  tenant?: string;
  deployment?: string;
  subject?: string;
  profile?: string;
}

export interface Evaluation {
  kind: ArtifactKind;
  integrity: Finding<"integrity">[];
  /** Signatures whose key the supplied trust lists do not hold, so they could not be checked (integrity not evaluated). */
  unverifiable: string[];
  admissions: Admission[];
  /** Issuer findings that belong to the artifact rather than one signature (rollback, root threshold, anchoring). */
  admissionFindings: Finding<"issuerAdmission">[];
  anchoring: { status: "anchored" | "unanchored" | "not-applicable"; detail: string | null };
  claimedAt: string | null;
  warnings: string[];
  scope: () => DimResult<"scope">;
  freshness: () => DimResult<"freshness">;
  completeness: () => DimResult<"completeness">;
  satisfaction: () => DimResult<"satisfaction">;
}

export interface Env {
  ctx: TrustContext;
  evidence: EvidenceStore;
  expect: ScopeExpectation;
}

export function result<D extends Dimension>(findings: Finding<D>[], notEvaluated: string | null = null): DimResult<D> {
  if (findings.length > 0) return { status: "fail", findings, note: null };
  return notEvaluated === null ? { status: "pass", findings, note: null } : { status: "not-evaluated", findings, note: notEvaluated };
}

export const notRecomputable = (detail: string): DimResult<"satisfaction"> =>
  ({ status: "not-evaluated", findings: [{ code: "NOT_RECOMPUTABLE", detail }], note: detail });

/**
 * Scope: each expected value the verifier's user gave must equal the record's; a record with no such field fails.
 * Not evaluated when nothing is expected and no evidence is foreign.
 */
export function scopeResult(fields: ScopeExpectation, expect: ScopeExpectation, foreign: Finding<"scope">[] = []): DimResult<"scope"> {
  const findings: Finding<"scope">[] = [];
  const keys = (["tenant", "deployment", "subject", "profile"] as const).filter(key => expect[key] !== undefined);
  for (const key of keys) {
    const actual = fields[key];
    if (actual === undefined) findings.push({ code: "SCOPE_MISMATCH", detail: `a ${key} of ${expect[key]} was expected; this record names no ${key}` });
    else if (!same(actual, expect[key]!)) findings.push({ code: "SCOPE_MISMATCH", detail: `${key} is ${actual}, not the expected ${expect[key]}` });
  }
  findings.push(...foreign);
  return result(findings, keys.length === 0 ? "no expected tenant, deployment, subject or profile was given" : null);
}

/** Evidence the verifier's user supplied, addressed by the sha256 of its bytes. */
export class EvidenceStore {
  private readonly items = new Map<string, Uint8Array>();
  private readonly parsed = new Map<string, unknown>();
  /** Entries whose bytes do not hash to the digest they were supplied under. */
  readonly mismatched: string[] = [];

  constructor(entries: Iterable<[string, Uint8Array]> = []) {
    for (const [digest, bytes] of entries) {
      if (same(sha256Hex(bytes), digest)) this.items.set(digest, bytes);
      else this.mismatched.push(digest);
    }
  }

  has(digest: string): boolean {
    return this.items.has(digest);
  }

  bytes(digest: string): Uint8Array | undefined {
    return this.items.get(digest);
  }

  /** The item parsed as strict JSON; undefined when absent or not JSON. */
  json(digest: string): unknown {
    if (!this.parsed.has(digest)) {
      const bytes = this.items.get(digest);
      let value: unknown;
      try { value = bytes === undefined ? undefined : parseJson(bytes); } catch { value = undefined; }
      this.parsed.set(digest, value);
    }
    return this.parsed.get(digest);
  }

  digests(): string[] {
    return [...this.items.keys()].sort();
  }
}
