// Proposed destination: tests/keys/maintainerProviderFlow.test.ts. Root must build the proposed production files first.
// Real maintained script in an owned child. Loader injection is test-only; SDK/native resolution is denied before ambient credentials can run.
import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { signTrustList, verifySignedTrustList } from "../../src/trust/trustList.js";
import { signRootRotation, applyTrustRootRotation, type RootRotationStatement } from "../../src/trust/rootRotation.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const SCRIPT = resolve("scripts/trust-list.mjs"), FACTORY = resolve("dist/keys/purposeProviders.js"), AWS = resolve("dist/keys/providers/awsKms.js");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-maintainer-provider-")); roots.push(root);
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const key = join(root, "holder.key"), marker = join(root, "requests.jsonl"), blocked = join(root, "blocked-imports.txt");
  writeFileSync(key, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const fake = join(root, "fake-factory.mjs"), loader = join(root, "owned-loader.mjs");
  // This small AWS transport uses the production AWS adapter; all cryptography is Node's own sign implementation.
  writeFileSync(fake, `
import { createPublicKey, sign } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { awsKmsProvider } from ${JSON.stringify(pathToFileURL(AWS).href)};
const key = readFileSync(process.env.P208_HOLDER_KEY, "utf8"), publicKey = createPublicKey(key);
const record = value => appendFileSync(process.env.P208_REQUESTS, JSON.stringify(value) + "\\n");
export function loadKeyProvider(_workspace, id) {
  if (id !== "aws-kms") throw new Error("owned fixture only supplies aws-kms");
  record({ operation: "OWNED_FACTORY" });
  return awsKmsProvider(async (operation, input) => {
    record({ operation, keyId: input.KeyId, messageHex: input.Message ? Buffer.from(input.Message).toString("hex") : null, messageType: input.MessageType });
    if (operation === "GetPublicKey") return { KeyId: input.KeyId, PublicKey: publicKey.export({ format: "der", type: "spki" }), KeyUsage: "SIGN_VERIFY", KeySpec: "ECC_NIST_P256", SigningAlgorithms: ["ECDSA_SHA_256"] };
    if (operation === "DescribeKey") return { KeyMetadata: { KeyId: input.KeyId, KeyState: "Enabled", Origin: "AWS_KMS" } };
    if (operation === "Sign") {
      if (process.env.P208_WAITING) {
        writeFileSync(process.env.P208_WAITING, "waiting");
        const deadline = Date.now() + 5000;
        while (!existsSync(process.env.P208_RESUME)) { if (Date.now() > deadline) throw new Error("owned fixture timed out"); await setTimeout(5); }
      }
      return { Signature: sign("sha256", input.Message, key) };
    }
    throw new Error("unexpected owned AWS operation");
  });
}
`);
  writeFileSync(loader, `
import { appendFileSync } from "node:fs";
export async function resolve(specifier, context, nextResolve) {
  if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) {
    appendFileSync(process.env.P208_BLOCKED, specifier + "\\n");
    throw new Error("owned provider test forbids SDK/native imports");
  }
  if (context.parentURL === ${JSON.stringify(pathToFileURL(SCRIPT).href)}) {
    const result = await nextResolve(specifier, context);
    if (result.url === ${JSON.stringify(pathToFileURL(FACTORY).href)}) return { url: ${JSON.stringify(pathToFileURL(fake).href)}, shortCircuit: true };
    return result;
  }
  return nextResolve(specifier, context);
}
`);
  const env = { ...process.env, P208_HOLDER_KEY: key, P208_REQUESTS: marker, P208_BLOCKED: blocked };
  const prefix = ["--experimental-loader", loader, SCRIPT];
  const run = (...args: string[]) => spawnSync(process.execPath, [...prefix, ...args], { cwd: root, encoding: "utf8", timeout: 10_000, env });
  const requests = () => existsSync(marker) ? readFileSync(marker, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const providerArgs = ["--provider", "aws-kms", "--key-ref", "arn:aws:kms:eu-west-1:111122223333:key/owned-root", "--provider-key-id", signingKeyId(pem)!];
  const assertOwned = () => { expect(requests().some(row => row.operation === "OWNED_FACTORY")).toBe(true); expect(existsSync(blocked)).toBe(false); };
  return { root, pem, keyId: signingKeyId(pem)!, env, prefix, run, requests, providerArgs, assertOwned };
}
async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!existsSync(path)) { if (Date.now() > deadline) throw new Error("owned child did not reach its fake signer"); await new Promise(resolve => setTimeout(resolve, 10)); }
}

