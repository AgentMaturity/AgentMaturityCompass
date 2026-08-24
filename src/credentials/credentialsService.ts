/**
 * The credentials seam.
 *
 * Four operations, one invariant: a value crosses this boundary in exactly one
 * direction and through exactly one method. `resolve` hands a secret to a
 * caller that is about to use it; `describe` answers everything else — UIs,
 * doctor output, evidence events, error messages — and structurally cannot
 * carry a value. Everything else in this directory exists to make those two
 * facts hold.
 *
 * This file is the contract only. No storage, no filesystem, no environment
 * reads: a provider supplies those, and lives behind this interface so the
 * gateway and the LLM adapters depend on the seam rather than on a store.
 */
import type { CredentialRef } from "./credentialRef.js";
import type { CredentialDescription } from "./credentialSources.js";

/**
 * Reads and writes credentials by reference.
 *
 * Reads are synchronous and writes are not, and the asymmetry is deliberate on
 * both sides. Reads must be cheap enough to repeat on every single operation —
 * that repetition is what makes a rotated key apply to the next request instead
 * of the next restart — and the call site that matters most, the gateway's
 * outbound-auth step, is synchronous today in a file that has no room to grow.
 * Writes are rare, must serialise against other processes, and must re-check
 * shadowing after they reach the front of the queue, none of which fits in a
 * synchronous call.
 */
export interface CredentialsService {
  /**
   * The value for `ref`, or `null` when no layer configures one.
   *
   * `null` rather than a throw: a missing credential is an ordinary,
   * recoverable condition that callers report by naming the reference (see the
   * gateway's `missing API key env: <name>`), and a typed absence keeps that
   * report from having to parse an error.
   *
   * Consumers must call this per operation. Hoisting the result into a
   * long-lived variable reintroduces the restart-to-rotate behaviour this seam
   * exists to remove, and no provider can undo it from its side. Providers, in
   * turn, must answer from a snapshot their reload keeps current, never from a
   * value captured at construction.
   */
  resolve(ref: CredentialRef): string | null;

  /**
   * What is knowable about `ref` without knowing its value.
   *
   * Safe to render, log, and attach to evidence. The return type has no field a
   * value could occupy and is sealed against gaining one.
   */
  describe(ref: CredentialRef): CredentialDescription;

  /**
   * Stores `value` for `ref` in the writable layer.
   *
   * Rejects loudly rather than storing an unreadable entry when the inherited
   * process environment answers for `ref` (`ShadowedWriteError`) or when the
   * value is empty or whitespace-only (`EmptyCredentialValueError`). The
   * shadowing check must be re-evaluated against a freshly observed environment
   * at the moment of writing, not only when the call was made: the environment
   * can change while a write waits in the queue.
   */
  set(ref: CredentialRef, value: string): Promise<void>;

  /**
   * Removes `ref` from the writable layer.
   *
   * Resolves `true` when an entry was removed and `false` when there was none,
   * so a caller can distinguish "cleared" from "already absent" without a
   * preceding read that would race the write queue. Subject to the same
   * shadowed-write rejection as {@link CredentialsService.set}: a reference the
   * environment supplies cannot be cleared by writing to a lower layer, and
   * pretending otherwise would report a rotation that did not happen.
   */
  unset(ref: CredentialRef): Promise<boolean>;
}
