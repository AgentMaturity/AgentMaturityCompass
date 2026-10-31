import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { questionBank } from "../diagnostic/questionBank.js";
import { notEvaluatedLevel } from "../diagnostic/levelSemantics.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { publishOrgPairs, prepareOrgPairsAsync } from "./preparedOrgPairs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgCommitmentAuthority, prepareOrgCommitmentMirror, OrgFollowupError, type OrgEffectOptions } from "./orgPublication.js";
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

type PreparedCommitment = { nodeId: string; commitId: string; markdown: string; days?: 14 | 30 | 90 };
type CommitmentType = "ORG_EDUCATION_CREATED" | "ORG_OWNERSHIP_CREATED" | "ORG_COMMITMENT_CREATED";
type CommitmentResult = { commitId: string; outPath: string; sigPath: string; markdown: string; auditEventId: string };
export interface OrgCommitmentOptions extends OrgEffectOptions { outFile?: string }
function commitmentPath(workspace: string, prepared: PreparedCommitment): string {
  return join(orgCommitmentsDir(workspace), prepared.nodeId, `${prepared.commitId}.md`);
}
function auditCommitment(workspace: string, prepared: PreparedCommitment, path: string, sha256: string, type: CommitmentType) {
  return writeOrgAudit({ workspace, nodeId: prepared.nodeId, auditType: type, payload: {
    commitId: prepared.commitId, ...(prepared.days === undefined ? {} : { days: prepared.days }), path, sha256
  } });
}
function publishCommitmentSync(workspace: string, prepared: PreparedCommitment, type: CommitmentType): CommitmentResult {
  const path = commitmentPath(workspace, prepared), bytes = Buffer.from(prepared.markdown), digest = sha256Hex(bytes);
  const written = publishOrgPairs(workspace, [{ path, bytes }])[0]!;
  let phase: "log" | "audit" = "log", entryHash: string | null = null;
  const paths = Object.freeze([relative(workspace, written.path), relative(workspace, written.sigPath)]);
  try {
    entryHash = appendTransparencyEntry({ workspace, type, agentId: "org", artifact: { kind: "policy", sha256: digest, id: prepared.commitId } }).hash;
    phase = "audit";
    const auditEventId = auditCommitment(workspace, prepared, path, digest, type);
    return { commitId: prepared.commitId, outPath: written.path, sigPath: written.sigPath, markdown: prepared.markdown, auditEventId };
  } catch (error) { throw new OrgFollowupError(phase, paths, null, error, entryHash); }
}
async function publishCommitmentAsync(workspace: string, doc: PreparedCommitment, type: CommitmentType,
  assertOriginal: () => void, outFile?: string): Promise<CommitmentResult> {
  const path = commitmentPath(workspace, doc), bytes = Buffer.from(doc.markdown), digest = sha256Hex(bytes);
  const mirror = prepareOrgCommitmentMirror(workspace, outFile, path);
  const prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes }], { beforePublish: assertOriginal });
  const written = prepared.publish()[0]!, paths = Object.freeze([relative(workspace, written.path), relative(workspace, written.sigPath)]);
  let phase: "log" | "audit" | "mirror" = "log", entryHash: string | null = null, auditEventId: string | null = null;
  try {
    const entry = await appendTransparencyEntryAsync({ workspace, type, agentId: "org",
      artifact: { kind: "policy", sha256: digest, id: doc.commitId } }, { beforeCommit: () => {
      withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation: prepared.assertCurrent });
    } });
    entryHash = entry.hash; phase = "audit"; prepared.assertCurrent();
    auditEventId = auditCommitment(workspace, doc, path, digest, type);
    phase = "mirror"; mirror.publish(doc.markdown, prepared.assertCurrent);
    return { commitId: doc.commitId, outPath: written.path, sigPath: written.sigPath, markdown: doc.markdown, auditEventId };
  } catch (error) { throw new OrgFollowupError(phase, paths, auditEventId, error, entryHash, phase === "mirror" ? mirror.path : null); }
}

function prepareOrgEducationBrief(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
}): PreparedCommitment {
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
  return { nodeId: params.nodeId, commitId, markdown };
}

function prepareOrgOwnershipPlan(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
}): PreparedCommitment {
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
  return { nodeId: params.nodeId, commitId, markdown };
}

function prepareOrgCommitmentPlan(params: {
  workspace: string;
  scorecard: OrgScorecard;
  nodeId: string;
  days: 14 | 30 | 90;
}): PreparedCommitment {
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
  return { nodeId: params.nodeId, commitId, markdown, days: params.days };
}

export function generateOrgEducationBrief(params: Parameters<typeof prepareOrgEducationBrief>[0]): CommitmentResult {
  return publishCommitmentSync(params.workspace, prepareOrgEducationBrief(params), "ORG_EDUCATION_CREATED");
}
export async function generateOrgEducationBriefAsync(params: Parameters<typeof prepareOrgEducationBrief>[0], options: OrgCommitmentOptions = {}): Promise<CommitmentResult> {
  const input = { ...params, scorecard: structuredClone(params.scorecard) }, outFile = options.outFile;
  const assertOriginal = captureOrgCommitmentAuthority(input.workspace, options.beforePublish);
  return publishCommitmentAsync(input.workspace, prepareOrgEducationBrief(input), "ORG_EDUCATION_CREATED", assertOriginal, outFile);
}

export function generateOrgOwnershipPlan(params: Parameters<typeof prepareOrgOwnershipPlan>[0]): CommitmentResult {
  return publishCommitmentSync(params.workspace, prepareOrgOwnershipPlan(params), "ORG_OWNERSHIP_CREATED");
}
export async function generateOrgOwnershipPlanAsync(params: Parameters<typeof prepareOrgOwnershipPlan>[0], options: OrgCommitmentOptions = {}): Promise<CommitmentResult> {
  const input = { ...params, scorecard: structuredClone(params.scorecard) }, outFile = options.outFile;
  const assertOriginal = captureOrgCommitmentAuthority(input.workspace, options.beforePublish);
  return publishCommitmentAsync(input.workspace, prepareOrgOwnershipPlan(input), "ORG_OWNERSHIP_CREATED", assertOriginal, outFile);
}

export function generateOrgCommitmentPlan(params: Parameters<typeof prepareOrgCommitmentPlan>[0]): CommitmentResult {
  return publishCommitmentSync(params.workspace, prepareOrgCommitmentPlan(params), "ORG_COMMITMENT_CREATED");
}
export async function generateOrgCommitmentPlanAsync(params: Parameters<typeof prepareOrgCommitmentPlan>[0], options: OrgCommitmentOptions = {}): Promise<CommitmentResult> {
  const input = { ...params, scorecard: structuredClone(params.scorecard) }, outFile = options.outFile;
  const assertOriginal = captureOrgCommitmentAuthority(input.workspace, options.beforePublish);
  return publishCommitmentAsync(input.workspace, prepareOrgCommitmentPlan(input), "ORG_COMMITMENT_CREATED", assertOriginal, outFile);
}
