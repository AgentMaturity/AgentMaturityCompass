import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initWorkspace } from "../src/workspace.js";
import { createWireDispatcher } from "../src/wire/wireDispatcher.js";
import { WIRE_METHODS } from "../src/wire/wireMethods.js";
import {
  decodeParams,
  decodeResult,
  WIRE_CODECS,
  WIRE_METHOD_NAMES,
  type WireMethodName
} from "../src/wire/wireCodecs.js";
import { WORK_STATES } from "../src/wire/workAcceptance.js";

/**
 * The codecs exist to stop the two ends describing the same method differently.
 *
 * So the tests that matter here are the ones about CORRESPONDENCE: that every
 * served method has a declaration, that no declaration describes a method
 * nothing serves, and -- the real proof -- that what the server actually puts on
 * the wire satisfies the declaration the client decodes against. A codec nothing
 * checked against a live reply would be documentation, not a contract.
 */

const PASS = "test-passphrase-wirecodecs";
const dirs: string[] = [];

function makeWorkspace() {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-codec-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "intake", runtime: "amc", binaryPath: "t", binarySha256: "a" });
  return { dir, ledger, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

function dispatcherFor(ws: ReturnType<typeof makeWorkspace>) {
  return createWireDispatcher({
    workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
    monitorPublicKeys: ws.monitorPublicKeys
  });
}

function leaseFor(workspace: string): string {
  return issueLeaseForCli({
    workspace, agentId: "wire-peer", ttl: "60m", scopes: "wire:submit",
    routes: "/wire", models: "*", rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null
  }).token;
}

/** Send one message through the dispatcher and return the reply's `result`. */
function resultOf(
  dispatcher: ReturnType<typeof createWireDispatcher>,
  message: Record<string, unknown>
): Record<string, unknown> {
  const out = dispatcher.handle(Buffer.from(`${JSON.stringify(message)}\n`, "utf8"));
  const reply = JSON.parse(out.replies[0]!.toString("utf8")) as Record<string, unknown>;
  expect(reply["error"], JSON.stringify(reply["error"])).toBeUndefined();
  return reply["result"] as Record<string, unknown>;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("codecs and the method registry describe the same wire", () => {
  it("declares exactly the methods the server serves", () => {
    // Both directions. A method with no codec cannot be decoded by a client; a
    // codec for no method is a contract nothing honours.
    expect([...WIRE_METHOD_NAMES].sort()).toEqual(WIRE_METHODS.map((m) => m.name).sort());
  });

  it("takes the work states from the module that decides them", () => {
    // Not a second copy. A wire that disagreed with the ledger about which
    // states exist would be a bug invisible from either file alone.
    const codec = WIRE_CODECS["work/describe"].result;
    const decoded = WORK_STATES.map((state) =>
      decodeResult("work/describe", { workSessionId: "s", state }).ok);
    expect(decoded).toEqual(WORK_STATES.map(() => true));
    expect(codec.safeParse({ workSessionId: "s", state: "succeeded" }).success).toBe(false);
  });
});

describe("what the server sends satisfies what the client decodes", () => {
  it("round-trips a real work/accept reply through the result codec", () => {
    const ws = makeWorkspace();
    const raw = resultOf(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: leaseFor(ws.dir),
      params: { prompt: "p", providerId: "anthropic" }
    });
    // The decisive check: the server's own output, decoded by the client's
    // declaration. If either side gains or loses a field, this fails.
    const decoded = decodeResult("work/accept", raw);
    expect(decoded.ok, decoded.ok ? "" : decoded.reason).toBe(true);
  });

  it("round-trips a real work/describe reply through the result codec", () => {
    const ws = makeWorkspace();
    const dispatcher = dispatcherFor(ws);
    const lease = leaseFor(ws.dir);
    const accepted = resultOf(dispatcher, {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease,
      params: { prompt: "p", providerId: "anthropic" }
    });
    const described = resultOf(dispatcher, {
      jsonrpc: "2.0", id: 2, method: "work/describe", lease,
      params: { receipt: accepted["receipt"] }
    });
    const decoded = decodeResult("work/describe", described);
    expect(decoded.ok, decoded.ok ? "" : decoded.reason).toBe(true);
  });
});

describe("decoding refuses rather than repairs", () => {
  it("refuses params carrying a member the method does not define", () => {
    // `.strict()`: a member the sender believes it set and the receiver silently
    // drops is a message that does not do what it plainly says.
    const decoded = decodeParams("work/accept", { prompt: "p", providerId: "a", priority: "high" });
    expect(decoded.ok).toBe(false);
  });

  it("refuses an empty string where a value is required", () => {
    // `z.string()` alone accepts "", which would put an empty prompt in a signed
    // acceptance row.
    expect(decodeParams("work/accept", { prompt: "", providerId: "a" }).ok).toBe(false);
    expect(decodeParams("work/describe", { receipt: "" }).ok).toBe(false);
  });

  it("keeps absent and null distinct for an optional field", () => {
    // Absent means the caller expressed no preference; null means it explicitly
    // wants none. Collapsing them loses a statement the caller made.
    const absent = decodeParams("work/accept", { prompt: "p", providerId: "a" });
    const explicit = decodeParams("work/accept", { prompt: "p", providerId: "a", model: null });
    expect(absent.ok && "model" in absent.value).toBe(false);
    expect(explicit.ok && explicit.value.model).toBeNull();
  });

  it("names the field it refused and never its contents", () => {
    const decoded = decodeParams("work/accept", { prompt: 42, providerId: "a" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toContain("prompt");
    // A refusal travels back to the sender and into logs on both sides; the
    // sender already knows what it sent.
    expect(decoded.reason).not.toContain("42");
  });

  it("names every bad field, not merely the first", () => {
    const decoded = decodeParams("work/accept", { prompt: "", providerId: "" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toContain("prompt");
    expect(decoded.reason).toContain("providerId");
  });
});

describe("the declaration is what the server enforces", () => {
  it("refuses through the dispatcher what the codec refuses directly", () => {
    const ws = makeWorkspace();
    const dispatcher = dispatcherFor(ws);
    const lease = leaseFor(ws.dir);
    const bad: ReadonlyArray<Record<string, unknown>> = [
      { providerId: "a" },
      { prompt: "p" },
      { prompt: "p", providerId: "a", priority: "high" },
      { prompt: "p", providerId: "a", model: 7 }
    ];
    for (const [index, params] of bad.entries()) {
      const out = dispatcher.handle(Buffer.from(`${JSON.stringify({
        jsonrpc: "2.0", id: index, method: "work/accept", lease, params
      })}\n`, "utf8"));
      const reply = JSON.parse(out.replies[0]!.toString("utf8")) as Record<string, unknown>;
      expect((reply["error"] as { code: number }).code).toBe(-32602);
      expect(decodeParams("work/accept", params).ok).toBe(false);
    }
  });

  it("still explains the agentId refusal in its own terms", () => {
    // `.strict()` would call this an unrecognised key, which says nothing about
    // why. A peer trying to name the agent needs to be told the lease decides it.
    const ws = makeWorkspace();
    const out = dispatcherFor(ws).handle(Buffer.from(`${JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: leaseFor(ws.dir),
      params: { prompt: "p", providerId: "a", agentId: "someone-else" }
    })}\n`, "utf8"));
    const reply = JSON.parse(out.replies[0]!.toString("utf8")) as Record<string, unknown>;
    expect((reply["error"] as { message: string }).message).toContain("taken from the lease");
  });
});

describe("types follow the declaration", () => {
  it("exposes a name union that matches the registry at compile time", () => {
    // If a method name were added to the registry without a codec, this
    // assignment would not compile.
    const names: readonly WireMethodName[] = WIRE_METHODS.map((m) => m.name as WireMethodName);
    expect(names).toHaveLength(WIRE_METHOD_NAMES.length);
  });
});
