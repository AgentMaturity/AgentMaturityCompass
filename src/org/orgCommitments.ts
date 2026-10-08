import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { questionBank } from "../diagnostic/questionBank.js";
import { notEvaluatedLevel } from "../diagnostic/levelSemantics.js";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { signFileWithAuditor } from "./orgSigner.js";
import { orgCommitmentsDir } from "./orgStore.js";
import type { OrgNodeScorecard, OrgScorecard } from "./orgSchema.js";

function findNode(scorecard: OrgScorecard, nodeId: string): OrgNodeScorecard {
  const node = scorecard.nodes.find((row) => row.nodeId === nodeId);
  if (!node) {
    throw new Error(`Node not found in scorecard: ${nodeId}`);
  }
  return node;
}

function writeOrgAudit(params: {
  workspace: string;
  nodeId: string;
  auditType: string;
  payload: Record<string, unknown>;
}): string {
  const ledger = openLedger(params.workspace);
  const sessionId = `org-${randomUUID()}`;
  const body = JSON.stringify({
    nodeId: params.nodeId,
    auditType: params.auditType,
    ...params.payload
  });
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-org",
      binarySha256: sha256Hex("amc-org")
    });
    const event = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: body,
      payloadExt: "json",
      inline: true,
      meta: {
        trustTier: "OBSERVED",
        auditType: params.auditType,
        nodeId: params.nodeId,
        ...params.payload
      },
      receipt: {
        kind: "guard_check",
        agentId: "org",
        providerId: "unknown",
        model: null,
        bodySha256: sha256Hex(Buffer.from(body, "utf8"))
      }
    });
    ledger.sealSession(sessionId);
    return event.id;
  } finally {
    ledger.close();
  }
}

function writeSignedCommitmentFile(params: {
  workspace: string;
  nodeId: string;
  commitId: string;
  body: string;
}): { path: string; sigPath: string; sha256: string } {
  const outPath = join(orgCommitmentsDir(params.workspace), params.nodeId, `${params.commitId}.md`);
  ensureDir(dirname(outPath));
  writeFileAtomic(outPath, params.body, 0o644);
  const sigPath = signFileWithAuditor(params.workspace, outPath);
  return {
    path: outPath,
    sigPath,
    sha256: sha256Hex(readUtf8(outPath))
  };
}

export function generateOrgEducationBrief(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
}): {
  commitId: string;
  outPath: string;
  sigPath: string;
  markdown: string;
  auditEventId: string;
} {
  const node = findNode(params.scorecard, params.nodeId);
  const commitId = `learn_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const gapIds = node.topGapQuestions.slice(0, 7).map((row) => row.questionId);
  const lines = [
    `# Org Education Brief — ${node.name}`,
    "",
    `Node: ${node.nodeId}`,
    `Headline maturity: ${node.headline.median.toFixed(3)}`,
    `Trust: ${node.trustLabel}`,
    "",
    "## Top 7 Gaps",
    ...node.topGapQuestions.slice(0, 7).map((gap) => `- ${gap.questionId}: gap ${gap.gap.toFixed(2)} (current ${gap.currentMedian.toFixed(2)}, target ${gap.targetMedian.toFixed(2)})`),
    "",
    "## What Levels Require",
    ...gapIds.flatMap((qid) => {
      const question = questionBank.find((row) => row.id === qid);
      if (!question) {
        return [`- ${qid}: question metadata unavailable`];
      }
      return [
        `### ${question.id} — ${question.title}`,
        `- Evidence gates: ${question.evidenceGateHints}`,
        `- Upgrade path: ${question.upgradeHints}`,
        `- Tuning knobs: ${question.tuningKnobs.join(", ")}`,
        ""
      ];
    }),
    ""
  ];
  const markdown = lines.join("\n");
  const written = writeSignedCommitmentFile({
    workspace: params.workspace,
    nodeId: params.nodeId,
    commitId,
    body: markdown
  });

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ORG_EDUCATION_CREATED",
    agentId: "org",
    artifact: {
      kind: "policy",
      sha256: written.sha256,
      id: commitId
    }
  });

  const auditEventId = writeOrgAudit({
    workspace: params.workspace,
    nodeId: params.nodeId,
    auditType: "ORG_EDUCATION_CREATED",
    payload: {
      commitId,
      path: written.path,
      sha256: written.sha256
    }
  });

  return {
    commitId,
    outPath: written.path,
    sigPath: written.sigPath,
    markdown,
    auditEventId
  };
}

