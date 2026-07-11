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

  constructor(private readonly workspace: string) {}

  listTools(): Array<{ name: string; actionClass: ActionClass; requireExecTicket: boolean }> {
    const config = loadToolsConfig(this.workspace);
    return config.tools.allowedTools.map((tool) => ({
      name: tool.name,
      actionClass: tool.actionClass,
      requireExecTicket: tool.requireExecTicket === true
    }));
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
        intentPayload: {
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

    const executionId = `exec_${randomUUID().replace(/-/g, "")}`;
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
    const blastRadiusConsentHash = hashToolBlastRadiusConsent(blastRadiusConsent);
    const ledger = openLedger(this.workspace);
    const sessionId = `toolhub-exec-${randomUUID()}`;
    const eventIds: string[] = [];
    let actionReceipt: string | undefined;
    let resultReceipt: string | undefined;

    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-toolhub",
        binarySha256: "toolhub"
      });

      const action = appendToolEvidenceWithReceipt({
        ledger,
        workspace: this.workspace,
        sessionId,
        agentId: intent.request.agentId,
        toolName: intent.request.toolName,
        eventType: "tool_action",
        extraMeta: {
          requestedMode,
          effectiveMode,
          actionClass: intent.actionClass,
          execTicketValid: ticketValid,
          approvalId: approvalUsedId,
          approvalDecisionReceiptId,
          blastRadiusConsent,
          blastRadiusConsentHash
        },
        payload: {
          executionId,
          intentId: intent.intentId,
          requestedMode,
          effectiveMode,
          args: intent.request.args,
          workOrderId: intent.request.workOrderId ?? null,
          execTicketProvided: !!input.execTicket,
          execTicketValid: ticketValid,
          actionClass: intent.actionClass,
          approvalId: approvalUsedId,
          approvalDecisionReceiptId,
          blastRadiusConsent,
          blastRadiusConsentHash
        }
      });
      eventIds.push(action.eventId);
      actionReceipt = action.receipt;

      const resultPayload = await this.runTool(tool.name, intent.request.args, simulate);
      const result = appendToolEvidenceWithReceipt({
        ledger,
        workspace: this.workspace,
        sessionId,
        agentId: intent.request.agentId,
        toolName: intent.request.toolName,
        eventType: "tool_result",
        extraMeta: {
          requestedMode,
          effectiveMode,
          actionClass: intent.actionClass,
          approvalId: approvalUsedId,
          blastRadiusConsentHash
        },
        payload: {
          executionId,
          intentId: intent.intentId,
          requestedMode,
          effectiveMode,
          simulated: simulate,
          success: true,
          result: resultPayload,
          denied: false,
          actionClass: intent.actionClass,
          approvalId: approvalUsedId,
          blastRadiusConsentHash
        }
      });
      eventIds.push(result.eventId);
      resultReceipt = result.receipt;

      this.appendOutcomeSignal({
        ledger,
        sessionId,
        intent,
        category: "Functional",
        metricId: "toolhub.execute_success",
        value: true,
        meta: {
          executionId,
          requestedMode,
          effectiveMode
        }
      });
      this.appendOutcomeSignal({
        ledger,
        sessionId,
        intent,
        category: "Economic",
        metricId: "toolhub.exec_count",
        value: 1,
        unit: intent.actionClass,
        meta: {
          executionId,
          actionClass: intent.actionClass
        }
      });
      if (intent.request.workOrderId) {
        this.appendOutcomeSignal({
          ledger,
          sessionId,
          intent,
          category: "Functional",
          metricId: "workorder.completed",
          value: true,
          meta: {
            executionId
          }
        });
      }

      if (approvalUsedId) {
        const consume = consumeApprovedExecution({
          workspace: this.workspace,
          approvalId: approvalUsedId,
          expectedAgentId: intent.request.agentId,
          executionId
        });
        if (consume.replay) {
          const replayPayload = {
            auditType: "APPROVAL_REPLAY_ATTEMPTED",
            severity: "HIGH",
            approvalId: approvalUsedId,
            executionId,
            intentId: intent.intentId,
            agentId: intent.request.agentId,
            message: consume.reason
          };
          const replayText = JSON.stringify(replayPayload);
          const replayBodySha = sha256Hex(Buffer.from(replayText, "utf8"));
          const replayEvent = ledger.appendEvidenceWithReceipt({
            sessionId,
            runtime: "unknown",
            eventType: "audit",
            payload: replayText,
            payloadExt: "json",
            inline: true,
            meta: {
              ...replayPayload,
              trustTier: "OBSERVED",
              bodySha256: replayBodySha
            },
            receipt: {
              kind: "guard_check",
              agentId: intent.request.agentId,
              providerId: "toolhub",
              model: null,
              bodySha256: replayBodySha
            }
          });
          eventIds.push(replayEvent.id);
          ledger.sealSession(sessionId);
          const failed: ExecutionRecord = {
            executionId,
            ts: Date.now(),
            intentId: intent.intentId,
            agentId: intent.request.agentId,
            toolName: intent.request.toolName,
            requestedMode,
            effectiveMode: "SIMULATE",
            allowed: false,
            reasons: [consume.reason],
            result: {
              error: consume.reason,
              auditType: "APPROVAL_REPLAY_ATTEMPTED"
            },
            eventIds
          };
          this.executions.set(executionId, failed);
          return {
            executionId,
            agentId: intent.request.agentId,
            allowed: false,
            effectiveMode: "SIMULATE",
            result: failed.result,
            reasons: failed.reasons
          };
        }
        const approvalPayload = {
          auditType: "APPROVAL_CONSUMED",
          severity: "MEDIUM",
          approvalId: approvalUsedId,
          executionId,
          intentId: intent.intentId,
          agentId: intent.request.agentId
        };
        const approvalPayloadText = JSON.stringify(approvalPayload);
        const approvalBodySha = sha256Hex(Buffer.from(approvalPayloadText, "utf8"));
        const consumedAudit = ledger.appendEvidenceWithReceipt({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: approvalPayloadText,
          payloadExt: "json",
          inline: true,
          meta: {
            ...approvalPayload,
            trustTier: "OBSERVED",
            bodySha256: approvalBodySha
          },
          receipt: {
            kind: "guard_check",
            agentId: intent.request.agentId,
            providerId: "toolhub",
            model: null,
            bodySha256: approvalBodySha
          }
        });
        eventIds.push(consumedAudit.id);

        const quorumPayload = {
          auditType: "APPROVAL_QUORUM_MET",
          severity: "MEDIUM",
          approvalRequestId: approvalUsedId,
          executionId,
          intentId: intent.intentId,
          agentId: intent.request.agentId
        };
        const quorumText = JSON.stringify(quorumPayload);
        const quorumBodySha = sha256Hex(Buffer.from(quorumText, "utf8"));
        const quorumAudit = ledger.appendEvidenceWithReceipt({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: quorumText,
          payloadExt: "json",
          inline: true,
          meta: {
            ...quorumPayload,
            trustTier: "OBSERVED",
            bodySha256: quorumBodySha
          },
          receipt: {
            kind: "guard_check",
            agentId: intent.request.agentId,
            providerId: "toolhub",
            model: null,
            bodySha256: quorumBodySha
          }
        });
        eventIds.push(quorumAudit.id);

        this.appendOutcomeSignal({
          ledger,
          sessionId,
          intent,
          category: "Brand",
          metricId: "approval.consumed",
          value: true,
          meta: {
            approvalRequestId: approvalUsedId,
            executionId
          }
        });
      }

      ledger.sealSession(sessionId);

      const execution: ExecutionRecord = {
        executionId,
        ts: Date.now(),
        intentId: intent.intentId,
        agentId: intent.request.agentId,
        toolName: intent.request.toolName,
        requestedMode,
        effectiveMode,
        allowed: true,
        reasons,
        result: resultPayload,
        eventIds
      };
      this.executions.set(executionId, execution);
      return {
        executionId,
        agentId: intent.request.agentId,
        allowed: true,
        effectiveMode,
        result: resultPayload,
        actionReceipt,
        resultReceipt,
        blastRadiusReceipt: actionReceipt,
        blastRadiusConsent,
        reasons
      };
    } finally {
      ledger.close();
    }
  }

  private async runTool(toolName: string, args: Record<string, unknown>, simulate: boolean): Promise<Record<string, unknown>> {
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
        url,
        method,
        headers,
        body,
        simulate
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
      executeAttempted?: boolean;
      executeWithoutTicketAttempted?: boolean;
      blastRadiusConsent?: ToolBlastRadiusConsent;
    }
  ): ToolExecutionResponse {
    const executionId = `exec_${randomUUID().replace(/-/g, "")}`;
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
    this.executions.set(executionId, execution);

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
