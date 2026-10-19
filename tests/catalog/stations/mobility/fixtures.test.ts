import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../../../../src/utils/json.js";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { runReleaseCheck } from "./releaseCheck.js";
import { runScreeningLog } from "./screeningLog.js";
import { runPortAccess } from "./portAccess.js";
import { runChangeGate } from "./changeGate.js";
import { runOtaDeployer } from "./otaDeployer.js";
import { runMobilityOracle, type FixtureCryptoMode } from "./harness.js";
import { runVehicleSimulator } from "./vehicleSimulator.js";
import { changeSchema, fallbackSchema, otaSchema, portSchema, screeningSchema, utcTime } from "./protocol.js";

type Kind = "release_check" | "screening_log" | "port_access" | "change_gate" | "ota_deployer" | "vehicle_simulator";
interface LocalFixture {
  ref: string;
  oracle: { kind: Kind; input: unknown; expected: { result: string; reasonCode: string } };
  cryptoMode?: FixtureCryptoMode;
  pending?: { dependency: string; notExecuted: boolean; intendedResult: string };
}

function loadLocals(): LocalFixture[] {
  return Array.from({ length: 6 }, (_, i) => "L1-MOB-0" + (i + 1)).flatMap(id => ["positive", "negative"].flatMap(polarity => {
    const directory = "catalog/fixtures/" + id + "/" + polarity;
    return readdirSync(directory).filter(name => name.endsWith(".json")).sort().flatMap(name => {
      const envelope = JSON.parse(readFileSync(directory + "/" + name, "utf8")) as {
        setup: { mobilityOracle?: LocalFixture["oracle"]; fixtureCrypto?: { mode: FixtureCryptoMode }; pendingColdChainCases?: LocalFixture["pending"] }
      };
      return envelope.setup.mobilityOracle ? [{ ref: id + "/" + polarity + "/" + name, oracle: envelope.setup.mobilityOracle,
        cryptoMode: envelope.setup.fixtureCrypto?.mode, pending: envelope.setup.pendingColdChainCases }] : [];
    });
  }));
}
const locals = loadLocals();
function named(name: string): LocalFixture {
  const fixture = locals.find(row => row.ref.endsWith("/" + name + ".json"));
  if (!fixture) throw new Error("Missing Mobility local fixture " + name);
  return fixture;
}

function runLocal(fixture: LocalFixture, value: unknown = fixture.oracle.input) {
  return runMobilityOracle({ kind: fixture.oracle.kind, input: value }, fixture.cryptoMode ? { mode: fixture.cryptoMode } : undefined);
}
type Outcome = ReturnType<typeof runLocal>;
function noEffects(actual: Outcome) {
  if ("releasedLots" in actual) expect(actual.releasedLots).toEqual([]);
  if ("noticeReleases" in actual) expect(actual.noticeReleases).toEqual([]);
  if ("openedRequests" in actual) expect(actual.openedRequests).toEqual([]);
  if ("mergeReleases" in actual) expect(actual.mergeReleases).toEqual([]);
  if ("installedPackages" in actual) expect(actual.installedPackages).toEqual([]);
  if ("deploymentReleases" in actual) expect(actual.deploymentReleases).toEqual([]);
}
function refused(actual: Outcome) {
  expect(["allow", "pass"]).not.toContain(actual.result); noEffects(actual);
}
function mapObjects(value: unknown, update: (value: Record<string, unknown>) => void): unknown {
  if (Array.isArray(value)) return value.map(row => mapObjects(row, update));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapObjects(entry, update)]));
    update(result); return result;
  }
  return value;
}
function replaceValue(value: unknown, before: string, after: string): unknown {
  if (typeof value === "string") return value === before ? after : value;
  if (Array.isArray(value)) return value.map(row => replaceValue(row, before, after));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceValue(entry, before, after)]));
  return value;
}

