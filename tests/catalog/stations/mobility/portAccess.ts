import type { LocalOutcome } from "./protocol.js";

interface PortOutcome extends LocalOutcome {
  openedRequests: string[];
  decisions: Array<{ requestId: string; result: "allow" | "deny" | "not_evaluated"; reasonCode: string; level: 1 | 2 | 3 | null; revision: number }>;
  currentLevel: 1 | 2 | 3 | null;
}
/** Stage1 stub; no gate is opened. */
export function runPortAccess(_input: unknown): PortOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", openedRequests: [], decisions: [], currentLevel: null };
}
