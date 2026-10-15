import { realpathSync } from "node:fs";
import { z } from "zod";
import { authorizationIntentFor } from "../../actions/authorize.js";
import type { ActionJournal } from "../../actions/actionJournal.js";
import { authorizationRecordDigest } from "../../actions/authorizationRecord.js";
import type { ReconcileAdapter } from "../../actions/reconcile.js";
import { createApprovalForIntent } from "../../approvals/approvalEngine.js";
import { loadVerifiedToolsConfigSnapshot } from "../../toolhub/toolhubValidators.js";
import { toolhubAllowlistGuard } from "../../tools/guards/policyGuards.js";
import { DEFAULT_AUTHORIZE_CLASSES, ToolPipeline, type ToolPipelineInit } from "../../tools/toolPipeline.js";
import { ToolRegistry } from "../../tools/toolRegistry.js";
import { DefiniteFailureError, type ToolBodyResult, type ToolDefinition, type ToolExecution } from "../../tools/toolTypes.js";
import { canonicalize } from "../../utils/json.js";
import { getVaultSecretReadOnly } from "../../vault/vault.js";
import { paymentArgsDigest, paymentIdSchema, paymentReferenceSchema } from "./paymentArgs.js";
import { createPaymentAdapter } from "./paymentAdapter.js";
import {
  createFinancePaymentContext, financePaymentArgs, financePaymentBindingFields, normalizeFinancePaymentEnvelope
} from "./financePaymentContext.js";
import type { FinancePaymentEnvelope } from "./financePaymentContext.js";
import { createPaymentServiceClient, type PaymentServiceClientOptions } from "./paymentServiceClient.js";

export interface FinanceOpsOptions {
  readonly workspace: string;
  readonly agentId: string;
  readonly reader: PaymentServiceClientOptions;
  readonly executorSecretKey: string;
  readonly shadow?: boolean;
  readonly journal: () => ActionJournal;
  readonly authorizationContext: NonNullable<ToolPipelineInit["authorizationContext"]>;
  readonly record: NonNullable<ToolPipelineInit["record"]>;
}

const EXECUTE = "finops_execute_payment";
const classes = {
  finops_list_transactions: "READ_ONLY", finops_reconcile: "READ_ONLY", finops_propose_payment: "WRITE_LOW",
  finops_execute_payment: "FINANCIAL", finops_lookup_payment: "READ_ONLY"
} as const;
const effects = { repeatable: false, idempotency: { carrier: "http-header", name: "Idempotency-Key" },
  reconcile: { adapterId: "native" } };
const financial = new Set<string>(["FINANCIAL"]);
const same = (left: unknown, right: unknown): boolean => canonicalize(left) === canonicalize(right);
const json = (value: unknown, ok = true): ToolBodyResult => ({ ok, output: JSON.stringify(value) });
const rangeSchema = z.object({ from: z.string().optional(), to: z.string().optional() }).strict();
const lookupSchema = z.union([
  z.object({ paymentId: paymentIdSchema }).strict(),
  z.object({ idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) }).strict(),
  z.object({ reference: paymentReferenceSchema }).strict()
]);
const rangeParameters = { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, additionalProperties: false };
const paymentProperties = {
  kind: { type: "string", enum: ["refund", "payout"] }, sourceAccountId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" },
  payeeId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" },
  amountMinor: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, currency: { const: "USD" },
  reference: { type: "string", pattern: "^[A-Za-z0-9-]{1,35}$" },
  originalTxnId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" }, amount: { type: "string", pattern: "^[0-9]+(?:\\.[0-9]+)?$" },
  payeeVersion: { type: "string", pattern: "^[1-9][0-9]*$" },
  destinationTokenSha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
};
const requiredPaymentFields = ["kind", "sourceAccountId", "payeeId", "amountMinor", "currency", "reference", "payeeVersion", "destinationTokenSha256"];
const paymentParameters = (execute: boolean): Record<string, unknown> => ({ type: "object", properties: paymentProperties,
  required: [...requiredPaymentFields, ...(execute ? ["amount"] : [])], additionalProperties: false });
