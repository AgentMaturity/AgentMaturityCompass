#!/usr/bin/env node
/**
 * P0-34: bind the gated release files to the commit and tag the gate ran on, so the publish job publishes those
 * bytes and nothing rebuilt.
 *
 *   node scripts/release-record.mjs write <dir> --tag vX.Y.Z --commit <sha> --tarball <file>   writes <dir>/record.json
 *   node scripts/release-record.mjs verify <dir> --tag vX.Y.Z --commit <sha>                   exit 1 on any difference
 *   node scripts/release-record.mjs tag vX.Y.Z <sha> [--remote origin]                          exit 1 unless the remote
 *                                                                                               tag still names <sha>
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";

export const RECORD = "record.json";
const SCHEMA = "amc.release-record/1";
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function gatedFiles(dir) {
  return readdirSync(dir).filter((name) => name !== RECORD).sort().map((name) => {
    if (!statSync(join(dir, name)).isFile()) throw new Error(`${join(dir, name)} is not a regular file`);
    return name;
  });
}

export function recordFor(dir, { tag, commit, tarball }) {
  const files = Object.fromEntries(gatedFiles(dir).map((name) => [name, sha256(join(dir, name))]));
  if (!(tarball in files)) throw new Error(`${tarball} is not in ${dir}`);
  return { schema: SCHEMA, tag, commit, version: tag.replace(/^v/, ""), tarball, files };
}

/** Every difference between the directory and its gated record, or [] when they match. */
export function verifyRecord(dir, record, { tag, commit }) {
  const failures = [];
  if (record.schema !== SCHEMA) failures.push(`record schema is ${record.schema}, expected ${SCHEMA}`);
  if (record.tag !== tag) failures.push(`record names tag ${record.tag}, expected ${tag}`);
  if (record.commit !== commit) failures.push(`record names commit ${record.commit}, expected ${commit}`);
  if (record.version !== tag.replace(/^v/, "")) failures.push(`record names version ${record.version}, expected ${tag.replace(/^v/, "")}`);
  if (!record.files?.[record.tarball]) failures.push(`record does not list its tarball ${record.tarball}`);
  for (const [name, digest] of Object.entries(record.files ?? {})) {
    const path = join(dir, name);
    if (!existsSync(path)) failures.push(`${name}: missing`);
    else if (sha256(path) !== digest) failures.push(`${name}: sha256 differs from the gated record`);
  }
  for (const name of gatedFiles(dir)) if (!(name in (record.files ?? {}))) failures.push(`${name}: not in the gated record`);
  return failures;
}

/** The commit a tag names in `git ls-remote` output: the peeled `^{}` entry of an annotated tag, else the tag itself. */
export function peeledTagCommit(listing, tag) {
  const refs = new Map(listing.split("\n").filter(Boolean).map((line) => line.split("\t").reverse()));
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null;
}

function option(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(args) {
  const [command, target] = args;
  const tag = command === "tag" ? target : option(args, "--tag");
  const commit = command === "tag" ? args[2] : option(args, "--commit");
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "") || !/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("a vX.Y.Z tag and a 40-hex commit are required");
  if (command === "write") {
    writeFileSync(join(target, RECORD), `${JSON.stringify(recordFor(target, { tag, commit, tarball: option(args, "--tarball") }), null, 2)}\n`);
    return [];
  }
  if (command === "verify") return verifyRecord(target, JSON.parse(readFileSync(join(target, RECORD), "utf8")), { tag, commit });
  if (command === "tag") {
    const listed = spawnSync("git", ["ls-remote", option(args, "--remote") ?? "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: "utf8" });
    if (listed.status !== 0) return [`git ls-remote failed: ${listed.stderr.trim()}`];
    const named = peeledTagCommit(listed.stdout, tag);
    return named === commit ? [] : [`${tag} names ${named ?? "nothing"}, not the gated commit ${commit}: the tag moved or was re-pointed`];
  }
  throw new Error(`unknown command ${command ?? "(none)"}; use write, verify or tag`);
}

if (isEntrypoint(import.meta.url)) {
  try {
    const failures = main(process.argv.slice(2));
    for (const failure of failures) console.error(`release record: ${failure}`);
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`release record: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
