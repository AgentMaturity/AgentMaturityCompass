import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { initWorkspace } from "../src/workspace.js";
import {
  evidenceServices,
  LEDGER_SEAM,
  CRYPTO_SEAM,
  RECEIPTS_SEAM,
  BLOBS_SEAM,
  type LedgerService,
  type CryptoService,
  type BlobsService
} from "../src/kernel/services/evidenceServices.js";

/**
 * P2.1: the evidence spine becomes injectable.
 *
 * The point of the wrap is not convenience — it is that a consumer declaring
 * `inject: ["amcLedger"]` stays PENDING when no ledger is provided, instead of
 * importing a module that is always present whether or not it should be. That
 * is what makes evidence capture replaceable, and what later phases attach to.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("evidence services on the composed tree", () => {
  const withWorkspace = async (fn: (workspace: string) => Promise<void>) => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-services-"));
    initWorkspace({ workspacePath: workspace, agentId: "default" });
    try {
      await fn(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  };

  it("gates a consumer until the evidence spine is provided", async () => {
    await withWorkspace(async (workspace) => {
      const ctx = new Context();
      const seen: string[] = [];
      ctx.plugin({
        name: "evidence-consumer",
        inject: [LEDGER_SEAM.name, CRYPTO_SEAM.name, RECEIPTS_SEAM.name, BLOBS_SEAM.name],
        apply: () => { seen.push("applied"); }
      });
      await settle();
      expect(seen, "a consumer must not run without the spine").toEqual([]);

      const fiber = ctx.plugin(evidenceServices, { workspace });
      await fiber.await();
      await settle();
      expect(seen).toEqual(["applied"]);
    });
  });

  it("appends and verifies real evidence through the services", async () => {
    await withWorkspace(async (workspace) => {
      const ctx = new Context();
      const fiber = ctx.plugin(evidenceServices, { workspace });
      await fiber.await();
      await settle();

      const ledger = (ctx as unknown as Record<string, LedgerService>)[LEDGER_SEAM.name]!;
      // An event whose session was never opened fails chain verification with
      // "references missing session", so the session comes first.
      ledger.startSession({
        sessionId: "session-1",
        runtime: "unknown",
        binaryPath: "/usr/bin/true",
        binarySha256: "0".repeat(64)
      });
      const appended = ledger.append({
        sessionId: "session-1",
        runtime: "unknown",
        eventType: "tool_action",
        payload: "hello",
        inline: true
      });
      expect(appended.id).toBeTruthy();

      // An unsealed session also fails the chain check, so the full lifecycle
      // is start → append → seal before evidence verifies.
      ledger.sealSession("session-1");

      const verdict = await ledger.verify();
      expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    });
  });

  it("signs and verifies through the crypto service", async () => {
    await withWorkspace(async (workspace) => {
      const ctx = new Context();
      const fiber = ctx.plugin(evidenceServices, { workspace });
      await fiber.await();
      await settle();

      const crypto = (ctx as unknown as Record<string, CryptoService>)[CRYPTO_SEAM.name]!;
      const digest = "a".repeat(64);
      expect(crypto.verify(digest, crypto.sign(digest))).toBe(true);
      // A signature over a different digest must not verify, or the check above
      // proves nothing.
      expect(crypto.verify("b".repeat(64), crypto.sign(digest))).toBe(false);
    });
  });

  it("round-trips a blob through the blobs service", async () => {
    await withWorkspace(async (workspace) => {
      const ctx = new Context();
      const fiber = ctx.plugin(evidenceServices, { workspace });
      await fiber.await();
      await settle();

      const blobs = (ctx as unknown as Record<string, BlobsService>)[BLOBS_SEAM.name]!;
      const secret = Buffer.from("payload held outside the ledger row", "utf8");
      const stored = blobs.store(secret);
      expect(blobs.load(stored.path).bytes.equals(secret)).toBe(true);
    });
  });

  it("releases the services when the fiber unloads", async () => {
    await withWorkspace(async (workspace) => {
      const ctx = new Context();
      const fiber = ctx.plugin(evidenceServices, { workspace });
      await fiber.await();
      await settle();
      expect((ctx as unknown as Record<string, unknown>)[LEDGER_SEAM.name]).toBeTruthy();

      // A service that cannot be withdrawn is a control that cannot be
      // replaced — the disposal contract the seam exists to enforce.
      await fiber.dispose();
      await settle();
      for (const seam of [LEDGER_SEAM, CRYPTO_SEAM, RECEIPTS_SEAM, BLOBS_SEAM]) {
        expect((ctx as unknown as Record<string, unknown>)[seam.name], `${seam.name} outlived its fiber`).toBeFalsy();
      }
    });
  });
});