describe("Mobility synthetic local reference oracles (P3-17)", () => {
  it("keeps exactly40 local cases separate from native evidence outcomes", () => {
    expect(locals).toHaveLength(40); expect(new Set(locals.map(row => row.ref)).size).toBe(40);
    expect(new Set(locals.map(row => row.oracle.kind)).size).toBe(6);
  });
  for (const fixture of locals) it(fixture.ref + ": synthetic outcome and atomic effects", () => {
    const before = structuredClone(fixture.oracle.input);
    const actual = runLocal(fixture);
    expect(actual.claimKind).toBe("synthetic_example");
    expect(actual.result).toBe(fixture.oracle.expected.result); expect(actual.reasonCode).toBe(fixture.oracle.expected.reasonCode);
    expect(fixture.oracle.input).toEqual(before);
    if (!["allow", "pass"].includes(actual.result)) noEffects(actual);
    if (fixture.oracle.kind === "release_check") {
      expect(actual.result).toBe("not_evaluated"); expect(actual.reasonCode).toBe("dependency_unavailable");
      expect(fixture.pending).toMatchObject({ dependency: "P2-27", notExecuted: true });
      expect("component" in actual).toBe(false); expect("eligibleLotIds" in actual).toBe(false);
    }
    if (fixture.oracle.kind === "screening_log" && actual.result === "pass") {
      const input = screeningSchema.parse(fixture.oracle.input);
      expect("noticeReleases" in actual && actual.noticeReleases.slice().sort()).toEqual(input.pairs.flatMap(pair => [pair.baseline, pair.counterfactual])
        .filter(application => application.decision === "deny").map(application => application.applicationId).sort());
    }
    if (fixture.oracle.kind === "port_access" && actual.result === "allow") {
      const input = portSchema.parse(fixture.oracle.input);
      expect("openedRequests" in actual && actual.openedRequests.slice().sort()).toEqual(input.events.flatMap(event => event.kind === "access_request" ? [event.requestId] : []).sort());
    }
    if (fixture.oracle.kind === "change_gate" && actual.result === "pass") {
      const input = changeSchema.parse(fixture.oracle.input);
      expect("mergeReleases" in actual && actual.mergeReleases).toEqual(["sha256:" + sha256Hex(Buffer.from(input.change.bytesUtf8, "utf8"))]);
    }
    if (fixture.oracle.kind === "ota_deployer" && actual.result === "allow") {
      const input = otaSchema.parse(fixture.oracle.input);
      expect("installedPackages" in actual && actual.installedPackages.map(row => row.vehicleId).sort()).toEqual(input.fleet!.vehicleIds.slice().sort());
    }
    if (fixture.oracle.kind === "vehicle_simulator" && actual.result === "pass") {
      expect("deploymentReleases" in actual && actual.deploymentReleases).toEqual([fallbackSchema.parse(fixture.oracle.input).vehicleId]);
    }
  });

  it("never invents a P2-27 adapter or releases a warm lot under pending scenario metadata", () => {
    for (const fixture of locals.filter(row => row.oracle.kind === "release_check")) {
      const actual = runReleaseCheck(fixture.oracle.input);
      expect(actual).toMatchObject({ result: "not_evaluated", reasonCode: "dependency_unavailable", releasedLots: [] });
    }
  });
  it("refuses both changed reasons and proxy sources even when every paired decision agrees", () => {
    for (const name of ["oracle-screening-reason-difference", "oracle-screening-proxy-lineage"]) {
      const fixture = named(name); const input = screeningSchema.parse(fixture.oracle.input);
      for (const pair of input.pairs) expect(pair.baseline.decision).toBe(pair.counterfactual.decision);
      const actual = runScreeningLog(input); expect(actual.result).toBe("fail"); expect(actual.noticeReleases).toEqual([]);
    }
  });
  it("holds every adverse notice until all paired applications and lineage have passed", () => {
    const input = screeningSchema.parse(named("oracle-screening-permitted-pairs").oracle.input);
    const bad = screeningSchema.parse(named("oracle-screening-proxy-lineage").oracle.input).pairs[1]!;
    const extra = structuredClone(bad); extra.pairId += "-extra";
    for (const application of [extra.baseline, extra.counterfactual]) { application.pairId = extra.pairId; application.applicationId += "-extra"; }
    input.pairs.push(extra); const actual = runScreeningLog(input);
    expect(actual.result).toBe("fail"); expect(actual.noticeReleases).toEqual([]);
  });
  it("refuses duplicate application, pair, reason and feature identities", () => {
    const fixture = named("oracle-screening-permitted-pairs");
    const original = screeningSchema.parse(fixture.oracle.input);
    const variants = [structuredClone(original), structuredClone(original), structuredClone(original), structuredClone(original)];
    variants[0]!.pairs.push(structuredClone(variants[0]!.pairs[0]!));
    variants[1]!.pairs[0]!.counterfactual.applicationId = variants[1]!.pairs[0]!.baseline.applicationId;
    variants[2]!.pairs[0]!.baseline.reasons!.push(structuredClone(variants[2]!.pairs[0]!.baseline.reasons![0]!));
    variants[3]!.pairs[0]!.baseline.features.push(structuredClone(variants[3]!.pairs[0]!.baseline.features[0]!));
    for (const input of variants) refused(runScreeningLog(input));
  });
  it("does not open a raised-level gate from a previously checked revision", () => {
    const actual = runPortAccess(named("oracle-port-raised-without-recheck").oracle.input);
    expect(actual.result).toBe("deny"); expect(actual.openedRequests).toEqual([]);
    expect(actual.decisions).toHaveLength(1); expect(actual.decisions[0]?.reasonCode).toBe("security_level_changed");
  });
  it("requires current authorization identity, expiry and chronological port events", () => {
    const original = portSchema.parse(named("oracle-port-level-2").oracle.input);
    for (const scenario of ["principal", "facility", "expired", "future", "missing"] as const) {
      const input = structuredClone(original); const request = input.events.find(event => event.kind === "access_request")!;
      if (request.kind !== "access_request") throw new Error("Fixture has no access request");
      if (scenario === "principal") request.authorization!.principalId += "-foreign";
      if (scenario === "facility") request.authorization!.facilityId += "-foreign";
      if (scenario === "expired") request.authorization!.expiresAt = request.at;
      if (scenario === "future") request.at = "2026-10-18T12:00:00.001Z";
      if (scenario === "missing") request.authorization = null;
      refused(runPortAccess(input));
    }
  });
  it("binds current change bytes and approval identity, decision and chronology", () => {
    const original = changeSchema.parse(named("oracle-change-bound-approval").oracle.input);
    for (const scenario of ["bytes", "self", "reject", "analysis-time", "expiry"] as const) {
      const input = structuredClone(original);
      if (scenario === "bytes") input.change.bytesUtf8 += "changed";
      if (scenario === "self") input.approval!.approverId = input.proposerId;
      if (scenario === "reject") input.approval!.decision = "reject";
      if (scenario === "analysis-time") input.analysis!.createdAt = input.at;
      if (scenario === "expiry") input.approval!.expiresAt = input.at;
      refused(runChangeGate(input));
    }
  });
  it("uses actual native release-purpose signature integrity and issuer admission before install", () => {
    const fixture = named("oracle-ota-trusted");
    const input = otaSchema.parse(fixture.oracle.input);
    const accepted = runMobilityOracle({ kind: "ota_deployer", input });
    expect(accepted.result).toBe("allow"); expect(accepted.integrity).toBe(true); expect(accepted.admission?.status).toBe("admitted");
    expect(accepted.installedPackages.length).toBe(input.fleet!.vehicleIds.length);
    const payloadSha256 = sha256Hex(Buffer.from(input.package.payloadBase64, "base64"));
    const verifiedMetadataDigest = "sha256:" + sha256Hex(canonicalize({ ...input.package.metadata, payloadSha256 }));
    for (const installed of accepted.installedPackages) {
      expect(installed.payloadSha256).toBe(payloadSha256); expect(installed.verifiedMetadataDigest).toBe(verifiedMetadataDigest);
    }
    for (const [mode, integrity, status] of [["unsigned", false, "admitted"], ["unknown_signer", true, "not-pinned"],
      ["revoked_signer", true, "revoked"], ["wrong_purpose", true, "wrong-purpose"], ["bad_signature", false, "admitted"]] as const) {
      const actual = runMobilityOracle({ kind: "ota_deployer", input }, { mode });
      expect(actual.result).toBe("deny"); expect(actual.integrity).toBe(integrity); expect(actual.admission?.status).toBe(status);
      expect(actual.installedPackages).toEqual([]);
    }
  });
  it("does not install with an envelope-supplied trust context or absent, invalid, future or expired trust", () => {
    const input = otaSchema.parse(named("oracle-ota-trusted").oracle.input);
    refused(runMobilityOracle({ kind: "ota_deployer", input: { ...input, contextOverride: { explicitPins: ["self-vouch"], allowUnpinned: true } } }));
    expect(runOtaDeployer(input, null)).toMatchObject({ result: "not_evaluated", reasonCode: "trust_unavailable", installedPackages: [] });
    for (const mode of ["invalid_trust", "future_trust", "expired_trust"] as const) refused(runMobilityOracle({ kind: "ota_deployer", input }, { mode }));
  });
  it("refuses actual content, records, fleet/model/version and metadata-time mismatches without install effects", () => {
    const original = otaSchema.parse(named("oracle-ota-trusted").oracle.input);
    for (const scenario of ["content", "records", "fleet", "model", "version", "time"] as const) {
      const input = structuredClone(original);
      if (scenario === "records") delete input.package.metadata.r156!.rollbackPlanId;
      if (scenario === "fleet") input.package.metadata.fleetId += "-foreign";
      if (scenario === "model") input.package.metadata.r156!.vehicleModelIds = ["foreign-model"];
      if (scenario === "version") input.package.metadata.r156!.softwareVersion = String(input.package.metadata.r156!.softwareVersion) + "-foreign";
      if (scenario === "time") input.package.metadata.createdAt = "2026-10-18T12:00:00.001Z";
      refused(runMobilityOracle({ kind: "ota_deployer", input }, { mode: scenario === "content" ? "bad_content" : "valid" }));
    }
  });

  it("accepts the inclusive fallback deadline and refuses one millisecond late", () => {
    expect(runVehicleSimulator(named("oracle-fallback-boundary").oracle.input).result).toBe("pass");
    const late = runVehicleSimulator(named("oracle-fallback-late").oracle.input);
    expect(late.result).toBe("fail"); expect(late.reasonCode).toBe("minimal_risk_late"); expect(late.deploymentReleases).toEqual([]);
  });
  it("requires actual independent safe stop, exact vehicle identity and post-crash sample order", () => {
    const original = fallbackSchema.parse(named("oracle-fallback-on-time").oracle.input);
    for (const scenario of ["agent", "moving", "outside", "vehicle", "before-crash", "future"] as const) {
      const input = structuredClone(original);
      for (const sample of input.trajectory) {
        if (scenario === "agent") sample.controller = "agent";
        if (scenario === "moving") sample.speedMps = 1;
        if (scenario === "outside") sample.insideSafeArea = false;
        if (scenario === "vehicle") sample.vehicleId += "-foreign";
        if (scenario === "before-crash") sample.at = "2026-10-18T11:59:00.000Z";
        if (scenario === "future") sample.at = "2026-10-18T12:00:00.001Z";
      }
      refused(runVehicleSimulator(input));
    }
  });
  it("rejects complete wrong-control protocols and consistently malformed facility identifiers", () => {
    for (const name of ["oracle-screening-permitted-pairs", "oracle-port-level-2", "oracle-change-bound-approval", "oracle-ota-trusted", "oracle-fallback-on-time"]) {
      const fixture = named(name);
      const input = mapObjects(fixture.oracle.input, object => {
        if ("tenantId" in object && "controlId" in object) object.controlId = object.controlId === "L1-MOB-02" ? "L1-MOB-03" : "L1-MOB-02";
      });
      refused(runLocal(fixture, input));
    }
    const fixture = named("oracle-port-level-2"); const original = portSchema.parse(fixture.oracle.input);
    for (const value of ["", " facility", "facility ", "x\u0000y", "x\u0085y", "x".repeat(513)]) {
      refused(runPortAccess(replaceValue(original, original.facilityId, value)));
    }
  });
  it("binds every subject, control version and illustrative plan field in nested records", () => {
    for (const name of ["oracle-screening-permitted-pairs", "oracle-port-level-2", "oracle-change-bound-approval", "oracle-ota-trusted", "oracle-fallback-on-time"]) {
      const fixture = named(name);
      for (const field of ["tenantId", "workspaceId", "deploymentId", "agentId", "controlVersion", "planDigest"] as const) {
        let first = true;
        const input = mapObjects(fixture.oracle.input, object => {
          if (!("tenantId" in object && "controlId" in object)) return;
          if (first) { first = false; return; }
          object[field] = field === "controlVersion" ? "9.9.9" : field === "planDigest" ? "sha256:" + "2".repeat(64) : "foreign-" + String(object[field]);
        });
        refused(runLocal(fixture, input));
      }
    }
  });
  it("rejects rolled, zone-less and submillisecond protocol times without truncating expiry or deadline", () => {
    for (const time of ["2026-02-30T00:00:00Z", "2026-10-18T12:00:00", "2026-10-18T12:00:00.0001Z", "0"]) {
      expect(utcTime.safeParse(time).success).toBe(false);
      const original = portSchema.parse(named("oracle-port-level-2").oracle.input);
      refused(runPortAccess({ ...original, at: time }));
    }
    const input = fallbackSchema.parse(named("oracle-fallback-boundary").oracle.input);
    for (const sample of input.trajectory) if (sample.speedMps === 0 && sample.insideSafeArea) sample.at = "2026-10-18T11:59:59.0001Z";
    refused(runVehicleSimulator(input));
  });
  it("rejects nonfinite speed, unsafe deadlines and string booleans from complete fallback inputs", () => {
    const original = fallbackSchema.parse(named("oracle-fallback-on-time").oracle.input);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const input = structuredClone(original); input.trajectory[0]!.speedMps = value; refused(runVehicleSimulator(input));
    }
    refused(runVehicleSimulator({ ...original, profile: { ...original.profile, maxResponseMs: Number.MAX_SAFE_INTEGER + 1 } }));
    refused(runVehicleSimulator({ ...original, trajectory: original.trajectory.map(sample => ({ ...sample, insideSafeArea: "true" })) }));
  });
});
