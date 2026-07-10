import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/pages.yml"), "utf8");

describe("GitHub Pages deployment runtime", () => {
  test("uses the official Node 24-compatible Pages action majors", () => {
    expect(workflow).toContain("actions/configure-pages@v6");
    expect(workflow).toContain("actions/upload-pages-artifact@v5");
    expect(workflow).toContain("actions/deploy-pages@v5");

    expect(workflow).not.toMatch(/actions\/configure-pages@v[1-5](?:\s|$)/);
    expect(workflow).not.toMatch(/actions\/upload-pages-artifact@v[1-4](?:\s|$)/);
    expect(workflow).not.toMatch(/actions\/deploy-pages@v[1-4](?:\s|$)/);
    expect(workflow).not.toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24");
  });

  test("triggers on every Pages artifact input and preserves the concurrency guard", () => {
    expect(workflow).toContain("branches: [main]");
    for (const path of [
      "website/**",
      "docs/**",
      "scripts/build-pages-site.mjs",
      "package.json",
      "package-lock.json",
      ".github/workflows/pages.yml",
    ]) {
      expect(workflow, path).toContain(path);
    }
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("group: pages");
    expect(workflow).toContain("cancel-in-progress: true");
  });

  test("builds a lockfile-pinned staged artifact with least-privilege Pages permissions", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("actions/setup-node@v6");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run build:pages");
    expect(workflow).toContain("path: tmp/pages-site");
    expect(workflow).not.toContain("path: website");
    expect(workflow).toContain("url: ${{ steps.deployment.outputs.page_url }}");
    expect(workflow).toContain("id: deployment");
  });
});
