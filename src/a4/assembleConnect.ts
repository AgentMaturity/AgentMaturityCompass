/**
 * Assemble's external path (P1-60 slice B; design §10.2, §13). After Build and before Review (step `built`), for a path
 * other than native, an owner in owner mode runs each external build mechanism from the A4 card. The project records
 * what AMC produced as an implementation ref, self_reported: AMC wrote files or minted a lease; nothing about the agent
 * is observed.
 * - scaffold: `generateScaffold` for the path's framework, `generateContractTests` and `exportPolicyPack` (its own sha256
 *   manifest), into a directory the owner names inside the workspace, outside `.amc/`, with no symbolic link on the way
 *   (every component lstat-checked), that does not exist yet. Every byte is produced in memory or in a private temporary
 *   directory first; the record binds a manifest of every file's sha256, and the files are written only after the
 *   record commits (a refused record writes nothing).
 * - connect: `buildConnectInstructions` with `mode` always passed (without one it prompts on a terminal). The lease token
 *   is in this response only and is never stored; the record keeps the leaseId, and a replay answers token: null. A lease
 *   whose record is refused was never delivered and is revoked.
 * - import: the neutral importer over a workspace file or directory reached with no symbolic link on the way, originals
 *   retained (P1-24): imported traces stay self_reported. The record binds the import's manifest; a refused record rolls
 *   the import back.
 * The bounded first task through `createForeignRunner` is not run here: a foreign child runs only under `spawnSubagent`
 * from a parent session, and Studio's native tasks compose no delegation (NATIVE_TASKS_NO_DELEGATION, the workflow
 * executor's blocker); Propose lists it as unsupported with that key.
 */
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { exportPolicyPack } from "../exports/policyExport.js";
import { rollbackNeutralImport, runNeutralImport, type NeutralImportResult } from "../importers/neutralImporter.js";
import { revokeLease } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { assertOwnerMode } from "../mode/mode.js";
import { generateContractTests, generateScaffold, type IntegrationFramework } from "../setup/integrationScaffold.js";
import type { ConnectOutput } from "../studio/connectWizard.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
// Function declarations only: a4Router.ts imports this module (through a4RouterStages.ts), so nothing here reads its bindings at load time.
import { a4Fail, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import type { A4IntegrationClaimV1 } from "./a4Schema.js";
import type { A4TransitionResult } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { integrationClaimFor, SCAFFOLD_FRAMEWORK } from "./assemblePaths.js";
import { assembleSpecOf, proposedFor } from "./spec/assemble.js";

const base = { expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) };
const scaffoldSchema = z.strictObject({ ...base, directory: z.string().trim().min(1).max(200) });
const connectSchema = z.strictObject({ ...base, mode: z.enum(["supervise", "sandbox"]), adapterId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/).nullable().optional() });
const importSchema = z.strictObject({ ...base, inputPath: z.string().trim().min(1).max(512) });
/** One path segment the owner may name: no leading dot (so never `.amc`, `.git`, `.` or `..`), no separator. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MANIFEST_NAME = "a4-scaffold-manifest.json";
/** The credential projection a4_requests keeps for a connect request (src/a4/a4Store.ts): leaseIds only, never the token. */
const CONNECT_CREDENTIAL = "a4.assemble.connect";

type FileOut = { readonly path: string; readonly bytes: Buffer };

/** The project at Assemble step `built` on a proposed external plan; the build action's roles (owner) and readiness. */
function externalPrecheck(route: A4Route, projectId: string, expectedHeadSeq: number): { state: A4ReadinessState; claim: A4IntegrationClaimV1 } {
  const state = precheck(route, projectId, "build", expectedHeadSeq);
  if (state.project.stage !== "assemble" || state.project.step !== "built") {
    throw a4Fail(409, "A4_STEP_ORDER", `Scaffold, connect and import run after Build and before Review at Assemble; the project is at ${state.project.stage} ${state.project.step}.`);
  }
  const { spec, answers } = assembleSpecOf(state);
  if (!proposedFor(spec, answers) || spec.build === undefined) throw a4Fail(409, "A4_NOT_READY", "Build the proposed plan first.", { reasonCodes: ["PLAN_STALE"] });
  const claim = integrationClaimFor(spec.path);
  if (claim === null || claim.path === "native") {
    throw a4Fail(409, "A4_STEP_ORDER", "The native path builds through Studio's native tasks; scaffold, connect and import are for external paths.");
  }
  return { state, claim };
}

