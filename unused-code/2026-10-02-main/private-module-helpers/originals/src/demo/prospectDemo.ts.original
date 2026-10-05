import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { DemoResult } from "./demoRun.js";
import { demoMaturityScore } from "./demoRun.js";
import { normalizePublicReportBaseUrl, sanitizeReportShareSlug } from "../diagnostic/reportShare.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export interface ProspectDemoStep {
  minute: string;
  title: string;
  command: string;
  proof: string;
  talkTrack: string;
}

export interface ProspectDemoBundleManifest {
  schemaVersion: 1;
  kind: "amc.demo.prospect.share";
  slug: string;
  generatedTs: number;
  trustLabel: "DEMO_ONLY";
  claimBoundary: string;
  liveEvidenceIncluded: boolean;
  liveEvidenceWorkspace: string | null;
  maturityScore: number;
  maturityLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  htmlSha256: string;
  demoJsonSha256: string;
  localUrl: string;
  publicUrl: string | null;
  sources: string[];
  files: {
    html: "index.html";
    manifest: "demo-manifest.json";
  };
}

export interface ProspectDemoPlan {
  title: string;
  durationMinutes: 5;
  trustLabel: "DEMO_ONLY";
  claimBoundary: string;
  sourceBasis: string[];
  commands: {
    guided: "amc demo prospect";
    share: "amc demo share --public-base-url <url>";
    liveEvidence: "amc demo prospect --live --share";
    reportShare: "amc report latest --share --public-base-url <url>";
  };
  steps: ProspectDemoStep[];
  compareAndLeaderboard: string[];
  liveResult: DemoResult | null;
  sampleScore: {
    maturityScore: number;
    maturityLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  };
}

export interface WriteProspectDemoShareBundleInput {
  outputRoot: string;
  slug?: string;
  publicBaseUrl?: string;
  plan: ProspectDemoPlan;
  now?: number;
}

export interface ProspectDemoShareBundle {
  slug: string;
  dir: string;
  htmlPath: string;
  manifestPath: string;
  shareUrl: string;
  manifest: ProspectDemoBundleManifest;
}

const FTC_ADVERTISING_BASICS_URL = "https://www.ftc.gov/business-guidance/advertising-marketing";

const CLAIM_BOUNDARY =
  "Sales demo artifact. Static examples are illustrative, DEMO_ONLY, and not production audit evidence. Use --live or a real diagnostic run before making customer-specific claims.";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function publicDemoUrl(baseUrl: string, slug: string): string {
  const normalized = normalizePublicReportBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("public demo base URL is required.");
  }
  return `${normalized}/${encodeURIComponent(slug)}/index.html`;
}

