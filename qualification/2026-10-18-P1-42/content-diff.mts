// Builds content-diff.json (summary, deep questions, catalogue additions) and content-diff-<station>.json (pack
// questions) for the D-08 reviewers: every pack question and deep question that P1-42 changes, adds, removes or
// restores relative to int. Split per station to stay under the receipt checker's 1 MiB file limit. Run from the
// worktree root:
//   npx tsx qualification/2026-10-18-P1-42/content-diff.mts <int-src-root> <candidate-37c1466b-apply-dir> qualification/2026-10-18-P1-42
// <int-src-root> is `git archive int src | tar -x` with node_modules linked; <apply-dir> holds
// mobility/apply-log.json and education/questions-applied.json read with `git show 37c1466b:AMC_OS/...`.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [intRoot, applyDir, outDir] = process.argv.slice(2).map((p) => resolve(p!));
type Q = { id: string; dimension: string; text: string; regulatoryRef: string; l1: string; l3: string; l5: string; weight: number };
type Pack = { id: string; stationId: string; questions: Q[] };
type Deep = { id: string; station: string; regulation: string; section: string; question: string; source?: { url: string; verified: boolean } };
const load = async (root: string) => ({
  packs: (await import(`${root}/src/domains/industryPacks.ts`)).listIndustryPacks() as Pack[],
  deep: (await import(`${root}/src/domains/deepIndustryPacks.ts`)).getAllDeepIndustryQuestions() as Deep[],
  catalogue: [
    ...(await import(`${root}/src/domains/packs/catalogueEu.ts`)).EU_INSTRUMENTS,
    ...(await import(`${root}/src/domains/packs/catalogueUs.ts`)).US_INSTRUMENTS,
    ...(await import(`${root}/src/domains/packs/catalogueIntl.ts`)).INTL_INSTRUMENTS,
  ] as Array<{ id: string; citation: string; status: string; url?: string }>,
});
const before = await load(intRoot);
const after = await load(process.cwd());
const drops = new Set((JSON.parse(readFileSync("docs/program/f5/drops.json", "utf8")).items as { id: string }[]).map((d) => d.id));

// Per-question dispositions the candidate committed (other stations recorded theirs only in the uncommitted round-2 inputs).
const mergedInto = new Map<string, string>();
const mobilityFlags = new Map<string, string>();
for (const row of JSON.parse(readFileSync(`${applyDir}/mobility/apply-log.json`, "utf8")) as Array<{ id: string; action: string; into?: string; note?: string | null }>) {
  if (row.action === "merge" && row.into) mergedInto.set(row.id, row.into);
  if (row.action === "floor-add") mobilityFlags.set(row.id, "mobility applier added this question to hold the 15-question floor without the orchestrator's ratification");
  else if (row.note?.includes("narrowed")) mobilityFlags.set(row.id, `mobility applier: ${row.note}; not ratified by the orchestrator`);
}
for (const row of JSON.parse(readFileSync(`${applyDir}/education/questions-applied.json`, "utf8")).droppedOrMerged as Array<{ id: string; action: string }>) {
  const m = /^merge -> (\S+)/.exec(row.action);
  if (m) mergedInto.set(row.id, m[1]!);
}

const index = (packs: Pack[]) => new Map(packs.flatMap((p) => p.questions.map((q) => [q.id, { pack: p.id, station: p.stationId, q }] as const)));
const b = index(before.packs), a = index(after.packs);
const same = (x: Q, y: Q) => JSON.stringify(x) === JSON.stringify(y);
const questions: unknown[] = [];
const counts: Record<string, number> = { keep: 0, rewrite: 0, add: 0, merge: 0, "removed-unrecorded": 0, "restored-f5-deferred": 0 };
for (const id of [...new Set([...b.keys(), ...a.keys()])].sort()) {
  const was = b.get(id), now = a.get(id);
  let action: string;
  if (was && now) action = drops.has(id) ? "restored-f5-deferred" : same(was.q, now.q) ? "keep" : "rewrite";
  else if (now) action = "add";
  else action = mergedInto.has(id) ? "merge" : drops.has(id) ? "drop" : "removed-unrecorded";
  counts[action] = (counts[action] ?? 0) + 1;
  if (action === "keep" && !mobilityFlags.has(id)) continue;
  questions.push({
    id, pack: (now ?? was)!.pack, station: (now ?? was)!.station, action,
    ...(mergedInto.has(id) ? { mergedInto: mergedInto.get(id) } : {}),
    ...(mobilityFlags.has(id) ? { flag: mobilityFlags.get(id) } : {}),
    before: was?.q ?? null, after: now?.q ?? null,
    citations: { before: was?.q.regulatoryRef ?? null, after: now?.q.regulatoryRef ?? null },
  });
}
const db = new Map(before.deep.map((q) => [q.id, q])), da = new Map(after.deep.map((q) => [q.id, q]));
const deep = [...new Set([...db.keys(), ...da.keys()])].sort().flatMap((id) => {
  const was = db.get(id), now = da.get(id);
  const strip = (q: Deep | undefined) => (q ? { ...q, contentStatus: undefined } : undefined);
  const action = was && now ? (JSON.stringify(strip(was)) === JSON.stringify(strip(now)) ? "keep" : "rewrite") : now ? "add" : "remove";
  return action === "keep" ? [] : [{ id, station: (now ?? was)!.station, action, before: was ?? null, after: now ?? null,
    citations: { before: was ? `${was.regulation} ${was.section} <${was.source?.url ?? "no source recorded"}>` : null, after: now ? `${now.regulation} ${now.section} <${now.source?.url ?? "no source recorded"}>` : null } }];
});
const cb = new Set(before.catalogue.map((i) => i.id));
const catalogueAdded = after.catalogue.filter((i) => !cb.has(i.id)).map((i) => ({ id: i.id, citation: i.citation, status: i.status, url: i.url ?? null }));

const write = (name: string, value: unknown) => writeFileSync(`${outDir}/${name}`, JSON.stringify(value, null, 1) + "\n");
const stations = [...new Set(questions.map((q) => (q as { station: string }).station))].sort();
for (const station of stations) write(`content-diff-${station}.json`, questions.filter((q) => (q as { station: string }).station === station));
write("content-diff.json", {
  schema: "amc.p1-42.content-diff/1",
  status: "experimental: AI-drafted round-2 content, not reviewed by a qualified expert (D-08); not legal advice",
  base: "int b9866b0fa (pack and deep-question registry before P1-42)",
  note: "Questions F5 proposed to drop are restored (P0-26 defer) and listed as restored-f5-deferred. A removed id is a merge where the candidate's committed apply records name the target (education, mobility); removed-unrecorded ids are merges whose target the candidate recorded only in its uncommitted round-2 inputs. Keep rows are omitted unless flagged. Pack-question rows (id, pack, station, action, before, after, citations) are in the per-station files.",
  counts: { packQuestionsBefore: b.size, packQuestionsAfter: a.size, deepQuestionsBefore: db.size, deepQuestionsAfter: da.size, packActions: counts,
    deepActions: deep.reduce<Record<string, number>>((n, q) => ({ ...n, [q.action]: (n[q.action] ?? 0) + 1 }), {}), catalogueAdded: catalogueAdded.length },
  questionFiles: stations.map((station) => `content-diff-${station}.json`),
  deepQuestions: deep, catalogueAdded,
});