const present = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** A workspace-relative path the owner named: its segments, refused when one is not a plain name. */
function segmentsOf(input: string, what: string): string[] {
  const segments = input.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
  if (segments.length > 8 || !segments.every((segment) => SEGMENT.test(segment))) {
    throw a4Fail(400, "INPUT_INVALID", `${what}: a workspace-relative path of plain names (letters, digits, . _ -; no leading dot), at most 8 deep.`);
  }
  return segments;
}

/**
 * Walks `segments` under the workspace with lstat on every prefix and refuses (400 PATH_NOT_PLAIN) a component that is a
 * symbolic link, or a directory on the way that is not one: the typed names never start with a dot, so with no link on
 * the way a planted `docs -> .amc` cannot lead a scaffold or an import into `.amc/` or out of the workspace. With
 * `create`, each missing directory is made on its own (never recursively) and checked once it exists. Returns the path.
 * ponytail: lstat-then-use, not openat; a workspace writer racing directory swaps between the check and the use is not
 * excluded (Node has no no-follow directory open). The resolved-path re-check in writeScaffold narrows it.
 */
function plainPath(workspace: string, segments: readonly string[], create: boolean): string {
  let path = workspace;
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment);
    if (create && !present(path)) mkdirSync(path);
    if (!present(path)) break;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (create || index < segments.length - 1))) {
      throw a4Fail(400, "PATH_NOT_PLAIN", "The path goes through a symbolic link or a file; name plain directories inside the workspace.");
    }
  }
  return path;
}

/** The scaffold directory: inside the workspace, outside `.amc/`, no link on the way, not present yet (nothing is ever overwritten). */
function scaffoldDirectory(workspace: string, input: string): { rel: string; segments: string[] } {
  const segments = segmentsOf(input, "directory");
  plainPath(workspace, segments, false);
  if (present(join(workspace, ...segments))) throw a4Fail(409, "SCAFFOLD_DIRECTORY_EXISTS", "Name a directory that does not exist yet; AMC never writes into an existing one.");
  return { rel: segments.join("/"), segments };
}

/**
 * Every file the scaffold writes, built before anything is recorded: the framework scaffold, the contract tests and the
 * policy pack (exported into a private temporary directory, read back, removed). The policy pack needs the agent's
 * signed target profile `default`, which Aspire's Build writes.
 */
