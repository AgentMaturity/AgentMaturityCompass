import { spawnSync } from "node:child_process";
import { createHash, randomUUID, verify } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

// Actual copied compiled CLI and disk catalog; no product module is imported in this parent process.
// Shared dependencies are accessed without installation/rebuild/writes. This is not an OS read-only mount claim.
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const catalogSource = join(repository, "tests", "fixtures", "catalog", "compiler", "catalog");
const profileSource = join(repository, "tests", "fixtures", "catalog", "compiler", "finance-ops-us.profile.json");
const node22 = process.versions.node.split(".")[0] === "22" ? process.execPath : "/opt/homebrew/opt/node@22/bin/node";
type JsonObject = Record<string, unknown>;
interface FilePin { path: string; bytes: number; sha256: string }
interface Receipt { status: number | null; signal: NodeJS.Signals | null; error: string | null; stdout: string; stderr: string; pid: number }
interface Signature { digestSha256: string; signature: string; signedTs: number; signer: string; envelope: {
  pubkeyB64: string; fingerprint: string; sigB64: string; signedTs: number; signer: { type: string; attestationLevel: string };
} }
interface Plan extends JsonObject { digest: string; status: string; profile: { profileId: string }; runtimePolicy: JsonObject & { policyDigest: string }; lock: JsonObject }
interface Summary { status: string; digest: string; policyDigest: string; outDir: string; files: string[]; review: { status: string; approvalRequestId: string | null }; claim: string }
interface PlanMetadata { signature: Signature; compiledAt: string; diff: unknown; review: Summary["review"] }
interface Fixture { root: string; workspace: string; env: NodeJS.ProcessEnv; auditor: string; sequence: number }
let ownedPackage: string;
let packageParent: string;
let packageHealthy = false;
let retainPackage = false;
let originalDistPins: FilePin[];
let originalCatalogPins: FilePin[];
let originalPackageJsonHash: string;
const fixtures: Fixture[] = [];
const hashBytes = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const hashFile = (path: string): string => hashBytes(readFileSync(path));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
function save(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as JsonObject;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("The fixture canonicalizer accepts JSON data only");
  return text;
}
function treePins(root: string): FilePin[] {
  if (!existsSync(root)) return [];
  const pins: FilePin[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), relative = prefix ? `${prefix}/${name}` : name;
      const entry = lstatSync(path);
      if (entry.isDirectory()) walk(path, relative);
      else if (entry.isFile()) pins.push({ path: relative, bytes: entry.size, sha256: hashFile(path) });
      else throw new Error(`Fixture input/snapshot is not a physical regular file: ${path}`);
    }
  };
  walk(root, "");
  return pins;
}
const SETUP = String.raw`
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [workspace, dist] = process.argv.slice(2);
assert.equal(process.versions.node.split('.')[0], '22');
const load = p => import(pathToFileURL(join(dist,p)).href);
const { initWorkspace } = await load('workspace.js');
const { initApprovalPolicy } = await load('approvals/approvalPolicyEngine.js');
const { buildOperatingProfile } = await load('domains/operatingProfiles/operatingProfileBuilder.js');
const { checkOperatingProfileConsistency } = await load('domains/operatingProfiles/operatingProfileConsistency.js');
initWorkspace({workspacePath:workspace,agentId:'default',trustBoundaryMode:'isolated'});
initApprovalPolicy(workspace);
const profile=buildOperatingProfile({station:'wealth',agentId:'default',generatedAt:'2026-10-16T00:00:00.000Z'});
const consistency=checkOperatingProfileConsistency(profile);
assert.equal(consistency.ok,true,JSON.stringify(consistency));
writeFileSync(join(workspace,'inputs','operating-profile.json'),JSON.stringify(profile,null,2)+'\n',{flag:'wx'});
writeFileSync(join(workspace,'setup.json'),JSON.stringify({node:process.versions.node,modules:process.versions.modules,consistency,mode:'owner',trust:'real initialized LOCAL_VAULT'})+'\n',{flag:'wx'});
// This setup process exits before the parent reads artifacts or another process opens SQLite.
`;
const INSPECT_REVIEW = String.raw`
import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [workspace,dist,outDir] = process.argv.slice(2);
assert.equal(process.versions.node.split('.')[0],'22');
const load = p => import(pathToFileURL(join(dist,p)).href);
const chain=await load('approvals/approvalChainStore.js');
const engine=await load('approvals/approvalEngine.js');
const {getAgentPaths}=await load('fleet/paths.js');
const {sha256Hex}=await load('utils/hash.js');
const {canonicalize}=await load('utils/json.js');
const plan=JSON.parse(readFileSync(join(outDir,'plan.json'),'utf8'));
const metadata=JSON.parse(readFileSync(join(outDir,'plan.sig.json'),'utf8'));
const approvalId=metadata.review.approvalRequestId;
assert.equal(typeof approvalId,'string');
const request=chain.loadApprovalRequestRecord({workspace,agentId:'default',approvalRequestId:approvalId,requireValidSignature:true});
const payload={planDigest:plan.digest,policyDigest:plan.runtimePolicy.policyDigest,profileId:plan.profile.profileId};
const exact={workspace,approvalId,expectedAgentId:'default',expectedIntentId:'control-plan-'+plan.digest.slice(7,39),expectedToolName:'catalog.plan.activate',expectedActionClass:'SECURITY',expectedIntentHash:sha256Hex(canonicalize(payload))};
const verification=engine.verifyApprovalForExecution(exact);
const changed=engine.verifyApprovalForExecution({...exact,expectedIntentHash:sha256Hex('a different owned plan payload')});
const consumed=chain.loadApprovalConsumed({workspace,agentId:'default',approvalRequestId:approvalId});
const decisions=chain.listApprovalDecisions({workspace,agentId:'default',approvalRequestId:approvalId});
const integrity=chain.inspectApprovalChainIntegrity({workspace,agentId:'default',approvalRequestId:approvalId});
writeFileSync(join(workspace,'review-inspection.json'),JSON.stringify({request,path:join(getAgentPaths(workspace,'default').rootDir,'approvals','requests',approvalId+'.json'),verification,changed,consumed,decisions,integrity})+'\n',{flag:'wx'});
`;
function run(f: Fixture, name: string, argv: string[]): Receipt {
  const stem = `${String(++f.sequence).padStart(2, "0")}-${name}`;
  const startedAt = Date.now();
  save(join(f.root, "logs", `${stem}.intent.json`), { executable: node22, argv, cwd: f.workspace, environmentKeys: Object.keys(f.env).sort(), startedAt });
  // No shell, retries or extra deadline. The repository's unchanged test timeout still applies.
  const result = spawnSync(node22, argv, { cwd: f.workspace, env: f.env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const receipt: Receipt = { status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
    stdout: result.stdout ?? "", stderr: result.stderr ?? "", pid: result.pid };
  writeFileSync(join(f.root, "logs", `${stem}.stdout.log`), receipt.stdout, { flag: "wx", mode: 0o600 });
  writeFileSync(join(f.root, "logs", `${stem}.stderr.log`), receipt.stderr, { flag: "wx", mode: 0o600 });
  save(join(f.root, "logs", `${stem}.closed.json`), { ...receipt, closedAt: Date.now(), boundary: "spawnSync returned after its owned child; no universal descendant or OS isolation claim" });
  return receipt;
}
function assertExit(receipt: Receipt, status: number): void {
  expect(receipt, receipt.stderr).toMatchObject({ status, signal: null, error: null });
}
function newFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "amc-p110-cli-workspace-"));
  const workspace = join(root, "workspace");
  const f: Fixture = { root, workspace, env: {}, auditor: "", sequence: 0 };
  fixtures.push(f); // Retain even a genuine setup failure.
  for (const name of ["workspace", "home", "tmp", "checkpoints", "logs", "public"]) mkdirSync(join(root, name), { mode: 0o700 });
  mkdirSync(join(workspace, "inputs"));
  f.env = { PATH: `${dirname(node22)}:${process.env.PATH ?? ""}`, HOME: join(root, "home"), AMC_HOME: join(root, "home"),
    TMPDIR: join(root, "tmp"), AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), AMC_NO_SIGN: "0",
    AMC_VAULT_PASSPHRASE: randomUUID(), NO_COLOR: "1", LANG: "C", LC_ALL: "C" };
  const setup = join(root, "setup.mjs");
  writeFileSync(setup, SETUP, { flag: "wx", mode: 0o600 });
  assertExit(run(f, "initialize", [setup, workspace, join(ownedPackage, "dist")]), 0);
  f.auditor = readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub"), "utf8");
  writeFileSync(join(root, "public", "auditor.pub.pem"), f.auditor, { flag: "wx", mode: 0o600 });
  save(join(root, "before-plan.json"), { auditorSha256: hashBytes(f.auditor), amc: treePins(join(workspace, ".amc")), setup: readJson(join(workspace, "setup.json")) });
  return f;
}
function profile(f: Fixture, name: string, overrides: JsonObject = {}): string {
  const raw = readJson<JsonObject>(profileSource);
  const value = { ...raw, deployment: { ...(raw.deployment as JsonObject), agentIds: ["zz-synthetic-agent", "default"] }, ...overrides };
  const path = join(f.workspace, "inputs", `${name}.profile.json`);
  save(path, value);
  return path;
}
function cli(f: Fixture, profilePath: string, out: string, extra: string[] = []): Receipt {
  return run(f, "catalog-compile", [join(ownedPackage, "dist", "cli.js"), "catalog", "compile", "--profile", profilePath, "--out", out, "--json", ...extra]);
}
function signedFile(path: string, auditor: string): JsonObject {
  const sig = readJson<{ signer: string; digestSha256: string; signature: string }>(`${path}.sig`);
  expect(sig.signer).toBe("auditor");
  expect(sig.digestSha256).toBe(hashFile(path));
  expect(verify(null, Buffer.from(sig.digestSha256, "hex"), auditor, Buffer.from(sig.signature, "base64"))).toBe(true);
  return readJson<JsonObject>(path);
}
function signedPlan(f: Fixture, receipt: Receipt, expectedStatus: string, out: string): { plan: Plan; metadata: PlanMetadata; summary: Summary } {
  const summary = JSON.parse(receipt.stdout) as Summary;
  const plan = readJson<Plan>(join(out, "plan.json"));
  const metadata = readJson<PlanMetadata>(join(out, "plan.sig.json"));
  const { digest, ...body } = plan;
  expect(digest).toBe(`sha256:${hashBytes(canonical(body))}`);
  const { policyDigest, ...policy } = plan.runtimePolicy;
  expect(policyDigest).toBe(`sha256:${hashBytes(canonical(policy))}`);
  expect(plan.status).toBe(expectedStatus);
  expect(summary).toMatchObject({ status: expectedStatus, digest, policyDigest, outDir: out, claim: "experimental plan; no compliance claim" });
  expect(summary.files).toEqual(["plan.json", "plan.sig.json", "plan.diff.md", "catalog.lock.json"]);
  expect(summary.review).toEqual(metadata.review);
  expect(metadata.diff).toBeNull();
  expect(metadata.review.status).toBe("pending");
  expect(readJson(join(out, "catalog.lock.json"))).toEqual(plan.lock);
  expect(readFileSync(join(out, "plan.diff.md"), "utf8").length).toBeGreaterThan(0);
  const signature = metadata.signature;
  expect(signature).toMatchObject({ digestSha256: digest.slice(7), signer: "auditor", envelope: { signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } });
  expect(signature.envelope.sigB64).toBe(signature.signature);
  expect(signature.envelope.signedTs).toBe(signature.signedTs);
  expect(Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8")).toBe(f.auditor);
  expect(signature.envelope.fingerprint).toBe(hashBytes(f.auditor));
  expect(verify(null, Buffer.from(digest.slice(7), "hex"), f.auditor, Buffer.from(signature.signature, "base64"))).toBe(true);
  expect(readFileSync(join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), "utf8")).toBe(f.auditor);
  // CONTROL_PLAN is the existing signer call's kind; the bare digest signature has no cryptographic purpose field.
  return { plan, metadata, summary };
}

