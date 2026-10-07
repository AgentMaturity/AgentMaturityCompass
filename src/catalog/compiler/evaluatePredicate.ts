/**
 * Three-valued (Kleene) evaluation of the applicability grammar (P1-10). A fact whose value is null is unknown and
 * stays unknown: `all` is false if any child is false, else unknown if any child is unknown; `any` is true if any child
 * is true, else unknown if any child is unknown; `not` keeps unknown. An unknown operator or fact throws.
 */
import { FACT_NAMES } from "../schema.js";
import type { FactName, Predicate } from "../types.js";
import type { DeploymentProfile, Fact } from "./types.js";

export type Truth = "true" | "false" | "unknown";
export interface PredicateResult {
  value: Truth;
  /** The unknown facts the result depends on; empty unless `value` is unknown. */
  missingFacts: FactName[];
  /** Each leaf clause with its fact value and provenance. */
  clauses: string[];
}

interface Node { value: Truth; missing: Set<FactName> }

const known = (value: Truth): Node => ({ value, missing: new Set() });
const unknownOf = (nodes: Node[]): Node => ({ value: "unknown", missing: new Set(nodes.filter((n) => n.value === "unknown").flatMap((n) => [...n.missing])) });

export function evaluatePredicate(p: Predicate, profile: DeploymentProfile): PredicateResult {
  const clauses: string[] = [];
  const leaf = (fact: FactName, op: string, terms: string[]): Node => {
    if (!(FACT_NAMES as readonly string[]).includes(fact)) throw new Error(`unknown fact in predicate: ${fact}`);
    const f = profile[fact] as Fact<string | string[]>;
    const clause = `${fact} ${op} ${JSON.stringify(op === "equals" ? terms[0] : terms)}`;
    if (f.value === null) {
      clauses.push(`${clause}: unknown (${fact} is not known)`);
      return { value: "unknown", missing: new Set([fact]) };
    }
    if ((op === "equals") === Array.isArray(f.value)) throw new Error(`predicate operator ${op} does not fit fact ${fact}`);
    const values = Array.isArray(f.value) ? f.value : [f.value];
    const hit = op === "includesAll" ? terms.every((t) => values.includes(t)) : terms.some((t) => values.includes(t));
    clauses.push(`${clause}: ${hit} (value ${JSON.stringify(f.value)}, ${f.provenance})`);
    return known(hit ? "true" : "false");
  };
  const walk = (node: Predicate): Node => {
    if ("always" in node) {
      clauses.push("always: true");
      return known("true");
    }
    if ("all" in node) {
      const kids = node.all.map(walk);
      return kids.some((k) => k.value === "false") ? known("false") : kids.some((k) => k.value === "unknown") ? unknownOf(kids) : known("true");
    }
    if ("any" in node) {
      const kids = node.any.map(walk);
      return kids.some((k) => k.value === "true") ? known("true") : kids.some((k) => k.value === "unknown") ? unknownOf(kids) : known("false");
    }
    if ("not" in node) {
      const kid = walk(node.not);
      return kid.value === "unknown" ? kid : known(kid.value === "true" ? "false" : "true");
    }
    if ("fact" in node) {
      if ("equals" in node) return leaf(node.fact, "equals", [node.equals]);
      if ("includesAny" in node) return leaf(node.fact, "includesAny", node.includesAny);
      if ("includesAll" in node) return leaf(node.fact, "includesAll", node.includesAll);
    }
    throw new Error(`unknown predicate operator: ${JSON.stringify(node)}`);
  };
  const result = walk(p);
  return { value: result.value, missingFacts: [...result.missing].sort(), clauses };
}