function scaffoldFiles(workspace: string, agentId: string, framework: IntegrationFramework): { files: FileOut[]; instructions: string[] } {
  const scaffold = generateScaffold(framework);
  const files: FileOut[] = scaffold.files.map((file) => ({ path: `scaffold/${segmentsOf(file.path, "scaffold file").join("/")}`, bytes: Buffer.from(file.content, "utf8") }));
  files.push({ path: "contract-tests.json", bytes: Buffer.from(`${JSON.stringify(generateContractTests(), null, 2)}\n`, "utf8") });
  const temp = mkdtempSync(join(tmpdir(), "amc-a4-policy-"));
  try {
    let pack: ReturnType<typeof exportPolicyPack>;
    try {
      pack = exportPolicyPack({ workspace, agentId, targetName: "default", outDir: temp });
    } catch (error) {
      throw a4Fail(409, "A4_NOT_READY", "The policy pack could not be exported: it needs the agent's signed target profile `default` (Aspire's Build writes it).",
        { reasonCodes: [errorCodeOf(error, "POLICY_PACK_UNAVAILABLE")] });
    }
    for (const rel of [...pack.files, relative(temp, pack.manifestPath)]) {
      files.push({ path: `policy-pack/${segmentsOf(rel, "policy pack file").join("/")}`, bytes: readFileSync(join(temp, rel)) });
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return { files, instructions: scaffold.instructions.slice(0, 32).map((line) => line.slice(0, 500)) };
}

/**
 * After the record committed: the parents re-walked (plainPath, made one at a time and lstat-checked, before anything
 * is created under them), the new directory created exclusively, its resolved path required to be exactly the typed one
 * under the resolved workspace (so never under `.amc/`), every file created exclusively.
 */
function writeScaffold(workspace: string, target: { segments: readonly string[] }, files: readonly FileOut[]): void {
  const parent = plainPath(workspace, target.segments.slice(0, -1), true);
  const dir = join(parent, target.segments.at(-1)!);
  mkdirSync(dir);
  plainPath(workspace, target.segments, false);
  const real = realpathSync(dir);
  if (real !== join(realpathSync(workspace), ...target.segments)) throw a4Fail(400, "PATH_NOT_PLAIN", "The directory does not resolve to the path named.");
  for (const file of files) {
    const path = join(real, ...file.path.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.bytes, { flag: "wx", mode: 0o644 });
  }
}

/**
 * POST …/stages/assemble/scaffold { directory }: the scaffold, contract tests and policy pack for the chosen path, as a
 * `manifest` ref (self_reported) whose sha256 binds every file; the files are written once the record commits.
 */
async function scaffold(route: A4Route, projectId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, scaffoldSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const { state, claim } = externalPrecheck(route, projectId, body.expectedHeadSeq);
  assertOwnerMode(route.workspace, "a4 scaffold");
  const framework = SCAFFOLD_FRAMEWORK[claim.path];
  if (framework === undefined) throw a4Fail(409, "A4_NOT_READY", `${claim.path} has no scaffold; connect it instead.`, { reasonCodes: ["NO_SCAFFOLD_FOR_PATH"] });
  const target = scaffoldDirectory(route.workspace, body.directory);
  const { files, instructions } = scaffoldFiles(route.workspace, state.project.agent_id, framework);
  const manifest = { schema: "amc.a4-scaffold-manifest/v1", projectId, revisionNo: state.project.revision_no, path: claim.path, framework,
    directory: target.rel, instructions, files: files.map((file) => ({ path: file.path, sha256: sha256Hex(file.bytes), size: file.bytes.length })) };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const refId = `${target.rel}/${MANIFEST_NAME}`;
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "manifest", refId, sha256: sha256Hex(manifestBytes), claimKind: "self_reported",
    method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `assemble scaffold: ${framework} scaffold, contract tests and policy pack for ${claim.path} in ${target.rel}/ (AMC-written files; self-reported)`,
    note: { purpose: "assemble_scaffold", directory: target.rel, framework, fileCount: files.length } });
  if (result.replay) return (apiSuccess(route.res, mutationResult(result)), true);
  let error: string | null = null;
  try {
    writeScaffold(route.workspace, target, [...files, { path: MANIFEST_NAME, bytes: manifestBytes }]);
  } catch (caught) {
    // The record names files that are not there: the manifest ref reads dangling until a new scaffold is recorded.
    error = errorCodeOf(caught, "SCAFFOLD_WRITE_FAILED");
  }
  apiSuccess(route.res, mutationResult(result, { scaffold: { directory: target.rel, framework, manifest: refId, files: manifest.files.map((file) => file.path),
    instructions, written: error === null, error } }), 201);
  return true;
}

/** Revokes a lease that was never delivered (best effort: an undelivered token is held by no one). */
function revokeUndelivered(workspace: string, leaseId: string): void {
  try {
    revokeLease(workspace, leaseId, "A4 connect was not recorded; the token was never delivered");
  } catch {
    // The token left nowhere; the lease expires on its own.
  }
}

/**
 * POST …/stages/assemble/connect { mode, adapterId? }: connect instructions for the agent. The lease token is in this
 * response once, never stored; the record (an `external` ref, self_reported) keeps the leaseId, route, mode and command.
 */
