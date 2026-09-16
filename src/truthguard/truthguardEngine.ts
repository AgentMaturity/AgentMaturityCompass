import { truthguardOutputSchema, truthguardResultSchema, type TruthguardOutput, type TruthguardResult } from "./truthguardSchema.js";
import { SECRET_PATTERNS, CLAIM_ACTION_RE, allowedByPatterns, extractTaggedValues, redactSnippet } from "./truthguardRules.js";
import { hasSufficientDomainProofRef, requiresDomainCorrectnessProof } from "../domainProof/domainProofSchema.js";

export interface TruthguardValidationInput {
  output: unknown;
  allowedTools: string[];
  allowedModels: string[];
  knownEvidenceRefs?: Set<string>;
}

function appendSecretViolations(params: {
  path: string;
  text: string;
  out: TruthguardResult["violations"];
}): void {
  for (const rule of SECRET_PATTERNS) {
    for (const match of params.text.matchAll(rule.re)) {
      const value = match[0] ?? "";
      params.out.push({
        kind: "SECRET_PATTERN",
        path: params.path,
        message: `secret-like pattern detected (${rule.type})`,
        snippetRedacted: redactSnippet(value)
      });
    }
  }
}

function appendTaggedAllowlistViolations(params: {
  path: string;
  text: string;
  allowedTools: string[];
  allowedModels: string[];
  out: TruthguardResult["violations"];
}): void {
  const taggedTools = extractTaggedValues(params.text, "tool");
  for (const tool of taggedTools) {
    if (!allowedByPatterns(params.allowedTools, tool)) {
      params.out.push({
        kind: "DISALLOWED_TOOL",
        path: params.path,
        message: `tool not allowed by policy: ${tool}`,
        snippetRedacted: redactSnippet(tool)
      });
    }
  }
  const taggedModels = extractTaggedValues(params.text, "model");
  for (const model of taggedModels) {
    if (!allowedByPatterns(params.allowedModels, model)) {
      params.out.push({
        kind: "DISALLOWED_MODEL",
        path: params.path,
        message: `model not allowed by policy: ${model}`,
        snippetRedacted: redactSnippet(model)
      });
    }
  }
}

function verifyEvidenceRefs(params: {
  output: TruthguardOutput;
  knownEvidenceRefs?: Set<string>;
  out: TruthguardResult["violations"];
  missingEvidenceRefs: Set<string>;
}): void {
  for (let i = 0; i < params.output.claims.length; i += 1) {
    const claim = params.output.claims[i]!;
    const refs = claim.evidenceRefs ?? [];
    const path = `claims[${i}]`;
    if (CLAIM_ACTION_RE.test(claim.text) && refs.length === 0) {
      params.out.push({
        kind: "MISSING_EVIDENCE_REF",
        path,
        message: "claim indicates completed action but has no evidenceRefs",
        snippetRedacted: redactSnippet(claim.text)
      });
      continue;
    }
    if (!params.knownEvidenceRefs || refs.length === 0) {
      continue;
    }
    for (const ref of refs) {
      if (!params.knownEvidenceRefs.has(ref)) {
        params.out.push({
          kind: "MISSING_EVIDENCE_REF",
          path,
          message: `evidenceRef not found: ${ref}`,
          snippetRedacted: redactSnippet(ref)
        });
        params.missingEvidenceRefs.add(ref);
      }
    }
  }
}

function verifyDomainCorrectnessProofClaims(params: {
  output: TruthguardOutput;
  out: TruthguardResult["violations"];
}): void {
  for (let i = 0; i < params.output.claims.length; i += 1) {
    const claim = params.output.claims[i]!;
    const path = `claims[${i}]`;
    const claimsDomainCorrectness = requiresDomainCorrectnessProof(claim.text);
    const claimsProvenStatus = claim.correctnessProofStatus === "proven";
    if (!claimsDomainCorrectness && !claimsProvenStatus) {
      continue;
    }
    if (hasSufficientDomainProofRef({
      correctnessProofStatus: claim.correctnessProofStatus,
      domainProofRefs: claim.domainProofRefs
    })) {
      continue;
    }
    params.out.push({
      kind: "UNSUPPORTED_CORRECTNESS_PROOF",
      path,
      message: "domain-correctness proof claims require correctnessProofStatus=proven and at least one domainProofRefs amcproof artifact",
      snippetRedacted: redactSnippet(claim.text)
    });
  }
}

export function validateTruthguardOutput(input: TruthguardValidationInput): TruthguardResult {
  const output = truthguardOutputSchema.parse(input.output);
  const violations: TruthguardResult["violations"] = [];
  const missingEvidenceRefs = new Set<string>();

  appendSecretViolations({
    path: "answer",
    text: output.answer,
    out: violations
  });
  appendTaggedAllowlistViolations({
    path: "answer",
    text: output.answer,
    allowedTools: input.allowedTools,
    allowedModels: input.allowedModels,
    out: violations
  });

  for (let i = 0; i < output.claims.length; i += 1) {
    const claim = output.claims[i]!;
    const path = `claims[${i}]`;
    appendSecretViolations({
      path,
      text: claim.text,
      out: violations
    });
    appendTaggedAllowlistViolations({
      path,
      text: claim.text,
      allowedTools: input.allowedTools,
      allowedModels: input.allowedModels,
      out: violations
    });
  }

  for (let i = 0; i < output.unknowns.length; i += 1) {
    const row = output.unknowns[i]!;
    appendSecretViolations({
      path: `unknowns[${i}]`,
      text: row.text,
      out: violations
    });
  }

  verifyEvidenceRefs({
    output,
    knownEvidenceRefs: input.knownEvidenceRefs,
    out: violations,
    missingEvidenceRefs
  });
  verifyDomainCorrectnessProofClaims({
    output,
    out: violations
  });

  violations.sort((a, b) => {
    const left = `${a.kind}:${a.path}:${a.message}`;
    const right = `${b.kind}:${b.path}:${b.message}`;
    return left.localeCompare(right);
  });

  const reasons = [...new Set(violations.map((row) => row.message))].sort((a, b) => a.localeCompare(b));
  const missingRefs = [...missingEvidenceRefs].sort((a, b) => a.localeCompare(b));
  return truthguardResultSchema.parse({
    v: 1,
    status: violations.length === 0 ? "PASS" : "FAIL",
    reasons,
    missingEvidenceRefs: missingRefs,
    violations
  });
}
