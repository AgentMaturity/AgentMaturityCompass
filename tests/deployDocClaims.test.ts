import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { read } from "./helpers/deployPackFixtures.js";

// The docs-drift and fabrication checks do not read these deployment docs, so each required or forbidden claim is pinned here.
const HELM_DOCS = ["docs/DEPLOYMENT.md", "docs/INSTALL.md", "docs/KUBERNETES_HELM_DEPLOYMENT.md", "deploy/helm/amc/README.md",
  ...readdirSync("docs/deploy/reference").filter((name) => name.endsWith(".md")).map((name) => `docs/deploy/reference/${name}`)];

/** Shell commands with their `\` continuation lines joined, so one logical command is one line. */
const logicalLines = (text: string) => text.replace(/\\\n\s*/g, " ").split("\n");
/** The text of a `## heading` section, up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return "";
  const level = /^#+/.exec(heading)![0].length;
  const rest = text.slice(start + heading.length + 1);
  const end = rest.search(new RegExp(`^#{1,${level}} `, "m"));
  return end < 0 ? rest : rest.slice(0, end);
}

describe("Kubernetes doc truth (LIVE-DEPLOY-09)", () => {
  const doc = read("docs/KUBERNETES_HELM_DEPLOYMENT.md");

  it("names the claims the chart renders: <release>-amc and <release>-amc-state", () => {
    // pvc-state.yaml renders <fullname>-state, and the fullname is <release>-amc (amc-amc-state for release amc).
    expect(doc).not.toMatch(/<release>-state`/);
    expect(doc).toContain("`<release>-amc-state`");
  });

  it("installs from a locally built image by digest, not from an unverified registry tag", () => {
    const install = section(doc, "## Install With Helm");
    const firstBlock = /```bash\n([\s\S]*?)```/.exec(install)?.[1] ?? "";
    expect(firstBlock).not.toContain("ghcr.io");
    expect(firstBlock).toContain("kind-image-digest.mjs");
    expect(firstBlock).toContain("--set image.requireDigest=true");
    expect(install).toContain("ImagePullBackOff");
    for (const text of [doc, read("deploy/helm/amc/README.md")]) {
      expect(text).not.toMatch(/--set image\.tag=latest/);
      // An image id is not a digest a registry or containerd resolves.
      for (const line of text.split("\n")) if (line.includes("image.digest")) expect(line).not.toMatch(/\{\{\.Id\}\}/);
    }
  });

  it("keeps values on every helm upgrade that sets one: --reuse-values or the operator's -f file", () => {
    const offenders = HELM_DOCS.flatMap((file) => logicalLines(read(file))
      .filter((line) => /helm upgrade/.test(line) && /--set/.test(line) && !line.includes("--reuse-values") && !line.includes(" -f "))
      .map((line) => `${file}: ${line.trim().slice(0, 120)}`));
    expect(offenders).toEqual([]);
  });
});

describe("cloud docs recommend only what the runtime can do (LIVE-DEPLOY-18)", () => {
  // The ledger is SQLite in WAL mode (src/ledger/ledgerConnection.ts), which network filesystems do not support, and Studio
  // is a single writer.
  const sentences = (text: string) => text.replace(/\n(?!\n)/g, " ").split(/(?<=[.!?])\s+/);

  it("offers no hosted AMC and no scale-out or network-filesystem Studio target", () => {
    const options = read("docs/DEPLOYMENT_OPTIONS.md");
    expect(options).not.toContain("Managed / hosted AMC");
    expect(options).toContain("Hosted AMC: not offered; D-03 names no hosted target.");
    expect(options).not.toMatch(/Cloud Run when persistence is externalized/);
  });

  it("says EFS and Azure Files are not usable for the workspace, in the sentence that names them", () => {
    const cloud = read("docs/CLOUD_REFERENCE_ARCHITECTURES.md");
    const efs = sentences(cloud).filter((sentence) => sentence.includes("EFS"));
    expect(efs.length).toBeGreaterThan(0);
    for (const sentence of efs) expect(sentence).toContain("not usable");
    for (const sentence of sentences(cloud).filter((s) => s.includes("Azure Files"))) expect(sentence).toMatch(/not usable|cannot use/);
    expect(cloud).not.toMatch(/EFS or another managed persistent storage option/);
  });
});
