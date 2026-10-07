/**
 * The declarative applicability grammar: parse and static validation only. Evaluation is P1-10's
 * (`evaluatePredicate`). A predicate is data; nothing here evaluates or imports it.
 */
import { predicateSchema, type CatalogIssue, type Vocabulary } from "./schema.js";
import type { FactName, Predicate } from "./types.js";

export const PREDICATE_LIMITS = { maxDepth: 8, maxNodes: 64 } as const;

/** The vocabulary list each fact's terms must come from. */
const FACT_TERMS: Readonly<Record<FactName, keyof Vocabulary>> = {
  stations: "stations", primaryStation: "stations", domains: "domains", jurisdictions: "jurisdictions", roles: "roles",
  entityTypes: "entityTypes", riskClass: "riskClasses", useCases: "useCases", dataClasses: "dataClasses"
};
/** Facts with one value take `equals`; list facts take `includesAny` or `includesAll`. */
const SCALAR_FACTS: ReadonlySet<FactName> = new Set(["primaryStation", "riskClass"]);

interface Where { file: string; controlId: string | null; path: string }

/** Parses one predicate or throws, naming the first problem. Unknown keys, unknown facts and oversize trees fail. */
export function parsePredicate(value: unknown): Predicate {
  const parsed = predicateSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`invalid predicate: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
  }
  const limit = limitProblem(parsed.data);
  if (limit) throw new Error(`invalid predicate: ${limit}`);
  return parsed.data;
}

function children(p: Predicate): Predicate[] {
  if ("all" in p) return p.all;
  if ("any" in p) return p.any;
  if ("not" in p) return [p.not];
  return [];
}

function limitProblem(root: Predicate): string | null {
  let nodes = 0;
  let deepest = 0;
  const walk = (p: Predicate, depth: number): void => {
    nodes += 1;
    deepest = Math.max(deepest, depth);
    if (nodes <= PREDICATE_LIMITS.maxNodes && depth <= PREDICATE_LIMITS.maxDepth) for (const child of children(p)) walk(child, depth + 1);
  };
  walk(root, 1);
  if (deepest > PREDICATE_LIMITS.maxDepth) return `deeper than ${PREDICATE_LIMITS.maxDepth} levels`;
  if (nodes > PREDICATE_LIMITS.maxNodes) return `more than ${PREDICATE_LIMITS.maxNodes} nodes`;
  return null;
}

/** Static checks: size limits, operator fits the fact, every term is in catalog/vocabulary.yaml. */
export function validatePredicate(p: Predicate, vocabulary: Vocabulary, where: Where = { file: "", controlId: null, path: "" }): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, severity: "error", ...where, path, message });
  const limit = limitProblem(p);
  if (limit) {
    add("CAT_SCHEMA", where.path, `predicate is ${limit}`);
    return issues;
  }
  const walk = (node: Predicate, path: string): void => {
    if ("all" in node) node.all.forEach((child, i) => walk(child, `${path}.all.${i}`));
    else if ("any" in node) node.any.forEach((child, i) => walk(child, `${path}.any.${i}`));
    else if ("not" in node) walk(node.not, `${path}.not`);
    else if ("fact" in node) {
      const scalar = SCALAR_FACTS.has(node.fact);
      if (scalar !== ("equals" in node)) add("CAT_SCHEMA", path, `fact ${node.fact} takes ${scalar ? "equals" : "includesAny or includesAll"}`);
      const terms = "equals" in node ? [node.equals] : "includesAny" in node ? node.includesAny : node.includesAll;
      const known: readonly string[] = vocabulary[FACT_TERMS[node.fact]];
      for (const t of terms) if (!known.includes(t)) add("CAT_VOCAB", path, `"${t}" is not a ${FACT_TERMS[node.fact]} term in catalog/vocabulary.yaml`);
    }
  };
  walk(p, where.path);
  return issues;
}
