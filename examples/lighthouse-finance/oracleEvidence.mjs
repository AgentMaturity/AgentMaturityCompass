/** Independent, read-only finance-fixture evidence checks. No AMC or provider imports. */
import { createHash, verify } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import Database from 'better-sqlite3';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canonical = value => JSON.stringify(sorted(value));
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const insist = (ok, message) => { if (!ok) throw new Error(message); };
export const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ident = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const same = (a, b) => canonical(a) === canonical(b);
const text = value => typeof value === 'string' && value.length > 0;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const nullable = (value, predicate) => value === null || predicate(value);

export function within(root, path) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
export function regular(path, max = 2 * 1024 * 1024) {
  const stat = lstatSync(path);
  insist(stat.isFile() && !stat.isSymbolicLink() && stat.size <= max, 'not a bounded regular file: ' + path);
  const bytes = readFileSync(path), after = lstatSync(path);
  insist(stat.dev === after.dev && stat.ino === after.ino && bytes.length === stat.size
    && stat.size === after.size && stat.mtimeMs === after.mtimeMs, 'file changed while reading: ' + path);
  return { bytes, pin: { path, dev: stat.dev, ino: stat.ino, bytes: bytes.length, sha256: sha256(bytes) } };
}
export function jsonFile(path, max, tracked) {
  const value = regular(path, max);
  tracked?.set(path, value.pin);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value.bytes));
}
function insideFile(root, path) {
  insist(within(root, path) && within(root, realpathSync(path)), 'file escaped its anchored root');
  return path;
}
export function snapshot(workspace) {
  const amc = join(workspace, '.amc');
  const paths = [join(amc, 'evidence.sqlite'), join(amc, 'evidence.sqlite-wal')];
  const keyDir = join(amc, 'keys');
  insist(realpathSync(keyDir) === keyDir && lstatSync(keyDir).isDirectory(), 'unsafe public key directory');
  for (const name of readdirSync(keyDir).sort()) paths.push(join(keyDir, name));
  return paths.map(path => {
    try { return regular(path, 128 * 1024 * 1024).pin; }
    catch (error) { if (error.code === 'ENOENT') return { path, absent: true }; throw error; }
  });
}
export function coordination(workspace) {
  const path = join(workspace, '.amc', 'evidence.sqlite-shm');
  try { return regular(path, 1024 * 1024).pin; }
  catch (error) { if (error.code === 'ENOENT') return { path, absent: true }; return { path, error: error.message }; }
}
function signedArtifact(path, auditor, tracked) {
  const value = regular(path), signature = jsonFile(path + '.sig', 64 * 1024, tracked);
  tracked.set(path, value.pin);
  insist(object(signature) && signature.signer === 'auditor' && signature.digestSha256 === value.pin.sha256
    && typeof signature.signature === 'string'
    && verify(null, Buffer.from(value.pin.sha256, 'hex'), auditor, Buffer.from(signature.signature, 'base64')),
  'auditor signature refused: ' + path);
  return value.bytes;
}
function signedJson(path, auditor, tracked) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(signedArtifact(path, auditor, tracked)));
}
const STATES = ['requested', 'authorized', 'started', 'completed', 'denied', 'cancelled', 'outcome_unknown'];
const ALLOWED = { none: ['requested'], requested: ['authorized', 'denied', 'cancelled'],
  authorized: ['started', 'denied', 'cancelled'], started: ['completed', 'outcome_unknown'],
  outcome_unknown: ['completed'], completed: [], denied: [], cancelled: [] };
function transition(previous, next) {
  const settles = previous?.state === 'outcome_unknown' ? next.state === 'completed'
    : previous?.state === 'completed' && !previous.evidenceComplete && next.state === 'completed' && next.evidenceComplete;
  const resolved = next.resolution !== null;
  if (resolved || settles) return resolved && settles;
  if (previous?.state === next.state) return previous.evidenceComplete && !next.evidenceComplete;
  return ALLOWED[previous?.state ?? 'none'].includes(next.state);
}
const RECEIPT_KEYS = ['schema', 'executionId', 'workspaceId', 'agentId', 'seq', 'state', 'previousState', 'reasonCode',
  'effect', 'evidenceComplete', 'authorizationDigest', 'intentDigest', 'idempotencyKey', 'resolution', 'outcomeDigest',
  'externalRef', 'at', 'prevReceiptDigest'];
