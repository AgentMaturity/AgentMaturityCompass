#!/usr/bin/env node
/**
 * P1-79 installed-package variant: `amc init --coding` from the installed bin, then the L0-IDN-01 fixture plan activated
 * non-interactively through the installed package's own modules (two test approvers), then the P1-40 SDK quickstart
 * against the installed package. Run twice: the owner named as the OS account (expect a verified synthetic action under
 * the plan), and an owner that is not the OS account (expect AMCNativeRefusedError PRINCIPAL_UNRESOLVED and no session).
 *
 * usage: node P1-79-installed-plan.mjs <kept packed-install work dir> <repo root>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [work, root] = process.argv.slice(2);
const consumer = join(work, "consumer");
const pkg = join(consumer, "node_modules", "agent-maturity-compass", "dist");
const amc = join(consumer, "node_modules", ".bin", "amc");
const mod = (rel) => import(pathToFileURL(join(pkg, rel)).href);
const env = { ...process.env, HOME: join(work, "home"), CI: "1", AMC_VAULT_PASSPHRASE: "packed-install-check" };
for (const key of Object.keys(env)) if (key.startsWith("AMC_") && key !== "AMC_VAULT_PASSPHRASE") delete env[key];
// The same HOME as every installed-bin step, so the control checkpoints this process writes are the ones they read.
process.env.AMC_VAULT_PASSPHRASE = env.AMC_VAULT_PASSPHRASE;
process.env.HOME = env.HOME;
const OS_USER = userInfo().username;

const { loadCatalog } = await mod("catalog/index.js");
const { compilePlan, parseDeploymentProfile } = await mod("catalog/compiler/compile.js");
const { signPlan } = await mod("catalog/compiler/sign.js");
const { activateControlPlan } = await mod("catalog/compiler/activate.js");
const { decideApprovalForIntent } = await mod("approvals/approvalEngine.js");
const { initApprovalPolicy } = await mod("approvals/approvalPolicyEngine.js");
const { initDestinationRegistry } = await mod("residency/destinationRegistry.js");
const { openLedger } = await mod("ledger/ledger.js");

function activate(ws) {
  const catalog = loadCatalog();
  const profile = catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json").envelope.setup.profile;
  writeFileSync(join(ws, "deployment-profile.json"), JSON.stringify(profile));
  initApprovalPolicy(ws);
  const us = { jurisdiction: "US", code: "us-fixture" };
  initDestinationRegistry(ws, { schemaVersion: "amc.residency-destinations/v1",
    profile: { path: "deployment-profile.json", storageUrl: "https://storage.example.test/amc" },
    destinations: [
      { destinationId: "fixture-storage", match: { hosts: ["storage.example.test"] }, channels: ["storage"], region: us, transferBasis: null },
      { destinationId: "stub-provider", match: { hosts: ["stub.invalid"] }, channels: ["provider"], region: us, transferBasis: null }],
    rules: [{ ruleId: "fixture-us", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
  if (plan.status !== "ready") throw new Error(`fixture plan is ${plan.status}`);
  const { signed } = signPlan({ workspace: ws, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId;
  for (const userId of ["test-approver-1", "test-approver-2"]) {
    decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
      reason: "P1-79 installed-package fixture plan review", userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
}

const { readNativeSessionEvents } = await mod("session/readNativeSessionEvents.js");
const { readEventPayload } = await mod("session/eventPayload.js");
const { listVerifiedUsers } = await mod("auth/authApi.js");
const WRITE_TASK = 'JSON.stringify({ tool: "fs.write", arguments: { path: "hello.txt", content: "hello from the AMC SDK quickstart (synthetic stub run)\\n" } })';
const READ_TASK = 'JSON.stringify({ tool: "fs.read", arguments: { path: "hello.txt" } })';

/** The principals and lease ids of the session's authorization records, read through the installed package. */
function bound(ws, sessionId) {
  return readNativeSessionEvents(ws, sessionId).filter((e) => JSON.parse(e.meta_json).auditType === "AUTHORIZATION_RECORD").map((e) => {
    const { record } = JSON.parse(readEventPayload(ws, e).bytes.toString("utf8"));
    return { ...record.principal, leaseId: record.delegation.leaseId };
  });
}

