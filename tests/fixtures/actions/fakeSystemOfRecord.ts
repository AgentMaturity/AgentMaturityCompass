/**
 * A system of record for the P1-04 fault matrix. Its transaction log is the oracle: every effect it applied, in order,
 * kept in a JSON file so a child process that is killed mid-call and its parent see the same log.
 *
 * Payments honour an idempotency key: the same key with the same body returns the first result with no new effect;
 * the same key with another body is a conflict. Deletions have no key support, so every call is an effect. Lookups
 * are read-only and counted, so a test can show a reconcile path never created an effect.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BindingFacts } from "../../../src/actions/authorizationRecord.js";
import type { ReconcileAdapter } from "../../../src/actions/reconcile.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { canonicalize } from "../../../src/utils/json.js";

export interface SystemOfRecordEffect {
  readonly kind: "payment" | "deletion";
  /** The idempotency key the request carried, or null (deletions). */
  readonly key: string | null;
  /** The AMC execution that sent it, as the body named it, for effects with no key. */
  readonly executionId: string | null;
  readonly ref: string;
  readonly bodyDigest: string;
  readonly facts: BindingFacts;
}

export interface PaymentBody {
  readonly amount: string;
  readonly currency: string;
  readonly recipient: string;
}

const facts = (body: PaymentBody): BindingFacts => ({ amount: { value: body.amount, currency: body.currency }, recipient: body.recipient,
  destination: null, resourceId: null, resourceVersion: null });

export class FakeSystemOfRecord {
  constructor(private readonly file: string) {
    if (!existsSync(file)) this.save({ effects: [], lookups: 0 });
  }

  private load(): { effects: SystemOfRecordEffect[]; lookups: number } {
    return JSON.parse(readFileSync(this.file, "utf8")) as { effects: SystemOfRecordEffect[]; lookups: number };
  }

  private save(state: { effects: SystemOfRecordEffect[]; lookups: number }): void {
    writeFileSync(this.file, JSON.stringify(state));
  }

  get effects(): readonly SystemOfRecordEffect[] {
    return this.load().effects;
  }

  get lookups(): number {
    return this.load().lookups;
  }

  /** Applies once per key. A repeated key with another body is refused (409) and applies nothing. */
  pay(key: string, body: PaymentBody, executionId: string | null): { readonly status: 200 | 409; readonly ref: string | null; readonly replayed: boolean } {
    const state = this.load();
    const bodyDigest = sha256Hex(canonicalize(body));
    const earlier = state.effects.find((effect) => effect.kind === "payment" && effect.key === key);
    if (earlier !== undefined) return earlier.bodyDigest === bodyDigest ? { status: 200, ref: earlier.ref, replayed: true } : { status: 409, ref: null, replayed: false };
    const ref = `pay_${state.effects.length + 1}`;
    state.effects.push({ kind: "payment", key, executionId, ref, bodyDigest, facts: facts(body) });
    this.save(state);
    return { status: 200, ref, replayed: false };
  }

  /** No idempotency support: every call deletes (an archive-and-purge job, say), so a retry is a second effect. */
  deleteResource(resourceId: string, executionId: string | null): { readonly ref: string } {
    const state = this.load();
    const ref = `del_${state.effects.length + 1}`;
    state.effects.push({ kind: "deletion", key: null, executionId, ref, bodyDigest: sha256Hex(resourceId),
      facts: { amount: null, recipient: null, destination: null, resourceId, resourceVersion: null } });
    this.save(state);
    return { ref };
  }

  /** Effects beyond the first for one intent: per key for payments, per AMC execution for keyless deletions. Must be 0. */
  duplicateEffects(): number {
    const intents = this.effects.map((effect) => effect.key ?? `execution:${effect.executionId ?? effect.ref}`);
    return intents.length - new Set(intents).size;
  }

  /** Effects no journaled intent accounts for, by key or, for keyless effects, by execution id. Must be 0. */
  effectsWithoutIntent(intents: { readonly keys: ReadonlySet<string>; readonly executionIds: ReadonlySet<string> }): number {
    return this.effects.filter((effect) => !(effect.key !== null ? intents.keys.has(effect.key)
      : effect.executionId !== null && intents.executionIds.has(effect.executionId))).length;
  }

  /** The payment adapter: read-only lookups by key. Deletions have no adapter. */
  adapter(adapterId = "fake-payments"): ReconcileAdapter {
    return {
      adapterId,
      lookup: async (query) => {
        const state = this.load();
        state.lookups += 1;
        this.save(state);
        const hit = state.effects.find((effect) => effect.kind === "payment" && effect.key === query.idempotencyKey);
        const observedAt = new Date().toISOString();
        return hit === undefined ? { kind: "not_applied", observedAt } : { kind: "applied", externalRef: hit.ref, observedAt, observed: hit.facts };
      }
    };
  }
}
