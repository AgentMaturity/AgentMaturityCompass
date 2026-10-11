import { createHash, generateKeyPairSync } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mintReceipt } from "../src/receipts/receipt.js";

const root = process.cwd();
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

type Mode = "governed" | "wrong-key" | "no-receipt" | "body-mismatch";

/** A stand-in for Studio + gateway: the same routes and the same receipt format. */
function startTarget(signer: string, mode: () => Mode): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "test", uptime: 1, dbStatus: "ok" }));
      return;
    }
    if (req.url === "/readyz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "READY", reasons: [] }));
      return;
    }
    if (req.url === "/openai/v1/chat/completions" && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${LEASE}`) {
        res.writeHead(401);
        res.end("lease required");
        return;
      }
      const body = JSON.stringify({ id: "chatcmpl-test", choices: [{ message: { content: "ok" } }] });
      const current = mode();
      const signedBody = current === "body-mismatch" ? `${body} ` : body;
      const { receipt } = mintReceipt({
        kind: "llm_response",
        ts: Date.now(),
        agentId: "default",
        providerId: "local_test",
        model: "gpt-test",
        eventHash: "e".repeat(64),
        bodySha256: createHash("sha256").update(signedBody).digest("hex"),
        sessionId: "session-test",
        privateKeyPem: current === "wrong-key" ? keyPair().privatePem : signer
      });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (current !== "no-receipt") headers["x-amc-receipt"] = receipt;
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

function runVerifier(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(process.execPath, [script, ...args], {
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
});
