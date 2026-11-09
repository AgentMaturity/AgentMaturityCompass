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

  it("names no ECS task volume as Studio's workspace: ECS deletes a service task's EBS volume when it stops (skeptic 2026-11-08)", () => {
    // AWS ECS developer guide, "Amazon EBS volumes": each task gets a new volume, and a service-managed task's volume is
    // deleted on termination, so a redeploy or health replacement would delete the vault, ledger and keys.
    for (const file of ["docs/CLOUD_REFERENCE_ARCHITECTURES.md", "docs/DEPLOYMENT_OPTIONS.md"]) {
      for (const sentence of sentences(read(file)).filter((s) => /\bEBS\b/.test(s) && /\b(?:ECS|Fargate|task)\b/.test(s))) {
        expect(sentence, file).toMatch(/\bdelete[sd]?\b|does not outlive/);
      }
    }
    const aws = section(read("docs/CLOUD_REFERENCE_ARCHITECTURES.md"), "## AWS reference architecture");
    const start = sentences(aws).map((sentence) => sentence.trim()).find((sentence) => sentence.startsWith("Recommended starting point:")) ?? "";
    expect(start).toContain("EKS");
    expect(start).not.toMatch(/Fargate|\bECS\b/);
  });
});

describe("receipt-based platform status where users install (LIVE-DEPLOY-10)", () => {
  /** Places where "supported" or "qualified" sits within 80 characters of "Windows" without a negation in front of it. */
  function windowsClaims(text: string): string[] {
    const claims: string[] = [];
    for (const match of text.matchAll(/\b(un)?(supported|qualified)\b/gi)) {
      const at = match.index!;
      const near = text.slice(Math.max(0, at - 80), at + match[0].length + 80);
      const negated = match[1] !== undefined || /\b(?:not|no)\s+$/i.test(text.slice(Math.max(0, at - 8), at));
      if (near.includes("Windows") && !negated) claims.push(near.replace(/\s+/g, " "));
    }
    return claims;
  }

  it("flags a Windows support claim and accepts a negated one (the check itself)", () => {
    expect(windowsClaims("Windows x64 is supported.")).toHaveLength(1);
    expect(windowsClaims("macOS arm64 is qualified; see the Windows notes.")).toHaveLength(1);
    expect(windowsClaims("Windows x64: not qualified. WSL2 is unsupported.")).toEqual([]);
  });

  it("claims no Windows support or qualification in INSTALL.md or DESKTOP_PACKAGES.md", () => {
    for (const file of ["docs/INSTALL.md", "docs/DESKTOP_PACKAGES.md"]) expect(windowsClaims(read(file)), file).toEqual([]);
  });

  it("states one receipt-based line per platform and the untested Windows paths", () => {
    const install = read("docs/INSTALL.md");
    const windows = section(install, "### Windows");
    expect(windows).toContain("PLATFORM_MATRIX.md");
    expect(windows).toContain("the CLI natively and Studio under WSL2 are both untested");
    const status = section(install, "### Platform status");
    for (const line of ["macOS arm64: qualified", "Linux arm64:", "Linux x64, macOS x64, Windows x64:", "Container images:"]) expect(status).toContain(line);
    const desktop = read("docs/DESKTOP_PACKAGES.md");
    expect(desktop).toContain("the CLI natively and Studio under WSL2 are both untested");
    expect(desktop).toMatch(/Linux archive ships no Studio launcher/);
  });
});

