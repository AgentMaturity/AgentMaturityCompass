/** The live facts readiness reads (freeze, read-only, principal population), split out of a4Store for its line budget. */
import { verifyUsersConfigSignature } from "../auth/authApi.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { principalPopulation } from "./a4Identity.js";
import type { A4ProjectRow } from "./a4Schema.js";

/** Studio's read-only rule (users or trust signature invalid), re-read here because studioServer keeps it private; `amc a4` refuses writes on it. */
export function readOnlyNow(workspace: string): boolean | null {
  try {
    const users = verifyUsersConfigSignature(workspace);
    return (users.signatureExists && !users.valid) || !verifyTrustConfigSignature(workspace).valid;
  } catch {
    return null;
  }
}

/** Freeze and read-only facts; P1-57 calls this inside the transaction for consume, complete and effect transitions. Null = unreadable. */
export function refreshVolatileFacts(workspace: string, project: Pick<A4ProjectRow, "agent_id">): {
  freeze: ReturnType<typeof activeFreezeStatus> | null; readOnly: boolean | null;
} {
  let freeze: ReturnType<typeof activeFreezeStatus> | null;
  try {
    freeze = activeFreezeStatus(workspace, project.agent_id);
  } catch {
    freeze = null;
  }
  return { freeze, readOnly: readOnlyNow(workspace) };
}

/** The live facts readiness reads; each source the store cannot read is null, never "all clear". Stage lanes add theirs. */
export function collectLiveFacts(workspace: string, project: Pick<A4ProjectRow, "agent_id">, options: { hostedRouter: boolean }): {
  activeLocal: string[] | null; hostPrincipals: number | null; hostedRouter: boolean
} & ReturnType<typeof refreshVolatileFacts> {
  return { ...principalPopulation(workspace), hostedRouter: options.hostedRouter, ...refreshVolatileFacts(workspace, project) };
}
