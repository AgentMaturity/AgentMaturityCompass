#!/usr/bin/env node
/**
 * P0-04: builds the commit-to-slice map for the regulated-platform candidate
 * (docs/program/landing/RUNBOOK.md). It walks <base>..<candidate>, gives each
 * merge's M^1..M^2 commits to the merged track, classifies every commit by the
 * paths `git diff-tree` reports (receipt-only when every path is under AMC_OS/),
 * applies docs/program/landing/slice-rules.json and writes the map as JSON.
 * --check rebuilds the map and exits 1 when it differs from --out or is invalid.
 *
 * Usage: node scripts/program/landing-slice-map.mjs --candidate candidate/head --base origin/main
 *          --rules docs/program/landing/slice-rules.json --out docs/program/landing/slice-map.json [--check]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const RECEIPT_ROOT = "AMC_OS/";
const ACTIONS = new Set(["cherry-pick", "cherry-pick-strip-receipts", "skip-receipt", "regenerate", "record-only"]);
const KINDS = new Set(["code", "mixed", "receipt-only", "merge", "root"]);
const ISSUE_KEY = /^(P[0-3]-\d{2}|ALL)$/;
const REGEN_SLICE = "regen";
const DEFAULT_OVERLAP_RULE = "merge in buildOrder; rebase the later slice onto the merged one and rerun its acceptance";
const REGEN_OVERLAP_RULE = "regenerate: the generator run is each slice's last commit; never hand-merge generated lines";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
const lines = (text) => (text ? text.split("\n") : []);
const touchesReceipts = (paths) => paths.some((p) => p.startsWith(RECEIPT_ROOT));

/** Every commit in base..candidate, parents before children. */
function walk(candidate, base) {
  return lines(git("log", "--topo-order", "--reverse", "--format=%H%x09%P%x09%s", `${base}..${candidate}`)).map((row) => {
    const [sha, parents, subject] = row.split("\t");
    const merge = parents.split(" ").length > 1;
    // --cc lists only the paths a merge resolved differently from every parent.
    const paths = lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", ...(merge ? ["--cc"] : []), sha));
    return { sha, subject, merge, paths, track: null };
  });
}

function mergedBranch(subject) {
  const match = /^Merge (?:remote-tracking )?branch '(?:origin\/)?([^']+)'/.exec(subject);
  if (!match) throw new Error(`cannot read the merged branch from "${subject}"`);
  return match[1];
}

function kindOf(commit) {
  if (commit.merge) return "merge";
  if (commit.track === null) return "root";
  const receipts = commit.paths.filter((p) => p.startsWith(RECEIPT_ROOT)).length;
  if (receipts === 0) return "code";
  return receipts === commit.paths.length ? "receipt-only" : "mixed";
}

function actionOf(kind, paths, ruled) {
  if (kind === "merge") return "record-only";
  if (kind === "receipt-only") return "skip-receipt";
  const action = ruled ?? "cherry-pick";
  return action === "cherry-pick" && touchesReceipts(paths) ? "cherry-pick-strip-receipts" : action;
}

function findOne(commits, prefix, where) {
  const found = commits.filter((c) => c.sha.startsWith(prefix));
  if (found.length !== 1) throw new Error(`${where}: ${prefix} matches ${found.length} commits in the range`);
  return found[0];
}

function checkRuleSlice(rule, slices, where) {
  const slice = slices.get(rule.slice);
  if (!slice) throw new Error(`${where}: unknown slice ${rule.slice}`);
  if (rule.issue !== slice.issue || rule.phase !== slice.phase) {
    throw new Error(`${where}: issue/phase ${rule.issue}/${rule.phase} differ from slice ${slice.id} (${slice.issue}/${slice.phase})`);
  }
}