beforeAll(() => {
  packageParent = mkdtempSync(join(tmpdir(), "amc-p110-cli-package-"));
  ownedPackage = join(packageParent, "package");
  mkdirSync(ownedPackage);
  originalDistPins = treePins(join(repository, "dist"));
  if (!originalDistPins.some(pin => pin.path === "cli.js")) throw new Error("A real compiled checkout is required; do not build during this fixture");
  originalCatalogPins = treePins(catalogSource);
  originalPackageJsonHash = hashFile(join(repository, "package.json"));
  if (originalCatalogPins.length === 0) throw new Error("The admitted sealed compiler catalog is required");
  cpSync(join(repository, "dist"), join(ownedPackage, "dist"), { recursive: true, errorOnExist: true, force: false });
  cpSync(join(repository, "package.json"), join(ownedPackage, "package.json"), { errorOnExist: true, force: false });
  cpSync(catalogSource, join(ownedPackage, "catalog"), { recursive: true, errorOnExist: true, force: false });
  symlinkSync(join(repository, "node_modules"), join(ownedPackage, "node_modules"), "dir");
  expect(treePins(join(ownedPackage, "dist"))).toEqual(originalDistPins);
  expect(treePins(join(ownedPackage, "catalog"))).toEqual(originalCatalogPins);
  expect(hashFile(join(ownedPackage, "package.json"))).toBe(originalPackageJsonHash);
  save(join(packageParent, "input-pins.json"), { dist: originalDistPins, catalog: originalCatalogPins,
    packageJsonSha256: hashFile(join(ownedPackage, "package.json")), dependencyLink: readlinkSync(join(ownedPackage, "node_modules")),
    boundary: "Unchanged physical compiled package plus labelled disk catalog; dependencies shared without writes; not installed-package or OS read-only proof" });
  packageHealthy = true;
});
afterEach(({ task }) => {
  for (const f of fixtures.splice(0)) {
    if (task.result?.state === "fail") {
      retainPackage = true;
      console.error(`P1-10 CLI fixture retained ${f.root}`);
    } else rmSync(f.root, { recursive: true, force: true });
  }
});
afterAll(() => {
  try {
    if (packageHealthy) {
      expect(treePins(join(ownedPackage, "dist"))).toEqual(originalDistPins);
      expect(treePins(join(ownedPackage, "catalog"))).toEqual(originalCatalogPins);
      expect(hashFile(join(ownedPackage, "package.json"))).toBe(originalPackageJsonHash);
      expect(readlinkSync(join(ownedPackage, "node_modules"))).toBe(join(repository, "node_modules"));
    }
  } catch (error) { retainPackage = true; throw error; }
  finally {
    if (packageParent && packageHealthy && !retainPackage) rmSync(packageParent, { recursive: true, force: true });
    else if (packageParent) console.error(`P1-10 CLI package retained ${packageParent}`);
  }
});

