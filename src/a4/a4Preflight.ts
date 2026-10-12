/**
 * Activate's effect pre-flights (P1-62): what an effect that mints a lease checks before its first side effect, so a
 * refusal leaves nothing revoked, written, minted or signed. Kept apart from src/a4/a4Package.ts, which imports it.
 */
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { getSigningKey } from "../keys/signingKeys.js";
import { LeasePrincipalRefused } from "../leases/leasePrincipal.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";
import type { A4Principal } from "./a4Schema.js";
import { fail } from "./stages/common.js";

/** The vault's own refusal ("🔐 Vault locked…"), which every step that signs with a vault key throws uncoded. */
export const vaultLocked = (error: unknown): boolean => /vault locked/i.test(error instanceof Error ? error.message : String(error));

/**
 * The vault purpose keys (P1-08) a step signs with, read in any signing mode before its first side effect, so a key that
 * cannot sign refuses it before anything is revoked, written, minted or signed, never part-way through: a locked vault
 * 423 A4_VAULT_LOCKED; a key the workspace key revocation list names 409 A4_KEY_REVOKED, naming the purpose and the
 * recovery (`amc keys rotate --purpose <purpose>`), never "vault locked"; any other read failure (an unreadable or
 * unverifiable revocation list, an incomplete key set) 409 SIGNING_FAILED with its reason. `what` completes "unlock the vault to …".
 */
export function assertPurposeKeys(workspace: string, purposes: readonly LocalPurpose[], what: string): void {
  for (const purpose of purposes) {
    try {
      getSigningKey(workspace, purpose);
    } catch (error) {
      if (error instanceof KeyRevokedError) throw fail(409, "A4_KEY_REVOKED", `cannot ${what}: ${error.message}`, { purpose });
      if (vaultLocked(error)) throw fail(423, "A4_VAULT_LOCKED", `unlock the vault to ${what}`);
      throw fail(409, "SIGNING_FAILED", `cannot ${what}: the ${purpose} key cannot be read (${(error instanceof Error ? error.message : String(error)).slice(0, 200)})`, { purpose });
    }
  }
}

/**
 * `run` (resolveLeasePrincipal, or issueLeaseForPrincipal) for `principal`, the human who runs the effect and never a
 * body field, with P1-78's refusal as the effect answers it: 409 PRINCIPAL_UNRESOLVED naming them. Layer 0's mandatory
 * L0-IDN-01 makes a plan require a principal for every tool call, and a call under a lease naming no active users.yaml
 * user is refused; so under such a plan, or one that does not verify, a principal who is not an active local users.yaml
 * user (a workspace-router session included) gets no lease. Under any other plan the lease names them when they
 * resolve, else no one.
 */
export function asLeasePrincipal<T>(principal: Pick<A4Principal, "key" | "username">, run: (principalKey: string) => T): T {
  try {
    return run(principal.key);
  } catch (error) {
    if (!(error instanceof LeasePrincipalRefused)) throw error;
    throw fail(409, "PRINCIPAL_UNRESOLVED", `${principal.username} (${principal.key}) runs this effect, but ${error.message.replace(/^PRINCIPAL_UNRESOLVED: /, "")}. `
      + "An owner signed in as an active local users.yaml user runs it.");
  }
}
