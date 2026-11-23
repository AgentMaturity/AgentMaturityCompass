import { describe, expect, it } from "vitest";
import { approvalCallHtml, offersApprove } from "../../src/console/assets/approvalCallView.js";

/** UX-04 (H2, M3): the console offers Approve only from the server's `approveHere` flag, on every card and list row. */
describe("approval controls from the server's flag", () => {
  const base = { approvalRequestId: "apprreq_x", toolName: "bash", actionClass: "WRITE_HIGH", riskTier: "high" };
  it("offers Approve only for a call Studio marked shown whole", () => {
    expect(offersApprove({ ...base, call: { title: "Run a shell command", lines: ["Command: ls"], complete: true, folder: ".", digest: "a".repeat(64), approveHere: true } })).toBe(true);
    expect(offersApprove({ ...base, call: { withheld: ["aws key"], digest: "a".repeat(64), approveHere: false } }), "withheld").toBe(false);
    expect(offersApprove({ ...base, call: { title: "t", lines: ["… 85 more lines are not shown here."], complete: false, folder: ".", approveHere: false } }), "incomplete").toBe(false);
    expect(offersApprove({ ...base, call: { unavailable: "no agent session recorded this call" } }), "unavailable").toBe(false);
    expect(offersApprove(base), "a list row carries no call").toBe(false);
    expect(offersApprove({ ...base, call: { withheld: ["jwt"], approveHere: true } as never }), "the flag, not the shape, decides").toBe(true);
    expect(offersApprove(base, true), "an agent project's own request keeps its project rules").toBe(true);
  });
  it("says in words why a withheld or incomplete call is decided elsewhere, and shows text as text", () => {
    const withheld = approvalCallHtml({ ...base, call: { withheld: ["private key"], digest: "b".repeat(64), approveHere: false } });
    expect(withheld).toContain("looks like a secret (private key)");
    expect(withheld).toContain("Decide it at the terminal");
    expect(withheld).not.toMatch(/<button/);
    const partial = approvalCallHtml({ ...base, call: { title: "Run a shell command", lines: ["Command: <img src=x onerror=alert(1)>"], complete: false, folder: ".", digest: "c".repeat(64), approveHere: false } });
    expect(partial).toContain("cannot be approved from this page");
    expect(partial).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
