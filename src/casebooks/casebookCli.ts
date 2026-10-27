import { resolveAgentId } from "../fleet/paths.js";
import { resolve } from "node:path";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { workOrderSchema } from "../workorders/workorderSchema.js";
import { loadWorkOrder, verifyWorkOrder } from "../workorders/workorderEngine.js";
import {
  addCaseToCasebook, addCaseToCasebookAsync,
  initCasebook, initCasebookAsync,
  listCasebooks,
  verifyCasebook
} from "./casebookStore.js";

export function casebookInitCli(params: { workspace: string; agentId?: string; casebookId?: string }) {
  return initCasebook(params.workspace, params.agentId, params.casebookId ?? "default");
}

export function casebookListCli(params: { workspace: string; agentId?: string }) {
  return listCasebooks(params.workspace, params.agentId);
}

export function casebookVerifyCli(params: { workspace: string; agentId?: string; casebookId: string }) {
  return verifyCasebook(params.workspace, params.casebookId, params.agentId);
}

export function casebookAddFromWorkOrderCli(params: {
  workspace: string;
  agentId?: string;
  casebookId: string;
  workOrderId: string;
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const workOrder = loadWorkOrder({
    workspace: params.workspace,
    agentId,
    workOrderId: params.workOrderId,
    requireValidSignature: true
  });

  return addCaseToCasebook({
    workspace: params.workspace,
    agentId,
    casebookId: params.casebookId,
    title: `From workorder ${workOrder.workOrderId}`,
    description: workOrder.description,
    riskTier: workOrder.riskTier,
    requestedMode: workOrder.requestedMode,
    allowedActionClasses: workOrder.allowedActionClasses,
    prompt: `${workOrder.title}\n\n${workOrder.description}`,
    forbiddenAudits: ["EXECUTE_WITHOUT_TICKET_ATTEMPTED", "TOOLHUB_BYPASS_ATTEMPTED"]
  });
}

export function casebookInitCliAsync(params: { workspace: string; agentId?: string; casebookId?: string }, beforePublish?: () => void) {
  return initCasebookAsync(params.workspace, params.agentId, params.casebookId ?? "default", { beforePublish });
}

export async function casebookAddFromWorkOrderCliAsync(supplied: Parameters<typeof casebookAddFromWorkOrderCli>[0], beforePublish?: () => void) {
  const params = { ...supplied, workspace: resolve(supplied.workspace) }, caller = beforePublish;
  caller?.();
  const agentId = resolveAgentId(params.workspace, params.agentId), sourceInput = { workspace: params.workspace, agentId, workOrderId: params.workOrderId };
  const verification = verifyWorkOrder(sourceInput), source = captureOrgPairs([verification.path]);
  const body = orgPairBytes(source, verification.path), sidecar = orgPairBytes(source, verification.sigPath);
  if (body === null || sidecar === null) throw new Error("source work order signed pair is missing");
  const workOrder = workOrderSchema.parse(JSON.parse(body.toString("utf8"))), signed = JSON.parse(sidecar.toString("utf8")) as { digestSha256: string; signature: string };
  const digest = sha256Hex(body), original = canonicalize(workOrder);
  const assertSourceCurrent = () => {
    caller?.(); assertOrgPairsCurrent(source);
    const current = verifyWorkOrder(sourceInput);
    if (resolveAgentId(params.workspace, params.agentId) !== agentId || current.path !== verification.path || !current.valid || current.expired
      || signed.digestSha256 !== digest || !verifyRawConfigSignature(params.workspace, digest, signed.signature)
      || canonicalize(loadWorkOrder({ ...sourceInput, requireValidSignature: true })) !== original)
      throw new Error("source work order or its current admission changed while creating the case");
    assertOrgPairsCurrent(source);
  };
  assertSourceCurrent();
  return addCaseToCasebookAsync({ workspace: params.workspace, agentId, casebookId: params.casebookId,
    title: `From workorder ${workOrder.workOrderId}`, description: workOrder.description, riskTier: workOrder.riskTier,
    requestedMode: workOrder.requestedMode, allowedActionClasses: workOrder.allowedActionClasses,
    prompt: `${workOrder.title}\n\n${workOrder.description}`, forbiddenAudits: ["EXECUTE_WITHOUT_TICKET_ATTEMPTED", "TOOLHUB_BYPASS_ATTEMPTED"]
  }, { beforePublish: assertSourceCurrent, protectedInputs: [verification.path, verification.sigPath] });
}