export function buildProspectDemoPlan(liveResult: DemoResult | null = null): ProspectDemoPlan {
  const sampleScore = liveResult?.maturityScore && liveResult.maturityLevel
    ? { maturityScore: liveResult.maturityScore, maturityLevel: liveResult.maturityLevel }
    : demoMaturityScore(10, 20);

  return {
    title: "AMC five-minute prospect demo",
    durationMinutes: 5,
    trustLabel: "DEMO_ONLY",
    claimBoundary: CLAIM_BOUNDARY,
    sourceBasis: [
      "FTC advertising guidance: marketing claims must be truthful, not deceptive or unfair, and evidence-based.",
      "AMC demo boundary: DEMO_ONLY examples are separate from signed production audit evidence."
    ],
    commands: {
      guided: "amc demo prospect",
      share: "amc demo share --public-base-url <url>",
      liveEvidence: "amc demo prospect --live --share",
      reportShare: "amc report latest --share --public-base-url <url>"
    },
    steps: [
      {
        minute: "0:00-0:45",
        title: "Open with the evidence gap",
        command: "amc demo gap --fast",
        proof: "Shows the difference between keyword/self-reported scoring and execution-verified scoring.",
        talkTrack: "AMC scores what the agent actually does, not what its docs claim."
      },
      {
        minute: "0:45-2:15",
        title: "Run a no-setup live demo",
        command: "amc demo run --no-vault",
        proof: "Starts an ephemeral local gateway, captures DEMO_ONLY evidence, and prints a maturity sample.",
        talkTrack: "A prospect can see gateway evidence capture without committing to vault setup."
      },
      {
        minute: "2:15-3:15",
        title: "Show the leave-behind",
        command: "amc demo share --public-base-url https://reports.example.com/amc-demo",
        proof: "Writes index.html and demo-manifest.json with hashes, URL, and claim boundary.",
        talkTrack: "The share link is a static bundle that a team can publish to its own approved host."
      },
      {
        minute: "3:15-4:15",
        title: "Compare options",
        command: "amc compare-models --agent default --iterations 3",
        proof: "Surfaces model comparison as a demo-ready command instead of leaving it hidden.",
        talkTrack: "AMC can compare behavior across model choices, not just score one run."
      },
      {
        minute: "4:15-5:00",
        title: "Close with a ranked view",
        command: "amc leaderboard show",
        proof: "Shows fleet or benchmark ranking for executive-friendly comparison.",
        talkTrack: "The buyer leaves with a clear next step: run a real diagnostic and share the signed report."
      }
    ],
    compareAndLeaderboard: [
      "amc compare-models --agent default --iterations 3",
      "amc leaderboard show",
      "amc leaderboard export --format html --output leaderboard.html"
    ],
    liveResult,
    sampleScore
  };
}