/** @returns {object} the slice map (schema in docs/program/landing/RUNBOOK.md) */
function buildSliceMap({ candidate, base, rules }) {
  const head = git("rev-parse", "--verify", `${candidate}^{commit}`);
  const walked = walk(head, base);
  const slices = new Map(rules.slices.map((s) => [s.id, s]));
  const byBranch = new Map(rules.rules.filter((r) => r.branch).map((r) => [r.branch, r]));
  const bySha = rules.rules.filter((r) => r.sha);
  const used = new Set();
  const tracks = [];
  const ruled = new Map();

  for (const merge of walked.filter((c) => c.merge)) {
    const branch = mergedBranch(merge.subject);
    const rule = byBranch.get(branch);
    if (!rule) throw new Error(`no rule for merged branch ${branch} (${merge.sha})`);
    checkRuleSlice(rule, slices, branch);
    used.add(rule);
    const [first, second] = git("rev-parse", `${merge.sha}^1`, `${merge.sha}^2`).split("\n");
    const own = new Set(lines(git("rev-list", `${first}..${second}`)));
    for (const commit of walked) {
      if (own.has(commit.sha) && commit.track === null && !commit.merge) {
        commit.track = rule.track;
        ruled.set(commit.sha, rule);
      }
    }
    merge.track = rule.track;
    ruled.set(merge.sha, rule);
    const acceptedHead = rule.acceptedHead ? findOne(walked.filter((c) => own.has(c.sha)), rule.acceptedHead, branch).sha : null;
    tracks.push({
      track: rule.track, branch, head: second, acceptedHead, mergeCommit: merge.sha,
      base: git("merge-base", first, second), verdict: rule.verdict, verdictFile: rule.verdictFile, slice: rule.slice
    });
  }

  for (const rule of bySha) {
    const commit = findOne(walked, rule.sha, `rule ${rule.sha}`);
    checkRuleSlice(rule, slices, rule.sha);
    if (commit.merge) throw new Error(`rule ${rule.sha}: merges are ruled by branch`);
    if (rule.track !== commit.track) throw new Error(`rule ${rule.sha}: track ${rule.track} but the commit came in on ${commit.track}`);
    ruled.set(commit.sha, rule);
    used.add(rule);
  }
  const unused = rules.rules.filter((r) => !used.has(r));
  if (unused.length > 0) throw new Error(`rules match nothing: ${unused.map((r) => r.branch ?? r.sha).join(", ")}`);

  const commits = walked.map((c) => {
    const kind = kindOf(c);
    const rule = ruled.get(c.sha);
    if (!rule) throw new Error(`no rule for ${kind} commit ${c.sha} (${c.subject})`);
    const slice = slices.get(rule.slice);
    return {
      sha: c.sha, subject: c.subject, track: c.track, kind, slice: slice.id, issue: slice.issue,
      action: actionOf(kind, c.paths, c.merge ? undefined : rule.action), paths: c.paths
    };
  });

  return {
    schemaVersion: 1,
    candidate: {
      ref: rules.candidateRef, head, base: git("merge-base", base, head),
      commitsAhead: commits.length, merges: commits.filter((c) => c.kind === "merge").length
    },
    slices: [...slices.values()].sort((a, b) => a.buildOrder - b.buildOrder).map((s) => ({
      id: s.id, issue: s.issue, phase: s.phase,
      tracks: [...new Set(commits.filter((c) => c.slice === s.id && c.track).map((c) => c.track))].sort(),
      buildOrder: s.buildOrder
    })),
    tracks,
    commits,
    overlaps: overlaps(commits, rules.overlaps ?? [], slices)
  };
}

/** Product paths that more than one slice touches, extended by the rules' named overlaps. */
function overlaps(commits, named, slices) {
  const touched = new Map();
  for (const c of commits) {
    if (c.kind === "merge") continue;
    for (const path of c.paths) {
      if (path.startsWith(RECEIPT_ROOT)) continue;
      if (!touched.has(path)) touched.set(path, new Set());
      touched.get(path).add(c.slice);
    }
  }
  const order = (id) => slices.get(id).buildOrder;
  const ruleFor = new Map(named.map((o) => [o.path, o]));
  const paths = new Set([...named.map((o) => o.path), ...[...touched].filter(([, s]) => s.size > 1).map(([p]) => p)]);
  return [...paths].sort().map((path) => {
    const candidateSlices = [...(touched.get(path) ?? [])].sort((a, b) => order(a) - order(b));
    const fallbackIssues = [...new Set(candidateSlices.map((id) => slices.get(id).issue))].filter((i) => i !== "ALL");
    const rule = ruleFor.get(path);
    return {
      path, candidateSlices,
      issues: rule?.issues ?? fallbackIssues,
      rule: rule?.rule ?? (candidateSlices.includes(REGEN_SLICE) ? REGEN_OVERLAP_RULE : DEFAULT_OVERLAP_RULE)
    };
  });
}

