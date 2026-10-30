#!/usr/bin/env node
// Generates docs/PLATFORM_MATRIX.md from platform-lane receipts (P2-06). Nothing in the matrix is typed by hand.
//
//   node scripts/gen-platform-matrix.mjs --receipts <dir> --commit <sha> [--out docs/PLATFORM_MATRIX.md] [--check]
//
// <dir> holds one folder per lane run with lane.json (amc.platform-lane/1) and doctor.json (`amc doctor --json`).
// lane.kind "platform" adds report.json (scripts/qualify-platform.mjs); "desktop" adds desktop.json
// (`npm run package:desktop:verify`); "gui" has gui.json (the manual docs/deploy/reference/GUI_CHECKLIST.md receipt).
// A lane is "qualified" only with a passing receipt for the same commit; another commit's receipt is "not run".
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const NODE_MAJORS = [22, 24];
const PLATFORMS = [
  { id: "linux-x64", label: "Linux AMD64", desktop: false },
  { id: "linux-arm64", label: "Linux ARM64", desktop: false },
  { id: "darwin-arm64", label: "macOS ARM64", desktop: true },
  { id: "win32-x64", label: "Windows x64", desktop: true }
];
export const STATUS = { qualified: "qualified", notQualified: "not qualified", inconclusive: "inconclusive (unsupported Node)", notRun: "not run",
  refused: "refused by design" };

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** Every lane folder under `dir` (empty when the directory does not exist). */
export function loadLanes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const folder = join(dir, entry.name);
    return { folder: entry.name, lane: readJson(join(folder, "lane.json")), report: readJson(join(folder, "report.json")),
      doctor: readJson(join(folder, "doctor.json")), desktop: readJson(join(folder, "desktop.json")), gui: readJson(join(folder, "gui.json")) };
  }).filter((entry) => entry.lane?.schema === "amc.platform-lane/1");
}

const nativeModulesPass = (doctor) => doctor?.checks?.some((check) => check.id === "native-modules" && check.status === "PASS") === true;

/** Status of one platform and Node major: the best-ranked receipt for `commit` decides; none for it is "not run". */
export function laneStatus(lanes, commit, platformId, nodeMajor) {
  const runs = lanes.filter(({ lane }) => lane.kind === "platform" && `${lane.platform}-${lane.arch}` === platformId && lane.nodeMajor === nodeMajor);
  const current = runs.filter(({ lane, report }) => lane.commit === commit && report?.sourceCommit === commit);
  if (current.length === 0) return { status: STATUS.notRun, evidence: null };
  const rank = (run) => {
    if (!NODE_MAJORS.includes(nodeMajor) || run.report.supportedNode !== true) return { status: STATUS.inconclusive, why: "unsupported Node" };
    if (run.report.status !== "passed") return { status: STATUS.notQualified, why: `platform qualification ${run.report.status}` };
    if (!nativeModulesPass(run.doctor)) return { status: STATUS.notQualified, why: "doctor native-modules did not PASS" };
    return { status: STATUS.qualified, why: null };
  };
  const order = [STATUS.qualified, STATUS.notQualified, STATUS.inconclusive];
  const best = current.map((run) => ({ run, ...rank(run) })).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
  return { status: best.status, why: best.why, evidence: best.run.folder };
}

/** Desktop installer (package:desktop + verify) and GUI checklist status for one desktop platform. */
export function desktopStatus(lanes, commit, platformId, field) {
  const runs = lanes.filter(({ lane }) => lane.kind === field && `${lane.platform}-${lane.arch}` === platformId && lane.commit === commit);
  if (runs.length === 0) return { status: STATUS.notRun, evidence: null };
  const passed = runs.find((run) => run[field]?.status === "passed" && (field === "gui" || nativeModulesPass(run.doctor)));
  return passed ? { status: STATUS.qualified, evidence: passed.folder } : { status: STATUS.notQualified, evidence: runs[0].folder };
}

const cell = (result) => result.evidence ? `${result.status} (\`${result.evidence}\`${result.why ? `; ${result.why}` : ""})` : result.status;

export function renderMatrix({ lanes, commit, source }) {
  const rows = PLATFORMS.map((platform) => {
    const node = NODE_MAJORS.map((major) => cell(laneStatus(lanes, commit, platform.id, major)));
    const desktop = platform.desktop ? cell(desktopStatus(lanes, commit, platform.id, "desktop")) : "n/a";
    const gui = platform.desktop ? cell(desktopStatus(lanes, commit, platform.id, "gui")) : "n/a";
    const shell = platform.id === "win32-x64" ? `${STATUS.refused} (until P2-14)` : "not evaluated by these lanes";
    return `| ${platform.label} | ${node.join(" | ")} | ${desktop} | ${gui} | ${shell} |`;
  });
  return [
    "# Platform matrix",
    "",
    "<!-- Generated by scripts/gen-platform-matrix.mjs from platform-lane receipts. Do not edit by hand. -->",
    "",
    `Commit: \`${commit}\`. Receipts: \`${source}\` (${lanes.length} lane run(s) found).`,
    "",
    "A cell is \"qualified\" only when a lane receipt for this commit passed `npm run qualify:platform` and `amc doctor --json` reported `native-modules` PASS.",
    "A receipt from another commit counts as \"not run\". A Node major other than 22 or 24 is \"inconclusive (unsupported Node)\".",
    "Desktop installer cells need `npm run package:desktop` and `npm run package:desktop:verify` on that platform; GUI cells need the manual",
    "receipt from docs/deploy/reference/GUI_CHECKLIST.md. How lanes run: docs/PLATFORM_QUALIFICATION.md.",
    "",
    `| Platform | Node ${NODE_MAJORS[0]} | Node ${NODE_MAJORS[1]} | Desktop installer | GUI launcher (manual) | Native shell |`,
    "|---|---|---|---|---|---|",
    ...rows,
    ""
  ].join("\n");
}

function parseArgs(argv) {
  const opts = { out: "docs/PLATFORM_MATRIX.md", check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") opts.check = true;
    else if (["--receipts", "--commit", "--out"].includes(argv[i])) opts[argv[i].slice(2)] = argv[(i += 1)];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!opts.receipts || !/^[0-9a-f]{40}$/.test(opts.commit ?? "")) throw new Error("--receipts <dir> and --commit <40-hex sha> are required");
  return opts;
}

if (isEntrypoint(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const text = renderMatrix({ lanes: loadLanes(resolve(opts.receipts)), commit: opts.commit, source: relative(process.cwd(), resolve(opts.receipts)) });
    if (opts.check) {
      const current = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : "";
      if (current !== text) { console.error(`${opts.out} is stale; regenerate it with the same --receipts and --commit`); process.exitCode = 1; }
    } else {
      writeFileSync(opts.out, text);
      console.log(`wrote ${opts.out}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
