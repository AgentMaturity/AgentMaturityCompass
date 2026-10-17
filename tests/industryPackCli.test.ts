import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { statusDimensionsSchema } from "../src/claims/eligibility/index.js";
import { createIndustryPackLicenseKey, getIndustryPackEntitlement } from "../src/domains/industryPackEntitlement.js";
import { sha256Hex } from "../src/utils/hash.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const records: Array<Record<string, unknown>> = [];
let root: string;
let workspace: string;
let fixtureHome: string;
let logs: string;
let guard: string;
let licenseKey: string;
let environment: NodeJS.ProcessEnv;
let paidControl: Promise<void> | undefined;

beforeAll(() => {
  expect(process.versions.node.split(".")[0], "CLI qualification requires the prepared Node 22 or 24 runtime").toMatch(/^(22|24)$/);
  expect(existsSync(cli), "Build P0-23 normally before running this CLI contract").toBe(true);
  root = mkdtempSync("/private/tmp/amc-p0-23-industry-pack-cli-");
  workspace = join(root, "workspace");
  fixtureHome = join(root, "home");
  logs = join(root, "logs");
  guard = join(root, "deny-transport.mjs");
  for (const path of [workspace, fixtureHome, logs]) mkdirSync(path);
  writeFileSync(guard, `import http from "node:http"; import https from "node:https"; import net from "node:net";
import tls from "node:tls"; import dns from "node:dns"; import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("P0_23_OFFLINE_FIXTURE: external transport denied"); };
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = deny;
dgram.createSocket = deny;
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "reverse"]) {
  dns[name] = deny; dns.promises[name] = deny;
}
globalThis.fetch = deny; globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();\n`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  licenseKey = createIndustryPackLicenseKey({
    customerId: "p0-23-owned-cli-fixture", expiresAt: "2099-01-01T00:00:00.000Z",
    env: { AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString() },
  });
  environment = {
    PATH: `${dirname(process.execPath)}${delimiter}/usr/bin${delimiter}/bin`, HOME: fixtureHome,
    NO_COLOR: "1", TERM: "dumb", NODE_ENV: "test", AMC_CLAIM_LABELS_STRICT: "1",
    NODE_OPTIONS: `--import=${pathToFileURL(guard).href}`,
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
    AMC_INDUSTRY_PACKS_LICENSE_KEY: licenseKey,
  };
  expect(getIndustryPackEntitlement(workspace, environment)).toMatchObject({ active: true, source: "env" });
  writeFileSync(join(logs, "fixture.json"), JSON.stringify({
    root, workspace, home: fixtureHome, node: process.version, executable: process.execPath,
    strict: true, transport: "denied", environmentKeys: Object.keys(environment).sort(),
    cli, cliSha256: sha256Hex(readFileSync(cli)), guardSha256: sha256Hex(readFileSync(guard)),
    testSha256: sha256Hex(readFileSync(fileURLToPath(import.meta.url))),
  }, null, 2));
});

afterAll(() => {
  // Raw child streams and their hashes remain private; only fresh fixture state is removed.
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  if (fixtureHome) rmSync(fixtureHome, { recursive: true, force: true });
});

async function invoke(name: string, args: string[]) {
  const started = Date.now();
  const result = await new Promise<{ status: number | null; signal: string | null; error?: string; stdout: string; stderr: string }>((done) => {
    execFile(process.execPath, ["--import", pathToFileURL(guard).href, cli, ...args], {
      cwd: workspace, env: environment, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const failure = error as (Error & { code?: string | number; signal?: string }) | null;
      done({ status: !failure ? 0 : typeof failure.code === "number" ? failure.code : null,
        signal: failure?.signal ?? null, ...(failure && typeof failure.code !== "number" ? { error: failure.message } : {}), stdout, stderr });
    });
  });
  const stdoutPath = join(logs, `${name}.stdout`);
  const stderrPath = join(logs, `${name}.stderr`);
  writeFileSync(stdoutPath, result.stdout);
  writeFileSync(stderrPath, result.stderr);
  records.push({ name, args, status: result.status, signal: result.signal, durationMs: Date.now() - started,
    stdoutPath, stderrPath, stdoutSha256: sha256Hex(result.stdout), stderrSha256: sha256Hex(result.stderr) });
  writeFileSync(join(logs, "commands.json"), JSON.stringify(records, null, 2));
  if ((result.stdout + result.stderr).includes(licenseKey)) throw new Error("Fixture license appeared in private child output");
  return result;
}

function completed(result: Awaited<ReturnType<typeof invoke>>): void {
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).not.toBeNull();
  expect(result.status, "Strict exit 70 does not qualify a pack refusal").not.toBe(70);
  expect(result.stdout + result.stderr).not.toMatch(/unknown option|missing required argument|required option .+ not specified|unknown command|P0_23_OFFLINE_FIXTURE/i);
}

function validPaidControl(): Promise<void> {
  return paidControl ??= (async () => {
    const access = await invoke("paid-entitlement", ["domain", "pack", "access", "--json"]);
    completed(access);
    expect(access.status, access.stderr).toBe(0);
    expect(JSON.parse(access.stdout)).toMatchObject({ active: true, source: "env" });
    const baseline = await invoke("paid-valid-pack", ["domain", "pack", "run", "--pack", "clinical-trials", "--baseline", "--json"]);
    completed(baseline);
    expect(baseline.status, baseline.stderr).toBe(0);
    const body = JSON.parse(baseline.stdout) as Record<string, unknown>;
    expect(body).toMatchObject({ packId: "clinical-trials", claimKind: "self_reported", selfAssessment: { complete: false, answered: 0 } });
    expect(statusDimensionsSchema.parse(body.statusDimensions).result).toBe("not_evaluated");
    expect(body.claimLabel).toContain("Claim: Self-reported");
    expect(Array.isArray(body.questionResults)).toBe(true);
    expect((body.questionResults as unknown[]).length).toBeGreaterThan(0);
  })();
}

describe("Industry Pack CLI inherited-name refusal", () => {
  test("a locally signed paid fixture accepts a legitimate pack with current syntax", async () => {
    await validPaidControl();
  });

  test.each(["__proto__", "constructor", "toString", "hasOwnProperty"])("refuses inherited pack ID %s after valid paid control", async (packId) => {
    await validPaidControl();
    const result = await invoke(`refused-${packId}`, ["domain", "pack", "run", "--pack", packId, "--baseline", "--json"]);
    completed(result);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(`Pack not found: ${packId}`);
    expect(result.stdout + result.stderr).not.toMatch(/industry_packs_locked|Industry Packs are locked|requires active/i);
    expect(result.stdout).not.toContain('"packId"');
    expect(result.stdout).not.toContain('"claimKind"');
  });
});