describe("maintainer script provider branches use owned runtime injection", () => {
  test("sign reaches the actual CLI provider branch and writes a valid P-256 v1 trust-list signature", () => {
    const f = fixture(), list = trustList([]), path = join(f.root, "list.json");
    writeFileSync(path, JSON.stringify({ list, signatures: [] }));
    const out = f.run("sign", "--list", path, ...f.providerArgs);
    expect(out.status, out.stderr).toBe(0); f.assertOwned();
    const signed = JSON.parse(readFileSync(path, "utf8"));
    expect(verifySignedTrustList(signed, { pinnedRootKeyIds: [f.keyId], now: new Date("2026-10-20T00:00:00.000Z") })).toEqual(list);
    expect(f.requests().find(row => row.operation === "Sign")).toMatchObject({ messageType: "RAW", messageHex: Buffer.from("AMC_TRUST_LIST_V1\0" + canonicalize(list)).toString("hex") });
  });

  test("root-sign reaches the actual CLI provider branch and contributes to independent 2-of-2 root apply", () => {
    const f = fixture(), b = testKey(), c = testKey(), d = testKey();
    const statement: RootRotationStatement = { type: "amc.root-rotation", version: 1, rootSetId: "owned-roots", sequence: 1, previousSha256: null,
      previousRoots: [f.keyId, b.keyId], previousThreshold: 2, newRoots: [c.keyId, d.keyId], newThreshold: 2,
      newRootPublicKeyPems: [c.publicKeyPem, d.publicKeyPem], allowDecrease: false, issuedAt: "2026-10-20T00:00:00.000Z" };
    const path = join(f.root, "rotation.json");
    writeFileSync(path, signRootRotation(statement, { current: [b.privateKeyPem], next: [c.privateKeyPem, d.privateKeyPem] }));
    const out = f.run("root-sign", "--statement", path, "--as", "current", ...f.providerArgs);
    expect(out.status, out.stderr).toBe(0); f.assertOwned();
    const home = join(f.root, "home"); mkdirSync(join(home, "trust"), { recursive: true });
    writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, rootSetId: "owned-roots", roots: statement.previousRoots, threshold: 2 }));
    expect(applyTrustRootRotation({ amcHome: home, statement: readFileSync(path), currentRootPublicKeyPems: [f.pem, b.publicKeyPem] })).toMatchObject({ roots: statement.newRoots, threshold: 2 });
    expect(f.requests().find(row => row.operation === "Sign")?.messageHex).toBe(Buffer.from("amc.root-rotation/v1\0" + canonicalize(statement)).toString("hex"));
  });

  test("the actual CLI rejects an independently pinned id mismatch before Sign and preserves the file", () => {
    const f = fixture(), path = join(f.root, "list.json"), original = JSON.stringify({ list: trustList([]), signatures: [] }); writeFileSync(path, original);
    const args = [...f.providerArgs]; args[args.length - 1] = "0".repeat(64);
    const out = f.run("sign", "--list", path, ...args);
    expect(out.status).toBe(1); expect(out.stderr).toContain("pinned key and ref"); f.assertOwned();
    expect(f.requests().some(row => row.operation === "Sign")).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  test("a trust-file change during the fake provider wait survives; the actual CLI refuses stale publication", async () => {
    const f = fixture(), path = join(f.root, "list.json"), list = trustList([]), waiting = join(f.root, "waiting"), resume = join(f.root, "resume");
    writeFileSync(path, JSON.stringify({ list, signatures: [] }));
    const child = spawn(process.execPath, [...f.prefix, "sign", "--list", path, ...f.providerArgs], { cwd: f.root,
      env: { ...f.env, P208_WAITING: waiting, P208_RESUME: resume }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", chunk => { stderr += String(chunk); });
    const done = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    try {
      await waitForFile(waiting);
      const competingRoot = testKey(), changed = JSON.stringify(signTrustList({ ...list, sequence: 2 }, competingRoot.privateKeyPem));
      writeFileSync(path, changed); writeFileSync(resume, "resume");
      expect(await done).toBe(1); expect(stderr).toContain("changed while signing or editing"); f.assertOwned();
      expect(readFileSync(path, "utf8")).toBe(changed);
    } finally { child.kill("SIGTERM"); }
  }, 15_000);

  test("the actual maintainer sign flow automatically selects explicit v2 for a new oversized AWS envelope", () => {
    const f = fixture(), list = trustList([listEntry(testKey(), { subject: "x".repeat(5000) })]), path = join(f.root, "large-list.json");
    writeFileSync(path, JSON.stringify({ list, signatures: [] }));
    const out = f.run("sign", "--list", path, ...f.providerArgs);
    expect(out.status, out.stderr).toBe(0); f.assertOwned();
    const signed = JSON.parse(readFileSync(path, "utf8"));
    expect(signed.signatureVersion).toBe(2);
    expect(verifySignedTrustList(signed, { pinnedRootKeyIds: [f.keyId], now: new Date("2026-10-20T00:00:00.000Z") })).toEqual(list);
    const legacy = Buffer.from("AMC_TRUST_LIST_V1\0" + canonicalize(list)); expect(legacy.length).toBeGreaterThan(4096);
    const expected = Buffer.concat([Buffer.from("AMC_TRUST_LIST_V2_DIGEST\0"), createHash("sha256").update(legacy).digest()]);
    expect(f.requests().find(row => row.operation === "Sign")).toMatchObject({ messageType: "RAW", messageHex: expected.toString("hex") });
  });

  test("the maintainer flow never mixes old v1 rows with v2, then co-signs a deliberately selected v2 envelope", () => {
    const f = fixture(), external = testKey(), list = trustList([listEntry(testKey(), { subject: "x".repeat(5000) })], { rootThreshold: 2 });
    const path = join(f.root, "co-signed.json"), privatePath = join(f.root, "external.key"); writeFileSync(privatePath, external.privateKeyPem, { mode: 0o600 });
    const original = JSON.stringify(signTrustList(list, external.privateKeyPem)); writeFileSync(path, original);
    const mixed = f.run("sign", "--list", path, ...f.providerArgs);
    expect(mixed.status).toBe(1); expect(mixed.stderr).toContain("existing v1 signatures cannot be mixed with v2");
    expect(readFileSync(path, "utf8")).toBe(original); expect(f.requests().some(row => row.operation === "Sign")).toBe(false);
    writeFileSync(path, JSON.stringify({ list, signatures: [] }));
    const first = f.run("sign", "--list", path, "--key", privatePath, "--digest-v2"); expect(first.status, first.stderr).toBe(0);
    const second = f.run("sign", "--list", path, ...f.providerArgs); expect(second.status, second.stderr).toBe(0); f.assertOwned();
    const signed = JSON.parse(readFileSync(path, "utf8")); expect(signed.signatureVersion).toBe(2); expect(signed.signatures).toHaveLength(2);
    expect(verifySignedTrustList(signed, { pinnedRootKeyIds: [f.keyId, external.keyId], threshold: 2, now: new Date("2026-10-20T00:00:00.000Z") })).toEqual(list);
  });

  test("root-rotate and provider root-sign preserve one explicit v2 mode for a valid oversized root set", () => {
    const f = fixture(), peer = testKey(), next = Array.from({ length: 64 }, () => testKey()), home = join(f.root, "root-home");
    mkdirSync(join(home, "trust"), { recursive: true });
    const rootsFile = join(home, "trust", "trust-roots.json"), path = join(f.root, "large-rotation.json"), peerKey = join(f.root, "peer.key");
    writeFileSync(rootsFile, JSON.stringify({ type: "amc.trust-roots", version: 1, rootSetId: "owned-large-roots", roots: [f.keyId, peer.keyId], threshold: 2 }));
    writeFileSync(peerKey, peer.privateKeyPem, { mode: 0o600 });
    const publicArgs: string[] = [], possessionArgs: string[] = [];
    next.forEach((key, index) => {
      const pub = join(f.root, `new-${index}.pub`); writeFileSync(pub, key.publicKeyPem); publicArgs.push("--new-pub", pub);
      if (index < 2) { const pem = join(f.root, `new-${index}.key`); writeFileSync(pem, key.privateKeyPem, { mode: 0o600 }); possessionArgs.push("--new-key", pem); }
    });
    const create = f.run("root-rotate", "--roots", rootsFile, ...publicArgs, "--new-threshold", "2", "--current-key", peerKey,
      ...possessionArgs, "--out", path, "--digest-v2"); expect(create.status, create.stderr).toBe(0);
    const signed = f.run("root-sign", "--statement", path, "--as", "current", ...f.providerArgs); expect(signed.status, signed.stderr).toBe(0); f.assertOwned();
    const envelope = JSON.parse(readFileSync(path, "utf8")); expect(envelope.signatureVersion).toBe(2);
    const legacy = Buffer.from("amc.root-rotation/v1\0" + canonicalize(envelope.statement)); expect(legacy.length).toBeGreaterThan(4096);
    const expected = Buffer.concat([Buffer.from("amc.root-rotation/v2-digest\0"), createHash("sha256").update(legacy).digest()]);
    expect(f.requests().find(row => row.operation === "Sign")?.messageHex).toBe(expected.toString("hex"));
    expect(applyTrustRootRotation({ amcHome: home, statement: readFileSync(path), currentRootPublicKeyPems: [f.pem, peer.publicKeyPem] }))
      .toMatchObject({ roots: next.map(key => key.keyId), threshold: 2 });
  });

  test("actual add and distrust commands refuse an unsupported envelope mode without changing its bytes", () => {
    const f = fixture(), list = trustList([]), path = join(f.root, "unknown-mode.json"), publicPath = join(f.root, "holder.pub");
    writeFileSync(publicPath, f.pem);
    const original = JSON.stringify({ list, signatures: [], signatureVersion: 3 });
    for (const args of [["add", "--list", path, "--pubkey", publicPath, "--purpose", "artifact-seal", "--subject", "owned"],
      ["distrust", "--list", path, "--key-id", f.keyId, "--reason", "key-compromise", "--note", "owned"]]) {
      writeFileSync(path, original);
      const out = f.run(...args);
      expect(out.status, out.stderr).toBe(1);
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(f.requests().some(row => row.operation === "Sign")).toBe(false);
    }
  });
});
