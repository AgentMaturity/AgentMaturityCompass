import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeApprovalInstructions } from "../src/setup/nativeApprovalInstructions.js";
import { renderNativeGuideCommand } from "../src/setup/nativeFirstUseGuide.js";

const seam = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../src/approvals/approvalInbox.js", () => ({ getApprovalInboxItem: seam.read }));
const requestId = `apprreq_${"a".repeat(32)}`, intentId = "apr_00000000-0000-4000-8000-000000000001", digest = "d".repeat(64);
const options = { workspace: "/fixture workspace", agentId: "native-reviewer", approvalId: intentId, approvalRequestId: requestId };
function fixture() {
  return { request: { approvalRequestId: requestId, agentId: options.agentId, intentId, expiresTs: Date.now() + 60_000,
    effectiveMode: "EXECUTE", toolName: "sensitive-tool-fixture", rawArguments: "secret-arguments-never-in-guidance" },
    requestDigestSha256: digest, status: "PENDING", requestIntegrity: { valid: true }, chainIntegrity: { valid: true }, contextIntegrity: { valid: true } };
}
beforeEach(() => { seam.read.mockReset(); seam.read.mockImplementation(fixture); });
afterEach(() => vi.restoreAllMocks());

describe("native one-shot authenticated approval instructions", () => {
  it("reads the canonical reference and binds both choices to its digest and authenticated session", () => {
    const result = nativeApprovalInstructions(options);
    expect(seam.read).toHaveBeenCalledWith({ workspace: options.workspace, agentId: options.agentId, approvalRequestId: requestId });
    expect(result.status).toBe("ready-for-review");
    expect(result.inspect?.argv).toEqual(["amc", "approvals", "show", "--agent", options.agentId, requestId]);
    for (const action of [result.approve, result.deny]) {
      expect(action?.cwd).toBe(options.workspace);
      expect(action?.argv).toEqual(expect.arrayContaining(["--session-token-file", "<private-session-token-file>", "--expect-request-digest", digest,
        "--user-id", "<authenticated-user-id>", "--username", "<authenticated-username>", "--roles", "<authenticated-comma-separated-roles>", requestId]));
    }
    expect(result.approve?.argv).toEqual(expect.arrayContaining(["--mode", "execute"]));
    expect(result.deny?.argv).not.toContain("--mode");
    expect(result.login?.argv).toEqual(["amc", "approvals", "login", "--username", "<existing-reviewer-username>", "--token-file", "<new-private-session-file>", "--json"]);
    expect(result.text).toContain("choose ONE decision");
    expect(result.text).toContain("FILE PATH");
    expect(result.text).not.toContain("secret-arguments-never-in-guidance");
    expect(result.text).not.toContain("sensitive-tool-fixture");
  });
  it("offers the actual simulate mode instead of silently requesting execute", () => {
    const item = fixture(); item.request.effectiveMode = "SIMULATE"; seam.read.mockReturnValue(item);
    const result = nativeApprovalInstructions(options);
    expect(result.approve?.argv).toEqual(expect.arrayContaining(["--mode", "simulate"]));
    expect(result.approve?.argv).not.toContain("execute");
  });
  it("renders placeholders and concrete agent values as single shell arguments without running them", () => {
    const agentId = "reviewer 'quote' $(not-a-command)";
    const item = fixture(); item.request.agentId = agentId; seam.read.mockReturnValue(item);
    const result = nativeApprovalInstructions({ ...options, agentId });
    expect(result.status).toBe("ready-for-review");
    expect(result.text).toContain(renderNativeGuideCommand({ cwd: options.workspace, argv: ["--agent", agentId] }));
    expect(result.text).toContain("'<private-session-token-file>'");
  });
  it.each(["requestIntegrity", "chainIntegrity", "contextIntegrity"] as const)("offers no decision template when %s is invalid", field => {
    const item = fixture(); item[field].valid = false; seam.read.mockReturnValue(item);
    const result = nativeApprovalInstructions(options);
    expect(result).toMatchObject({ status: "inspection-only", login: null, approve: null, deny: null });
    expect(result.inspect).not.toBeNull();
    expect(result.text).not.toContain("amc approvals approve");
  });
  it.each(["APPROVED", "QUORUM_MET", "DENIED", "EXPIRED", "CONSUMED", "CANCELLED"])("does not suggest a new decision for %s", status => {
    seam.read.mockReturnValue({ ...fixture(), status });
    expect(nativeApprovalInstructions(options)).toMatchObject({ status: "inspection-only", approve: null, deny: null });
  });
  it.each([
    { approvalRequestId: `apprreq_${"b".repeat(32)}` }, { agentId: "another-agent" }, { intentId: "another-intent" },
    { expiresTs: 0 }, { expiresTs: Number.NaN }, { effectiveMode: "unknown" }
  ])("does not fabricate decision authority for a mismatched request: %j", changed => {
    const item = fixture(); Object.assign(item.request, changed); seam.read.mockReturnValue(item);
    expect(nativeApprovalInstructions(options)).toMatchObject({ status: "inspection-only", approve: null, deny: null });
  });
  it("does not echo a malformed digest or a thrown raw inbox error", () => {
    seam.read.mockReturnValue({ ...fixture(), requestDigestSha256: "secret-fixture-digest" });
    let result = nativeApprovalInstructions(options);
    expect(result.status).toBe("inspection-only");
    expect(result.text).not.toContain("secret-fixture");
    seam.read.mockImplementation(() => { throw new Error("secret-fixture-private-path"); });
    result = nativeApprovalInstructions(options);
    expect(result.status).toBe("inspection-only");
    expect(result.text).not.toContain("secret-fixture");
  });
  it("does not look up or render terminal-control inputs as commands", () => {
    const result = nativeApprovalInstructions({ ...options, agentId: "agent\u001b[2J" });
    expect(result).toMatchObject({ status: "inspection-only", inspect: null, approve: null, deny: null });
    expect(seam.read).not.toHaveBeenCalled();
    expect(result.text).not.toContain("\u001b[2J");
  });
});
