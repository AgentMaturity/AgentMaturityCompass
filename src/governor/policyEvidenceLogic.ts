import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const POLICY_EVIDENCE_LOGIC_MAX_DEPTH = 6;
export const POLICY_EVIDENCE_LOGIC_MAX_NODES = 64;
export const POLICY_EVIDENCE_LOGIC_MAX_CHILDREN = 16;
export const POLICY_EVIDENCE_LOGIC_MAX_BYTES = 8_192;
export const POLICY_EVIDENCE_LOGIC_MAX_GATES = 60;

const gateIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^(maturity|assurance):(?:[A-Za-z0-9][A-Za-z0-9._-]*|~[a-f0-9]{64})$/);

export type PolicyEvidenceFamily = "maturity" | "assurance";

export interface PolicyEvidenceGateEntry {
  gateId: string;
  family: PolicyEvidenceFamily;
  requirementId: string;
}

export type PolicyEvidenceLogic =
  | { gate: string }
  | { all: PolicyEvidenceLogic[] }
  | { any: PolicyEvidenceLogic[] };

const gateNodeSchema: z.ZodType<PolicyEvidenceLogic> = z.object({
  gate: gateIdSchema,
}).strict() as z.ZodType<PolicyEvidenceLogic>;

const recursivePolicyEvidenceLogicSchema: z.ZodType<PolicyEvidenceLogic> = z.lazy(() => z.union([
  gateNodeSchema,
  z.object({
    all: z.array(recursivePolicyEvidenceLogicSchema)
      .min(2)
      .max(POLICY_EVIDENCE_LOGIC_MAX_CHILDREN),
  }).strict(),
  z.object({
    any: z.array(recursivePolicyEvidenceLogicSchema)
      .min(2)
      .max(POLICY_EVIDENCE_LOGIC_MAX_CHILDREN),
  }).strict(),
]));

function preflightRawStructure(input: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 1 }];
  let nodeCount = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > POLICY_EVIDENCE_LOGIC_MAX_NODES) {
      throw new Error(`Evidence logic node count exceeds ${POLICY_EVIDENCE_LOGIC_MAX_NODES}.`);
    }
    if (depth > POLICY_EVIDENCE_LOGIC_MAX_DEPTH) {
      throw new Error(`Evidence logic depth exceeds ${POLICY_EVIDENCE_LOGIC_MAX_DEPTH}.`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    for (const key of ["all", "any"] as const) {
      if (!Array.isArray(candidate[key])) continue;
      for (let index = candidate[key].length - 1; index >= 0; index -= 1) {
        stack.push({ value: candidate[key][index], depth: depth + 1 });
      }
    }
  }
  const serializedBytes = Buffer.byteLength(JSON.stringify(input), "utf8");
  if (serializedBytes > POLICY_EVIDENCE_LOGIC_MAX_BYTES) {
    throw new Error(`Evidence logic exceeds ${POLICY_EVIDENCE_LOGIC_MAX_BYTES} serialized bytes.`);
  }
}

export const policyEvidenceLogicSchema: z.ZodType<PolicyEvidenceLogic> = z.unknown()
  .transform((input, context): PolicyEvidenceLogic => {
    try {
      preflightRawStructure(input);
      return recursivePolicyEvidenceLogicSchema.parse(input);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid Action Policy evidence logic.",
      });
      return z.NEVER;
    }
  }) as z.ZodType<PolicyEvidenceLogic>;

export interface PolicyEvidenceRuleRequirements {
  minEffectiveQuestionLevels: Record<string, number>;
  requireAssurancePacks: Record<string, { minScore: number; maxSucceeded: number }>;
}

export interface PolicyEvidenceLogicValidation {
  logic: PolicyEvidenceLogic;
  logicSha256: string;
  gateIds: string[];
  gateCount: number;
  nodeCount: number;
  maxDepth: number;
  hasAlternatives: boolean;
}

export interface PolicyEvidenceLogicNodeResult {
  path: string;
  nodeType: "gate" | "all" | "any";
  gateId: string | null;
  passed: boolean;
  unknown: boolean;
}

export interface PolicyEvidenceLogicEvaluation {
  passed: boolean;
  nodes: PolicyEvidenceLogicNodeResult[];
  unknownGateIds: string[];
  blockingGateIds: string[];
}

interface StructureInspection {
  gateIds: string[];
  nodeCount: number;
  maxDepth: number;
  hasAlternatives: boolean;
}

function nodeKind(node: PolicyEvidenceLogic): "gate" | "all" | "any" {
  if ("gate" in node) return "gate";
  return "all" in node ? "all" : "any";
}

function nodeChildren(node: PolicyEvidenceLogic): PolicyEvidenceLogic[] {
  if ("all" in node) return node.all;
  if ("any" in node) return node.any;
  return [];
}

function gateFamily(gateId: string): PolicyEvidenceFamily {
  return gateId.startsWith("maturity:") ? "maturity" : "assurance";
}

