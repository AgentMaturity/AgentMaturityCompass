import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("API operational contract documentation", () => {
  test("documents Studio rate-limit headers and retry semantics", () => {
    const docs = readProjectFile("docs/API_SURFACES.md");
    const studio = readProjectFile("src/studio/studioServer.ts");

    expect(studio).toContain("x-ratelimit-limit");
    expect(studio).toContain("ratelimit-limit");
    expect(studio).toContain("retry-after");
    expect(docs).toContain("Rate-limit and retry contract:");
    expect(docs).toContain("x-ratelimit-limit");
    expect(docs).toContain("ratelimit-reset");
    expect(docs).toContain("retry-after");
    expect(docs).toContain("RFC 6585");
  });

  test("documents org SSE reconnect behavior and no-replay boundary", () => {
    const realtime = readProjectFile("docs/REALTIME.md");
    const apiDocs = readProjectFile("docs/API_SURFACES.md");
    const orgSse = readProjectFile("src/org/orgSse.ts");

    expect(orgSse).toContain("retry: 15000");
    expect(orgSse).toContain("id: ${event.summaryHash}");
    expect(realtime).toContain("reconnect hint: `retry: 15000`");
    expect(realtime).toContain("Last-Event-ID");
    expect(realtime).toContain("does not replay missed org events");
    expect(apiDocs).toContain("SSE reconnect contract:");
    expect(apiDocs).toContain("not a replay log");
  });

  test("documents alert webhook retry boundary", () => {
    const docs = readProjectFile("docs/API_SURFACES.md");

    expect(docs).toContain("`amc alert send` and `amc alert test` use the simple alert dispatcher");
    expect(docs).toContain("fail fast on non-2xx webhook responses");
    expect(docs).toContain("integration dispatcher supports channel-level retry policy");
    expect(docs).toContain("dead-letter behavior");
  });
});