function quickstart(ws, pin, task) {
  const source = readFileSync(join(root, "examples", "sdk", "quickstart.mjs"), "utf8");
  if (!source.includes(WRITE_TASK)) throw new Error("the quickstart's task line moved; update this variant");
  const script = join(consumer, task === WRITE_TASK ? "quickstart.mjs" : "quickstart-read-variant.mjs");
  writeFileSync(script, source.replace(WRITE_TASK, task));
  const r = spawnSync("node", [script, ws], { cwd: consumer, encoding: "utf8", env: { ...env, AMC_EXPECTED_MONITOR_FINGERPRINT: pin } });
  const out = `${r.stdout}${r.stderr}`;
  return { status: r.status, out, sessionId: /\[synthetic\] session ([0-9a-f-]{36})/.exec(out)?.[1] };
}

const show = (out) => out.trim().split("\n").filter((line) => /\[synthetic\]|Error:|PRINCIPAL|data:/.test(line)).slice(0, 10).map((line) => `     ${line.trim()}`).join("\n");

function variant(label, owner) {
  const ws = join(work, `p1-79-${label}`); mkdirSync(ws);
  const started = Date.now();
  const init = spawnSync(amc, ["init", "--coding"], { cwd: ws, encoding: "utf8",
    env: { ...env, AMC_BOOTSTRAP_OWNER_USERNAME: owner, AMC_BOOTSTRAP_OWNER_PASSWORD: "packed-install-owner" } });
  const pin = /export AMC_EXPECTED_MONITOR_FINGERPRINT=([0-9a-f]{64})/.exec(init.stdout)?.[1];
  if (init.status !== 0 || !pin) { console.log(`FAIL ${label}: amc init --coding (${init.status})\n${init.stderr}`); return false; }
  activate(ws);
  const ownerId = listVerifiedUsers(ws).users.find((u) => u.username === owner).userId;
  if (owner !== OS_USER) {
    const r = quickstart(ws, pin, WRITE_TASK);
    const ledger = openLedger(ws, { readonly: true });
    const sessions = ledger.getAllSessions().length; ledger.close();
    const ok = r.status !== 0 && /AMCNativeRefusedError/.test(r.out) && /reason: 'PRINCIPAL_UNRESOLVED'/.test(r.out) && sessions === 0;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: owner is not the OS account; quickstart exit ${r.status}; sessions in the ledger ${sessions}; ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(show(r.out));
    return ok;
  }
  // The fixture plan's compiled approval rule requires a signed approval for writes, which the quickstart does not raise:
  // the unmodified quickstart runs under the lease and its fs.write is refused approval_missing (the plan, not P1-79).
  const write = quickstart(ws, pin, WRITE_TASK);
  const writeBound = write.sessionId ? bound(ws, write.sessionId) : [];
  const refusedByPlan = /fs\.write hello\.txt: failed/.test(write.out) && writeBound.length > 0
    && writeBound.every((p) => p.principalId === ownerId && p.authenticatedVia === "lease" && p.leaseId);
  console.log(`${refusedByPlan ? "info" : "FAIL"} ${label}: unmodified quickstart exit ${write.status}; its fs.write ran under a lease naming the owner and the plan's approval rule refused it`);
  // The variant: the same quickstart with its one call changed to fs.read (READ_ONLY, no approval rule) of hello.txt.
  writeFileSync(join(ws, "hello.txt"), "hello from the P1-79 installed-package variant (synthetic)\n");
  const read = quickstart(ws, pin, READ_TASK);
  const readBound = read.sessionId ? bound(ws, read.sessionId) : [];
  const ok = refusedByPlan && read.status === 0 && read.out.includes("verification: verified, externally-anchored") && readBound.length > 0
    && readBound.every((p) => p.principalId === ownerId && p.kind === "human" && p.authenticatedVia === "lease" && typeof p.leaseId === "string");
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: owner is the OS account; fs.read variant exit ${read.status}; ${readBound.length} authorization record(s) name ${ownerId} via lease ${readBound[0]?.leaseId ?? "none"}; ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(show(read.out));
  return ok;
}

console.log(`P1-79 installed-package variant, node ${process.version}, local macOS arm64, not CI; package ${pkg}`);
const a = variant("plan-os-user", OS_USER);
const b = variant("plan-other-user", `not-${OS_USER}`);
process.exit(a && b ? 0 : 1);