export function generateOrgOwnershipPlan(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
}): {
  commitId: string;
  outPath: string;
  sigPath: string;
  markdown: string;
  auditEventId: string;
} {
  const node = findNode(params.scorecard, params.nodeId);
  const commitId = `own_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const lines = [
    `# Org Ownership Map — ${node.name}`,
    "",
    `Node: ${node.nodeId}`,
    `Trust: ${node.trustLabel}`,
    "",
    "## OWNER Responsibilities",
    "- Maintain signed org/policy/budget/gate configs and vault hygiene.",
    "- Enforce CI gates, review freezes, and approve high-impact changes.",
    "- Ensure lease, sandbox, and transparency controls remain active.",
    "",
    "## OPERATOR Responsibilities",
    "- Run diagnostics/assurance/outcomes on cadence and publish scorecards.",
    "- Monitor SSE updates, incidents, and evidence gaps across nodes.",
    "- Keep exports (bundles/certs/BOM) current for audits.",
    "",
    "## APPROVER/AUDITOR Responsibilities",
    "- Review dual-control approvals and deny unsafe execute requests.",
    "- Validate attestation paths and cert issuance conditions.",
    "- Verify transparency chain and merkle root health.",
    "",
    "## AGENT Responsibilities",
    "- Follow truth protocol and evidence-linking discipline.",
    "- Use ToolHub/Gateway properly; avoid bypass attempts.",
    "- Escalate for approvals whenever execute conditions are not met.",
    ""
  ];
  const markdown = lines.join("\n");
  const written = writeSignedCommitmentFile({
    workspace: params.workspace,
    nodeId: params.nodeId,
    commitId,
    body: markdown
  });

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ORG_OWNERSHIP_CREATED",
    agentId: "org",
    artifact: {
      kind: "policy",
      sha256: written.sha256,
      id: commitId
    }
  });

  const auditEventId = writeOrgAudit({
    workspace: params.workspace,
    nodeId: params.nodeId,
    auditType: "ORG_OWNERSHIP_CREATED",
    payload: {
      commitId,
      path: written.path,
      sha256: written.sha256
    }
  });

  return {
    commitId,
    outPath: written.path,
    sigPath: written.sigPath,
    markdown,
    auditEventId
  };
}

export function generateOrgCommitmentPlan(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
  days: 14 | 30 | 90;
}): {
  commitId: string;
  outPath: string;
  sigPath: string;
  markdown: string;
  auditEventId: string;
} {
  const node = findNode(params.scorecard, params.nodeId);
  const commitId = `commit_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const topGaps = node.topGapQuestions.slice(0, 10);
  // P1-07: a gap that crosses a level AMC cannot evaluate gets that level's reason, never a promise to unlock it.
  const notEvaluated = (gap: (typeof topGaps)[number]): string | undefined => {
    const blocked = notEvaluatedLevel(questionBank.find((q) => q.id === gap.questionId), gap.currentMedian, gap.targetMedian);
    return blocked ? `${gap.questionId}: ${blocked.notice}` : undefined;
  };
  const lines = [
    `# Org Commitment Plan — ${node.name}`,
    "",
    `Commitment ID: ${commitId}`,
    `Duration: ${params.days} days`,
    `Node: ${node.nodeId}`,
    `Trust: ${node.trustLabel}`,
    "",
    "## Prioritized Initiatives",
    ...topGaps.map((gap) => `- [ ] ${notEvaluated(gap) ?? `Close ${gap.questionId} gap ${gap.gap.toFixed(2)} by collecting missing evidence.`}`),
    "",
    "## Required Evidence To Unlock Next Levels",
    ...topGaps.map((gap) => `- [ ] ${notEvaluated(gap) ?? `${gap.questionId}: at least 5 sessions across 7 days with OBSERVED evidence and stable correlation.`}`),
    "",
    "## Commands",
    "- amc verify",
    "- amc org score --window 14d",
    "- amc run --window 14d --target default",
    "- amc assurance run --all --mode sandbox",
    "- amc outcomes report --window 14d",
    "",
    "## Regression Protection",
    "- [ ] Keep CI gates active for integrity, assurance, and value thresholds.",
    "- [ ] Freeze EXECUTE on drift regression until remediation is verified.",
    "- [ ] Require dual-control approvals for high-impact actions.",
    ""
  ];

  const markdown = lines.join("\n");
  const written = writeSignedCommitmentFile({
    workspace: params.workspace,
    nodeId: params.nodeId,
    commitId,
    body: markdown
  });

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ORG_COMMITMENT_CREATED",
    agentId: "org",
    artifact: {
      kind: "policy",
      sha256: written.sha256,
      id: commitId
    }
  });

  const auditEventId = writeOrgAudit({
    workspace: params.workspace,
    nodeId: params.nodeId,
    auditType: "ORG_COMMITMENT_CREATED",
    payload: {
      commitId,
      days: params.days,
      path: written.path,
      sha256: written.sha256
    }
  });

  return {
    commitId,
    outPath: written.path,
    sigPath: written.sigPath,
    markdown,
    auditEventId
  };
}