describe("catalog compiler actual cold CLI with a synthetic disk catalog", () => {
  test("ready exits 0 and produces a real pinned-auditor plan signature", () => {
    const f = newFixture(), input = profile(f, "ready"), out = join(f.workspace, "plans", "ready");
    const result = cli(f, input, out);
    assertExit(result, 0);
    const { metadata } = signedPlan(f, result, "ready", out);
    expect(metadata.review.approvalRequestId).toBeNull();
  });

  test("unknown mandatory applicability exits 2 and still writes its signed blocked plan", () => {
    const f = newFixture(), input = profile(f, "blocked", {
      entityTypes: { value: null, provenance: "asserted", source: "synthetic CLI unknown entity type", reviewedBy: null }
    }), out = join(f.workspace, "plans", "blocked");
    const result = cli(f, input, out);
    assertExit(result, 2);
    signedPlan(f, result, "blocked", out);
  });

  test("a malformed real deployment profile exits 1 without output", () => {
    const f = newFixture(), input = profile(f, "invalid", { profileVersion: 2 }), out = join(f.workspace, "plans", "invalid");
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain("PROFILE_INVALID:");
    expect(existsSync(out)).toBe(false);
  });

  test("an .amc output target refuses before signing and leaves the whole signed tree unchanged", () => {
    const f = newFixture(), input = profile(f, "forbidden"), out = join(f.workspace, ".amc", "forbidden-plan");
    const before = treePins(join(f.workspace, ".amc"));
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain(`Refusing to write a control plan under ${join(realpathSync(f.workspace), ".amc")}`);
    expect(result.stderr).toContain(".amc/** is reserved for signed configs.");
    expect(existsSync(out)).toBe(false);
    expect(treePins(join(f.workspace, ".amc"))).toEqual(before);
  });

  test("a workspace symlink cannot disguise an output inside its signed configuration tree", () => {
    const f = newFixture(), input = profile(f, "workspace-alias");
    const alias = join(f.root, "workspace-alias");
    symlinkSync(f.workspace, alias, "dir");
    const out = join(alias, ".amc", "forbidden-plan"), before = treePins(join(f.workspace, ".amc"));
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain(".amc/** is reserved for signed configs.");
    expect(existsSync(out)).toBe(false);
    expect(treePins(join(f.workspace, ".amc"))).toEqual(before);
  });

  test("an output-directory symlink into the signed tree is refused before writing", () => {
    const f = newFixture(), input = profile(f, "output-alias");
    const alias = join(f.workspace, "exports");
    symlinkSync(join(f.workspace, ".amc"), alias, "dir");
    const out = join(alias, "forbidden-plan"), before = treePins(join(f.workspace, ".amc"));
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain(".amc/** is reserved for signed configs.");
    expect(existsSync(out)).toBe(false);
    expect(treePins(join(f.workspace, ".amc"))).toEqual(before);
  });

  test("a signed-tree symlink cannot make its physical output location writable", () => {
    const f = newFixture(), input = profile(f, "signed-root-alias");
    const signedRoot = join(f.workspace, ".amc"), physicalRoot = join(f.root, "signed-configs");
    renameSync(signedRoot, physicalRoot);
    symlinkSync(physicalRoot, signedRoot, "dir");
    const out = join(physicalRoot, "forbidden-plan"), before = treePins(signedRoot);
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain(".amc/** is reserved for signed configs.");
    expect(existsSync(out)).toBe(false);
    expect(treePins(signedRoot)).toEqual(before);
  });

  test("a valid-form lock derived from an actual output refuses its changed catalog digest", () => {
    const f = newFixture(), input = profile(f, "lock"), first = join(f.workspace, "plans", "lock-source");
    const firstResult = cli(f, input, first);
    assertExit(firstResult, 0);
    signedPlan(f, firstResult, "ready", first);
    const lock = readJson<JsonObject>(join(first, "catalog.lock.json"));
    const catalog = lock.catalog as JsonObject;
    catalog.digest = `sha256:${catalog.digest === `sha256:${"0".repeat(64)}` ? "1".repeat(64) : "0".repeat(64)}`;
    const mismatch = join(f.workspace, "inputs", "mismatch.catalog.lock.json");
    save(mismatch, lock);
    const out = join(f.workspace, "plans", "lock-refused"), before = treePins(join(f.workspace, ".amc"));
    const result = cli(f, input, out, ["--lock", mismatch]);
    assertExit(result, 1);
    expect(result.stderr).toContain("the catalog does not match --lock: catalog.digest expected");
    expect(existsSync(out)).toBe(false);
    expect(treePins(join(f.workspace, ".amc"))).toEqual(before);
  });

  test("request-review creates a genuine PENDING request for the sorted first agent and exact plan payload", () => {
    const f = newFixture(), input = profile(f, "review"), out = join(f.workspace, "plans", "review");
    const result = cli(f, input, out, ["--request-review"]);
    assertExit(result, 0);
    const { plan, metadata } = signedPlan(f, result, "ready", out);
    expect(metadata.review.approvalRequestId).toMatch(/^apprreq_[a-f0-9]{32}$/);
    const script = join(f.root, "inspect-review.mjs");
    writeFileSync(script, INSPECT_REVIEW, { flag: "wx", mode: 0o600 });
    assertExit(run(f, "inspect-review", [script, f.workspace, join(ownedPackage, "dist"), out]), 0);
    const inspection = readJson<{ request: JsonObject; path: string; verification: JsonObject; changed: JsonObject; decisions: unknown[]; consumed: unknown; integrity: { valid: boolean } }>(join(f.workspace, "review-inspection.json"));
    const request = signedFile(inspection.path, f.auditor);
    expect(request).toEqual(inspection.request);
    const payload = { planDigest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, profileId: plan.profile.profileId };
    expect(request).toMatchObject({ approvalRequestId: metadata.review.approvalRequestId, agentId: "default", status: "PENDING",
      intentId: `control-plan-${plan.digest.slice(7, 39)}`, toolName: "catalog.plan.activate", actionClass: "SECURITY",
      requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", workOrderId: null,
      requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"],
      boundHashes: { intentHash: hashBytes(canonical(payload)), policyHash: hashFile(join(f.workspace, ".amc", "action-policy.yaml")),
        toolsHash: hashFile(join(f.workspace, ".amc", "tools.yaml")), budgetsHash: hashFile(join(f.workspace, ".amc", "budgets.yaml")),
        workOrderHash: null, leaseConstraintsHash: hashBytes(canonical({ scopes: [], routeAllowlist: [], modelAllowlist: [] })) } });
    expect(inspection.verification).toMatchObject({ ok: false, status: "PENDING", error: "approval quorum not met (PENDING)" });
    expect(inspection.changed).toMatchObject({ ok: false, status: null, error: "approval intent hash mismatch" });
    expect(inspection.decisions).toEqual([]);
    expect(inspection.consumed).toBeNull();
    expect(inspection.integrity.valid).toBe(true);
  });

  test("the actual F1 operating profile is refused as the different deployment-profile contract", () => {
    const f = newFixture(), input = join(f.workspace, "inputs", "operating-profile.json"), out = join(f.workspace, "plans", "raw-f1");
    const result = cli(f, input, out);
    assertExit(result, 1);
    expect(result.stderr).toContain("PROFILE_INVALID:");
    expect(existsSync(out)).toBe(false);
  });

  test("a genuine referenced F1 file is hash-checked, without claiming fact conversion", () => {
    const f = newFixture(), operating = join(f.workspace, "inputs", "operating-profile.json");
    const ref = { path: "inputs/operating-profile.json", sha256: hashFile(operating), schemaVersion: "2026-10-07" };
    const input = profile(f, "f1-reference", { operatingProfile: ref }), first = join(f.workspace, "plans", "f1-reference");
    const result = cli(f, input, first);
    assertExit(result, 0);
    signedPlan(f, result, "ready", first);
    writeFileSync(operating, `${readFileSync(operating, "utf8")}\n`); // JSON still parses; only the pinned file bytes changed.
    const out = join(f.workspace, "plans", "f1-changed"), before = treePins(join(f.workspace, ".amc"));
    const refused = cli(f, input, out);
    assertExit(refused, 1);
    expect(refused.stderr).toContain("operating profile inputs/operating-profile.json does not match the sha256 the deployment profile records");
    expect(existsSync(out)).toBe(false);
    expect(treePins(join(f.workspace, ".amc"))).toEqual(before);
  });
});