/** Structural checks on a map; returns the problems found (empty when valid). */
export function validateSliceMap(map) {
  const errors = [];
  if (map.schemaVersion !== 1) errors.push(`schemaVersion ${map.schemaVersion}, expected 1`);
  const { commits, slices, tracks, candidate } = map;
  if (commits.length !== candidate.commitsAhead) errors.push(`${commits.length} commits, expected ${candidate.commitsAhead}`);
  const merges = commits.filter((c) => c.kind === "merge").length;
  if (merges !== candidate.merges) errors.push(`${merges} merges, expected ${candidate.merges}`);

  const sliceById = new Map();
  const orders = new Set();
  for (const s of slices) {
    if (sliceById.has(s.id)) errors.push(`duplicate slice ${s.id}`);
    if (orders.has(s.buildOrder)) errors.push(`duplicate buildOrder ${s.buildOrder}`);
    if (!ISSUE_KEY.test(s.issue)) errors.push(`slice ${s.id}: unknown issue ${s.issue}`);
    sliceById.set(s.id, s);
    orders.add(s.buildOrder);
  }

  const seen = new Map();
  for (const c of commits) {
    if (seen.has(c.sha)) errors.push(`duplicate commit ${c.sha}`);
    seen.set(c.sha, c);
    const slice = sliceById.get(c.slice);
    if (!slice) errors.push(`commit ${c.sha}: unknown slice ${c.slice}`);
    else if (c.issue !== slice.issue) errors.push(`commit ${c.sha}: issue ${c.issue} is not slice ${slice.id}'s issue ${slice.issue}`);
    if (!KINDS.has(c.kind)) errors.push(`commit ${c.sha}: unknown kind ${c.kind}`);
    if (!ACTIONS.has(c.action)) errors.push(`commit ${c.sha}: unknown action ${c.action}`);
    if (c.kind === "merge" && c.action !== "record-only") errors.push(`merge ${c.sha} must be record-only, never cherry-picked`);
    if (c.kind === "receipt-only" && c.action !== "skip-receipt") {
      errors.push(`receipt-only commit ${c.sha} must be skip-receipt, not ${c.action}`);
    }
    if (c.action === "cherry-pick" && touchesReceipts(c.paths)) {
      errors.push(`commit ${c.sha} carries AMC_OS paths; use cherry-pick-strip-receipts`);
    }
  }

  for (const t of tracks) {
    if (seen.get(t.head)?.track !== t.track) errors.push(`track ${t.track}: head ${t.head} is not one of its commits`);
    if (seen.get(t.mergeCommit)?.kind !== "merge") errors.push(`track ${t.track}: ${t.mergeCommit} is not a merge in the map`);
    if (!sliceById.has(t.slice)) errors.push(`track ${t.track}: unknown slice ${t.slice}`);
  }
  return errors;
}

const serialize = (map) => `${JSON.stringify(map, null, 2)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      candidate: { type: "string" }, base: { type: "string" }, rules: { type: "string" },
      out: { type: "string" }, check: { type: "boolean", default: false }
    }
  });
  const missing = ["candidate", "base", "rules", "out"].filter((name) => !values[name]);
  if (missing.length > 0) {
    console.error(`Missing --${missing.join(", --")}.`);
    process.exit(2);
  }
  let map;
  try {
    map = buildSliceMap({ candidate: values.candidate, base: values.base, rules: JSON.parse(readFileSync(values.rules, "utf8")) });
  } catch (error) {
    console.error(`slice map not built: ${error.message}`);
    process.exit(1);
  }
  const errors = validateSliceMap(map);
  for (const error of errors) console.error(error);
  const summary = `${map.commits.length} commits, ${map.candidate.merges} merges, ${map.slices.length} slices, ${map.overlaps.length} overlaps`;
  if (errors.length > 0) {
    console.error(`slice map invalid: ${errors.length} problem(s).`);
    process.exit(1);
  }
  if (values.check) {
    const committed = existsSync(values.out) ? readFileSync(values.out, "utf8") : "";
    if (committed !== serialize(map)) {
      console.error(`${values.out} differs from the map rebuilt from ${map.candidate.head} (${summary}). Rerun without --check.`);
      process.exit(1);
    }
    console.log(`${values.out} matches ${map.candidate.head}: ${summary}.`);
  } else {
    writeFileSync(values.out, serialize(map));
    console.log(`Wrote ${values.out}: ${summary}.`);
  }
}
