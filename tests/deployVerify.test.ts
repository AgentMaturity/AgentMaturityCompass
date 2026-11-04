import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mintReceipt } from "../src/receipts/receipt.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = resolve(root, "scripts/deploy-verify.mjs");
const LEASE = "lease-sentinel-must-never-appear";

interface Check { name: string; status: string; detail: string }
interface VerifyResult {
  pass: boolean;
  target: string;
  verifierCommit: string;
  missingChecks: string[];
  checks: Check[];
  receipt: { receiptId: string } | null;
}

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString()
  };
}

type Mode = "governed" | "wrong-key" | "no-receipt" | "body-mismatch" | "reflected-lease" | "reflected-metadata" | "reflected-metadata-key";

/** A stand-in for Studio + gateway: the same routes and the same receipt format. */
function startTarget(signer: string, mode: () => Mode, lease = LEASE): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: mode() === "reflected-lease" ? LEASE : "test", uptime: 1, dbStatus: "ok" }));
      return;
    }
    if (req.url === "/readyz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mode() === "reflected-lease"
        ? { status: "NOT_READY", reasons: [LEASE] }
        : { status: "READY", reasons: [] }));
      return;
    }
    if (req.url === "/openai/v1/chat/completions" && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${lease}`) {
        res.writeHead(401);
        res.end("lease required");
        return;
      }
      const body = JSON.stringify({ id: "chatcmpl-test", choices: [{ message: { content: "ok" } }] });
      const current = mode();
      const signedBody = current === "body-mismatch" ? `${body} ` : body;
      const { payload, receipt } = mintReceipt({
        kind: "llm_response",
        ts: Date.now(),
        agentId: "default",
        providerId: "local_test",
        model: "gpt-test",
        eventHash: "e".repeat(64),
        bodySha256: createHash("sha256").update(signedBody).digest("hex"),
        sessionId: current === "reflected-metadata" ? LEASE : "session-test",
        privateKeyPem: current === "wrong-key" ? keyPair().privatePem : signer
      });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (current !== "no-receipt") headers["x-amc-receipt"] = receipt;
      if (current === "reflected-lease") {
        headers["x-amc-receipt"] = "invalid-receipt";
        headers["x-amc-monitor-pub-fpr"] = (req.headers.authorization ?? "").slice("Bearer ".length);
      }
      if (current === "reflected-metadata-key") {
        const reflected = {
          ...payload,
          receipt_id: { [lease]: "id" },
          session_id: [{ [lease]: "session" }],
          event_hash: { nested: { [lease]: "event" } }
        };
        const bytes = Buffer.from(JSON.stringify(reflected), "utf8");
        headers["x-amc-receipt"] = `${bytes.toString("base64url")}.${sign(null, bytes, signer).toString("base64url")}`;
      }
      res.writeHead(200, headers);
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      done({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

function runVerifier(args: string[], env: NodeJS.ProcessEnv = {}, entry = script): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(process.execPath, [entry, ...args], {
      cwd: root,
      env: { PATH: process.env.PATH, ...env },
      timeout: 30_000
    }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 99) : 0;
      done({ code, stdout, stderr });
    });
  });
}

function checkStatus(result: VerifyResult, name: string): string | undefined {
  return result.checks.find((check) => check.name === name)?.status;
}

describe("deploy-verify", () => {
  const keys = keyPair();
  let mode: Mode = "governed";
  let target: { server: Server; url: string };
  let dir: string;
  let pubkeyPath: string;

  beforeAll(async () => {
    target = await startTarget(keys.privatePem, () => mode);
    dir = mkdtempSync(join(tmpdir(), "amc-deploy-verify-"));
    pubkeyPath = join(dir, "monitor_ed25519.pub");
    writeFileSync(pubkeyPath, keys.publicPem);
  });

  afterAll(() => {
    target.server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function verify(extra: string[] = [], env: NodeJS.ProcessEnv = { AMC_DEPLOY_VERIFY_LEASE: LEASE }) {
    const out = join(dir, `result-${mode}-${Date.now()}.json`);
    const run = await runVerifier(["--target", target.url, "--monitor-pubkey", pubkeyPath, "--out", out, ...extra], env);
    const result = JSON.parse(readFileSync(out, "utf8")) as VerifyResult;
    return { ...run, result };
  }

  test("passes only when a governed turn returns a receipt signed by the pinned monitor key", async () => {
    mode = "governed";
    const { code, result, stdout, stderr } = await verify();
    expect(result.checks.map((check) => [check.name, check.status])).toEqual([
      ["health", "PASS"],
      ["readiness", "PASS"],
      ["governed-turn", "PASS"],
      ["receipt-signature", "PASS"],
      ["receipt-binding", "PASS"]
    ]);
    expect(result.pass).toBe(true);
    expect(code).toBe(0);
    expect(result.receipt?.receiptId).toBeTruthy();
    expect(`${stdout}${stderr}${JSON.stringify(result)}`).not.toContain(LEASE);
  });

  test("fails closed on a non-responding target and still writes the result", async () => {
    const out = join(dir, "unreachable.json");
    const { code, stdout } = await runVerifier(["--target", "http://127.0.0.1:1", "--out", out, "--timeout-ms", "2000"]);
    const result = JSON.parse(readFileSync(out, "utf8")) as VerifyResult;
    expect(code).not.toBe(0);
    expect(result.pass).toBe(false);
    expect(checkStatus(result, "health")).toBe("FAIL");
    expect(checkStatus(result, "governed-turn")).toBe("FAIL");
    expect(JSON.parse(stdout).pass).toBe(false);
  });

  test("fails closed when the receipt signature does not verify against the pinned key", async () => {
    mode = "wrong-key";
    const { code, result } = await verify();
    expect(checkStatus(result, "governed-turn")).toBe("PASS");
    expect(checkStatus(result, "receipt-signature")).toBe("FAIL");
    expect(checkStatus(result, "receipt-binding")).toBe("FAIL");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("fails closed when no monitor key is pinned, rather than trusting the target", async () => {
    mode = "governed";
    const out = join(dir, "no-key.json");
    const { code } = await runVerifier(["--target", target.url, "--out", out], { AMC_DEPLOY_VERIFY_LEASE: LEASE });
    const result = JSON.parse(readFileSync(out, "utf8")) as VerifyResult;
    expect(checkStatus(result, "receipt-signature")).toBe("FAIL");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("fails closed when the governed turn returns no receipt", async () => {
    mode = "no-receipt";
    const { code, result } = await verify();
    expect(checkStatus(result, "governed-turn")).toBe("FAIL");
    expect(checkStatus(result, "receipt-signature")).toBe("FAIL");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("fails closed when a validly signed receipt does not commit to the bytes received", async () => {
    mode = "body-mismatch";
    const { code, result } = await verify();
    expect(checkStatus(result, "receipt-signature")).toBe("PASS");
    expect(checkStatus(result, "receipt-binding")).toBe("FAIL");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("fails closed when no lease is supplied", async () => {
    mode = "governed";
    const { code, result } = await verify([], {});
    expect(checkStatus(result, "governed-turn")).toBe("FAIL");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("a missing required check fails the run even when every present check passed", async () => {
    const { evaluateChecks, REQUIRED_CHECKS } = await import("../scripts/deploy-verify.mjs") as {
      evaluateChecks(checks: Check[]): { pass: boolean; missingChecks: string[] };
      REQUIRED_CHECKS: string[];
    };
    const all = REQUIRED_CHECKS.map((name) => ({ name, status: "PASS", detail: "" }));
    expect(evaluateChecks(all)).toEqual({ pass: true, missingChecks: [] });
    const withoutSignature = all.filter((check) => check.name !== "receipt-signature");
    expect(evaluateChecks(withoutSignature)).toEqual({ pass: false, missingChecks: ["receipt-signature"] });
    expect(evaluateChecks([]).pass).toBe(false);
    const unknownStatus = all.map((check) => check.name === "health" ? { ...check, status: "SKIP" } : check);
    expect(evaluateChecks(unknownStatus).pass).toBe(false);
  });

  test("exits 2 on a usage error", async () => {
    const { code } = await runVerifier([]);
    expect(code).toBe(2);
  });

  test("redacts a loaded lease reflected by target version, readiness and an untrusted fingerprint header", async () => {
    mode = "reflected-lease";
    const { code, result, stdout, stderr } = await verify();
    expect(checkStatus(result, "health")).toBe("PASS");
    expect(checkStatus(result, "readiness")).toBe("FAIL");
    expect(checkStatus(result, "governed-turn")).toBe("PASS");
    expect(checkStatus(result, "receipt-signature")).toBe("FAIL");
    expect(checkStatus(result, "receipt-binding")).toBe("FAIL");
    expect(result).toMatchObject({ targetReportedVersion: "[REDACTED]" });
    expect(result.checks.find((check) => check.name === "readiness")?.detail).toContain("[REDACTED]");
    expect(result.pass).toBe(false);
    expect(code).toBe(1);
    expect(`${stdout}${stderr}${JSON.stringify(result)}`).not.toContain(LEASE);
  });

  test("redacts a loaded lease in signed receipt metadata after preserving the verified pass", async () => {
    mode = "reflected-metadata";
    const { code, result, stdout, stderr } = await verify();
    expect(result.checks.map((check) => check.status)).toEqual(["PASS", "PASS", "PASS", "PASS", "PASS"]);
    expect(result.receipt).toMatchObject({ sessionId: "[REDACTED]" });
    expect(result.pass).toBe(true);
    expect(code).toBe(0);
    expect(`${stdout}${stderr}${JSON.stringify(result)}`).not.toContain(LEASE);
  });

  test("rejects timeout text that is not a positive safe decimal integer and accepts an explicit normal timeout", async () => {
    for (const value of ["1.5", "100ms", "1e3", "-1", "0", "NaN", "9007199254740992", "+10000", " 10000"]) {
      const { code, stdout, stderr } = await runVerifier(["--target", target.url, "--timeout-ms", value]);
      expect(code, value).toBe(2);
      expect(stdout, value).toBe("");
      expect(stderr, value).toContain("--timeout-ms must be a positive integer");
    }
    mode = "governed";
    const { code, result } = await verify(["--timeout-ms", "10000"]);
    expect(code).toBe(0);
    expect(result.pass).toBe(true);
  });

  test("replaces signed non-scalar metadata without renaming fixed result keys", async () => {
    for (const lease of [LEASE, "pass"]) {
      const owned = await startTarget(keys.privatePem, () => "reflected-metadata-key", lease);
      try {
        const out = join(dir, `metadata-keys-${lease === LEASE ? "sentinel" : "short"}.json`);
        const { code, stdout, stderr } = await runVerifier(["--target", owned.url, "--monitor-pubkey", pubkeyPath, "--out", out], { AMC_DEPLOY_VERIFY_LEASE: lease });
        const result = JSON.parse(readFileSync(out, "utf8")) as VerifyResult;
        expect(code).toBe(0);
        expect(result.checks.map((check) => check.status)).toEqual(["PASS", "PASS", "PASS", "PASS", "PASS"]);
        expect(Object.prototype.hasOwnProperty.call(result, "pass")).toBe(true);
        expect(result.pass).toBe(true);
        expect(result.receipt).toMatchObject({
          receiptId: "[non-scalar receipt metadata]",
          sessionId: "[non-scalar receipt metadata]",
          eventHash: "[non-scalar receipt metadata]"
        });
        if (lease === LEASE) expect(`${stdout}${stderr}${JSON.stringify(result)}`).not.toContain(LEASE);
      } finally {
        await new Promise<void>((resolve, reject) => owned.server.close((error) => error ? reject(error) : resolve()));
      }
    }
  });

  test("runs the verifier through an owned symlink instead of silently skipping main", async () => {
    mode = "governed";
    const entry = join(dir, "deploy-verify-via-symlink.mjs");
    const out = join(dir, "symlink-result.json");
    symlinkSync(script, entry);
    const { code, stdout } = await runVerifier(["--target", target.url, "--monitor-pubkey", pubkeyPath, "--out", out], { AMC_DEPLOY_VERIFY_LEASE: LEASE }, entry);
    expect(code).toBe(0);
    expect(stdout.trim()).not.toBe("");
    const result = JSON.parse(readFileSync(out, "utf8")) as VerifyResult;
    expect(JSON.parse(stdout)).toEqual(result);
    expect(result.pass).toBe(true);
    expect(result.checks.map((check) => check.status)).toEqual(["PASS", "PASS", "PASS", "PASS", "PASS"]);
  });
});