function subtreeGateFamilies(node: PolicyEvidenceLogic): Set<"maturity" | "assurance"> {
  if ("gate" in node) return new Set([gateFamily(node.gate)]);
  const families = new Set<"maturity" | "assurance">();
  for (const child of nodeChildren(node)) {
    for (const family of subtreeGateFamilies(child)) families.add(family);
  }
  return families;
}

function inspectStructure(logic: PolicyEvidenceLogic): StructureInspection {
  preflightRawStructure(logic);

  const stack: Array<{ node: PolicyEvidenceLogic; depth: number }> = [{ node: logic, depth: 1 }];
  const gateIds: string[] = [];
  let nodeCount = 0;
  let maxDepth = 0;
  let hasAlternatives = false;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, current.depth);
    if (nodeCount > POLICY_EVIDENCE_LOGIC_MAX_NODES) {
      throw new Error(`Evidence logic node count exceeds ${POLICY_EVIDENCE_LOGIC_MAX_NODES}.`);
    }
    if (current.depth > POLICY_EVIDENCE_LOGIC_MAX_DEPTH) {
      throw new Error(`Evidence logic depth exceeds ${POLICY_EVIDENCE_LOGIC_MAX_DEPTH}.`);
    }
    if ("gate" in current.node) {
      gateIds.push(current.node.gate);
      continue;
    }
    if ("any" in current.node) {
      hasAlternatives = true;
      const families = subtreeGateFamilies(current.node);
      if (families.size !== 1) {
        throw new Error("Each any subtree must contain gates from exactly one evidence family.");
      }
    }
    const children = nodeChildren(current.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index]!, depth: current.depth + 1 });
    }
  }
  return { gateIds, nodeCount, maxDepth, hasAlternatives };
}

function canonicalNode(logic: PolicyEvidenceLogic): PolicyEvidenceLogic {
  if ("gate" in logic) return { gate: logic.gate };
  const kind = nodeKind(logic) as "all" | "any";
  const children = nodeChildren(logic)
    .map((child) => canonicalNode(child))
    .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
  return kind === "all" ? { all: children } : { any: children };
}

export function canonicalizePolicyEvidenceLogic(input: unknown): PolicyEvidenceLogic {
  const parsed = policyEvidenceLogicSchema.parse(input);
  inspectStructure(parsed);
  return canonicalNode(parsed);
}

function semanticNode(logic: PolicyEvidenceLogic): PolicyEvidenceLogic {
  if ("gate" in logic) return { gate: logic.gate };
  const kind = nodeKind(logic) as "all" | "any";
  const flattened: PolicyEvidenceLogic[] = [];
  const collect = (child: PolicyEvidenceLogic): void => {
    if ((kind === "all" && "all" in child) || (kind === "any" && "any" in child)) {
      for (const nested of nodeChildren(child)) collect(nested);
      return;
    }
    flattened.push(semanticNode(child));
  };
  for (const child of nodeChildren(logic)) collect(child);
  flattened.sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
  return kind === "all" ? { all: flattened } : { any: flattened };
}

export function policyEvidenceLogicSemanticHash(input: unknown): string {
  const parsed = policyEvidenceLogicSchema.parse(input);
  inspectStructure(parsed);
  return sha256Hex(canonicalize(semanticNode(parsed)));
}

export function policyEvidenceGateId(family: PolicyEvidenceFamily, requirementId: string): string {
  const direct = `${family}:${requirementId}`;
  if (
    direct.length <= 128
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requirementId)
  ) return direct;
  return `${family}:~${sha256Hex(requirementId)}`;
}

export function policyEvidenceGateEntriesForRule(
  rule: PolicyEvidenceRuleRequirements,
): PolicyEvidenceGateEntry[] {
  return [
    ...Object.keys(rule.minEffectiveQuestionLevels).map((requirementId) => ({
      gateId: policyEvidenceGateId("maturity", requirementId),
      family: "maturity" as const,
      requirementId,
    })),
    ...Object.keys(rule.requireAssurancePacks).map((requirementId) => ({
      gateId: policyEvidenceGateId("assurance", requirementId),
      family: "assurance" as const,
      requirementId,
    })),
  ].sort((left, right) => left.gateId.localeCompare(right.gateId));
}

export function policyEvidenceGateIdsForRule(rule: PolicyEvidenceRuleRequirements): string[] {
  return policyEvidenceGateEntriesForRule(rule).map((entry) => entry.gateId);
}

