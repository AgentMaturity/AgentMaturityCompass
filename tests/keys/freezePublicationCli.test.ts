import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "node:crypto";
import { expect, test } from "vitest";
import { createFreezeIncident, listIncidents } from "../../src/drift/freezeEngine.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { freezeFixture, writeFreezeDecisionInputs } from "../helpers/freezePublicationFixture.js";

function harness(f: ReturnType<typeof freezeFixture>) {
  const cli = pathToFileURL(resolve("dist/cli.js")).href, drift = pathToFileURL(resolve("dist/drift/driftCli.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, file = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href, requests = join(f.root, "requests.jsonl"); writeFileSync(requests, "");
  const wrapper = join(f.root, "drift.mjs"), fileWrapper = join(f.root, "file.mjs"), deny = join(f.root, "bridge.mjs"), loader = join(f.root, "loader.mjs"), bin = join(f.root, "bin"); mkdirSync(bin);
  writeFileSync(wrapper, `export * from ${JSON.stringify(drift)};\nexport function freezeLiftCli(){throw new Error("owned freeze CLI denies legacy sync lift");}\nexport function driftCheckCli(){throw new Error("owned drift CLI denies retained incident signing path");}\nexport const driftReportCli=driftCheckCli;\n`);
  writeFileSync(fileWrapper, `import{appendFileSync}from"node:fs";import{fileKeyProvider as actual}from${JSON.stringify(file)};\nexport function fileKeyProvider(workspace){const provider=actual(workspace);return{...provider,async sign(ref,bytes){const signature=await provider.sign(ref,bytes);appendFileSync(process.env.P208_FREEZE_REQUESTS,JSON.stringify({ref,hex:Buffer.from(bytes).toString("hex")})+"\\n");return signature;}};}\n`);
  writeFileSync(deny, 'export function callProviderSync(){throw new Error("owned freeze CLI denies provider bridge invocation");}\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier,context,nextResolve){\nif(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned freeze CLI denies real SDK/native imports");\nconst found=await nextResolve(specifier,context);\nif(found.url===${JSON.stringify(bridge)})return{url:${JSON.stringify(pathToFileURL(deny).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(cli)}&&found.url===${JSON.stringify(drift)})return{url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(file)})return{url:${JSON.stringify(pathToFileURL(fileWrapper).href)},shortCircuit:true};\nreturn found;}\n`);
  const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_FREEZE_REQUESTS: requests };
  const run = async (args: string[]) => { const child = spawnOwnedNode([resolve("dist/cli.js"), ...args], { cwd: f.workspace, env }); return child.wait(30_000); };
  const calls = () => readFileSync(requests, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  return { run, calls, wrapper, env };
}

test.skipIf(process.platform === "win32")("actual freeze lift CLI awaits checked raw32 signing and prints only its real durable lift", async () => {
  const f = freezeFixture(), incident = createFreezeIncident(f.params()), h = harness(f);
  const control = spawnOwnedNode(["--input-type=module", "-e", `import{freezeLiftCli}from${JSON.stringify(pathToFileURL(h.wrapper).href)};freezeLiftCli();`], { cwd: f.workspace, env: h.env });
  const rejected = await control.wait(30_000); expect(rejected.code).not.toBe(0); expect(rejected.stderr).toContain("denies legacy sync lift");
  const result = await h.run(["freeze", "lift", "--agent", "default", "--incident", incident.incidentId, "--reason", "owned compiled clear"]);
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
  const stored = JSON.parse(readFileSync(f.liftPath(incident.incidentId), "utf8")), { signature, ...payload } = stored, digest = sha256Hex(canonicalize(payload));
  expect(verify(null, Buffer.from(digest, "hex"), f.publicKey, Buffer.from(signature, "base64"))).toBe(true);
  expect(h.calls()).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: digest }]); expect(result.stdout).toContain(`Freeze lifted: ${realpathSync(f.liftPath(incident.incidentId))}`); // the CLI resolves its cwd (macOS /private/var)
}, 60_000);

test.skipIf(process.platform === "win32")("actual drift report CLI uses owned diagnostic INPUTS and awaits incident signing before its real Markdown output", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f); const h = harness(f);
  const result = await h.run(["drift", "report", "--agent", "default", "--out", "owned-drift.md"]);
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
  const incident = listIncidents(f.workspace)[0]!; expect(incident).toBeDefined(); const { signature, ...payload } = incident, digest = sha256Hex(canonicalize(payload));
  expect(verify(null, Buffer.from(digest, "hex"), f.publicKey, Buffer.from(signature, "base64"))).toBe(true);
  expect(h.calls()).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: digest }]);
  const report = readFileSync(join(f.workspace, "owned-drift.md"), "utf8"); expect(report).toContain("triggered: yes"); expect(report).toContain(`incidentId: ${incident.incidentId}`);
  expect(result.stdout).toContain("Saved:");
}, 60_000);