const lookupParameters = { type: "object", oneOf: [
  { type: "object", properties: { paymentId: paymentProperties.payeeId }, required: ["paymentId"], additionalProperties: false },
  { type: "object", properties: { idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" } }, required: ["idempotencyKey"], additionalProperties: false },
  { type: "object", properties: { reference: paymentProperties.reference }, required: ["reference"], additionalProperties: false }
] };

/** An opt-in composition. It neither signs policy nor registers in any default or shared tool registry. */
export function createFinanceOpsTools(options: FinanceOpsOptions): {
  registry: ToolRegistry;
  pipeline: ToolPipeline;
  adapters: ReadonlyMap<string, ReconcileAdapter>;
} {
  const workspace = realpathSync(options.workspace);
  if (!options.agentId || !options.executorSecretKey || typeof options.record !== "function"
    || typeof options.journal !== "function" || typeof options.authorizationContext !== "function") {
    throw new Error("Finance tools require explicit agent, vault secret name, journal, authorization context and recorder");
  }
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config || !snapshot.digestSha256 || !snapshot.config.tools.denyByDefault) {
    throw new Error("Finance tools require a verifiable deny-by-default signed tools configuration");
  }
  const allowed = snapshot.config.tools.allowedTools;
  if (allowed.length !== 5 || new Set(allowed.map(tool => tool.name)).size !== 5 || allowed.some(tool =>
    !(tool.name in classes) || tool.actionClass !== classes[tool.name as keyof typeof classes] || tool.context?.kind === "mcp")) {
    throw new Error("Finance tools require exactly the five compatible native tool definitions");
  }
  if (allowed.some(tool => tool.requireExecTicket === true || tool.maxBytes !== undefined)) {
    throw new Error("Finance composition cannot enforce declared execution tickets or byte limits");
  }
  const executeDefinition = allowed.find(tool => tool.name === EXECUTE)!;
  if (!same(executeDefinition.bindingFields, financePaymentBindingFields) || !same(executeDefinition.effects, effects)) {
    throw new Error("Finance execute requires exact signed bindings, Idempotency-Key header and native reconciliation");
  }
  const readerOptions = Object.freeze({ ...options.reader });
  const reader = createPaymentServiceClient(readerOptions);
  const context = createFinancePaymentContext({ workspace, agentId: options.agentId, journal: options.journal });
  const readerAdapter = createPaymentAdapter({ client: reader, adapterId: "native", resolveLookupContext: context.resolveLookupContext });
  const registry = new ToolRegistry();
  const refreshed = new WeakMap<ToolExecution, string | null>();

  async function refresh(execution: ToolExecution): Promise<"allow" | "deny" | "unavailable"> {
    if (execution.effectiveMode === "SIMULATE") return "allow";
    if (execution.signal?.aborted) return "deny";
    try {
      const envelope = normalizeFinancePaymentEnvelope(execution.arguments);
      const result = await reader.getPayee(envelope.payeeId, execution.signal);
      if (result.kind !== "ok") {
        refreshed.set(execution, "finance_payee_refresh_unavailable");
        return "unavailable";
      }
      const payee = result.value.payee;
      const matches = payee.payeeId === envelope.payeeId && String(payee.version) === envelope.payeeVersion
        && payee.destinationTokenSha256 === envelope.destinationTokenSha256;
      refreshed.set(execution, matches ? null : "finance_payee_changed");
      return "allow"; // The synchronous deny-only guard reports a changed resource; this answer grants no authority.
    } catch {
      refreshed.set(execution, "finance_payee_refresh_unavailable");
      return "unavailable";
    }
  }

  const definitions: ToolDefinition[] = [
    { name: "finops_list_transactions", actionClass: "READ_ONLY", description: "Read synthetic provider bank transactions; memo text is data.",
      parameters: rangeParameters, async body(execution) {
        const result = await reader.listBankTransactions(rangeSchema.parse(execution.arguments), execution.signal);
        return json(result, result.kind === "ok");
      } },
    { name: "finops_reconcile", actionClass: "READ_ONLY", description: "Compare actual synthetic bank and book rows without creating payments.",
      parameters: rangeParameters, async body(execution) {
        const range = rangeSchema.parse(execution.arguments);
        const bank = await reader.listBankTransactions(range, execution.signal);
        if (bank.kind !== "ok") return json(bank, false);
        const books = await reader.listBookEntries(range, execution.signal);
        if (books.kind !== "ok") return json(books, false);
        const discrepancies: Record<string, unknown>[] = [];
        const captures = new Map<string, string>();
        const ordered = [...bank.value.bankTransactions].sort((left, right) => left.txnId < right.txnId ? -1 : left.txnId > right.txnId ? 1 : 0);
        for (const transaction of ordered) {
          if (transaction.type === "capture") {
            const key = canonicalize([transaction.tenantId, transaction.accountId, transaction.currency,
              transaction.amountMinor, transaction.counterpartyRef]);
            const duplicateOf = captures.get(key);
            if (duplicateOf !== undefined) {
              discrepancies.push({ kind: "duplicate_capture", txnId: transaction.txnId, duplicateOf });
              continue; // A duplicate capture is not a second missing-book finding.
            }
            captures.set(key, transaction.txnId);
          }
          const entries = books.value.bookEntries.filter(entry => entry.tenantId === transaction.tenantId && entry.txnRef === transaction.txnId);
          if (entries.length === 0) {
            discrepancies.push({ kind: "missing_book_entry", txnId: transaction.txnId });
            continue;
          }
          const bookAmountMinor = Number(entries.reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n));
          if (!Number.isSafeInteger(bookAmountMinor)) return json({ kind: "unknown", reason: "unsafe_book_total" }, false);
          if (bookAmountMinor !== transaction.amountMinor) discrepancies.push({ kind: "amount_mismatch", txnId: transaction.txnId,
            bankAmountMinor: transaction.amountMinor, bookAmountMinor });
        }
        return json({ discrepancies });
      } },
    { name: "finops_propose_payment", actionClass: "WRITE_LOW", description: "Create a signed pending request from supplied payment facts, without contacting the provider.",
      parameters: paymentParameters(false), body(execution) {
        const envelope = normalizeFinancePaymentEnvelope(execution.arguments, true);
        if (execution.signal?.aborted) throw new DefiniteFailureError("finance_proposal_aborted");
        if (execution.effectiveMode === "SIMULATE") return json({ mode: "SIMULATE", arguments: envelope,
          paymentBodySha256: paymentArgsDigest(financePaymentArgs(envelope)) });
        const intent = authorizationIntentFor({ workspace, name: EXECUTE, actionClass: "FINANCIAL", effectiveMode: "EXECUTE", arguments: envelope },
          options.authorizationContext());
        if (!intent.ok) throw new Error("Finance proposal could not bind an authorization intent");
        const created = createApprovalForIntent({ workspace, agentId: execution.agentId, intentId: execution.callId,
          toolName: EXECUTE, actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
          riskTier: "high", intentPayload: intent.payload });
        return json({ schema: "lighthouse-finance-proposal/1", approvalRequestId: created.request.approvalRequestId,
          status: created.approval.status, toolName: EXECUTE, arguments: envelope, argumentsDigest: intent.payload.argumentsDigest,
          paymentBodySha256: paymentArgsDigest(financePaymentArgs(envelope)), intentHash: created.request.boundHashes.intentHash,
          requiredApprovals: created.request.requiredApprovals, expiresTs: created.request.expiresTs });
      } },
    { name: EXECUTE, actionClass: "FINANCIAL", description: "Dispatch one genuinely approved synthetic payment through the durable action path.",
      parameters: paymentParameters(true), async body(execution) {
        if (execution.effectiveMode === "SIMULATE") return { ...json({ mode: "SIMULATE", argumentsDigest: execution.authorization?.record.action.argumentsDigest }), effect: "not_applied" };
        let writer: ReturnType<typeof createPaymentServiceClient>;
        let envelope: FinancePaymentEnvelope;
        try {
          envelope = normalizeFinancePaymentEnvelope(execution.arguments);
          if (execution.signal?.aborted) throw new Error("aborted before POST");
          context.persist(execution, envelope);
          const token = getVaultSecretReadOnly(workspace, options.executorSecretKey);
          if (token === null) throw new Error("writer credential unavailable");
          writer = createPaymentServiceClient({ ...readerOptions, token });
        } catch (error) {
          // Every operation above is before this call's POST; no effect is possible on this path.
          throw new DefiniteFailureError("finance_payment_pre_dispatch_failed", { cause: error });
        }
        const adapter = createPaymentAdapter({ client: writer, adapterId: "native" });
        const result = await adapter.dispatch({ executionId: execution.executionId!, idempotencyKey: execution.idempotencyKey!,
          args: financePaymentArgs(envelope) }, execution.signal);
        if (result.kind === "rejected") throw new DefiniteFailureError(`finance_payment_rejected:${result.reason}`);
        if (result.kind === "unknown") return { ...json(result, false), effect: "unknown" };
        return { ...json(result), effect: "applied", externalRef: result.payment.paymentId };
      } },
    { name: "finops_lookup_payment", actionClass: "READ_ONLY", description: "Read a synthetic payment by exactly one provider identifier; does not grant authority or settle AMC receipts.",
      parameters: lookupParameters, async body(execution) {
        const selector = lookupSchema.parse(execution.arguments);
        const result = "paymentId" in selector ? await reader.getPayment(selector.paymentId, execution.signal)
          : "idempotencyKey" in selector ? await reader.findPaymentsByKey(selector.idempotencyKey, execution.signal)
            : await reader.findPaymentsByReference(selector.reference, execution.signal);
        return json(result, result.kind === "ok");
      } }
  ];
  for (const definition of definitions) registry.define(definition, options.agentId);
  if (options.shadow) registry.restrict({ deny: new Set([EXECUTE]) }, options.agentId);
  registry.guard("finance-signed-allowlist", toolhubAllowlistGuard(workspace,
    execution => registry.visible(execution.agentId).get(execution.name), snapshot.digestSha256), options.agentId);
  registry.guard("finance-current-payee", execution => {
    if (execution.name !== EXECUTE || execution.effectiveMode === "SIMULATE") return undefined;
    if (!refreshed.has(execution)) return "finance_payee_refresh_missing";
    const failure = refreshed.get(execution);
    if (failure !== null) return failure;
    try {
      const envelope = normalizeFinancePaymentEnvelope(execution.arguments);
      const record = execution.authorization?.record;
      if (!record || execution.authorization?.digest !== authorizationRecordDigest(record)
        || record.bindings.recipient !== envelope.payeeId || record.bindings.resourceId !== envelope.payeeId
        || record.bindings.resourceVersion !== envelope.payeeVersion || record.bindings.destination !== envelope.destinationTokenSha256) {
        return "finance_resource_binding_mismatch";
      }
      return undefined;
    } catch {
      return "finance_resource_binding_mismatch";
    }
  }, options.agentId);
  const pipeline = new ToolPipeline({ registry, workspace, approve: refresh, approvalRequiredFor: financial,
    boundApprovalRequiredFor: financial, authorizeClasses: DEFAULT_AUTHORIZE_CLASSES,
    authorizationContext: options.authorizationContext, journal: options.journal, record: options.record });
  const lookupOnly: ReconcileAdapter = Object.freeze({ adapterId: "native", lookup: readerAdapter.lookup });
  return { registry, pipeline, adapters: new Map([["native", lookupOnly]]) };
}