export function renderProspectDemoMarkdown(plan: ProspectDemoPlan): string {
  const lines = [
    `${plan.title}`,
    "",
    `Trust label: ${plan.trustLabel}`,
    `Claim boundary: ${plan.claimBoundary}`,
    "",
    "Five-minute flow:"
  ];
  for (const step of plan.steps) {
    lines.push(`- ${step.minute} ${step.title}: \`${step.command}\``);
    lines.push(`  Proof: ${step.proof}`);
  }
  lines.push("");
  lines.push("Share:");
  lines.push(`- ${plan.commands.share}`);
  lines.push(`- ${plan.commands.reportShare}`);
  lines.push("");
  lines.push("Demo-ready comparison commands:");
  for (const command of plan.compareAndLeaderboard) {
    lines.push(`- ${command}`);
  }
  if (plan.liveResult) {
    lines.push("");
    lines.push(`Live DEMO_ONLY result: ${plan.liveResult.requestsSent} requests, ${plan.liveResult.evidenceItems} evidence events, ${plan.sampleScore.maturityLevel}/${plan.sampleScore.maturityScore}.`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderProspectDemoHtml(plan: ProspectDemoPlan): string {
  const stepCards = plan.steps.map((step) => `
      <section class="step">
        <div class="minute">${escapeHtml(step.minute)}</div>
        <h2>${escapeHtml(step.title)}</h2>
        <code>${escapeHtml(step.command)}</code>
        <p>${escapeHtml(step.proof)}</p>
        <p class="talk">${escapeHtml(step.talkTrack)}</p>
      </section>`).join("\n");
  const comparisonItems = plan.compareAndLeaderboard.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("\n");
  const live = plan.liveResult
    ? `<p><strong>Live DEMO_ONLY run:</strong> ${plan.liveResult.requestsSent} requests, ${plan.liveResult.evidenceItems} evidence events, ${plan.sampleScore.maturityLevel}/${plan.sampleScore.maturityScore}. Evidence workspace: <code>${escapeHtml(plan.liveResult.evidenceWorkspace ?? "n/a")}</code>.</p>`
    : `<p><strong>Static sample:</strong> ${plan.sampleScore.maturityLevel}/${plan.sampleScore.maturityScore}. Run <code>${escapeHtml(plan.commands.liveEvidence)}</code> to attach local gateway evidence.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(plan.title)}</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0a0a;--panel:#141414;--text:#f8fafc;--muted:#a0a0a0;--green:#4AEF79;--border:rgba(255,255,255,.12)}
    *{box-sizing:border-box}
    body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
    main{max-width:960px;margin:0 auto;padding:48px 20px}
    h1{font-size:clamp(2rem,5vw,4rem);line-height:1;margin:0 0 16px}
    h2{margin:0 0 10px;font-size:1.1rem}
    .lede{color:var(--muted);max-width:720px}
    .badge{display:inline-block;margin:18px 0 28px;padding:5px 10px;border:1px solid var(--green);color:var(--green);font:700 .78rem ui-monospace,monospace}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:24px 0}
    .step,.panel{border:1px solid var(--border);background:var(--panel);padding:18px}
    .minute{font:700 .78rem ui-monospace,monospace;color:var(--green);margin-bottom:8px}
    code{display:inline-block;max-width:100%;overflow-wrap:anywhere;color:var(--green);background:rgba(74,239,121,.08);padding:2px 5px}
    .talk{color:var(--muted)}
    ul{padding-left:20px}
    a{color:var(--green)}
    :where(a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])):focus-visible{outline:2px solid var(--green);outline-offset:3px}
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(plan.title)}</h1>
  <p class="lede">A prospect-safe, five-minute AMC demo path with an explicit claim boundary and publishable static leave-behind.</p>
  <div class="badge">${plan.trustLabel}</div>
  <section class="panel">
    <h2>Claim Boundary</h2>
    <p>${escapeHtml(plan.claimBoundary)}</p>
    ${live}
  </section>
  <div class="grid">
${stepCards}
  </div>
  <section class="panel">
    <h2>Demo-ready comparison commands</h2>
    <ul>${comparisonItems}</ul>
  </section>
  <section class="panel">
    <h2>Share commands</h2>
    <p><code>${escapeHtml(plan.commands.share)}</code></p>
    <p><code>${escapeHtml(plan.commands.reportShare)}</code></p>
  </section>
</main>
</body>
</html>`;
}

export function writeProspectDemoShareBundle(input: WriteProspectDemoShareBundleInput): ProspectDemoShareBundle {
  const slug = sanitizeReportShareSlug(input.slug ?? "prospect-demo").replace(/-+/g, "-");
  const dir = join(input.outputRoot, slug);
  const htmlPath = join(dir, "index.html");
  const manifestPath = join(dir, "demo-manifest.json");
  const html = renderProspectDemoHtml(input.plan);
  const demoJson = JSON.stringify(input.plan, null, 2);
  const localUrl = pathToFileURL(htmlPath).href;
  const publicBaseUrl = normalizePublicReportBaseUrl(input.publicBaseUrl);
  const publicUrl = publicBaseUrl ? publicDemoUrl(publicBaseUrl, slug) : null;
  const manifest: ProspectDemoBundleManifest = {
    schemaVersion: 1,
    kind: "amc.demo.prospect.share",
    slug,
    generatedTs: input.now ?? Date.now(),
    trustLabel: "DEMO_ONLY",
    claimBoundary: input.plan.claimBoundary,
    liveEvidenceIncluded: Boolean(input.plan.liveResult),
    liveEvidenceWorkspace: input.plan.liveResult?.evidenceWorkspace ?? null,
    maturityScore: input.plan.sampleScore.maturityScore,
    maturityLevel: input.plan.sampleScore.maturityLevel,
    htmlSha256: sha256Hex(html),
    demoJsonSha256: sha256Hex(demoJson),
    localUrl,
    publicUrl,
    sources: [FTC_ADVERTISING_BASICS_URL],
    files: {
      html: "index.html",
      manifest: "demo-manifest.json"
    }
  };

  ensureDir(dir);
  writeFileAtomic(htmlPath, html, 0o644);
  writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
  return {
    slug,
    dir,
    htmlPath,
    manifestPath,
    shareUrl: publicUrl ?? localUrl,
    manifest
  };
}