export function defaultPolicyEvidenceLogicForRule(
  rule: PolicyEvidenceRuleRequirements,
): PolicyEvidenceLogic | null {
  const leaves = policyEvidenceGateIdsForRule(rule).map((gate) => ({ gate }));
  if (leaves.length === 0) return null;
  if (leaves.length === 1) return leaves[0]!;
  if (leaves.length > POLICY_EVIDENCE_LOGIC_MAX_GATES) return null;
  if (leaves.length <= POLICY_EVIDENCE_LOGIC_MAX_CHILDREN) return { all: leaves };

  const groupCount = Math.ceil(
    (leaves.length - POLICY_EVIDENCE_LOGIC_MAX_CHILDREN)
      / (POLICY_EVIDENCE_LOGIC_MAX_CHILDREN - 1),
  );
  let groupedLeavesRemaining = leaves.length - (POLICY_EVIDENCE_LOGIC_MAX_CHILDREN - groupCount);
  let offset = 0;
  const children: PolicyEvidenceLogic[] = [];
  for (let group = 0; group < groupCount; group += 1) {
    const groupsRemaining = groupCount - group - 1;
    const size = Math.min(
      POLICY_EVIDENCE_LOGIC_MAX_CHILDREN,
      groupedLeavesRemaining - (groupsRemaining * 2),
    );
    children.push({ all: leaves.slice(offset, offset + size) });
    offset += size;
    groupedLeavesRemaining -= size;
  }
  children.push(...leaves.slice(offset));
  try {
    return canonicalizePolicyEvidenceLogic({ all: children });
  } catch {
    return null;
  }
}

export function validatePolicyEvidenceLogicForRule(
  input: unknown,
  rule: PolicyEvidenceRuleRequirements,
): PolicyEvidenceLogicValidation {
  const logic = canonicalizePolicyEvidenceLogic(input);
  const structure = inspectStructure(logic);
  const seen = new Set<string>();
  for (const gateId of structure.gateIds) {
    if (seen.has(gateId)) {
      throw new Error(`Duplicate evidence gate or subtree reference: ${gateId}.`);
    }
    seen.add(gateId);
  }

  const allowed = policyEvidenceGateIdsForRule(rule);
  const undeclared = [...seen].filter((gateId) => !allowed.includes(gateId));
  if (undeclared.length > 0) {
    throw new Error(`Evidence logic references gates not declared by this Action Policy rule: ${undeclared.join(", ")}.`);
  }
  const omitted = allowed.filter((gateId) => !seen.has(gateId));
  if (omitted.length > 0 || seen.size !== allowed.length) {
    throw new Error(`Every declared evidence gate must appear exactly once; omitted: ${omitted.join(", ") || "none"}.`);
  }

  return {
    logic,
    logicSha256: sha256Hex(canonicalize(logic)),
    gateIds: [...seen].sort((left, right) => left.localeCompare(right)),
    gateCount: seen.size,
    nodeCount: structure.nodeCount,
    maxDepth: structure.maxDepth,
    hasAlternatives: structure.hasAlternatives,
  };
}

export function evaluatePolicyEvidenceLogic(
  input: unknown,
  gateResults: Record<string, boolean | null | undefined>,
): PolicyEvidenceLogicEvaluation {
  const logic = canonicalizePolicyEvidenceLogic(input);
  const nodes: PolicyEvidenceLogicNodeResult[] = [];
  const unknownGateIds = new Set<string>();

  const visit = (node: PolicyEvidenceLogic, path: string): { passed: boolean; blockers: Set<string> } => {
    if ("gate" in node) {
      const actual = gateResults[node.gate];
      const unknown = typeof actual !== "boolean";
      if (unknown) unknownGateIds.add(node.gate);
      const passed = actual === true;
      nodes.push({ path, nodeType: "gate", gateId: node.gate, passed, unknown });
      return { passed, blockers: passed ? new Set() : new Set([node.gate]) };
    }

    const kind = nodeKind(node) as "all" | "any";
    const results = nodeChildren(node).map((child, index) => visit(child, `${path}.${kind}[${index}]`));
    const passed = kind === "all"
      ? results.every((result) => result.passed)
      : results.some((result) => result.passed);
    nodes.push({ path, nodeType: kind, gateId: null, passed, unknown: false });
    if (passed) return { passed, blockers: new Set() };
    const blockers = new Set<string>();
    for (const result of results) {
      if (!result.passed) {
        for (const gateId of result.blockers) blockers.add(gateId);
      }
    }
    return { passed, blockers };
  };

  const result = visit(logic, "$logic");
  return {
    passed: result.passed,
    nodes,
    unknownGateIds: [...unknownGateIds].sort((left, right) => left.localeCompare(right)),
    blockingGateIds: [...result.blockers].sort((left, right) => left.localeCompare(right)),
  };
}

export function renderPolicyEvidenceLogic(input: unknown): string {
  const logic = canonicalizePolicyEvidenceLogic(input);
  const render = (node: PolicyEvidenceLogic): string => {
    if ("gate" in node) return node.gate;
    const kind = nodeKind(node) as "all" | "any";
    return `${kind.toUpperCase()}(${nodeChildren(node).map((child) => render(child)).join(", ")})`;
  };
  return render(logic);
}
