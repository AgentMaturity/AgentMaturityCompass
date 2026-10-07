import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { enforceRoleOrAdmin } from "../src/auth/rbac.js";
import { USER_ROLES, type UserRole } from "../src/auth/roles.js";
import { landedText } from "./helpers/landedSource.js";

const prefix = "unused-code/2026-10-01-main/studio-route-role-context";
const map = JSON.parse(readFileSync(resolve(prefix, "restoration.json"), "utf8")) as {
  files: Array<{ archivePath: string; sha256: string }>;
  helperText: string;
  calls: Array<{ text: string; replacement: string; roles: UserRole[]; line: number }>;
};
const originalBytes = readFileSync(resolve(map.files[0].archivePath));
if (createHash("sha256").update(originalBytes).digest("hex") !== map.files[0].sha256) {
  throw new Error("Archived Studio source changed");
}
const original = originalBytes.toString("utf8");
const current = readFileSync(resolve("src/studio/studioServer.ts"), "utf8");

function sourceAst(source: string) {
  return ts.createSourceFile("studioServer.ts", source, ts.ScriptTarget.ES2022, true);
}
function guardDeclarations(source: string): string {
  const ast = sourceAst(source);
  return ["json", "accessContext", "requireRoles"].map(name => {
    const rows = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (rows.length !== 1) throw new Error("Missing actual Studio guard declaration: " + name);
    return rows[0].getText(ast);
  }).join("\n");
}
function contextDeclaration(source: string): string {
  const ast = sourceAst(source);
  const rows: ts.VariableStatement[] = [];
  function walk(node: ts.Node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(row =>
      ts.isIdentifier(row.name) && row.name.text === "requireRouteRoles")) rows.push(node);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (rows.length !== 1) throw new Error("Missing actual Studio request role context");
  return rows[0].getText(ast);
}
function currentGuardCalls(source: string): string[] {
  const ast = sourceAst(source), rows: string[] = [];
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "requireRouteRoles") rows.push(node.getText(ast));
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (rows.length !== map.calls.length) throw new Error("Actual Studio guard call inventory changed");
  return rows;
}

const vaultMap = JSON.parse(readFileSync(resolve("unused-code/2026-10-02-main/studio-vault-signing-context/restoration.json"), "utf8")) as {
  helperText: string; guards: Array<{ text: string; replacement: string }>;
};
function undoVaultSharing(source: string): string {
  if (source.split(vaultMap.helperText).length !== 2) throw new Error("Signing-vault helper inventory changed");
  let restored = source.replace(vaultMap.helperText, "");
  const ast = sourceAst(restored), guards: ts.IfStatement[] = [];
  function walk(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === "!requireUnlockedVaultForSigning()") guards.push(node);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (guards.length !== vaultMap.guards.length) throw new Error("Signing-vault caller inventory changed");
  for (let i = guards.length - 1; i >= 0; i--) {
    if (guards[i].getText(ast) !== vaultMap.guards[i].replacement) throw new Error("Signing-vault caller bytes changed");
    restored = restored.slice(0, guards[i].getStart(ast)) + vaultMap.guards[i].text + restored.slice(guards[i].end);
  }
  return restored;
}

type Actor = { isAdmin: boolean; username: string | null; roles: Set<UserRole>; sessionAuthSource?: string };
type Response = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void };
type Guard = () => boolean;
type Factory = (auth: Actor, res: Response, options: { workspace: string }, admitted: () => void) => Guard[];

function guardFactory(source: string, shared: boolean, verify: (workspace: string) => { valid: boolean }): Factory {
  // Execute the real private Studio guard and request helper, with real RBAC.
  // Only signature IO and subsequent domain work are controlled fixture seams.
  const calls = shared ? currentGuardCalls(source) : map.calls.map(row => row.text);
  const factory = `function make(auth, res, options, admitted) {
    ${shared ? contextDeclaration(source) : ""}
    return [${calls.map(call => `() => {
      if (!${call}) return false;
      admitted(); return true;
    }`).join(",\n")}];
  }\nexports.make = make;`;
  const compiled = ts.transpileModule(guardDeclarations(source) + "\n" + factory, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true
  });
  if (compiled.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) {
    throw new Error("Actual guard fragment did not compile");
  }
  const exports: { make?: Factory } = {};
  // P0-23: json() labels 2xx result bodies; these guard fragments only answer with refusals.
  const withClaimBody = (_res: unknown, _status: number, body: unknown) => body;
  runInNewContext(compiled.outputText, { exports, enforceRoleOrAdmin, verifyUsersConfigSignature: verify, withClaimBody }, { timeout: 1_000 });
  return exports.make!;
}

let events: unknown[] = [];
let signatureValid = true;
let signatureThrows = false;
const verify = (workspace: string) => {
  events.push(["signature", workspace]);
  if (signatureThrows) throw new Error("owned signature fixture refusal");
  return { valid: signatureValid };
};
const before = guardFactory(original, false, verify);
const after = guardFactory(current, true, verify);

