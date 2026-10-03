import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const runbook = readFileSync(join(root, "docs/RELEASE_RUNBOOK.md"), "utf8");

/** Text from a `### ` heading up to the next `##`/`###` heading. */
function section(heading: string): string {
  const start = runbook.indexOf(`${heading}\n`);
  expect(start, `missing heading: ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = runbook.slice(start + heading.length + 1);
  const next = rest.search(/^#{2,3} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

// Verbatim from plans/2026-09-09-amc-execution-brief.md:355-371 (§6 B3/B4).
const B3 = "### B3 — Publish — **CONFIRM WITH SID FIRST**";
const B4 = "### B4 — Live deployment — **CONFIRM WITH SID FIRST**";
const B3_SENTENCE = "Do not run it until you have shown Sid the version, the artifact SHA256, the gate result, and the B0 disposition, and he has said yes in this conversation.";

describe("deployment confirmation runbook (B3/B4 owner gates)", () => {
  test("states the B3 publish gate verbatim inside the B3 section", () => {
    expect(runbook).toContain(B3);
    expect(section(B3)).toContain(B3_SENTENCE);
  });

  test("states the B4 live-deployment gate and 'wait for an explicit yes' inside the B4 section", () => {
    expect(runbook).toContain(B4);
    expect(section(B4)).toContain("wait for an explicit yes");
  });

  test("links the deployment confirmation runbook, which exists", () => {
    expect(runbook).toContain("(./DEPLOYMENT_CONFIRMATION_RUNBOOK.md)");
    expect(existsSync(join(root, "docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md"))).toBe(true);
  });
});
