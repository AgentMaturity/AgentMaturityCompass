import Database from "better-sqlite3";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { generateTrustCertificate, verifyTrustCertificateEnvelope } from "../src/cert/trustCertificate.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
const previousVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-trust-cert-test-"));
  roots.push(root);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}

function writeRun(workspace: string, agentId: string, runId: string, ts: number, integrityIndex: number): void {
  const dir = join(workspace, ".amc", "agents", agentId, "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${runId}.json`),
    `${JSON.stringify({ runId, ts, integrityIndex }, null, 2)}\n`
  );
}

function writeEvidenceChain(workspace: string, hashes: Array<{ prev: string; hash: string }>): void {
  const dbPath = join(workspace, ".amc", "evidence.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE evidence_events (prev_event_hash TEXT NOT NULL, event_hash TEXT NOT NULL)");
    const stmt = db.prepare("INSERT INTO evidence_events (prev_event_hash, event_hash) VALUES (?, ?)");
    for (const row of hashes) {
      stmt.run(row.prev, row.hash);
    }
  } finally {
    db.close();
  }
}

beforeEach(() => {
  process.env.AMC_VAULT_PASSPHRASE = "trust-cert-test-passphrase";
});

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (previousVaultPassphrase !== undefined) {
    process.env.AMC_VAULT_PASSPHRASE = previousVaultPassphrase;
  } else {
    delete process.env.AMC_VAULT_PASSPHRASE;
  }
});

describe("generateTrustCertificate", () => {
  test("generates a signed JSON trust certificate with required fields", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-x", "run-1", 1000, 0.82);
    writeEvidenceChain(workspace, [
      { prev: "GENESIS", hash: "h1" },
      { prev: "h1", hash: "h2" }
    ]);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "out/trust.json",
      validityDays: 45,
      nowTs: 1700000000000
    });

    expect(out.format).toBe("json");
    expect(out.signatureStatus).toBe("SIGNED");
    expect(out.envelope.signatureStatus).toBe("SIGNED");
    expect(existsSync(out.outputPath)).toBe(true);
    expect(out.envelope.payload.agentId).toBe("agent-x");
    expect(out.envelope.payload.score).toBe(82);
    expect(out.envelope.payload.evidenceHashChain.eventCount).toBe(2);
    expect(out.envelope.payload.validity.daysValid).toBe(45);
    expect(verifyTrustCertificateEnvelope(out.envelope).ok).toBe(true);
  });

  test("detects tampering when payload is modified", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-x", "run-1", 1000, 0.7);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "tamper.json",
      nowTs: 1700000000000
    });

    const tampered = {
      ...out.envelope,
      payload: {
        ...out.envelope.payload,
        score: out.envelope.payload.score + 5
      }
    };

    const verified = verifyTrustCertificateEnvelope(tampered);
    expect(verified.ok).toBe(false);
    expect(verified.errors.some((error) => error.includes("payloadSha256"))).toBe(true);
  });

  test("generates an unsigned preview without vault signing and verifier rejects it", () => {
    const workspace = newWorkspace();
    delete process.env.AMC_VAULT_PASSPHRASE;
    writeRun(workspace, "agent-x", "run-1", 1000, 0.73);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "preview.json",
      nowTs: 1700000000000,
      preview: true
    });

    expect(out.format).toBe("json");
    expect(out.signatureStatus).toBe("UNSIGNED_PREVIEW");
    expect(out.envelope.signatureAlgorithm).toBe("unsigned-preview");
    expect(out.envelope.signature).toBe("UNSIGNED_PREVIEW");
    expect(out.envelope.claimBoundary).toContain("not verifier-ready evidence");
    expect(out.envelope.payload.signingKey.kind).toBe("preview");
    expect(out.envelope.payload.score).toBe(73);

    const verified = verifyTrustCertificateEnvelope(out.envelope);
    expect(verified.ok).toBe(false);
    expect(verified.errors.some((error) => error.includes("unsigned preview certificate"))).toBe(true);
  });

  test("writes PDF certificate and machine-verifiable JSON sidecar", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-x", "run-1", 1000, 0.66);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "certs/trust.pdf",
      nowTs: 1700000000000
    });

    expect(out.format).toBe("pdf");
    expect(existsSync(out.outputPath)).toBe(true);
    expect(out.sidecarJsonPath).toBeDefined();
    expect(out.sidecarJsonPath && existsSync(out.sidecarJsonPath)).toBe(true);

    const pdfHeader = readFileSync(out.outputPath).toString("utf8", 0, 8);
    expect(pdfHeader.startsWith("%PDF-1.4")).toBe(true);

    const sidecarRaw = readFileSync(out.sidecarJsonPath!, "utf8");
    const sidecar = JSON.parse(sidecarRaw) as { payload: { certificateId: string } };
    expect(sidecar.payload.certificateId).toBe(out.envelope.payload.certificateId);
  });

  test("uses empty evidence chain defaults when evidence DB is absent", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-x", "run-1", 1000, 0.5);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "no-evidence.json",
      nowTs: 1700000000000
    });

    expect(out.envelope.payload.evidenceHashChain.eventCount).toBe(0);
    expect(out.envelope.payload.evidenceHashChain.genesisHash).toBe("GENESIS");
    expect(out.envelope.payload.evidenceHashChain.headHash).toBe("GENESIS");
  });

  test("stores signing key fingerprint derived from signing public key", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-x", "run-1", 1000, 0.5);

    const out = generateTrustCertificate({
      workspace,
      agentId: "agent-x",
      outputPath: "fingerprint.json",
      nowTs: 1700000000000
    });

    const expected = sha256Hex(Buffer.from(out.envelope.payload.signingKey.publicKeyPem, "utf8"));
    expect(out.envelope.payload.signingKey.fingerprint).toBe(expected);
  });
});