function outcome(factory: Factory, call: number, actor: Actor, valid = true, throws = false) {
  events = []; signatureValid = valid; signatureThrows = throws;
  const auth = new Proxy(actor, { get(target, key, receiver) {
    events.push(["actor", String(key)]); return Reflect.get(target, key, receiver);
  } });
  const response: Response = {
    statusCode: 0,
    setHeader(name, value) { events.push(["header", name, value]); },
    end(body) { events.push(["body", body]); }
  };
  const options = { get workspace() { events.push(["workspace"]); return "owned-workspace-fixture"; } };
  let admitted = 0;
  try {
    const allowed = factory(auth, response, options, () => { admitted++; events.push(["admitted"]); })[call]();
    return { allowed, status: response.statusCode, admitted, events: [...events] };
  } catch (error) {
    const failure = error as Error;
    return { error: { name: failure.name, message: failure.message }, status: response.statusCode, admitted, events: [...events] };
  }
}
const actor = (roles: UserRole[], overrides: Partial<Actor> = {}): Actor => ({
  isAdmin: false, username: "owned-human-fixture", roles: new Set(roles), ...overrides
});
const cases = [
  ...USER_ROLES.map(role => ({ name: "valid signature / " + role, actor: actor([role]), valid: true })),
  ...USER_ROLES.map(role => ({ name: "invalid signature / " + role, actor: actor([role]), valid: false })),
  { name: "admin / invalid signature", actor: actor([], { isAdmin: true, username: null }), valid: false },
  { name: "missing username / valid signature", actor: actor(["OWNER"], { username: null }), valid: true },
  { name: "no roles / valid signature", actor: actor([]), valid: true },
  { name: "workspace-router viewer / invalid local signature", actor: actor(["VIEWER"], { sessionAuthSource: "WORKSPACE_ROUTER" }), valid: false },
  { name: "workspace-router agent / invalid local signature", actor: actor(["AGENT"], { sessionAuthSource: "WORKSPACE_ROUTER" }), valid: false },
  { name: "multiple ordinary roles", actor: actor(["VIEWER", "AUDITOR", "OPERATOR"]), valid: true }
];
const groups = [...new Map(map.calls.map((row, index) => [JSON.stringify(row.roles), index])).entries()];

describe("Studio request role context sharing", () => {
  it("reverses exactly the declared calls to the complete unchanged source", () => {
    expect(map.calls).toHaveLength(232);
    const current = landedText("src/studio/studioServer.ts");
    expect(current.split(map.helperText)).toHaveLength(2);
    let restored = undoVaultSharing(current).replace(map.helperText, "");
    const ast = sourceAst(restored), calls: ts.CallExpression[] = [];
    function walk(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "requireRouteRoles") calls.push(node);
      ts.forEachChild(node, walk);
    }
    walk(ast);
    expect(calls).toHaveLength(map.calls.length);
    for (let i = calls.length - 1; i >= 0; i--) {
      expect(calls[i].getText(ast)).toBe(map.calls[i].replacement);
      restored = restored.slice(0, calls[i].getStart(ast)) + map.calls[i].text + restored.slice(calls[i].end);
    }
    expect(restored).toBe(original);
  });
  it("never invokes signature IO while merely binding the request", () => {
    events = [];
    const options = { get workspace(): string { throw new Error("eager workspace read"); } };
    expect(after(actor(["OWNER"]), { statusCode: 0, setHeader() {}, end() {} }, options, () => {})).toHaveLength(232);
    expect(events).toEqual([]);
  });
  it("retains denial and prevents later domain work at every declared route position", () => {
    for (let index = 0; index < map.calls.length; index++) {
      const result = outcome(after, index, actor(["AGENT"]));
      expect(result, "original guard line " + map.calls[index].line).toEqual(outcome(before, index, actor(["AGENT"])));
      expect(result).toMatchObject({ allowed: false, status: 403, admitted: 0 });
    }
  });
  it("retains admission at every declared route position for the actual admin guard", () => {
    for (let index = 0; index < map.calls.length; index++) {
      expect(outcome(after, index, actor([], { isAdmin: true }), false))
        .toEqual(outcome(before, index, actor([], { isAdmin: true }), false));
    }
  });
});
for (const [roles, index] of groups) {
  describe("actual Studio guard parity: " + roles, () => {
    for (const fixture of cases) it(fixture.name, () => {
      expect(outcome(after, index, fixture.actor, fixture.valid))
        .toEqual(outcome(before, index, fixture.actor, fixture.valid));
    });
    it("retains native signature verifier failures before later domain work", () => {
      const result = outcome(after, index, actor(["OWNER"]), true, true);
      expect(result).toEqual(outcome(before, index, actor(["OWNER"]), true, true));
      expect(result).toMatchObject({ error: { message: "owned signature fixture refusal" }, admitted: 0 });
    });
  });
}
