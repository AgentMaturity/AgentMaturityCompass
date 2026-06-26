import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  completeDsarForCli,
  dsarStorePaths,
  getDsarStatusForCli,
  listDsarForCli,
  submitDsarForCli,
  summarizeDsarRequests
} from "../src/vault/dsarCli.js";

const roots: string[] = [];

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-dsar-cli-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("DSAR CLI persistence", () => {
  test("submits, persists, lists, and completes DSAR requests with audit events", () => {
    const workspace = tempWorkspace();
    const submitted = submitDsarForCli({
      workspace,
      subject: "user-123@example.com",
      type: "deletion"
    });

    expect(submitted.request).toMatchObject({
      subject: "user-123@example.com",
      type: "delete",
      status: "pending",
      completedTs: null
    });

    const listed = listDsarForCli({ workspace });
    expect(listed.requests).toHaveLength(1);
    expect(listed.requests[0]?.requestId).toBe(submitted.request.requestId);

    const status = getDsarStatusForCli({ workspace, requestId: submitted.request.requestId });
    expect(status.request.status).toBe("pending");

    const completed = completeDsarForCli({ workspace, requestId: submitted.request.requestId });
    expect(completed.request.status).toBe("complete");
    expect(completed.request.completedTs).toBeGreaterThanOrEqual(completed.request.createdTs);

    const afterComplete = getDsarStatusForCli({ workspace, requestId: submitted.request.requestId });
    expect(afterComplete.request.status).toBe("complete");

    expect(summarizeDsarRequests(listDsarForCli({ workspace }).requests)).toEqual({
      total: 1,
      pending: 0,
      complete: 1
    });

    const paths = dsarStorePaths(workspace);
    const store = JSON.parse(readFileSync(paths.storePath, "utf8")) as { requests: unknown[] };
    expect(store.requests).toHaveLength(1);

    const auditLines = readFileSync(paths.auditPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { action: string; subjectSha256: string });
    expect(auditLines.map((line) => line.action)).toEqual(["submitted", "completed"]);
    expect(auditLines[0]?.subjectSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(paths.auditPath, "utf8")).not.toContain("user-123@example.com");
  });

  test("throws for missing DSAR requests", () => {
    const workspace = tempWorkspace();
    expect(() => getDsarStatusForCli({ workspace, requestId: "missing" })).toThrow("DSAR request not found");
    expect(() => completeDsarForCli({ workspace, requestId: "missing" })).toThrow("DSAR request not found");
  });
});