function actionReceipt(raw) {
  insist(keys(raw, RECEIPT_KEYS) && raw.schema === 'amc.action-receipt/v1'
    && ident(raw.executionId) && ident(raw.agentId) && text(raw.workspaceId) && Number.isSafeInteger(raw.seq) && raw.seq >= 0
    && STATES.includes(raw.state) && nullable(raw.previousState, v => STATES.includes(v)) && text(raw.reasonCode)
    && [null, 'applied', 'not_applied'].includes(raw.effect) && typeof raw.evidenceComplete === 'boolean'
    && nullable(raw.authorizationDigest, hex) && nullable(raw.intentDigest, hex) && nullable(raw.idempotencyKey, text)
    && [null, 'adapter', 'operator'].includes(raw.resolution) && nullable(raw.outcomeDigest, hex)
    && nullable(raw.externalRef, v => typeof v === 'string') && time(raw.at) && nullable(raw.prevReceiptDigest, hex), 'invalid action receipt');
  return raw;
}
function decodedReceipt(signed) {
  insist(typeof signed === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(signed), 'malformed signed receipt');
  const bytes = Buffer.from(signed.split('.')[0], 'base64url');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function workspaceId(workspace) {
  const parts = workspace.replaceAll('\\', '/').split('/').filter(Boolean), position = parts.lastIndexOf('workspaces');
  const candidate = parts[position + 1];
  return position >= 0 && /^[a-z0-9][a-z0-9-]{1,62}$/.test(candidate ?? '') ? candidate : 'default';
}
function chain(index, transitions, evidence, expected) {
  insist(transitions.length > 0, 'execution has no receipt chain');
  const receipts = [], receiptIds = [], usedEvents = new Set();
  for (const [position, row] of transitions.entries()) {
    const receipt = actionReceipt(JSON.parse(row.receipt_json)), previous = receipts.at(-1) ?? null;
    insist(row.seq === position && receipt.seq === position && canonical(receipt) === row.receipt_json
      && sha256(row.receipt_json) === row.receipt_digest, 'action receipt bytes/position mismatch');
    insist(receipt.executionId === index.execution_id && receipt.workspaceId === workspaceId(expected.workspace)
      && receipt.agentId === expected.agentId && receipt.previousState === (previous?.state ?? null)
      && receipt.prevReceiptDigest === (position ? transitions[position - 1].receipt_digest : null)
      && (!previous || previous.idempotencyKey === receipt.idempotencyKey) && transition(previous, receipt), 'action linkage/transition mismatch');
    const event = evidence.get(row.evidence_event_id);
    insist(event && !usedEvents.has(event.id), 'missing or reused action evidence'); usedEvents.add(event.id);
    // Cold CLI authenticates this unchanged event and its v2 signature. Independently bind every action-specific member.
    insist(event.event_type === 'audit' && event.payload_inline === row.receipt_json
      && event.payload_sha256 === row.receipt_digest && !event.payload_pruned && !event.archived, 'action payload is not complete inline evidence');
    const meta = JSON.parse(event.meta_json), v2 = decodedReceipt(meta.receipt);
    insist(meta.auditType === 'ACTION_STATE' && meta.executionId === receipt.executionId && meta.seq === position
      && meta.state === receipt.state && meta.agentId === receipt.agentId && meta.evidenceComplete === receipt.evidenceComplete
      && v2.v === 2 && v2.kind === 'action_state' && v2.executionId === receipt.executionId && v2.agentId === receipt.agentId
      && v2.state === receipt.state && v2.event_hash === event.event_hash && v2.body_sha256 === row.receipt_digest
      && v2.session_id === event.session_id && v2.authorizationRecordDigest === receipt.authorizationDigest
      && v2.idempotencyKey === receipt.idempotencyKey && v2.enforcement?.level === 'enforced'
      && v2.enforcement.boundary === 'tool-pipeline' && text(v2.receipt_id), 'v2 action/evidence member mismatch');
    insist((receipt.resolution !== null) === (v2.reconciliation !== undefined), 'reconciliation marker mismatch');
    if (receipt.resolution !== null) insist(v2.reconciliation.fromReceiptId === receiptIds.at(-1)
      && v2.reconciliation.reconciledAt === receipt.at, 'reconciliation predecessor mismatch');
    if (receipt.state === 'denied') insist(v2.reason === receipt.reasonCode, 'denial reason mismatch');
    if (!position) insist(meta.agentSessionId === index.session_id && meta.callId === index.call_id, 'request session/call mismatch');
    if (previous?.authorizationDigest !== null && previous?.authorizationDigest !== undefined) insist(receipt.authorizationDigest === previous.authorizationDigest, 'authorization digest changed within action');
    if (previous?.intentDigest !== null && previous?.intentDigest !== undefined) insist(receipt.intentDigest === previous.intentDigest, 'intent digest changed within action');
    receipts.push(receipt); receiptIds.push(v2.receipt_id);
  }
  const head = receipts.at(-1), last = transitions.at(-1);
  insist([0, 1].includes(index.evidence_complete) && index.last_receipt_digest === last.receipt_digest && index.state === head.state && index.effect === head.effect
    && Boolean(index.evidence_complete) === head.evidenceComplete && index.authorization_digest === head.authorizationDigest
    && index.idempotency_key === head.idempotencyKey && index.workspace_id === head.workspaceId
    && index.agent_id === head.agentId, 'action index/head mismatch');
  const intent = index.intent_json === null ? null : JSON.parse(index.intent_json);
  if (head.intentDigest !== null) insist(keys(intent, ['schema', 'executionId', 'authorizationId', 'authorizationDigest', 'workspaceId', 'agentId', 'toolName', 'adapterId', 'actionClass', 'argumentsDigest', 'bindings', 'idempotencyKey', 'parentExecutionId', 'sessionId', 'callId', 'owner', 'startedAt'])
    && keys(intent.owner, ['pid', 'hostname']) && Number.isSafeInteger(intent.owner.pid) && intent.owner.pid > 0 && text(intent.owner.hostname) && time(intent.startedAt) && canonical(intent) === index.intent_json
    && sha256(index.intent_json) === head.intentDigest && intent.schema === 'amc.action-intent/v1'
    && intent.executionId === index.execution_id && intent.workspaceId === head.workspaceId && intent.agentId === head.agentId
    && intent.toolName === index.tool_name && intent.actionClass === index.action_class && intent.idempotencyKey === head.idempotencyKey
    && intent.sessionId === index.session_id && intent.callId === index.call_id
    && intent.parentExecutionId === index.parent_execution_id, 'durable intent mismatch');
  else insist(intent === null, 'unexpected unbound intent');
  return { index, head, receipts, intent, transitions };
}
export function minorDecimal(minor) {
  insist(Number.isSafeInteger(minor) && minor > 0, 'invalid minor amount');
  const n = BigInt(minor), raw = String(n / 100n) + '.' + String(n % 100n).padStart(2, '0');
  return raw.replace(/0+$/, '').replace(/\.$/, '');
}
export const PAYMENT_KEYS = ['kind', 'sourceAccountId', 'payeeId', 'amountMinor', 'currency', 'reference'];
export function paymentBody(value) {
  insist(keys(value, PAYMENT_KEYS, ['originalTxnId']) && ['refund', 'payout'].includes(value.kind)
    && typeof value.sourceAccountId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.sourceAccountId)
    && typeof value.payeeId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.payeeId) && Number.isSafeInteger(value.amountMinor) && value.amountMinor > 0
    && value.currency === 'USD' && typeof value.reference === 'string' && /^[A-Za-z0-9-]{1,35}$/.test(value.reference)
    && (value.originalTxnId === undefined || (typeof value.originalTxnId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.originalTxnId))), 'invalid payment body');
  return Object.fromEntries([...PAYMENT_KEYS, ...(value.originalTxnId === undefined ? [] : ['originalTxnId'])].map(key => [key, value[key]]));
}
function normalizedEnvelope(value) {
  insist(keys(value, [...PAYMENT_KEYS, 'amount', 'payeeVersion', 'destinationTokenSha256'], ['originalTxnId']), 'invalid finance envelope fields');
  const result = Object.fromEntries(Object.entries(value).map(([key, v]) => [key, typeof v === 'string' ? v.normalize('NFC') : v]));
  insist(result.amount === minorDecimal(result.amountMinor) && typeof result.payeeVersion === 'string'
    && /^[1-9][0-9]*$/.test(result.payeeVersion) && Number.isSafeInteger(Number(result.payeeVersion))
    && hex(result.destinationTokenSha256), 'inconsistent amount/resource preimage');
  paymentBody(Object.fromEntries(Object.entries(result).filter(([key]) => PAYMENT_KEYS.includes(key) || key === 'originalTxnId')));
  return result;
}
function intentPayload(record) {
  return { schema: 'amc.authorization-intent/v1', toolName: record.action.toolName, adapterId: record.action.adapterId,
    actionClass: record.action.actionClass, argumentsDigest: record.action.argumentsDigest, bindings: record.bindings,
    deploymentDigest: record.scope.deploymentDigest, workspaceId: record.scope.workspaceId };
}
/** This finite oracle recognizes only the independently reviewed current default FINANCIAL profile. */
export function financialRule(pins) {
  const rule = pins.financialRule;
  insist(keys(rule, ['requiredApprovals', 'requireDistinctUsers', 'rolesAllowed', 'ttlMinutes'])
    && rule.requiredApprovals === 2 && rule.requireDistinctUsers === true && rule.ttlMinutes === 10
    && Array.isArray(rule.rolesAllowed) && rule.rolesAllowed.length === 2 && new Set(rule.rolesAllowed).size === 2
    && same([...rule.rolesAllowed].sort(), ['AUDITOR', 'OWNER']), 'unsupported external FINANCIAL rule');
  return rule;
}
function approvals(record, view, pins, tracked) {
  const startedAt = Date.parse(view.intent.startedAt), named = record.authority.approvals, rule = financialRule(pins);
  insist(Array.isArray(named) && named.length > 0, 'financial approval is missing');
  const allApprovers = new Set();
  for (const approval of named) {
    insist(ident(approval.approvalRequestId), 'unsafe approval id');
    const request = signedJson(insideFile(pins.workspace, join(pins.approvalsDir, 'requests', approval.approvalRequestId + '.json')), pins.auditor.publicKeyPem, tracked);
    const binding = sha256(canonical({ ...request, status: 'PENDING' })), wantedIntent = sha256(canonical(intentPayload(record)));
    insist(request.v === 1 && request.agentId === pins.agentId && request.approvalRequestId === approval.approvalRequestId
      && request.toolName === pins.toolName && request.actionClass === 'FINANCIAL' && request.effectiveMode === 'EXECUTE'
      && request.requestedMode === 'EXECUTE' && request.status === 'CONSUMED' && binding === approval.requestBindingDigest
      && request.boundHashes.intentHash === approval.intentHash && wantedIntent === approval.intentHash
      && same(request.authorizationIntent, intentPayload(record)) && approval.actionClass === 'FINANCIAL'
      && request.boundHashes.toolsHash === record.policy.toolsConfigDigest && request.boundHashes.policyHash === record.policy.actionPolicyDigest
      && request.boundHashes.budgetsHash === record.policy.budgetsDigest && Number.isSafeInteger(request.createdTs)
      && Number.isSafeInteger(request.expiresTs) && request.createdTs <= startedAt && request.expiresTs > startedAt
      && Date.parse(approval.expiresAt) === request.expiresTs, 'approval intent/policy/expiry mismatch');
    insist(request.requiredApprovals === rule.requiredApprovals && request.requireDistinctUsers === rule.requireDistinctUsers
      && Array.isArray(request.rolesAllowed) && new Set(request.rolesAllowed).size === request.rolesAllowed.length
      && same([...request.rolesAllowed].sort(), [...rule.rolesAllowed].sort())
      && request.expiresTs - request.createdTs === rule.ttlMinutes * 60_000, 'request weakens or differs from the external FINANCIAL rule');
    const consumed = signedJson(insideFile(pins.workspace, join(pins.approvalsDir, 'consumed', approval.approvalRequestId + '.json')), pins.auditor.publicKeyPem, tracked);
    insist(consumed.v === 1 && consumed.agentId === pins.agentId && consumed.approvalRequestId === approval.approvalRequestId
      && consumed.executionId === view.index.execution_id && Number.isSafeInteger(consumed.consumedTs)
      && consumed.consumedTs >= request.createdTs && consumed.consumedTs <= startedAt && consumed.consumedTs < request.expiresTs, 'approval consumption mismatch');
    const approvers = [], decisionDir = join(pins.approvalsDir, 'decisions');
    insist(realpathSync(decisionDir) === decisionDir, 'unsafe decisions directory');
    for (const name of readdirSync(decisionDir).sort()) {
      if (!name.endsWith('.json')) continue;
      const decision = signedJson(insideFile(pins.workspace, join(decisionDir, name)), pins.auditor.publicKeyPem, tracked);
      if (decision.approvalRequestId !== approval.approvalRequestId) continue;
      insist(decision.v === 1 && decision.agentId === pins.agentId && text(decision.userId) && Array.isArray(decision.roles)
        && decision.requestDigestSha256 === binding && Number.isSafeInteger(decision.decisionTs)
        && decision.decisionTs >= request.createdTs && decision.decisionTs <= consumed.consumedTs, 'decision binding/time mismatch');
      if (!decision.roles.some(role => request.rolesAllowed.includes(role))) continue;
      insist(decision.decision !== 'DENY', 'signed approval was denied');
      if (decision.decision !== 'APPROVE_EXECUTE') continue;
      if (request.requireDistinctUsers) insist(!approvers.includes(decision.userId), 'duplicate approving identity');
      approvers.push(decision.userId); allApprovers.add(decision.userId);
    }
    insist(approvers.length >= request.requiredApprovals && same([...new Set(approvers)].sort(), [...approval.approverIds].sort()), 'signed quorum/approver mismatch');
  }
  insist(record.principal.kind === 'human' && record.principal.authenticatedVia === 'approval-engine'
    && record.principal.principalId === [...allApprovers].sort().join(','), 'authorization principal mismatch');
}
function recordShape(record) {
  insist(keys(record, ['schema', 'authorizationId', 'executionId', 'issuedAt', 'expiresAt', 'scope', 'subject', 'principal',
    'delegation', 'session', 'control', 'policy', 'action', 'resource', 'bindings', 'authority', 'idempotencyKey', 'evidenceRefs'],
  ['agentSuppliedMetadata']) && record.schema === 'amc.authorization-record/v1', 'invalid authorization record keys');
  insist(keys(record.scope, ['workspaceId', 'tenantId', 'deploymentId', 'deploymentDigest'])
    && text(record.scope.workspaceId) && nullable(record.scope.tenantId, text) && text(record.scope.deploymentId) && hex(record.scope.deploymentDigest)
    && keys(record.subject, ['governedAs', 'runAs', 'agentConfigDigest']) && text(record.subject.governedAs) && text(record.subject.runAs)
    && nullable(record.subject.agentConfigDigest, hex), 'invalid authorization scope/subject');
  insist(keys(record.principal, ['principalId', 'kind', 'authenticatedVia']) && text(record.principal.principalId)
    && keys(record.delegation, ['depth', 'parentExecutionId', 'allowedActionClasses', 'leaseId'])
    && Array.isArray(record.delegation.allowedActionClasses) && record.delegation.allowedActionClasses.includes('FINANCIAL')
    && nullable(record.delegation.leaseId, text), 'invalid principal/delegation');
  insist(keys(record.session, ['sessionId', 'runId', 'callId', 'rootCallId', 'parentToken'])
    && nullable(record.session.sessionId, text) && nullable(record.session.runId, text) && text(record.session.callId)
    && text(record.session.rootCallId) && nullable(record.session.parentToken, text)
    && keys(record.control, ['controlId', 'controlVersion']) && nullable(record.control.controlId, text)
    && nullable(record.control.controlVersion, text), 'invalid authorization session/control');
  insist(keys(record.policy, ['compiledPolicyDigest', 'policyRevision', 'toolsConfigDigest', 'actionPolicyDigest', 'approvalPolicyDigest', 'budgetsDigest'])
    && nullable(record.policy.compiledPolicyDigest, hex) && nullable(record.policy.policyRevision, n => Number.isSafeInteger(n) && n >= 0)
    && ['toolsConfigDigest', 'actionPolicyDigest', 'approvalPolicyDigest', 'budgetsDigest'].every(key => hex(record.policy[key]))
    && keys(record.action, ['toolName', 'adapterId', 'actionClass', 'mode', 'argumentsDigest', 'normalizer'])
    && hex(record.action.argumentsDigest), 'invalid authorization policy/action');
  insist(keys(record.resource, ['purpose', 'dataClasses']) && nullable(record.resource.purpose, text)
    && Array.isArray(record.resource.dataClasses) && record.resource.dataClasses.every(text)
    && keys(record.bindings, ['amount', 'recipient', 'destination', 'resourceId', 'resourceVersion'])
    && keys(record.authority, ['approvals', 'exceptions']) && Array.isArray(record.authority.approvals)
    && Array.isArray(record.authority.exceptions) && record.authority.exceptions.length === 0
    && Array.isArray(record.evidenceRefs) && record.evidenceRefs.every(text), 'unsupported authorization resource/authority');
  for (const approval of record.authority.approvals) insist(keys(approval, ['approvalRequestId', 'requestBindingDigest', 'intentHash', 'actionClass', 'approverIds', 'expiresAt'])
    && hex(approval.requestBindingDigest) && hex(approval.intentHash) && Array.isArray(approval.approverIds)
    && approval.approverIds.length > 0 && approval.approverIds.every(text) && time(approval.expiresAt), 'invalid authorization approval');
}
function authorization(view, pins, tracked) {
  const id = view.index.execution_id;
  insist(ident(id) && id.startsWith('exec_'), 'unsafe execution id');
  const preimage = jsonFile(insideFile(pins.workspace, join(pins.preimagesDir, id + '.json')), 2 * 1024 * 1024, tracked);
  insist(keys(preimage, ['schema', 'authorizationRecord', 'arguments']) && preimage.schema === 'lighthouse-finance-preimage/1', 'unsupported authorization preimage');
  const record = preimage.authorizationRecord, intent = view.intent, args = normalizedEnvelope(preimage.arguments);
  recordShape(record);
  insist(object(record) && record.schema === 'amc.authorization-record/v1' && object(record.scope) && object(record.action)
    && object(record.policy) && object(record.session) && object(record.subject) && object(record.authority)
    && object(record.bindings) && object(record.principal), 'invalid authorization record');
  const digest = sha256('AMC_AUTHZ_V1\0' + canonical(record));
  insist(digest === view.head.authorizationDigest && digest === intent.authorizationDigest
    && record.executionId === id && record.authorizationId === intent.authorizationId
    && record.scope.workspaceId === view.head.workspaceId && [null, pins.tenantId].includes(record.scope.tenantId)
    && record.subject.governedAs === pins.agentId && record.subject.runAs === pins.agentId
    && record.session.sessionId === intent.sessionId && record.session.callId === intent.callId
    && record.session.parentToken === null && record.scope.deploymentId === 'unregistered' && record.scope.tenantId === null
    && record.delegation.leaseId === null && record.policy.compiledPolicyDigest === null && record.policy.policyRevision === null
    && record.delegation?.depth === 0 && record.delegation.parentExecutionId === null
    && record.action.toolName === pins.toolName && record.action.actionClass === 'FINANCIAL' && record.action.mode === 'EXECUTE'
    && record.action.adapterId === intent.adapterId && record.action.adapterId === 'native'
    && record.action.normalizer === 'amc.args/v1' && time(record.issuedAt) && time(record.expiresAt)
    && Date.parse(record.issuedAt) <= Date.parse(intent.startedAt) && Date.parse(record.expiresAt) > Date.parse(intent.startedAt)
    && record.idempotencyKey === intent.idempotencyKey && record.idempotencyKey === view.head.idempotencyKey, 'authorization identity/digest mismatch');
  insist(record.action.argumentsDigest === sha256(canonical({ normalizer: 'amc.args/v1', arguments: args }))
    && intent.argumentsDigest === record.action.argumentsDigest, 'generic argument digest mismatch');
  const bindings = { amount: { value: args.amount, currency: args.currency }, recipient: args.payeeId,
    destination: args.destinationTokenSha256, resourceId: args.payeeId, resourceVersion: args.payeeVersion };
  insist(same(record.bindings, bindings) && same(intent.bindings, bindings), 'protected finance bindings mismatch');
  const policies = { toolsConfigDigest: 'tools.yaml', actionPolicyDigest: 'action-policy.yaml', approvalPolicyDigest: 'approval-policy.yaml', budgetsDigest: 'budgets.yaml' };
  for (const [field, name] of Object.entries(policies)) {
    const bytes = signedArtifact(insideFile(pins.workspace, join(pins.workspace, '.amc', name)), pins.auditor.publicKeyPem, tracked);
    insist(record.policy[field] === sha256(bytes), 'policy file digest mismatch: ' + field);
  }
  insist(record.policy.toolsConfigDigest === pins.toolsConfigSha256, 'tools config differs from operator-reviewed fixed binding fields');
  insist(record.policy.approvalPolicyDigest === pins.approvalPolicySha256,
    'signed approval policy differs from the external reviewed default FINANCIAL policy pin');
  approvals(record, view, pins, tracked);
  const body = paymentBody(Object.fromEntries(Object.entries(args).filter(([key]) => PAYMENT_KEYS.includes(key) || key === 'originalTxnId')));
  return { record, args, body, bodySha256: sha256(canonical(body)), authorizationDigest: digest };
}
function closeEvidenceDatabase(db, originalError = null) {
  const errors = originalError === null ? [] : [originalError];
  try { if (db.inTransaction) db.exec('ROLLBACK'); } catch (error) { errors.push(error); }
  try { db.close(); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'readonly evidence preparation/rollback/close failures');
}
/** Keep one real read snapshot alive across the separate cold verifier and all independent action reads. */
export function openEvidenceReader(pins) {
  const db = new Database(join(pins.workspace, '.amc', 'evidence.sqlite'), { readonly: true, fileMustExist: true });
  try {
    db.exec('BEGIN');
    // BEGIN is deferred; an actual SELECT establishes the read transaction and any empty WAL/SHM coordination.
    const initial = db.prepare('SELECT COUNT(*) AS count FROM sqlite_master').get();
    insist(db.readonly === true && db.inTransaction === true && Number.isSafeInteger(initial.count), 'readonly reader did not establish a snapshot');
    return { db, preparation: { readonly: db.readonly, inTransaction: db.inTransaction, initialSchemaRows: initial.count },
      close() { closeEvidenceDatabase(db); } };
  } catch (error) {
    closeEvidenceDatabase(db, error); // Always tries both rollback and close, preserving the original and every cleanup error.
  }
}
export function actionEvidence(pins, reader) {
  const tracked = new Map(), errors = [], authorizationErrors = [], views = [];
  const db = reader.db;
  insist(db.readonly === true && db.inTransaction === true, 'action extraction requires the established readonly snapshot');
  let selected;
  {
    const indices = db.prepare('SELECT * FROM action_executions ORDER BY execution_id LIMIT 50001').all();
    const transitions = db.prepare('SELECT * FROM action_transitions ORDER BY execution_id, seq LIMIT 50001').all();
    const events = db.prepare('SELECT * FROM evidence_events ORDER BY rowid LIMIT 50001').all();
    insist(indices.length < 50001 && transitions.length < 50001 && events.length < 50001, 'action evidence exceeds bound');
    const evidence = new Map(events.map(event => [event.id, event]));
    selected = indices.filter(row => row.agent_id === pins.agentId && row.tool_name === pins.toolName && row.action_class === 'FINANCIAL');
    for (const index of selected) {
      try { views.push(chain(index, transitions.filter(row => row.execution_id === index.execution_id), evidence, pins)); }
      catch (error) { errors.push({ executionId: index.execution_id, message: error.message }); }
    }
  }
  for (const view of views) {
    if (view.intent === null) continue;
    try { view.proof = authorization(view, pins, tracked); }
    catch (error) { authorizationErrors.push({ executionId: view.index.execution_id, message: error.message }); }
  }
  for (const [path, before] of tracked) insist(same(before, regular(path).pin), 'authorization input changed during read');
  return { views, errors, authorizationErrors, selectedCount: selected.length, authenticatedInputPins: [...tracked.values()] };
}
