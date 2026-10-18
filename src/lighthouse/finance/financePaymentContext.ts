import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, writeFileSync
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ActionJournal } from "../../actions/actionJournal.js";
import { authorizationRecordDigest, type AuthorizationRecordV1 } from "../../actions/authorizationRecord.js";
import { normalizeArguments } from "../../actions/normalizeArguments.js";
import type { ReconcileQuery } from "../../actions/reconcile.js";
import type { ActionIntentV1 } from "../../actions/receiptStates.js";
import { authorizationRecordV1Schema } from "../../contracts/v1/authorizationRecord.js";
import type { ToolExecution } from "../../tools/toolTypes.js";
import { canonicalize } from "../../utils/json.js";
import { workspaceIdFromDirectory } from "../../workspaces/workspaceId.js";
import {
  normalizePaymentArgs, paymentArgsDigest, paymentArgsSchema, paymentMinorToDecimal, type PaymentArgs
} from "./paymentArgs.js";
import type { PaymentLookupContext } from "./paymentAdapter.js";

export const financePaymentBindingFields = Object.freeze({
  amount: "amount", currency: "currency", recipient: "payeeId", destination: "destinationTokenSha256",
  resourceId: "payeeId", resourceVersion: "payeeVersion"
});

const version = z.string().regex(/^[1-9][0-9]*$/).refine(value =>
  Number.isSafeInteger(Number(value)) && String(Number(value)) === value, "payeeVersion must be a canonical safe integer");
