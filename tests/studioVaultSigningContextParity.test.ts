import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addUser, createSession, initUsersConfig } from "../src/auth/authApi.js";
import { nativeCsrfTokenForSession, NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../src/studio/nativeAdmission.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { landedText } from "./helpers/landedSource.js";

const prefix = "unused-code/2026-10-02-main/studio-vault-signing-context";
const map = JSON.parse(readFileSync(resolve(prefix, "restoration.json"), "utf8")) as {
  files: Array<{ archivePath: string; sha256: string }>;
  helperText: string;
  guards: Array<{ text: string; replacement: string; path: string; method: string; line: number }>;
};
const originalBytes = readFileSync(resolve(map.files[0].archivePath));
if (createHash("sha256").update(originalBytes).digest("hex") !== map.files[0].sha256) throw new Error("Archived Studio source changed");
const original = originalBytes.toString("utf8");
const current = readFileSync(resolve("src/studio/studioServer.ts"), "utf8");
const sourceAst = (source: string) => ts.createSourceFile("studioServer.ts", source, ts.ScriptTarget.ES2022, true);

function currentGuards(source: string): Array<{ text: string; start: number; end: number }> {
  const ast = sourceAst(source), rows: Array<{ text: string; start: number; end: number }> = [];
  function walk(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === "!requireUnlockedVaultForSigning()") {
      rows.push({ text: node.getText(ast), start: node.getStart(ast), end: node.end });
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (rows.length !== map.guards.length) throw new Error("Actual signing-vault caller inventory changed");
  return rows;
}
function helperDeclaration(source: string): string {
  const ast = sourceAst(source), rows: ts.VariableStatement[] = [];
  function walk(node: ts.Node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(row =>
      ts.isIdentifier(row.name) && row.name.text === "requireUnlockedVaultForSigning")) rows.push(node);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (rows.length !== 1) throw new Error("Actual signing-vault helper inventory changed");
  return rows[0].getText(ast);
}

type Response = { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void };
type Factory = (res: Response, options: { workspace: string }, admitted: () => void) => Array<() => boolean | undefined>;
let events: unknown[] = [];
let unlocked: unknown = false;
let fixtureFailure: "lookup" | "property" | null = null;
const vaultLookup = (workspace: string) => {
  events.push(["vault", workspace]);
  if (fixtureFailure === "lookup") throw new Error("owned vault lookup refusal");
  return { get unlocked() {
    events.push(["unlocked"]);
    if (fixtureFailure === "property") throw new TypeError("owned unlocked getter refusal");
    return unlocked;
  } };
};
function guardFactory(source: string, shared: boolean): Factory {
  const ast = sourceAst(source);
  const json = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "json");
  if (!json) throw new Error("Actual Studio JSON response function missing");
  const guards = shared ? currentGuards(source).map(row => row.text) : map.guards.map(row => row.text);
  // Execute actual source fragments. Vault IO and subsequent domain work are
  // controlled seams; real signed-session HTTP checks below exercise the server.
  const code = json.getText(ast) + `\nfunction make(res, options, admitted) {
    ${shared ? helperDeclaration(source) : ""}
    return [${guards.map(guard => `() => { ${guard} admitted(); return true; }`).join(",\n")}];
  }\nexports.make = make;`;
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  if (compiled.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) throw new Error("Actual vault guard fragment did not compile");
  const exports: { make?: Factory } = {};
  runInNewContext(compiled.outputText, { exports, vaultStatus: vaultLookup }, { timeout: 1_000 });
  return exports.make!;
}
const before = guardFactory(original, false), after = guardFactory(current, true);
function outcome(factory: Factory, index: number, value: unknown, failure: typeof fixtureFailure = null) {
  events = []; unlocked = value; fixtureFailure = failure;
  const response: Response = { statusCode: 0,
    setHeader(name, data) { events.push(["header", name, data]); },
    end(body) { events.push(["body", body]); } };
  const options = { get workspace() { events.push(["workspace"]); return "owned-vault-fixture"; } };
  let admitted = 0;
  try {
    const allowed = factory(response, options, () => { admitted++; events.push(["admitted"]); })[index]();
    return { allowed, status: response.statusCode, admitted, events: [...events] };
  } catch (error) {
    const caught = error as Error;
    return { error: { name: caught.name, message: caught.message }, status: response.statusCode, admitted, events: [...events] };
  }
}

describe("actual Studio signing-vault guard parity", () => {
  it("reverses only the declared sharing to the complete unchanged source", () => {
    expect(map.guards).toHaveLength(40);
    const current = landedText("src/studio/studioServer.ts");
    expect(current.split(map.helperText)).toHaveLength(2);
    let restored = current.replace(map.helperText, "");
    const guards = currentGuards(restored);
    for (let i = guards.length - 1; i >= 0; i--) {
      expect(guards[i].text).toBe(map.guards[i].replacement);
      restored = restored.slice(0, guards[i].start) + map.guards[i].text + restored.slice(guards[i].end);
    }
    expect(restored).toBe(original);
  });
  it("does not query the vault or workspace while merely binding the request", () => {
    events = [];
    const options = { get workspace(): string { throw new Error("eager workspace access"); } };
    expect(after({ statusCode: 0, setHeader() {}, end() {} }, options, () => {})).toHaveLength(40);
    expect(events).toEqual([]);
  });
  it.each(map.guards.map((row, index) => ({ ...row, index })))("retains locked-vault denial before domain work at $path", row => {
    const result = outcome(after, row.index, false);
    expect(result).toEqual(outcome(before, row.index, false));
    expect(result).toMatchObject({ status: 423, admitted: 0 });
    expect(result.events).toContainEqual(["body", JSON.stringify({ error: "vault locked; unlock required for signing" })]);
  });
  it.each([false, true, 0, 1, null, undefined, "", "unlocked"])("retains boolean coercion and getter order for %s", value => {
    for (let index = 0; index < map.guards.length; index++) {
      expect(outcome(after, index, value)).toEqual(outcome(before, index, value));
    }
  });
  it.each(["lookup", "property"] as const)("retains native %s failures before domain work", failure => {
    for (let index = 0; index < map.guards.length; index++) {
      const result = outcome(after, index, true, failure);
      expect(result).toEqual(outcome(before, index, true, failure));
      expect(result.admitted).toBe(0);
      expect(result).toHaveProperty("error");
    }
  });
});

describe("actual signed-session Studio signing-vault HTTP refusals", () => {
  let workspace: string;
  let api: Awaited<ReturnType<typeof startStudioApiServer>> | undefined;
  let owner: ReturnType<typeof createSession>, viewer: ReturnType<typeof createSession>;
  beforeAll(async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-signing-vault-fixture-only");
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-signing-vault-context-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    const initialized = initUsersConfig({ workspace, username: "owner", password: "owned-owner-fixture" });
    owner = createSession({ workspace, user: initialized.owner });
    viewer = createSession({ workspace, user: addUser({ workspace, username: "viewer", password: "owned-viewer-fixture", roles: ["VIEWER"] }) });
    api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "owned-vault-fixture-admin" });
    lockVault(workspace);
  }, 30_000);
  afterAll(async () => {
    try { await api?.close(); }
    finally { if (workspace) rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); }
  });
  function post(path: string, session?: ReturnType<typeof createSession>) {
    const headers: Record<string, string> = { "content-type": "application/json", origin: api!.url,
      [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE };
    if (session) {
      headers.cookie = `amc_session=${session.token}`;
      headers[NATIVE_CSRF_HEADER] = nativeCsrfTokenForSession(session.payload);
    }
    // Malformed body proves the vault refusal precedes parsing or signing work.
    return fetch(api!.url + path, { method: "POST", headers, body: "{not-json" });
  }
  it.each(map.guards)("retains vault denial after authentication and role admission at $path", async row => {
    const refused = await post(row.path, owner);
    expect(refused.status).toBe(423);
    expect(refused.headers.get("content-type")).toContain("application/json");
    expect(await refused.json()).toEqual({ error: "vault locked; unlock required for signing" });
    const roleRefused = await post(row.path, viewer);
    expect(roleRefused.status).toBe(403);
    const unauthenticated = await post(row.path);
    expect(unauthenticated.status).toBe(401);
  });
});