describe("one documented way to run AMC for live users (LIVE-DEPLOY-17)", () => {
  it("routes live users in D-03 vocabulary and claims no support", () => {
    const first = section(read("docs/DEPLOYMENT.md"), "## Running AMC for live users");
    expect(first).toContain("not qualified");
    expect(first).not.toMatch(/\bsupported\b/i);
    for (const runbook of ["INSTALL.md", "UPGRADE.md", "ROLLBACK.md", "BACKUP_RESTORE.md", "RECOVERY_TARGETS.md", "COMPOSE.md"]) {
      expect(first).toContain(`deploy/reference/${runbook}`);
    }
  });

  it("gives the Compose backup, rollback and 1.1.1 commands their safe form", () => {
    const compose = read("docs/deploy/reference/COMPOSE.md");
    // Command lines only: they start with docker compose (inside a code block, or as a numbered step's inline command).
    const backups = compose.split("\n").filter((line) => /^\s*(?:\d+\.\s*)?`?docker compose\b/.test(line) && /(?:amc|dist\/cli\.js) backup create/.test(line));
    expect(backups.length).toBeGreaterThan(1);
    for (const line of backups) {
      expect(line).toContain("-w /data/amc");
      expect(line).toContain("AMC_VAULT_PASSPHRASE=");
      expect(line).toContain("--out /tmp/");
    }
    expect(compose).toMatch(/[Nn]ever (?:run )?`(?:docker compose )?down -v`/);
    expect(compose).toContain("chown -R 10001:10001");
    expect(compose).not.toMatch(/docker compose[^`\n]* cp amc-studio:\/tmp\//);
  });

  it("says what amc verify all prints while Studio runs: PASS naming the open gateway session, no verified prefix (final review)", () => {
    const step = read("docs/deploy/reference/COMPOSE.md").split("\n").find((line) => line.includes("`amc verify all --json --expect-monitor <sha256>`"));
    expect(step).toContain("the ledger check passes and names Studio's own gateway session as open");
    expect(step).toContain("reports the payloads as not evaluated and exits 1");
    expect(step).not.toMatch(/verified prefix|needs Studio stopped/);
  });

  it("starts the Upgrading section with the backup", () => {
    expect(section(read("docs/INSTALL.md"), "## Upgrading").trimStart().startsWith("Back up first")).toBe(true);
  });

  it("tells a 1-vCPU host how to lower Studio's CPU limit, which Docker refuses above the host's CPU count (skeptic 2026-11-08)", () => {
    for (const doc of ["docs/INSTALL.md", "docs/deploy/reference/COMPOSE.md"]) expect(read(doc), doc).toContain("set `AMC_STUDIO_CPUS=1`");
  });

  it("forbids up --build once AMC_STUDIO_IMAGE names a release, which would retag new code (skeptic 2026-11-08)", () => {
    for (const file of ["docs/deploy/reference/COMPOSE.md", "deploy/compose/README.md"]) {
      expect(read(file), file).toMatch(/once `?(?:\.env`? names a release tag or an image id|`AMC_STUDIO_IMAGE` names a release tag or an image id), never run `docker compose up --build`/i);
    }
    expect(read("docs/INSTALL.md")).toContain("never run `docker compose up --build` once that pin names a release");
  });

  it("carries the signed-control checkpoints with every Helm backup, restore and rollback (skeptic 2026-11-08)", () => {
    // Chart 0.4.1 keeps them on the state claim; a bundle restored without them leaves every published signed control failing closed.
    const backup = read("docs/deploy/reference/BACKUP_RESTORE.md");
    expect(backup).toContain("tar -czf - -C /home/amc/.config/amc/state control-checkpoints > ./amc-control-checkpoints-<ts>.tgz");
    expect(backup).toContain("tar -xzf - -C /home/amc/.config/amc/state < ./amc-control-checkpoints-<ts>.tgz");
    expect(backup).toMatch(/without its checkpoint archive leaves every signed control[^.]*failing closed/);
    const rollback = read("docs/deploy/reference/ROLLBACK.md");
    expect(rollback).toContain("! -name kill-switch -exec rm -rf {} + && tar -xzf - -C /home/amc/.config/amc/state' < ./amc-control-checkpoints-<ts>.tgz");
    expect(rollback).toContain("Start a tool pod on the same workspace and state claims");
    expect(read("docs/deploy/reference/UPGRADE.md")).toContain("archive the signed-control checkpoints with it");
  });
});