async function connect(route: A4Route, projectId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, connectSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const { state, claim } = externalPrecheck(route, projectId, body.expectedHeadSeq);
  assertOwnerMode(route.workspace, "a4 connect");
  const agentId = state.project.agent_id;
  let output: ConnectOutput;
  try {
    // `mode` is always passed: buildConnectInstructions prompts with inquirer without one (loaded only here, never at Studio start).
    const { buildConnectInstructions } = await import("../studio/connectWizard.js");
    output = await buildConnectInstructions({ workspace: route.workspace, agentId, mode: body.mode, ...(body.adapterId ? { adapterId: body.adapterId } : {}) });
  } catch (error) {
    throw a4Fail(409, "A4_NOT_READY", "Connect instructions could not be built for this agent; check its adapter and gateway configuration.",
      { reasonCodes: [errorCodeOf(error, "CONNECT_FAILED")] });
  }
  const lease = verifyLeaseToken({ workspace: route.workspace, token: output.leaseToken, expectedAgentId: agentId });
  if (!lease.ok || lease.payload === null) throw a4Fail(500, "LEASE_UNVERIFIED", "The lease minted for the connect instructions does not verify; nothing was recorded.");
  const leaseId = lease.payload.leaseId;
  const record = { path: claim.path, mode: output.mode, adapterId: output.adapterId, routeUrl: output.routeUrl, command: output.command, leaseId,
    leaseExpiresTs: lease.payload.expiresTs, workOrderId: output.workOrderId, hookInstallCommand: output.hookObservation.installCommand };
  let result: A4TransitionResult;
  try {
    result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "external", refId: `lease:${leaseId}`, sha256: sha256Hex(canonicalize(record)),
      claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq,
      request: request === undefined ? undefined : { ...request, credential: { releaseId: CONNECT_CREDENTIAL, leaseIds: [leaseId] } },
      label: `assemble connect: ${claim.path} connect instructions (${output.mode}); lease ${leaseId} delivered once, never stored (self-reported)`,
      note: { purpose: "assemble_connect", ...record } });
  } catch (error) {
    revokeUndelivered(route.workspace, leaseId);
    throw error;
  }
  if (result.replay) {
    revokeUndelivered(route.workspace, leaseId);
    return (apiSuccess(route.res, mutationResult(result)), true);
  }
  apiSuccess(route.res, mutationResult(result, { connect: { ...record, envLines: output.envLines, leaseToken: output.leaseToken,
    leaseCarrierHint: output.leaseCarrierHint, nodeSnippet: output.nodeSnippet, pythonSnippet: output.pythonSnippet, hookObservation: output.hookObservation,
    tokenNotice: "The lease token is shown once, in this response; AMC does not store it. Copy it now." } }), 201);
  return true;
}

/** A workspace file or directory the owner named for import: inside the workspace, outside `.amc/`, no symbolic link on the way or at the end. */
function importSource(workspace: string, input: string): { rel: string; abs: string } {
  const segments = segmentsOf(input, "inputPath");
  const abs = plainPath(workspace, segments, false);
  if (!present(abs)) throw a4Fail(404, "IMPORT_SOURCE_MISSING", "No such file or directory in the workspace.");
  return { rel: segments.join("/"), abs };
}

/**
 * POST …/stages/assemble/import { inputPath }: the neutral importer over the agent's traces, originals retained; the
 * import's manifest becomes a `manifest` ref, self_reported. A refused record rolls the import back.
 */
async function importTraces(route: A4Route, projectId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, importSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const { state, claim } = externalPrecheck(route, projectId, body.expectedHeadSeq);
  assertOwnerMode(route.workspace, "a4 import");
  const source = importSource(route.workspace, body.inputPath);
  let imported: NeutralImportResult;
  try {
    imported = runNeutralImport({ workspace: route.workspace, inputPath: source.abs, agentId: state.project.agent_id, mode: "import", retainOriginals: true });
  } catch (error) {
    throw a4Fail(422, errorCodeOf(error, "IMPORT_REFUSED"), "The neutral importer refused this source; check it with `amc import --help`.");
  }
  const rollback = (): void => {
    try {
      rollbackNeutralImport({ workspace: route.workspace, importId: imported.importId });
    } catch {
      // Reported by the import's own manifest; the A4 record names nothing.
    }
  };
  let result: A4TransitionResult;
  try {
    if (imported.importManifestPath === null) throw a4Fail(500, "IMPORT_NOT_RECORDED", "The importer wrote no manifest.");
    const manifestRel = relative(route.workspace, imported.importManifestPath).split(sep).join("/");
    result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "manifest", refId: manifestRel, sha256: sha256Hex(readFileSync(imported.importManifestPath)),
      claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
      label: `assemble import: ${claim.path} traces from ${source.rel} (neutral import ${imported.importId}; self-reported, originals retained)`,
      note: { purpose: "assemble_import", importId: imported.importId, source: source.rel, originals: imported.originals.length,
        semanticDigest: imported.plan.normalization?.semanticDigest ?? null } });
  } catch (error) {
    rollback();
    throw error;
  }
  if (result.replay) rollback();
  apiSuccess(route.res, mutationResult(result, result.replay ? {} : { import: { importId: imported.importId, applied: imported.applied, source: source.rel,
    originals: imported.originals.length, writtenPaths: imported.writtenPaths.length } }), result.replay ? 200 : 201);
  return true;
}

/** The external path's POST routes; false when none matches. */
export async function handleConnectRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  if (tail === "/stages/assemble/scaffold") return scaffold(route, projectId);
  if (tail === "/stages/assemble/connect") return connect(route, projectId);
  if (tail === "/stages/assemble/import") return importTraces(route, projectId);
  return false;
}
