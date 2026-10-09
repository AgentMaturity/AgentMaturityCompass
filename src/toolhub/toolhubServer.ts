import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadTargetProfile } from "../targets/targetProfile.js";
import {
  evaluateActionPermission,
  loadActionPolicy,
  summarizeGovernorInput,
  verifyActionPolicySignature,
  type GovernorDecision
} from "../governor/actionPolicyEngine.js";
import { type ActionClass, type ExecutionMode } from "../types.js";
import { openLedger } from "../ledger/ledger.js";
import {
  findToolDefinition,
  loadToolsConfig,
  validateToolRequest,
  verifyToolsConfigSignature
} from "./toolhubValidators.js";
import { appendToolEvidenceWithReceipt } from "./toolhubReceipts.js";
import {
  buildToolBlastRadiusConsent,
  buildToolExecutedScope,
  hashToolBlastRadiusConsent,
  validateToolBlastRadiusConsent,
  withToolBlastRadiusDecision,
  type ToolBlastRadiusConsent,
  type ToolBlastRadiusReviewerDecision
} from "./blastRadiusConsent.js";
import { ToolhubJournal, isJournaledToolhubExecution, toolhubApprovalIntent, toolhubExecutionId, openToolhubExecutionEvidence, classifyToolhubOutcome, type JournaledToolhubOutcome } from "./toolhubJournal.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { executeFsRead, executeFsWrite } from "./toolhubExecutors/fs.js";
import { executeGit } from "./toolhubExecutors/git.js";
import { executeHttpFetch } from "./toolhubExecutors/http.js";
import { executeProcessSpawn } from "./toolhubExecutors/process.js";
import { loadWorkOrder } from "../workorders/workorderEngine.js";
import { verifyExecTicket } from "../tickets/execTicketVerify.js";
import { sha256Hex } from "../utils/hash.js";
import { evaluateBudgetStatus } from "../budgets/budgets.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import {
  approvalStatusPayload,
  consumeApprovedExecution,
  createApprovalForIntent,
  verifyApprovalForExecution
} from "../approvals/approvalEngine.js";
import { loadApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import {
  inspectToolhubContext,
  requireTrustedToolhubContext,
  type ToolContextTool,
  type ToolHubContextProjection
} from "./toolContext.js";

export interface ToolIntentRequest {
  agentId: string;
  workOrderId?: string;
  toolName: string;
  args: Record<string, unknown>;
  requestedMode: "SIMULATE" | "EXECUTE";
}

export interface ToolIntentResponse {
  intentId: string;
  requiredExecTicket: boolean;
  effectiveMode: ExecutionMode;
  allowed: boolean;
  reasons: string[];
  expiresTs: number;
  approvalRequired?: boolean;
  approvalId?: string;
  approvalRequestId?: string;
  approvalStatus?: "PENDING" | "QUORUM_MET" | "DENIED" | "CONSUMED" | "EXPIRED" | "CANCELLED";
  quorum?: { required: number; received: number; status: string };
  guardReceipt?: string;
  blastRadiusConsent?: ToolBlastRadiusConsent;
}

export interface ToolExecutionRequest {
  intentId: string;
  execTicket?: string;
  approvalId?: string;
  approvalRequestId?: string;
}

export interface ToolExecutionResponse {
  executionId: string;
  agentId: string;
  allowed: boolean;
  effectiveMode: ExecutionMode;
  result: Record<string, unknown>;
  actionReceipt?: string;
  resultReceipt?: string;
  action?: JournaledToolhubOutcome["action"];
  blastRadiusReceipt?: string;
  blastRadiusConsent?: ToolBlastRadiusConsent;
  reasons: string[];
}

interface IntentRecord {
  intentId: string;
  createdTs: number;
  expiresTs: number;
  request: ToolIntentRequest;
  decision: GovernorDecision;
  actionClass: ActionClass;
  approvalRequestId?: string;
  approvalRequired: boolean;
  blastRadiusConsent: ToolBlastRadiusConsent;
}

export interface ExecutionRecord {
  executionId: string;
  ts: number;
  intentId: string;
  agentId: string;
  toolName: string;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  allowed: boolean;
  reasons: string[];
  result: Record<string, unknown>;
  eventIds: string[];
}

function normalizeActionClass(value: unknown): ActionClass {
  const text = String(value ?? "").trim().toUpperCase();
  const valid: ActionClass[] = [
    "READ_ONLY",
    "WRITE_LOW",
    "WRITE_HIGH",
    "DEPLOY",
    "SECURITY",
    "FINANCIAL",
    "NETWORK_EXTERNAL",
    "DATA_EXPORT",
    "IDENTITY"
  ];
  if (!valid.includes(text as ActionClass)) {
    throw new Error(`invalid action class: ${String(value ?? "")}`);
  }
  return text as ActionClass;
}

function normalizeMode(value: unknown): ExecutionMode {
  const text = String(value ?? "SIMULATE").trim().toUpperCase();
  return text === "EXECUTE" ? "EXECUTE" : "SIMULATE";
}

export class ToolHubService {
  private readonly intents = new Map<string, IntentRecord>();
  private readonly executions = new Map<string, ExecutionRecord>();

  private readonly actionJournal: ToolhubJournal;

  constructor(private readonly workspace: string) { this.actionJournal = new ToolhubJournal(workspace); }

  close(): void { this.actionJournal.close(); }

  listToolContext(): ToolHubContextProjection {
    return inspectToolhubContext(this.workspace);
  }

  listTools(): ToolContextTool[] {
    return requireTrustedToolhubContext(this.workspace).tools;
  }

  listRecentExecutions(limit = 10): ExecutionRecord[] {
    return [...this.executions.values()]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }

  listPendingIntents(limit = 25): Array<{
    intentId: string;
    agentId: string;
    toolName: string;
    actionClass: ActionClass;
    requestedMode: ExecutionMode;
    effectiveMode: ExecutionMode;
    approvalRequired: boolean;
    approvalId?: string;
    expiresTs: number;
    reasons: string[];
  }> {
    return [...this.intents.values()]
      .filter((intent) => intent.expiresTs > Date.now())
      .sort((a, b) => b.createdTs - a.createdTs)
      .slice(0, limit)
      .map((intent) => ({
        intentId: intent.intentId,
        agentId: intent.request.agentId,
        toolName: intent.request.toolName,
        actionClass: intent.actionClass,
        requestedMode: intent.request.requestedMode,
        effectiveMode: intent.decision.effectiveMode,
        approvalRequired: intent.approvalRequired,
        approvalRequestId: intent.approvalRequestId,
        expiresTs: intent.expiresTs,
        reasons: intent.decision.reasons
      }));
  }

  getExecution(executionId: string): ExecutionRecord | null {
    return this.executions.get(executionId) ?? null;
  }

  intentAgentId(intentId: string): string | null {
    return this.intents.get(intentId)?.request.agentId ?? null;
  }

  intent(intentId: string): IntentRecord | null {
    return this.intents.get(intentId) ?? null;
  }

  private writeAuditWithReceipt(params: {
    auditType: string;
    severity?: "LOW" | "MEDIUM" | "HIGH";
    message: string;
    intent: IntentRecord;
    extraMeta?: Record<string, unknown>;
  }): {
    eventId: string;
    receiptId: string;
    receipt: string;
  } {
    const ledger = openLedger(this.workspace);
    const sessionId = `toolhub-audit-${randomUUID()}`;
    const payload = {
      auditType: params.auditType,
      severity: params.severity ?? "HIGH",
      message: params.message,
      intentId: params.intent.intentId,
      agentId: params.intent.request.agentId,
      toolName: params.intent.request.toolName,
      actionClass: params.intent.actionClass,
      requestedMode: params.intent.request.requestedMode,
      ...params.extraMeta
    };
    const payloadText = JSON.stringify(payload);
    const bodySha256 = sha256Hex(Buffer.from(payloadText, "utf8"));
    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-toolhub",
        binarySha256: "toolhub"
      });
      const out = ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: payloadText,
        payloadExt: "json",
        inline: true,
        meta: {
          ...payload,
          trustTier: "OBSERVED",
          bodySha256
        },
        receipt: {
          kind: "guard_check",
          agentId: params.intent.request.agentId,
          providerId: "toolhub",
          model: null,
          bodySha256
        }
      });
      ledger.sealSession(sessionId);
      return {
        eventId: out.id,
        receiptId: out.receiptId,
        receipt: out.receipt
      };
    } finally {
      ledger.close();
    }
  }

  private appendOutcomeSignal(params: {
    ledger: ReturnType<typeof openLedger>;
    sessionId: string;
    intent: IntentRecord;
    category: "Emotional" | "Functional" | "Economic" | "Brand" | "Lifetime";
    metricId: string;
    value: number | string | boolean;
    unit?: string | null;
    meta?: Record<string, unknown>;
  }): void {
    params.ledger.appendOutcomeEvent({
      ts: Date.now(),
      sessionId: params.sessionId,
      agentId: params.intent.request.agentId,
      workOrderId: params.intent.request.workOrderId ?? null,
      category: params.category,
      metricId: params.metricId,
      value: params.value,
      unit: params.unit ?? null,
      trustTier: "OBSERVED",
      source: "toolhub",
      meta: {
        intentId: params.intent.intentId,
        toolName: params.intent.request.toolName,
        actionClass: params.intent.actionClass,
        ...(params.meta ?? {})
      }
    });
  }

  createIntent(input: ToolIntentRequest): ToolIntentResponse {
    const actionPolicySig = verifyActionPolicySignature(this.workspace);
    const toolsSig = verifyToolsConfigSignature(this.workspace);
    const configTrusted = actionPolicySig.valid && toolsSig.valid;
    const tools = loadToolsConfig(this.workspace);
    const tool = findToolDefinition(tools, input.toolName);
    if (!tool) {
      throw new Error(`Tool not allowed: ${input.toolName}`);
    }

    const summary = summarizeGovernorInput(this.workspace, input.agentId);
    let target = null;
    try {
      target = loadTargetProfile(this.workspace, "default", input.agentId);
    } catch {
      target = null;
    }
    let workOrderContext: {
      workOrderId: string;
      riskTier: "low" | "med" | "high" | "critical";
      allowedActionClasses: ActionClass[];
    } | undefined;

    if (input.workOrderId) {
      const workOrder = loadWorkOrder({
        workspace: this.workspace,
        agentId: input.agentId,
        workOrderId: input.workOrderId,
        requireValidSignature: true
      });
      workOrderContext = {
        workOrderId: workOrder.workOrderId,
        riskTier: workOrder.riskTier === "medium" ? "med" : workOrder.riskTier,
        allowedActionClasses: workOrder.allowedActionClasses
      };
    }

    const decision = evaluateActionPermission({
      agentId: input.agentId,
      actionClass: normalizeActionClass(tool.actionClass),
      riskTier: workOrderContext?.riskTier ?? "med",
      currentDiagnosticRun: summary.run,
      targetProfile: target,
      trustSummary: {
        ...summary.trust,
        untrustedConfig: summary.trust.untrustedConfig || !configTrusted
      },
      assuranceSummary: summary.assurance,
      requestedMode: normalizeMode(input.requestedMode),
      workOrder: workOrderContext,
      hasExecTicket: false,
      freezeStatus: activeFreezeStatus(this.workspace, input.agentId),
      budgetStatus: evaluateBudgetStatus(this.workspace, input.agentId),
      policy: loadActionPolicy(this.workspace),
      policySignatureValid: actionPolicySig.valid
    });

    const intentId = `intent_${randomUUID().replace(/-/g, "")}`;
    const approvalPolicySig = verifyApprovalPolicySignature(this.workspace);
    let manualApprovalsRequired = 0;
    if (approvalPolicySig.valid) {
      const approvalPolicy = loadApprovalPolicy(this.workspace);
      const approvalRule = approvalPolicy.approvalPolicy.actionClasses[normalizeActionClass(tool.actionClass)];
      manualApprovalsRequired = approvalRule?.requiredApprovals ?? 0;
    }
    const approvalRequired =
      normalizeMode(input.requestedMode) === "EXECUTE" &&
      (tool.requireExecTicket === true || (approvalPolicySig.valid && manualApprovalsRequired > 0));
    const blastRadiusConsent = buildToolBlastRadiusConsent({
      intentId,
      agentId: input.agentId,
      toolName: input.toolName,
      actionClass: normalizeActionClass(tool.actionClass),
      args: input.args,
      requestedMode: normalizeMode(input.requestedMode),
      effectiveMode: decision.effectiveMode,
      approvalRequired
    });
    const record: IntentRecord = {
      intentId,
      createdTs: Date.now(),
      expiresTs: Date.now() + 10 * 60_000,
      request: {
        ...input,
        requestedMode: normalizeMode(input.requestedMode)
      },
      decision,
      actionClass: normalizeActionClass(tool.actionClass),
      approvalRequired,
      blastRadiusConsent
    };
    const boundIntent = isJournaledToolhubExecution(decision.effectiveMode, record.actionClass)
      ? toolhubApprovalIntent({ workspace: this.workspace, intentId, agentId: input.agentId, toolName: input.toolName,
          actionClass: record.actionClass, args: input.args, requestedMode: record.request.requestedMode, effectiveMode: decision.effectiveMode }) : null;
    if (approvalRequired) {
      const approval = createApprovalForIntent({
        workspace: this.workspace,
        agentId: input.agentId,
        intentId,
        toolName: input.toolName,
        actionClass: record.actionClass,
        workOrderId: input.workOrderId,
        requestedMode: record.request.requestedMode,
        effectiveMode: decision.effectiveMode,
        riskTier: workOrderContext?.riskTier === "med" ? "medium" : (workOrderContext?.riskTier ?? "medium"),
        intentPayload: boundIntent ?? {
          intentId,
          agentId: input.agentId,
          toolName: input.toolName,
          actionClass: record.actionClass,
          requestedMode: record.request.requestedMode,
          effectiveMode: decision.effectiveMode,
          reasons: decision.reasons,
          blastRadiusConsent
        }
      });
      record.approvalRequestId = approval.approval.approvalRequestId;
      this.writeAuditWithReceipt({
        auditType: "APPROVAL_REQUEST_CREATED",
        severity: "MEDIUM",
        message: "Execute intent requires owner approval.",
        intent: record,
        extraMeta: {
          approvalRequestId: approval.approval.approvalRequestId,
          approvalStatus: approval.approval.status,
          quorumRequired: approval.approval.requiredApprovals,
          quorumReceived: approval.approval.receivedApprovals
        }
      });
      this.writeAuditWithReceipt({
        auditType: "APPROVAL_REQUESTED",
        severity: "MEDIUM",
        message: "Execute intent requires approval (compatibility audit).",
        intent: record,
        extraMeta: {
          approvalRequestId: approval.approval.approvalRequestId
        }
      });
    }
    this.intents.set(intentId, record);

    const ledger = openLedger(this.workspace);
    let guardReceipt: string | undefined;
    const sessionId = `toolhub-intent-${randomUUID()}`;
    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-toolhub",
        binarySha256: "toolhub"
      });
      const payload = {
        auditType: "GUARD_CHECK",
        intentId,
        agentId: input.agentId,
        toolName: input.toolName,
        actionClass: record.actionClass,
        requestedMode: input.requestedMode,
        effectiveMode: decision.effectiveMode,
        allowed: decision.allowed,
        reasons: decision.reasons,
        configTrusted
      };
      const payloadText = JSON.stringify(payload);
      const bodySha256 = sha256Hex(Buffer.from(payloadText, "utf8"));
      const out = ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: payloadText,
        payloadExt: "json",
        inline: true,
        meta: {
          ...payload,
          trustTier: "OBSERVED",
          bodySha256
        },
        receipt: {
          kind: "guard_check",
          agentId: input.agentId,
          providerId: "toolhub",
          model: null,
          bodySha256
        }
      });
      guardReceipt = out.receipt;
      if (input.workOrderId) {
        this.appendOutcomeSignal({
          ledger,
          sessionId,
          intent: record,
          category: "Functional",
          metricId: "workorder.started",
          value: true,
          meta: {
            approvalRequired
          }
        });
      }
      if (approvalRequired) {
        this.appendOutcomeSignal({
          ledger,
          sessionId,
          intent: record,
          category: "Brand",
          metricId: "approval.requested",
          value: true,
          meta: {
            approvalRequestId: record.approvalRequestId ?? null
          }
        });
      }
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }

    return {
      intentId,
      requiredExecTicket: decision.requiredExecTicket || tool.requireExecTicket === true,
      effectiveMode: decision.effectiveMode,
      allowed: decision.allowed,
      reasons: decision.reasons,
      expiresTs: record.expiresTs,
      approvalRequired,
      approvalId: record.approvalRequestId,
      approvalRequestId: record.approvalRequestId,
      approvalStatus: approvalRequired ? "PENDING" : undefined,
      quorum:
        approvalRequired && record.approvalRequestId
          ? approvalStatusPayload({
              workspace: this.workspace,
              agentId: input.agentId,
              approvalId: record.approvalRequestId
            }).quorum
          : undefined,
      guardReceipt,
      blastRadiusConsent
    };
  }

  async executeIntent(input: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const intent = this.intents.get(input.intentId);
    if (!intent) {
      throw new Error(`Unknown intent: ${input.intentId}`);
    }
    if (Date.now() > intent.expiresTs) {
      throw new Error(`Intent expired: ${input.intentId}`);
    }

    const toolsSig = verifyToolsConfigSignature(this.workspace);
    const actionSig = verifyActionPolicySignature(this.workspace);
    const configTrusted = toolsSig.valid && actionSig.valid;
    const tools = loadToolsConfig(this.workspace);
    const tool = findToolDefinition(tools, intent.request.toolName);
    if (!tool) {
      return this.auditDenied(intent, "TOOLHUB_BYPASS_ATTEMPTED", "Tool is not configured in tools.yaml");
    }

    const requestedMode = normalizeMode(intent.request.requestedMode);
    if (!configTrusted) {
      return this.auditDenied(
        intent,
        "CONFIG_SIGNATURE_INVALID",
        "Tool execution denied because signed tools/action policy verification failed.",
        {
          executeAttempted: requestedMode === "EXECUTE",
          executeWithoutTicketAttempted: requestedMode === "EXECUTE"
        }
      );
    }

    const freeze = activeFreezeStatus(this.workspace, intent.request.agentId);
    if (requestedMode === "EXECUTE" && freeze.active && freeze.actionClasses.includes(intent.actionClass)) {
      return this.auditDenied(
        intent,
        "EXECUTE_FROZEN_ACTIVE",
        `Execute is currently frozen for action class ${intent.actionClass}.`,
        {
          executeAttempted: true,
          executeWithoutTicketAttempted: true
        }
      );
    }

    const budget = evaluateBudgetStatus(this.workspace, intent.request.agentId);
    if (!budget.budgetConfigValid && requestedMode === "EXECUTE") {
      return this.auditDenied(
        intent,
        "CONFIG_SIGNATURE_INVALID",
        "Budgets config signature invalid; EXECUTE is denied until fixed.",
        {
          executeAttempted: true,
          executeWithoutTicketAttempted: true
        }
      );
    }
    const executeBudgetExceeded =
      requestedMode === "EXECUTE" &&
      (!budget.ok &&
        (budget.exceededActionClasses.includes(intent.actionClass) ||
          budget.reasons.some((reason) => /daily llm|per-minute llm|daily llm cost/i.test(reason))));
    if (executeBudgetExceeded) {
      return this.auditDenied(intent, "BUDGET_EXCEEDED", budget.reasons.join("; "), {
        executeAttempted: true,
        executeWithoutTicketAttempted: true
      });
    }

    let effectiveMode = intent.decision.effectiveMode;
    const reasons: string[] = [];

    let ticketValid = false;
    let approvalUsedId: string | null = null;
    let approvalDecisionReceiptId: string | null = null;
    const ticketRequired = tool.requireExecTicket === true || intent.decision.requiredExecTicket || intent.approvalRequired;
    if (requestedMode === "EXECUTE" && ticketRequired) {
      const approvalRef = input.approvalRequestId ?? input.approvalId;
      if (approvalRef) {
        const approvalCheck = verifyApprovalForExecution({
          workspace: this.workspace,
          approvalId: approvalRef,
          expectedAgentId: intent.request.agentId,
          expectedIntentId: intent.intentId,
          expectedToolName: intent.request.toolName,
          expectedActionClass: intent.actionClass
        });
        if (!approvalCheck.ok) {
          const replay = approvalCheck.status === "CONSUMED";
          return this.auditDenied(
            intent,
            replay ? "APPROVAL_REPLAY_ATTEMPTED" : "APPROVAL_QUORUM_FAILED",
            replay
              ? "Approval replay attempt detected for execute action."
              : `Invalid approval: ${approvalCheck.error ?? "unknown reason"}`,
            {
              executeAttempted: true,
              executeWithoutTicketAttempted: true
            }
          );
        }
        approvalUsedId = approvalRef;
        ticketValid = true;
      } else {
        if (!input.execTicket) {
          reasons.push("Execution ticket missing.");
          return this.auditDenied(intent, "EXEC_TICKET_MISSING", "Execute attempted without required ticket", {
            executeAttempted: true,
            executeWithoutTicketAttempted: true
          });
        }
        const ticket = verifyExecTicket({
          workspace: this.workspace,
          ticket: input.execTicket,
          expectedAgentId: intent.request.agentId,
          expectedWorkOrderId: intent.request.workOrderId,
          expectedActionClass: intent.actionClass,
          expectedToolName: intent.request.toolName
        });
        if (!ticket.ok) {
          reasons.push(`Execution ticket invalid: ${ticket.error ?? "unknown"}`);
          return this.auditDenied(intent, "EXEC_TICKET_INVALID", `Invalid execute ticket: ${ticket.error ?? "unknown"}`, {
            executeAttempted: true,
            executeWithoutTicketAttempted: true
          });
        }
        ticketValid = true;
      }
    }

    if (requestedMode === "EXECUTE" && effectiveMode !== "EXECUTE") {
      reasons.push("Governor downgraded action to SIMULATE.");
    }

    const simulate = effectiveMode !== "EXECUTE";
    const validation = this.validateToolArgs(tool, intent.request.args);
    if (!validation.ok) {
      return this.auditDenied(intent, "TOOLHUB_BYPASS_ATTEMPTED", validation.reason ?? "tool argument validation failed", {
        executeAttempted: requestedMode === "EXECUTE",
        executeWithoutTicketAttempted: requestedMode === "EXECUTE" && !ticketValid
      });
    }

    const journaled = isJournaledToolhubExecution(effectiveMode, intent.actionClass);
    const executionId = journaled ? toolhubExecutionId(workspaceIdFromDirectory(this.workspace), intent.intentId) : `exec_${randomUUID().replace(/-/g, "")}`;
    const blastRadiusReviewerDecision: ToolBlastRadiusReviewerDecision =
      approvalUsedId !== null
        ? {
            status: "approved",
            approvalRequestId: approvalUsedId,
            decidedBy: "approval_quorum"
          }
        : ticketValid
          ? {
              status: "ticket_accepted",
              decidedBy: "exec_ticket"
            }
          : requestedMode === "EXECUTE" && (intent.blastRadiusConsent.highImpact || ticketRequired)
            ? {
                status: "missing",
                reason: "no approval or execution ticket was accepted"
              }
            : {
                status: "not_required"
              };
    const blastRadiusConsent = withToolBlastRadiusDecision(
      intent.blastRadiusConsent,
      blastRadiusReviewerDecision,
      buildToolExecutedScope({
        toolName: intent.request.toolName,
        actionClass: intent.actionClass,
        args: intent.request.args,
        effectiveMode,
        workOrderId: intent.request.workOrderId ?? null
      })
    );
    const blastRadiusValidation = validateToolBlastRadiusConsent(blastRadiusConsent);
    if (!blastRadiusValidation.ok && requestedMode === "EXECUTE") {
      return this.auditDenied(
        intent,
        "BLAST_RADIUS_CONSENT_INVALID",
        `Blast-radius consent evidence invalid: ${blastRadiusValidation.reasons.join("; ")}`,
        {
          executeAttempted: true,
          executeWithoutTicketAttempted: !ticketValid,
          blastRadiusConsent
        }
      );
    }
    const evidenceInput: Parameters<typeof openToolhubExecutionEvidence>[0] = {
      workspace: this.workspace, executionId, intentId: intent.intentId, agentId: intent.request.agentId,
      toolName: intent.request.toolName, actionClass: intent.actionClass, requestedMode, effectiveMode,
      args: intent.request.args, workOrderId: intent.request.workOrderId ?? null, execTicketProvided: !!input.execTicket,
      execTicketValid: ticketValid, approvalId: approvalUsedId, approvalDecisionReceiptId, blastRadiusConsent,
      signal: signal => this.appendOutcomeSignal({ ...signal, intent })
    };
    if (journaled) {
      let evidence: ReturnType<typeof openToolhubExecutionEvidence> | undefined;
      const outcome = await this.actionJournal.dispatch({
        workspace: this.workspace, intentId: intent.intentId, agentId: intent.request.agentId, toolName: tool.name,
        actionClass: intent.actionClass, args: intent.request.args, requestedMode, effectiveMode, tool, approvalId: approvalUsedId,
        argumentCarrierSupported: false,
        recheckTicket: () => !input.execTicket || approvalUsedId !== null || verifyExecTicket({ workspace: this.workspace,
          ticket: input.execTicket, expectedAgentId: intent.request.agentId, expectedWorkOrderId: intent.request.workOrderId,
          expectedActionClass: intent.actionClass, expectedToolName: tool.name }).ok,
        recordAction: metadata => { evidence = openToolhubExecutionEvidence(evidenceInput, metadata); },
        recordResult: result => { if (!evidence) throw new Error("toolhub evidence recorder unavailable"); evidence.recordResult(result); },
        closeEvidence: () => evidence?.close(),
        run: (args, key) => this.runTool(tool.name, args, false, key)
      });
      if (outcome.state === "denied") {
        try { return { ...this.auditDenied(intent, "ACTION_DISPATCH_DENIED", outcome.reasonCode, { executeAttempted: true, executionId }), action: outcome.action }; }
        catch { return { executionId, agentId: intent.request.agentId, allowed: false, effectiveMode,
          result: outcome.result, reasons: [outcome.reasonCode], action: { ...outcome.action, evidenceComplete: false } }; }
      }
      this.executions.set(executionId, { executionId, ts: Date.now(), intentId: intent.intentId, agentId: intent.request.agentId,
        toolName: tool.name, requestedMode, effectiveMode, allowed: true, reasons, result: outcome.result, eventIds: evidence?.eventIds ?? [] });
      return { executionId, agentId: intent.request.agentId, allowed: true, effectiveMode, result: outcome.result, reasons,
        action: outcome.action, actionReceipt: evidence?.actionReceipt, resultReceipt: evidence?.resultReceipt,
        blastRadiusReceipt: evidence?.actionReceipt, blastRadiusConsent };
    }
    if (approvalUsedId) {
      // Non-journaled compatibility path: consume before its effect as before P1-54.
      let consume: ReturnType<typeof consumeApprovedExecution> | null = null;
      try { consume = consumeApprovedExecution({ workspace: this.workspace, approvalId: approvalUsedId, expectedAgentId: intent.request.agentId, executionId }); } catch { /* unreadable: denied below */ }
      if (!consume?.consumed) return this.auditDenied(intent, consume ? "APPROVAL_REPLAY_ATTEMPTED" : "APPROVAL_QUORUM_FAILED", consume?.reason ?? "approval consumption could not be recorded", { executeAttempted: true, executeWithoutTicketAttempted: true });
    }
    const evidence = openToolhubExecutionEvidence(evidenceInput);
    try {
      const resultPayload = await this.runTool(tool.name, intent.request.args, simulate);
      evidence.recordResult(simulate
        ? { state: "completed", effect: null, reasonCode: "completed", result: resultPayload, bodySucceeded: true }
        : classifyToolhubOutcome(intent.actionClass, resultPayload));
      this.executions.set(executionId, { executionId, ts: Date.now(), intentId: intent.intentId, agentId: intent.request.agentId,
        toolName: intent.request.toolName, requestedMode, effectiveMode, allowed: true, reasons, result: resultPayload, eventIds: evidence.eventIds });
      return { executionId, agentId: intent.request.agentId, allowed: true, effectiveMode, result: resultPayload,
        actionReceipt: evidence.actionReceipt, resultReceipt: evidence.resultReceipt, blastRadiusReceipt: evidence.actionReceipt, blastRadiusConsent, reasons };
    } finally { evidence.close(); }
  }

  private async runTool(toolName: string, args: Record<string, unknown>, simulate: boolean, key?: { idempotencyKey: string; header: string | null }): Promise<Record<string, unknown>> {
    const cwd = resolve(this.workspace, String(args.cwd ?? this.workspace));
    if (toolName === "fs.read") {
      const targetPath = resolve(this.workspace, String(args.path ?? ""));
      const maxBytes = Number(args.maxBytes ?? 200000);
      const result = executeFsRead({
        path: targetPath,
        maxBytes,
        simulate
      });
      return result;
    }

    if (toolName === "fs.write") {
      const targetPath = resolve(this.workspace, String(args.path ?? ""));
      const content = String(args.content ?? "");
      const result = executeFsWrite({
        path: targetPath,
        content,
        simulate
      });
      return result;
    }

    if (toolName === "git.status") {
      const out = executeGit({ subcommand: "status", args: ["--porcelain"], cwd, simulate });
      return out;
    }

    if (toolName === "git.commit") {
      const commitArgs = Array.isArray(args.args) ? args.args.map(String) : ["-m", String(args.message ?? "amc commit")];
      const out = executeGit({ subcommand: "commit", args: commitArgs, cwd, simulate });
      return out;
    }

    if (toolName === "git.push") {
      const pushArgs = Array.isArray(args.args) ? args.args.map(String) : [];
      const out = executeGit({ subcommand: "push", args: pushArgs, cwd, simulate });
      return out;
    }

    if (toolName === "http.fetch") {
      const url = String(args.url ?? "");
      const method = args.method ? String(args.method) : "GET";
      const headers: Record<string, string> = {};
      if (args.headers && typeof args.headers === "object") {
        for (const [key, value] of Object.entries(args.headers as Record<string, unknown>)) {
          headers[key] = String(value);
        }
      }
      const body = typeof args.body === "string" ? args.body : undefined;
      const out = await executeHttpFetch({
        workspace: this.workspace,
        url,
        method,
        headers,
        body,
        simulate,
        ...(key?.header ? { idempotency: { header: key.header, key: key.idempotencyKey } } : {})
      });
      return out;
    }

    if (toolName === "process.spawn") {
      const binary = String(args.binary ?? "");
      const argv = Array.isArray(args.argv) ? args.argv.map(String) : [];
      const env = args.env && typeof args.env === "object" ? Object.fromEntries(Object.entries(args.env as Record<string, unknown>).map(([k, v]) => [k, String(v)])) : {};
      const out = executeProcessSpawn({
        binary,
        argv,
        cwd,
        env,
        simulate
      });
      return out;
    }

    throw new Error(`Unsupported tool implementation: ${toolName}`);
  }

  private validateToolArgs(tool: NonNullable<ReturnType<typeof findToolDefinition>>, args: Record<string, unknown>): { ok: boolean; reason?: string } {
    return validateToolRequest({ workspace: this.workspace, tool, args });
  }

  private auditDenied(
    intent: IntentRecord,
    auditType: string,
    message: string,
    opts?: {
      executionId?: string;
      executeAttempted?: boolean;
      executeWithoutTicketAttempted?: boolean;
      blastRadiusConsent?: ToolBlastRadiusConsent;
    }
  ): ToolExecutionResponse {
    const executionId = opts?.executionId ?? `exec_${randomUUID().replace(/-/g, "")}`;
    const ledger = openLedger(this.workspace);
    const sessionId = `toolhub-deny-${randomUUID()}`;
    const eventIds: string[] = [];
    const blastRadiusConsent = opts?.blastRadiusConsent;
    const blastRadiusConsentHash = blastRadiusConsent ? hashToolBlastRadiusConsent(blastRadiusConsent) : null;

    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-toolhub",
        binarySha256: "toolhub"
      });
      const payload = {
        auditType,
        severity: "HIGH",
        message,
        intentId: intent.intentId,
        toolName: intent.request.toolName,
        agentId: intent.request.agentId,
        actionClass: intent.actionClass,
        requestedMode: intent.request.requestedMode,
        executeAttempted: opts?.executeAttempted ?? false,
        executeWithoutTicketAttempted: opts?.executeWithoutTicketAttempted ?? false,
        blastRadiusConsent,
        blastRadiusConsentHash
      };
      const id = ledger.appendEvidence({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: JSON.stringify(payload),
        payloadExt: "json",
        inline: true,
        meta: {
          ...payload,
          trustTier: "OBSERVED"
        }
      });
      eventIds.push(id);
      this.appendOutcomeSignal({
        ledger,
        sessionId,
        intent,
        category: "Functional",
        metricId: "toolhub.execute_success",
        value: false,
        meta: {
          auditType
        }
      });
      if (intent.request.workOrderId) {
        this.appendOutcomeSignal({
          ledger,
          sessionId,
          intent,
          category: "Functional",
          metricId: "workorder.failed",
          value: true,
          meta: {
            auditType
          }
        });
      }
      this.appendOutcomeSignal({
        ledger,
        sessionId,
        intent,
        category: "Brand",
        metricId: "execution.denied",
        value: true,
        meta: {
          auditType
        }
      });
      if (opts?.executeWithoutTicketAttempted) {
        const attemptId = ledger.appendEvidence({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "EXECUTE_WITHOUT_TICKET_ATTEMPTED",
            severity: "HIGH",
            message,
            intentId: intent.intentId,
            toolName: intent.request.toolName,
            agentId: intent.request.agentId,
            actionClass: intent.actionClass,
            blastRadiusConsent,
            blastRadiusConsentHash
          }),
          payloadExt: "json",
          inline: true,
          meta: {
            auditType: "EXECUTE_WITHOUT_TICKET_ATTEMPTED",
            severity: "HIGH",
            intentId: intent.intentId,
            toolName: intent.request.toolName,
            agentId: intent.request.agentId,
            actionClass: intent.actionClass,
            blastRadiusConsent,
            blastRadiusConsentHash,
            trustTier: "OBSERVED"
          }
        });
        eventIds.push(attemptId);
      }
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }

    const execution: ExecutionRecord = {
      executionId,
      ts: Date.now(),
      intentId: intent.intentId,
      agentId: intent.request.agentId,
      toolName: intent.request.toolName,
      requestedMode: normalizeMode(intent.request.requestedMode),
      effectiveMode: "SIMULATE",
      allowed: false,
      reasons: [message],
      result: {
        error: message,
        auditType
      },
      eventIds
    };
    if (!this.executions.has(executionId)) this.executions.set(executionId, execution);

    return {
      executionId,
      agentId: intent.request.agentId,
      allowed: false,
      effectiveMode: "SIMULATE",
      result: execution.result,
      reasons: execution.reasons
    };
  }
}