const envelopeSchema = paymentArgsSchema.extend({
  amount: z.string(), payeeVersion: version, destinationTokenSha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
const proposalSchema = envelopeSchema.extend({ amount: z.string().optional() });
export type FinancePaymentEnvelope = z.infer<typeof envelopeSchema>;

/** The only projection permitted on the provider wire; no authority or resource metadata enters POST. */
export function financePaymentArgs(envelope: FinancePaymentEnvelope): PaymentArgs {
  return normalizePaymentArgs({ kind: envelope.kind, sourceAccountId: envelope.sourceAccountId, payeeId: envelope.payeeId,
    amountMinor: envelope.amountMinor, currency: envelope.currency, reference: envelope.reference,
    ...(envelope.originalTxnId === undefined ? {} : { originalTxnId: envelope.originalTxnId }) });
}

export function normalizeFinancePaymentEnvelope(input: unknown, proposal = false): FinancePaymentEnvelope {
  const parsed = proposal ? proposalSchema.parse(input) : envelopeSchema.parse(input);
  const amount = paymentMinorToDecimal(parsed.amountMinor);
  if (parsed.amount !== undefined && parsed.amount !== amount) throw new Error("amount does not match amountMinor");
  return { ...financePaymentArgs({ ...parsed, amount }), amount, payeeVersion: parsed.payeeVersion,
    destinationTokenSha256: parsed.destinationTokenSha256 };
}

const fixedDefinition = { name: "finops_execute_payment", actionClass: "FINANCIAL" as const,
  bindingFields: financePaymentBindingFields };
const preimageSchema = z.object({ schema: z.literal("lighthouse-finance-preimage/1"),
  authorizationRecord: authorizationRecordV1Schema, arguments: envelopeSchema }).strict();
const MAX_PREIMAGE_BYTES = 256 * 1024;
const executionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const same = (left: unknown, right: unknown): boolean => canonicalize(left) === canonicalize(right);

function assertMatch(condition: unknown): asserts condition {
  if (!condition) throw new Error("Finance payment context does not match its signed intent");
}

/** Fixed finance mapping; a historical lookup does not reinterpret today's changed policy or consume approvals. */
function matchIntent(record: AuthorizationRecordV1, envelope: FinancePaymentEnvelope, intent: ActionIntentV1,
  workspaceId: string, agentId: string): void {
  const normalized = normalizeArguments(fixedDefinition, "FINANCIAL", envelope);
  assertMatch(normalized.ok);
  assertMatch(record.executionId === intent.executionId && record.authorizationId === intent.authorizationId);
  assertMatch(authorizationRecordDigest(record) === intent.authorizationDigest);
  assertMatch(record.scope.workspaceId === workspaceId && intent.workspaceId === workspaceId);
  assertMatch(record.subject.governedAs === agentId && intent.agentId === agentId);
  assertMatch(record.action.toolName === "finops_execute_payment" && intent.toolName === record.action.toolName);
  assertMatch(record.action.adapterId === "native" && intent.adapterId === "native");
  assertMatch(record.action.actionClass === "FINANCIAL" && intent.actionClass === "FINANCIAL" && record.action.mode === "EXECUTE");
  assertMatch(record.action.normalizer === normalized.normalizer && record.action.argumentsDigest === normalized.argumentsDigest);
  assertMatch(intent.argumentsDigest === normalized.argumentsDigest && same(record.bindings, normalized.bindings));
  assertMatch(same(intent.bindings, normalized.bindings));
  assertMatch(record.idempotencyKey !== null && intent.idempotencyKey === record.idempotencyKey);
  assertMatch(record.session.sessionId === intent.sessionId && record.session.callId === intent.callId);
  assertMatch(record.delegation.parentExecutionId === intent.parentExecutionId);
}

function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assertMatch(fstatSync(fd).isDirectory());
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Static no-follow checks. These do not provide atomic protection against concurrent same-UID path replacement. */
function directory(root: string, create: boolean): string {
  let path = root;
  for (const part of [".amc", "lighthouse-finance", "preimages"]) {
    const parent = path;
    path = join(parent, part);
    let info;
    try {
      info = lstatSync(path);
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      mkdirSync(path, { mode: 0o700 });
      info = lstatSync(path);
      syncDirectory(parent);
    }
    assertMatch(info.isDirectory() && !info.isSymbolicLink());
  }
  return path;
}

export function createFinancePaymentContext(options: {
  readonly workspace: string;
  readonly agentId: string;
  /** The caller owns this journal and its lifecycle; opening it can perform writable recovery. */
  readonly journal: () => ActionJournal;
}): {
  persist(execution: ToolExecution, envelope: FinancePaymentEnvelope): void;
  resolveLookupContext(query: ReconcileQuery, signal: AbortSignal): Promise<PaymentLookupContext | null>;
} {
  const root = realpathSync(options.workspace);
  const workspaceId = workspaceIdFromDirectory(root);

  function viewFor(executionId: string) {
    assertMatch(executionIdPattern.test(executionId));
    const journal = options.journal();
    assertMatch(realpathSync(journal.workspace) === root && journal.workspaceId === workspaceId);
    // get() verifies the signed chain and checks the stored intent hash against its receipt-bound digest.
    const view = journal.get(executionId);
    assertMatch(view !== null && view.executionId === executionId && view.receipts.length > 0 && view.intent !== null);
    assertMatch(view.receipts.some(receipt => receipt.state === "started"));
    return { view, intent: view.intent };
  }

  return {
    persist(execution, input) {
      assertMatch(execution.executionId !== undefined && execution.authorization !== undefined);
      assertMatch(execution.agentId === options.agentId && realpathSync(execution.workspace) === root);
      assertMatch(execution.effectiveMode === "EXECUTE" && execution.name === "finops_execute_payment");
      const envelope = normalizeFinancePaymentEnvelope(input);
      const record = authorizationRecordV1Schema.parse(execution.authorization.record);
      const { view, intent } = viewFor(execution.executionId);
      assertMatch(view.state === "started" && record.executionId === execution.executionId);
      assertMatch(execution.authorization.authorizationId === record.authorizationId);
      assertMatch(execution.authorization.digest === authorizationRecordDigest(record));
      assertMatch(execution.idempotencyKey === record.idempotencyKey && execution.idempotencyHeader === "Idempotency-Key");
      matchIntent(record, envelope, intent, workspaceId, options.agentId);
      const parent = directory(root, true);
      const body = canonicalize({ schema: "lighthouse-finance-preimage/1", authorizationRecord: record, arguments: envelope });
      assertMatch(Buffer.byteLength(body) <= MAX_PREIMAGE_BYTES);
      const fd = openSync(join(parent, `${execution.executionId}.json`),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        writeFileSync(fd, body, "utf8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      syncDirectory(parent);
    },
    async resolveLookupContext(query, signal) {
      try {
        if (signal.aborted) return null;
        const { intent } = viewFor(query.executionId);
        assertMatch(query.executionId === intent.executionId);
        assertMatch(query.toolName === intent.toolName && query.idempotencyKey === intent.idempotencyKey);
        assertMatch(query.argumentsDigest === intent.argumentsDigest && query.startedAt === intent.startedAt);
        assertMatch(same(query.bindings, intent.bindings));
        const path = join(directory(root, false), `${query.executionId}.json`);
        const info = lstatSync(path);
        assertMatch(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= MAX_PREIMAGE_BYTES);
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        let body: Buffer;
        try {
          const opened = fstatSync(fd);
          assertMatch(opened.isFile() && opened.dev === info.dev && opened.ino === info.ino && opened.nlink === 1);
          body = readFileSync(fd);
          assertMatch(body.length <= MAX_PREIMAGE_BYTES);
        } finally {
          closeSync(fd);
        }
        const preimage = preimageSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
        const envelope = normalizeFinancePaymentEnvelope(preimage.arguments);
        matchIntent(preimage.authorizationRecord, envelope, intent, workspaceId, options.agentId);
        if (signal.aborted) return null;
        return { executionId: intent.executionId, argumentsDigest: intent.argumentsDigest,
          reference: envelope.reference, paymentBodySha256: paymentArgsDigest(financePaymentArgs(envelope)) };
      } catch {
        // No context is an unknown observation, never permission to GET with caller-invented correlation or to POST.
        return null;
      }
    }
  };
}
