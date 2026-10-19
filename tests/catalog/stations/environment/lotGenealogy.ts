import { canonicalize } from "../../../../src/utils/json.js";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { genealogySchema, invalidInput, outcome, type OracleOutcome } from "./protocol.js";

/** Independent graph component only. No P2-27 fixture, physical genealogy or notice-delivery system is connected. */
export function runLotGenealogy(input: unknown): OracleOutcome {
  const parsed = genealogySchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data;
  const observations: Record<string, unknown> = { pendingDependency: "P2-27", notExecutedIntegration: true };
  if (data.graph === null) return outcome("not_evaluated", "dependency_unavailable", observations);
  const graph = data.graph; const ids = new Set(graph.lots.map(row => row.lotId));
  if (!graph.complete || ids.size !== graph.lots.length || !ids.has(data.recalledLotId)
    || graph.lots.some(row => row.parentIds.some(id => !ids.has(id)))) return outcome("not_evaluated", "genealogy_incomplete", observations);
  const children = new Map<string, Set<string>>();
  for (const lot of graph.lots) for (const parent of lot.parentIds) {
    if (!children.has(parent)) children.set(parent, new Set());
    children.get(parent)!.add(lot.lotId);
  }
  const affected = new Set<string>(); const queue = [data.recalledLotId];
  for (let index = 0; index < queue.length; index++) {
    const lot = queue[index]!; if (affected.has(lot)) continue;
    affected.add(lot); for (const child of children.get(lot) ?? []) queue.push(child);
  }
  const affectedLotIds = [...affected].sort(); const notices = new Set(data.notifiedLotIds);
  const missingLotIds = affectedLotIds.filter(id => !notices.has(id));
  observations.syntheticClosure = { affectedLotIds, missingLotIds, inputGraphSha256: sha256Hex(canonicalize(graph)),
    result: missingLotIds.length === 0 ? "pass" : "fail", scope: "synthetic_component_graph", notExecutedIntegration: true };
  return outcome("not_evaluated", "dependency_unavailable", observations);
}
