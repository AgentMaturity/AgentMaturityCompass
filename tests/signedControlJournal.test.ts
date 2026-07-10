import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import {
  appendSignedControlJournal,
  readSignedControlJournal,
  signedControlPendingPath,
  signedControlTrustPinPath
} from "../src/lifecycle/signedControlJournal.js";
import { createVault } from "../src/vault/vault.js";

const roots: string[] = [];
const originalCheckpointDir = process.env.AMC_CONTROL_CHECKPOINT_DIR;
const checkpointRoot = mkdtempSync(join(tmpdir(), "amc-control-journal-checkpoints-"));
process.env.AMC_CONTROL_CHECKPOINT_DIR = checkpointRoot;

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-control-journal-"));
  roots.push(root);
  return root;
}

function parsePayload(value: unknown): { value: string } {
  if (!value || typeof value !== "object" || typeof (value as { value?: unknown }).value !== "string") {
    throw new Error("value is required");
  }
  return { value: (value as { value: string }).value };
}

function signingPair(): { privateKeyPem: string; publicKeyPem: string } {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString()
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

afterAll(() => {
  rmSync(checkpointRoot, { recursive: true, force: true });
  if (originalCheckpointDir === undefined) delete process.env.AMC_CONTROL_CHECKPOINT_DIR;
  else process.env.AMC_CONTROL_CHECKPOINT_DIR = originalCheckpointDir;
});

describe("signed control journal", () => {
  test("rejects a checkpoint root inside the governed workspace", () => {
    const ws = workspace();
    const prior = process.env.AMC_CONTROL_CHECKPOINT_DIR;
    process.env.AMC_CONTROL_CHECKPOINT_DIR = join(ws, ".amc", "checkpoints");
    try {
      expect(() => readSignedControlJournal({
        workspace: ws,
        controlKind: "guardrail-control",
        journalDir: join(ws, ".amc", "journal"),
        parsePayload
      })).toThrow(/outside the governed workspace/i);
    } finally {
      process.env.AMC_CONTROL_CHECKPOINT_DIR = prior;
    }
  });

  test("rejects a checkpoint root symlinked into the governed workspace", () => {
    const ws = workspace();
    const target = join(ws, ".amc", "checkpoint-target");
    const link = mkdtempSync(join(tmpdir(), "amc-checkpoint-link-parent-"));
    const linkedRoot = join(link, "checkpoints");
    mkdirSync(target, { recursive: true });
    symlinkSync(target, linkedRoot, "dir");
    const prior = process.env.AMC_CONTROL_CHECKPOINT_DIR;
    process.env.AMC_CONTROL_CHECKPOINT_DIR = linkedRoot;
    try {
      expect(() => readSignedControlJournal({
        workspace: ws,
        controlKind: "guardrail-control",
        journalDir: join(ws, ".amc", "journal"),
        parsePayload
      })).toThrow(/outside the governed workspace/i);
    } finally {
      process.env.AMC_CONTROL_CHECKPOINT_DIR = prior;
      rmSync(link, { recursive: true, force: true });
    }
  });

  test("recovers only the authenticated pending revision before accepting another mutation", () => {
    const ws = workspace();
    const journalDir = join(ws, ".amc", "test-control-journal");
    const initial = readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    });
    const first = appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: initial,
      payload: { value: "first" }
    });
    expect(first.revision).toBe(1);
    expect(first.checkpointPath?.startsWith(ws)).toBe(false);
    expect(existsSync(signedControlTrustPinPath(ws, "guardrail-control"))).toBe(true);

    expect(() => appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: first,
      payload: { value: "uncommitted" },
      beforeCheckpointCommit: () => {
        throw new Error("simulated checkpoint signer failure");
      }
    })).toThrow("simulated checkpoint signer failure");

    expect(() => readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    })).toThrow(/pending authenticated recovery/i);

    const afterFailure = readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload,
      recoverPendingPublication: true
    });
    expect(afterFailure.revision).toBe(2);
    expect(afterFailure.payload).toEqual({ value: "uncommitted" });
    expect(existsSync(signedControlPendingPath(ws, "guardrail-control"))).toBe(false);

    const recovered = appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: afterFailure,
      payload: { value: "second" }
    });
    expect(recovered.revision).toBe(3);
    expect(readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    }).payload).toEqual({ value: "second" });
  });

  test("fails closed when the latest checkpoint is deleted but its local revision remains", () => {
    const ws = workspace();
    const journalDir = join(ws, ".amc", "test-control-journal");
    const initial = readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    });
    const first = appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: initial,
      payload: { value: "first" }
    });
    const second = appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: first,
      payload: { value: "second" }
    });

    unlinkSync(second.checkpointPath!);
    expect(() => readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    })).toThrow(/uncommitted journal revision 2/i);
    expect(() => readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload,
      recoverPendingPublication: true
    })).toThrow(/uncommitted journal revision 2/i);
    expect(() => appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: first,
      payload: { value: "replacement" }
    })).toThrow(/journal revision 2 already exists/i);
  });

  test("recovers genesis publication before and after the external signer pin", () => {
    const beforePinWs = workspace();
    const beforePinJournal = join(beforePinWs, ".amc", "test-control-journal");
    const beforePinInitial = readSignedControlJournal({
      workspace: beforePinWs,
      controlKind: "guardrail-control",
      journalDir: beforePinJournal,
      parsePayload
    });
    expect(() => appendSignedControlJournal({
      workspace: beforePinWs,
      controlKind: "guardrail-control",
      journalDir: beforePinJournal,
      previous: beforePinInitial,
      payload: { value: "before-pin" },
      beforeCheckpointCommit: () => {
        throw new Error("simulated crash before genesis pin");
      }
    })).toThrow("simulated crash before genesis pin");
    expect(existsSync(signedControlTrustPinPath(beforePinWs, "guardrail-control"))).toBe(false);
    expect(readSignedControlJournal({
      workspace: beforePinWs,
      controlKind: "guardrail-control",
      journalDir: beforePinJournal,
      parsePayload,
      recoverPendingPublication: true
    })).toMatchObject({ integrity: "trusted", revision: 1, payload: { value: "before-pin" } });

    const afterPinWs = workspace();
    const afterPinJournal = join(afterPinWs, ".amc", "test-control-journal");
    const afterPinInitial = readSignedControlJournal({
      workspace: afterPinWs,
      controlKind: "guardrail-control",
      journalDir: afterPinJournal,
      parsePayload
    });
    expect(() => appendSignedControlJournal({
      workspace: afterPinWs,
      controlKind: "guardrail-control",
      journalDir: afterPinJournal,
      previous: afterPinInitial,
      payload: { value: "after-pin" },
      afterTrustPinCommit: () => {
        throw new Error("simulated crash after genesis pin");
      }
    })).toThrow("simulated crash after genesis pin");
    expect(existsSync(signedControlTrustPinPath(afterPinWs, "guardrail-control"))).toBe(true);
    expect(readSignedControlJournal({
      workspace: afterPinWs,
      controlKind: "guardrail-control",
      journalDir: afterPinJournal,
      parsePayload,
      recoverPendingPublication: true
    })).toMatchObject({ integrity: "trusted", revision: 1, payload: { value: "after-pin" } });
  });

  test("discards a signed pending plan when no local revision was published", () => {
    const ws = workspace();
    const journalDir = join(ws, ".amc", "test-control-journal");
    const initial = readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    });
    expect(() => appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: initial,
      payload: { value: "never-published" },
      afterPendingCommit: () => {
        throw new Error("simulated crash before local publication");
      }
    })).toThrow("simulated crash before local publication");
    expect(existsSync(signedControlPendingPath(ws, "guardrail-control"))).toBe(true);
    expect(readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload,
      recoverPendingPublication: true
    })).toMatchObject({ integrity: "uninitialized", revision: 0, payload: null });
    expect(existsSync(signedControlPendingPath(ws, "guardrail-control"))).toBe(false);
  });

  test("pins checkpoint signer trust outside workspace key history", () => {
    const ws = workspace();
    const journalDir = join(ws, ".amc", "test-control-journal");
    const first = appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: readSignedControlJournal({
        workspace: ws,
        controlKind: "guardrail-control",
        journalDir,
        parsePayload
      }),
      payload: { value: "first" }
    });
    const trustPin = JSON.parse(readFileSync(signedControlTrustPinPath(ws, "guardrail-control"), "utf8")) as {
      signerFingerprint?: string;
      genesisCheckpointSha256?: string;
    };
    expect(trustPin.signerFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(trustPin.genesisCheckpointSha256).toBe(first.checkpointSha256);

    rmSync(join(ws, ".amc", "keys"), { recursive: true, force: true });
    expect(readSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      parsePayload
    })).toMatchObject({ integrity: "trusted", revision: 1, payload: { value: "first" } });

    const monitor = signingPair();
    const auditor = signingPair();
    const lease = signingPair();
    const session = signingPair();
    createVault({
      workspace: ws,
      passphrase: "amc-test-passphrase",
      monitorPrivateKeyPem: monitor.privateKeyPem,
      auditorPrivateKeyPem: auditor.privateKeyPem,
      leasePrivateKeyPem: lease.privateKeyPem,
      sessionPrivateKeyPem: session.privateKeyPem,
      monitorPublicKeyPem: monitor.publicKeyPem,
      auditorPublicKeyPem: auditor.publicKeyPem,
      leasePublicKeyPem: lease.publicKeyPem,
      sessionPublicKeyPem: session.publicKeyPem
    });
    expect(() => appendSignedControlJournal({
      workspace: ws,
      controlKind: "guardrail-control",
      journalDir,
      previous: first,
      payload: { value: "unauthorized signer rotation" }
    })).toThrow(/pinned genesis signer/i);
  });
});
