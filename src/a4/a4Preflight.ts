/**
 * Activate's effect pre-flights (P1-62): what an effect that mints a lease checks before its first side effect, so a
 * refusal leaves nothing revoked, written, minted or signed. Kept apart from src/a4/a4Package.ts, which imports it.
 */
import { LeasePrincipalRefused } from "../leases/leasePrincipal.js";
import type { A4Principal } from "./a4Schema.js";
import { fail } from "./stages/common.js";

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
