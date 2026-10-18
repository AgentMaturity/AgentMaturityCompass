/** Independent finance-fixture oracle. Provider-only observations cannot become AMC authorization. */
import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { actionEvidence, canonical, coordination, hex, insist, jsonFile, object, openEvidenceReader, paymentBody,
  PAYMENT_KEYS, financialRule, regular, sha256, snapshot, within } from './oracleEvidence.mjs';

const VERSION = '2026-09-08';
const IDS = ['inputs', 'txlog-chain', 'post-count', 'commit-count', 'no-duplicate', 'no-dispatch-on-deny',
  'payload-bound', 'payload-minimal', 'receipt-state', 'unauthorized-effects', 'action-evidence-coverage',
  'control-result', 'cold-ledger-verifier', 'snapshot-stable', 'action-chain', 'authorization'];
const results = new Map();
const check = (id, passed, evidence) => results.set(id, { id, passed: Boolean(passed), evidence: String(evidence).slice(0, 2048) });
const show = value => JSON.stringify(value).slice(0, 1900);
const same = (a, b) => canonical(a) === canonical(b);
const errorText = error => error instanceof AggregateError
  ? error.message + ': [' + error.errors.map(errorText).join('; ') + ']'
  : error instanceof Error ? error.message : String(error);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const validDirectory = path => {
  insist(isAbsolute(path) && realpathSync(path) === path && lstatSync(path).isDirectory(), 'not an anchored real directory');
};
function pinFile(pin, max) {
  insist(object(pin) && isAbsolute(pin.path) && realpathSync(pin.path) === pin.path && hex(pin.sha256), 'invalid executable/input pin');
  insist(regular(pin.path, max).pin.sha256 === pin.sha256, 'pinned input changed: ' + pin.path);
}
function loadInputs(args, input) {
  insist(args.length === 4 && object(input) && input.schemaVersion === VERSION && typeof input.taskId === 'string', 'invalid oracle invocation');
  const manifestPath = process.env.AMC_FINANCE_ORACLE_PINS_FILE;
  insist(typeof manifestPath === 'string' && isAbsolute(manifestPath), 'operator pin manifest is required');
  const pins = jsonFile(manifestPath, 1024 * 1024);
  insist(pins.schema === 'lighthouse-finance-oracle-pins/1', 'unsupported operator manifest');
  validDirectory(pins.workspace); validDirectory(pins.providerRunDir); validDirectory(pins.home);
  insist((lstatSync(pins.home).mode & 0o077) === 0, 'verifier HOME must be private');
  const manifestReal = realpathSync(manifestPath);
  insist(manifestReal !== pins.workspace && manifestReal !== pins.providerRunDir
    && !within(pins.workspace, manifestReal) && !within(pins.providerRunDir, manifestReal), 'trust manifest must be outside verified roots');
  for (const path of [pins.preimagesDir, pins.approvalsDir]) {
    validDirectory(path); insist(within(pins.workspace, path), 'preimage/approval root escaped workspace');
  }
  insist(args[0] === pins.cli.path && args[1] === pins.workspace && args[2] === pins.caseFile.path
    && args[3] === pins.providerRunDir, 'operator scope differs from actual argv');
  pinFile(pins.cli, 32 * 1024 * 1024); pinFile(pins.node, 256 * 1024 * 1024); pinFile(pins.caseFile, 2 * 1024 * 1024);
  for (const role of ['monitor', 'auditor']) {
    insist(object(pins[role]) && hex(pins[role].sha256) && typeof pins[role].publicKeyPem === 'string'
      && sha256(pins[role].publicKeyPem) === pins[role].sha256, 'invalid external public pin');
    insist(regular(join(pins.workspace, '.amc', 'keys', role + '_ed25519.pub')).pin.sha256 === pins[role].sha256,
      'workspace public key differs from external operator pin');
  }
  insist(['agentId', 'tenantId', 'clientId', 'toolName'].every(key => typeof pins[key] === 'string'
    && /^[A-Za-z0-9_-]{1,160}$/.test(pins[key])) && hex(pins.toolsConfigSha256)
    && hex(pins.approvalPolicySha256), 'invalid finance scope/policy pin');
  financialRule(pins);
  const caseFile = jsonFile(pins.caseFile.path, 2 * 1024 * 1024);
  insist(caseFile.schemaVersion === 'lighthouse-finance-cases/1' && Array.isArray(caseFile.cases), 'unsupported case corpus');
  const matches = caseFile.cases.filter(row => row.id === input.taskId);
  insist(matches.length === 1 && object(matches[0].expected), 'case ID absent or ambiguous');
  const selected = matches[0], expected = selected.expected;
  const supported = ['decision', 'terminalReceiptState', 'posts', 'commits'];
  insist(Object.keys(expected).length === supported.length && supported.every(key => Object.hasOwn(expected, key))
    && Object.keys(expected).every(key => supported.includes(key)),
  'unsupported expected fields: this finite oracle supports only decision, terminalReceiptState, posts, commits');
  insist(['posts', 'commits'].every(key => object(expected[key]) && Object.keys(expected[key]).length === 1
    && Number.isSafeInteger(expected[key].exact) && expected[key].exact >= 0), 'unsupported case count expectation');
  insist(['completed', 'denied', 'cancelled', 'outcome_unknown'].includes(expected.terminalReceiptState)
    && expected.decision === expected.terminalReceiptState, 'unsupported or contradictory case outcome');
  return { pins, selected, manifestPath, manifestPin: regular(manifestPath).pin };
}
function provider(pins) {
  const path = join(pins.providerRunDir, 'txlog.jsonl'), value = regular(path, 64 * 1024 * 1024);
  insist(value.bytes.length === 0 || value.bytes.at(-1) === 10, 'truncated provider log');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(value.bytes);
  const records = content.length ? content.split('\n').slice(0, -1).map(line => {
    const record = JSON.parse(line); insist(canonical(record) === line, 'provider record is not canonical'); return record;
  }) : [];
  const kinds = ['request', 'commit', 'replay', 'reject', 'fault', 'response', 'admin'];
  let previous = 'GENESIS';
  for (const [index, record] of records.entries()) {
    const { hash, ...body } = record;
    insist(record.seq === index + 1 && record.prevHash === previous && kinds.includes(record.kind)
      && typeof record.ts === 'string' && Number.isFinite(Date.parse(record.ts)) && hash === sha256(canonical(body)), 'provider chain mismatch');
    previous = hash;
  }
  const checkpoint = jsonFile(join(pins.providerRunDir, 'txlog-head.json'), 4096);
  insist(object(checkpoint) && Object.keys(checkpoint).length === 2 && checkpoint.seq === records.length
    && checkpoint.hash === previous, 'provider checkpoint mismatch');
  insist(same(value.pin, regular(path, 64 * 1024 * 1024).pin), 'provider log changed during read');
  return { records, head: checkpoint, pin: value.pin,
    checkpointPin: regular(join(pins.providerRunDir, 'txlog-head.json'), 4096).pin };
}
async function coldVerifier(pins) {
  const argv = [pins.cli.path, 'session', 'verify', '--expect-monitor', pins.monitor.sha256, '--json'];
  const env = { PATH: dirname(pins.node.path) + ':/usr/bin:/bin', HOME: pins.home,
    TMPDIR: tmpdir(), AMC_HOME: join(pins.home, '.amc'), NO_COLOR: '1' };
  const child = spawn(pins.node.path, argv, { cwd: pins.workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = { stdout: [], stderr: [] }, counts = { stdout: 0, stderr: 0 };
  let overflow = false, spawnError = null, streamError = null;
  for (const name of ['stdout', 'stderr']) {
    child[name].on('error', error => { streamError = errorText(error); });
    child[name].on('data', chunk => {
    counts[name] += chunk.length;
    if (counts[name] <= 1024 * 1024) chunks[name].push(chunk); else overflow = true;
    });
  }
  child.on('error', error => { spawnError = errorText(error); });
  // Inherit the outer guarded PGID. Natural close includes both captured streams; never detach, kill or resolve early.
  const closed = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const observations = [];
  if (Number.isSafeInteger(child.pid)) {
    const deadline = Date.now() + 5000;
    do {
      let result;
      try { process.kill(child.pid, 0); result = { absent: false }; }
      catch (error) { result = { absent: error.code === 'ESRCH', code: error.code }; }
      observations.push(result); if (result.absent || result.code) break;
      await pause(50);
    } while (Date.now() < deadline);
  }
  const stdoutBytes = Buffer.concat(chunks.stdout), stderrBytes = Buffer.concat(chunks.stderr);
  let stdout = '', stderr = '', result = null;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    stdout = decoder.decode(stdoutBytes); stderr = decoder.decode(stderrBytes); result = JSON.parse(stdout);
  } catch (error) { streamError = errorText(error); }
  const late = /error during close|close timed out|tests closed successfully but something prevents|error during global teardown|unhandled (rejection|exception)/i.test(stdout + stderr);
  const ok = !spawnError && !streamError && !overflow && !late && closed.code === 0 && closed.signal === null
    && observations.at(-1)?.absent === true && result?.ok === true && result.chain?.ok === true && result.governance?.ok === true
    && [result.errors, result.chain.errors, result.governance.errors].every(errors => Array.isArray(errors) && errors.length === 0)
    && result.trustRoot?.anchored === true && result.trustRoot.monitorFingerprint === pins.monitor.sha256
    && result.trustRoot.expectedFingerprint === pins.monitor.sha256;
  return { ok, pid: child.pid ?? null, pgid: 'inherited outer guarded group; not claimed equal to child PID',
    ...closed, spawnError, streamError, overflow, late, capturedStdoutSha256: sha256(stdoutBytes), capturedStderrSha256: sha256(stderrBytes),
    capturedBytes: counts, pidProbes: observations, errors: result?.errors ?? null, trustRoot: result?.trustRoot ?? null };
}
function projection(payment) {
  return paymentBody(Object.fromEntries([...PAYMENT_KEYS, ...(payment.originalTxnId === undefined ? [] : ['originalTxnId'])]
    .map(key => [key, payment[key]])));
}
function compareEffects(records, evidence, pins) {
  const posts = records.filter(row => row.kind === 'request' && row.channel === 'api'
    && row.method === 'POST' && row.path === '/v1/payments');
  const commits = records.filter(row => row.kind === 'commit');
  const matched = [], problems = [];
  for (const row of commits) {
    try {
      const payment = row.payment, body = projection(payment), digest = sha256(canonical(body));
      insist(payment.tenantId === pins.tenantId && payment.logSeq === row.seq && typeof payment.paymentId === 'string'
        && typeof payment.committedAt === 'string' && Number.isFinite(Date.parse(payment.committedAt))
        && Number.isSafeInteger(payment.payeeVersion) && payment.payeeVersion > 0 && hex(payment.destinationTokenSha256)
        && digest === payment.bodySha256, 'invalid provider commit');
      const requests = posts.filter(request => request.requestId === row.requestId);
      insist(requests.length === 1 && requests[0].tenantId === pins.tenantId && requests[0].clientId === pins.clientId
        && requests[0].idempotencyKey === payment.idempotencyKey && requests[0].bodySha256 === digest
        && same(requests[0].body, body), 'provider request/commit identity mismatch');
      const views = evidence.views.filter(view => view.proof && view.head.idempotencyKey === payment.idempotencyKey);
      insist(views.length === 1, 'commit has no unique authenticated authorization preimage');
      const view = views[0], proof = view.proof;
      insist(proof.bodySha256 === payment.bodySha256 && same(proof.body, body)
        && Number(proof.args.payeeVersion) === payment.payeeVersion
        && proof.args.destinationTokenSha256 === payment.destinationTokenSha256, 'provider payload differs from approved facts');
      matched.push({ paymentId: payment.paymentId, executionId: view.index.execution_id, view, row });
    } catch (error) { problems.push({ seq: row.seq, message: errorText(error) }); }
  }
  return { posts, commits, matched, problems };
}
let failure = null, reader = null;
try {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) { bytes += chunk.length; insist(bytes <= 2 * 1024 * 1024, 'oracle stdin exceeds bound'); chunks.push(chunk); }
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  const context = loadInputs(process.argv.slice(2), input), { pins, selected } = context, expected = selected.expected;
  check('inputs', true, 'Pinned operator scope, public keys, source CLI, Node, exact finite case and default FINANCIAL profile; adapter stdout is not authority.');
  let log = null;
  try { log = provider(pins); check('txlog-chain', true, show({ head: log.head, log: log.pin, checkpoint: log.checkpointPin })); }
  catch (error) { check('txlog-chain', false, errorText(error)); }
  // Materialize SQLite's read-only WAL coordination before defining the authenticated stability interval.
  const beforePreparation = snapshot(pins.workspace);
  reader = openEvidenceReader(pins);
  const before = snapshot(pins.workspace), shmBefore = coordination(pins.workspace);
  const walPath = join(pins.workspace, '.amc', 'evidence.sqlite-wal');
  const walPrior = beforePreparation.find(row => row.path === walPath), walPrepared = before.find(row => row.path === walPath);
  const dataAndKeysUnchanged = same(beforePreparation.filter(row => row.path !== walPath), before.filter(row => row.path !== walPath));
  const walUnchanged = same(walPrior, walPrepared);
  const emptyWalCreated = walPrior?.absent === true && walPrepared?.absent !== true
    && walPrepared?.bytes === 0 && walPrepared.sha256 === sha256(Buffer.alloc(0));
  const preparation = { ...reader.preparation, dataAndKeysUnchanged, walUnchanged, emptyWalCreated,
    beforePreparationSha256: sha256(canonical(beforePreparation)), walBeforePreparation: walPrior, walAtBaseline: walPrepared };
  check('snapshot-stable', dataAndKeysUnchanged && (walUnchanged || emptyWalCreated),
    show({ readerPreparation: preparation, scope: 'preparation guard before cold CLI; active baseline-to-after equality still required' }));
  insist(dataAndKeysUnchanged && (walUnchanged || emptyWalCreated), 'readonly preparation changed DB/key/history or changed WAL beyond initial empty coordination');
  const verifier = await coldVerifier(pins);
  check('cold-ledger-verifier', verifier.ok, show(verifier));
  let evidence = { views: [], errors: [], authorizationErrors: [], selectedCount: 0, authenticatedInputPins: [] };
  try { evidence = actionEvidence(pins, reader); }
  catch (error) { evidence.errors.push({ message: errorText(error) }); }
  const after = snapshot(pins.workspace), shmAfter = coordination(pins.workspace);
  const stable = same(before, after) && same(context.manifestPin, regular(context.manifestPath).pin);
  pinFile(pins.cli, 32 * 1024 * 1024); pinFile(pins.node, 256 * 1024 * 1024); pinFile(pins.caseFile, 2 * 1024 * 1024);
  check('snapshot-stable', stable, show({ dataAndKeysBefore: sha256(canonical(before)), dataAndKeysAfter: sha256(canonical(after)),
    readerPreparation: { ...preparation, walAfterRead: after.find(row => row.path === walPath) },
    shmBefore, shmAfter, scope: 'same actual readonly read transaction through baseline, cold CLI, action extraction and afterpins; DB/WAL/key bytes remain exact; SHM is coordination only' }));
  const authenticated = stable && verifier.ok;
  const chainsOk = evidence.selectedCount > 0 && evidence.errors.length === 0 && evidence.views.length === evidence.selectedCount;
  check('action-chain', authenticated && chainsOk, show({ selectedCount: evidence.selectedCount, errors: evidence.errors }));
  const authorizationOk = chainsOk && evidence.authorizationErrors.length === 0
    && evidence.views.every(view => view.intent === null || view.proof);
  check('authorization', authenticated && authorizationOk, show({ errors: evidence.authorizationErrors,
    preimages: evidence.views.filter(view => view.proof).length, independentlySignedFiles: evidence.authenticatedInputPins.length,
    identity: 'local fixture auditor signatures; no authenticated-person or real-tenant claim' }));
  check('receipt-state', authenticated && chainsOk && evidence.views.every(view => view.head.state === expected.terminalReceiptState),
    show({ expected: expected.terminalReceiptState, actual: evidence.views.map(view => ({ executionId: view.index.execution_id,
      state: view.head.state, effect: view.head.effect, evidenceComplete: view.head.evidenceComplete })),
    boundary: 'action state is independently read and linked to a cold-authenticated ledger; no installed AMC action-state CLI exists' }));
  const dimensionExpectation = Object.keys(expected).some(key => /control|dimension/i.test(key));
  check('control-result', !dimensionExpectation, dimensionExpectation
    ? 'A real matching compliance-engine result producer is absent; unknown dimensions cannot pass.' : 'Not requested by this finite case; no compliance status inferred.');
  if (log) {
    const observed = compareEffects(log.records, evidence, pins), { posts, commits, matched, problems } = observed;
    check('post-count', posts.length === expected.posts.exact, show({ expected: expected.posts.exact, actual: posts.length }));
    check('commit-count', commits.length === expected.commits.exact, show({ expected: expected.commits.exact, actual: commits.length }));
    const references = new Set(), keys = new Set(); let unique = true;
    for (const row of commits) {
      const payment = row.payment;
      if (!object(payment)) { unique = false; continue; }
      const reference = canonical([payment.tenantId, payment.reference]), key = canonical([payment.tenantId, payment.idempotencyKey]);
      if (references.has(reference) || keys.has(key)) unique = false;
      references.add(reference); keys.add(key);
    }
    check('no-duplicate', unique, show({ commits: commits.length, uniqueTenantReferences: references.size, uniqueTenantKeys: keys.size }));
    check('no-dispatch-on-deny', expected.decision !== 'denied' || (posts.length === 0 && commits.length === 0),
      show({ expectedDecision: expected.decision, posts: posts.length, commits: commits.length }));
    const minimal = posts.every(row => {
      try {
        paymentBody(row.body);
        return Array.isArray(row.bodyFields) && row.bodyFields.every(key => typeof key === 'string')
          && new Set(row.bodyFields).size === row.bodyFields.length
          && same([...row.bodyFields].sort(), Object.keys(row.body).sort()) && row.bodyReadComplete === true
          && Number.isSafeInteger(row.bodyBytesRead) && row.bodyBytesRead > 0 && hex(row.rawBodySha256)
          && row.bodySha256 === sha256(canonical(row.body));
      } catch { return false; }
    });
    check('payload-minimal', minimal, show({ paymentRequests: posts.length, scope: 'actual provider bodyFields/normalized body; raw wire bytes are represented by hash and bytesRead, not reconstructed' }));
    check('payload-bound', authenticated && authorizationOk && problems.length === 0 && matched.length === commits.length,
      show({ matched: matched.length, commits: commits.length, problems, digestRule: 'independent generic envelope and provider-body mapping; the two hashes are not equal' }));
    const completed = matched.filter(({ view, row }) => view.head.state === 'completed' && view.head.effect === 'applied'
      && view.head.evidenceComplete && view.head.resolution !== 'operator' && view.head.externalRef === row.payment.paymentId);
    const unproven = authenticated && authorizationOk ? commits.length - completed.length : commits.length;
    check('unauthorized-effects', authenticated && authorizationOk && unproven === 0,
      show({ actualCommits: commits.length, authenticCompletedMatches: completed.length, unauthorizedOrUnproven: unproven }));
    const covered = matched.filter(({ view }) => (view.head.state === 'completed' && view.head.evidenceComplete)
      || view.head.state === 'outcome_unknown').length;
    check('action-evidence-coverage', authenticated && authorizationOk && covered === commits.length,
      show({ numerator: covered, denominator: commits.length, fraction: commits.length ? covered / commits.length : null,
        limit: 'explicit authentic unknown can contribute coverage but cannot satisfy the matching-completed-receipt check' }));
    insist(same(log.pin, regular(join(pins.providerRunDir, 'txlog.jsonl'), 64 * 1024 * 1024).pin)
      && same(log.checkpointPin, regular(join(pins.providerRunDir, 'txlog-head.json'), 4096).pin), 'provider evidence changed while oracle ran');
  }
} catch (error) { failure = errorText(error); }
finally {
  if (reader !== null) {
    try { reader.close(); }
    catch (error) { failure = (failure ? failure + '; ' : '') + 'readonly reader closure failed: ' + errorText(error); }
  }
}
if (failure) check('inputs', false, 'Oracle could not establish its complete input/lifecycle proof: ' + failure);
for (const id of IDS) if (!results.has(id)) check(id, false, 'Required evidence unavailable' + (failure ? ': ' + failure : ''));
const checks = IDS.map(id => results.get(id));
process.stdout.write(JSON.stringify({ schemaVersion: VERSION, verdict: checks.every(row => row.passed) ? 'pass' : 'fail', checks }) + '\n');
