/**
 * P2-01 doctor live probes: the native POST (src/doctor/doctorLiveProbe.ts requestDoctorStatus) and the pre-lease
 * admission plus two sequential carrier probes in src/doctor/doctorRules.ts runDoctorRules --live-probes.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requestDoctorStatus } from "../../src/doctor/doctorLiveProbe.js";
import { runDoctorRules } from "../../src/doctor/doctorRules.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

const studio = vi.hoisted(() => ({ gatewayPort: 0 }));
vi.mock("../../src/studio/studioSupervisor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/studio/studioSupervisor.js")>(),
  studioStatus: () => ({ running: true, vaultUnlocked: true, state: { host: "127.0.0.1", apiPort: 1, gatewayPort: studio.gatewayPort } })
}));

vi.setConfig({ testTimeout: 60_000 });
let blocked: string, open: string, gateway: Listener;
beforeEach(async () => {
  const root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  gateway = await listen((_req, res) => { res.writeHead(200).end("{}"); });
  studio.gatewayPort = Number(new URL(gateway.url).port);
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

const probe = (url: string, workspace?: string) => requestDoctorStatus(`${url}/openai/v1/chat/completions`, { "x-amc-agent-id": "default" }, "{}", 5_000, workspace);
const carrierRows = (checks: Array<{ id: string; status: string }>) => checks.filter(row => row.id.startsWith("lease-carrier")).map(row => [row.id, row.status]);

describe("doctor live probes", () => {
  test("a denied probe rejects typed before any socket; doctor reports a residency FAIL and sends nothing", async () => {
    await expect(probe(gateway.url, blocked)).rejects.toBeInstanceOf(EgressBlocked);
    await expect(withWorkspaceScope(blocked, () => probe(gateway.url))).rejects.toBeInstanceOf(EgressBlocked);
    const report = await runDoctorRules(blocked, { liveProbes: true });
    expect(carrierRows(report.checks)).toEqual([["lease-carriers-live", "FAIL"]]);
    expect(report.checks.find(row => row.id === "lease-carriers-live")?.message).toMatch(/blocked by residency/);
    expect(gateway.connections).toBe(0);
  });

  test("the doctor workspace holds across both probes: blocked after the first, the second is refused; explicit scope beats ambient", async () => {
    const flipping = await listen((_req, res) => { blockResidency(open); res.writeHead(200).end("{}"); });
    studio.gatewayPort = Number(new URL(flipping.url).port);
    const report = await runDoctorRules(open, { liveProbes: true });
    expect(carrierRows(report.checks)).toEqual([["lease-carrier-authorization", "PASS"], ["lease-carriers-live", "FAIL"]]);
    expect(flipping.requests).toHaveLength(1);
    // An open ambient scope does not widen an explicitly blocked probe.
    await expect(withWorkspaceScope(newWorkspace(tempRoot(), "ambient"), () => probe(gateway.url, blocked))).rejects.toBeInstanceOf(EgressBlocked);
    expect(gateway.connections).toBe(0);
  });

  test("a 3xx is a non-2xx outcome, never followed", async () => {
    const redirector = await redirectTo(gateway);
    expect(await probe(redirector.url, open)).toEqual({ status: 302, failure: null });
    expect(gateway.connections).toBe(0);
  });
});
