/** Internal provenance helpers. Legacy bodies/order are shared; only async preparation requests readonly lookup. */
import { randomUUID } from "node:crypto";
import { readFileSync, lstatSync, openSync, fstatSync, closeSync, readlinkSync, type Stats } from "node:fs";
import { basename, extname, relative, resolve, dirname } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { amcVersion } from "../version.js";
import type { SignArtifactProvenanceInput, ArtifactProvenanceManifest } from "./artifactProvenance.js";

const REQUIRED_CHAIN_EDGES = [
  { from: "artifact", to: "agent", relation: "generated-by" },
  { from: "agent", to: "model", relation: "executed-with" },
  { from: "model", to: "prompt", relation: "prompted-by" },
  { from: "prompt", to: "evidence", relation: "supported-by" }
] as const;

export function normalizePathForManifest(workspace: string, file: string): string {
  const rel = relative(resolve(workspace), file).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) {
    return file;
  }
  return rel;
}

export function mediaTypeFromFile(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".txt" || ext === ".md" || ext === ".log" || ext === ".csv") {
    return "text/plain";
  }
  if (ext === ".json" || ext === ".amcprov.json") {
    return "application/json";
  }
  if (ext === ".html" || ext === ".htm") {
    return "text/html";
  }
  if (ext === ".pdf") {
    return "application/pdf";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".yaml" || ext === ".yml") {
    return "application/yaml";
  }
  return "application/octet-stream";
}

export function defaultManifestPath(file: string): string {
  return `${file}.amcprov.json`;
}

export function defaultSignaturePath(file: string): string {
  return `${file}.amcprov.sig.json`;
}

export function computePromptDigest(input: SignArtifactProvenanceInput): string | null {
  if (input.promptTextSha256) {
    return input.promptTextSha256;
  }
  if (input.promptText) {
    return sha256Hex(Buffer.from(input.promptText, "utf8"));
  }
  return null;
}

export function normalizeEvidenceRefs(input: SignArtifactProvenanceInput, readonlyLookup = false): {
  eventIds: string[];
  refs: Array<{ eventId: string; eventHash: string | null; note: string | null }>;
  usedLedgerRefs: Array<{ eventId: string; eventHash: string }>;
} {
  const usedLedgerRefs: Array<{ eventId: string; eventHash: string }> = [];
  const eventIds = new Set<string>();
  const map = new Map<string, { eventId: string; eventHash: string | null; note: string | null }>();

  for (const rawId of input.evidenceEventIds ?? []) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    eventIds.add(id);
    if (!map.has(id)) {
      map.set(id, { eventId: id, eventHash: null, note: null });
    }
  }

  for (const ref of input.evidenceRefs ?? []) {
    const eventId = ref.eventId.trim();
    if (!eventId) {
      continue;
    }
    const eventHash = ref.eventHash?.trim() ? ref.eventHash.trim() : null;
    const note = ref.note?.trim() ? ref.note.trim() : null;
    eventIds.add(eventId);
    const existing = map.get(eventId);
    if (!existing) {
      map.set(eventId, { eventId, eventHash, note });
      continue;
    }
    existing.eventHash = existing.eventHash ?? eventHash;
    existing.note = existing.note ?? note;
  }

  if (pathExists(resolve(input.workspace, ".amc", "evidence.sqlite"))) {
    const ledger = openLedger(input.workspace, { readonly: readonlyLookup });
    try {
      for (const id of eventIds) {
        const existing = map.get(id);
        if (!existing || existing.eventHash) {
          continue;
        }
        const event = ledger.getEventById(id);
        if (event) {
          existing.eventHash = event.event_hash;
          usedLedgerRefs.push({ eventId: id, eventHash: event.event_hash });
        }
      }
    } finally {
      ledger.close();
    }
  }

  return {
    usedLedgerRefs,
    eventIds: [...eventIds].sort((a, b) => a.localeCompare(b)),
    refs: [...map.values()].sort((a, b) => a.eventId.localeCompare(b.eventId))
  };
}

export function buildChain(): ArtifactProvenanceManifest["chain"] {
  return REQUIRED_CHAIN_EDGES.map((edge) => ({
    from: edge.from,
    to: edge.to,
    relation: edge.relation
  }));
}

export function validateChain(
  chain: ArtifactProvenanceManifest["chain"]
): Array<{ from: string; to: string; relation: string }> {
  const missing: Array<{ from: string; to: string; relation: string }> = [];
  for (const required of REQUIRED_CHAIN_EDGES) {
    const found = chain.some(
      (edge) =>
        edge.from === required.from &&
        edge.to === required.to &&
        edge.relation === required.relation
    );
    if (!found) {
      missing.push(required);
    }
  }
  return missing;
}

export function buildC2paSection(params: {
  filePath: string;
  promptSha: string | null;
  promptRef: string | null;
  evidenceRefs: Array<{ eventId: string; eventHash: string | null }>;
  evidenceDatasetSha256: string | null;
}): ArtifactProvenanceManifest["c2pa"] {
  const ingredients: ArtifactProvenanceManifest["c2pa"]["ingredients"] = [];
  if (params.promptSha) {
    ingredients.push({
      title: params.promptRef ?? "prompt",
      relationship: "prompt",
      sha256: params.promptSha
    });
  }
  for (const ref of params.evidenceRefs) {
    if (!ref.eventHash) {
      continue;
    }
    ingredients.push({
      title: `evidence:${ref.eventId}`,
      relationship: "input",
      sha256: ref.eventHash
    });
  }
  if (params.evidenceDatasetSha256) {
    ingredients.push({
      title: "evidence-dataset",
      relationship: "input",
      sha256: params.evidenceDatasetSha256
    });
  }
  return {
    format: "application/vnd.c2pa.manifest+json",
    title: basename(params.filePath),
    claimGenerator: `amc/${amcVersion}`,
    assertions: ["amc.agent", "amc.model", "amc.prompt", "amc.evidence"],
    ingredients
  };
}

export function recordArtifactEvidence(params: {
  workspace: string;
  subjectPath: string;
  subjectSha256: string;
  manifestPath: string;
  signaturePath: string;
  manifestSha256: string;
  agentId: string;
  modelId: string;
  promptSha256: string | null;
}): void {
  const ledger = openLedger(params.workspace);
  const sessionId = `artifact-provenance-${randomUUID().replace(/-/g, "")}`;
  const payload = canonicalize({
    file: params.subjectPath,
    sha256: params.subjectSha256,
    manifestSha256: params.manifestSha256,
    manifestPath: normalizePathForManifest(params.workspace, params.manifestPath),
    signaturePath: normalizePathForManifest(params.workspace, params.signaturePath)
  });
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc artifact sign",
      binarySha256: sha256Hex("amc artifact sign")
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "artifact",
      payload,
      payloadExt: "json",
      inline: true,
      meta: {
        agentId: params.agentId,
        modelId: params.modelId,
        promptSha256: params.promptSha256,
        questionId: "AMC-PROV-1",
        provenance: {
          profile: "AMC-C2PA-INSPIRED/1",
          manifestPath: normalizePathForManifest(params.workspace, params.manifestPath),
          signaturePath: normalizePathForManifest(params.workspace, params.signaturePath)
        },
        trustTier: "OBSERVED"
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}


export interface ProvenanceFileSnapshot { bytes: Buffer | null; entry: string | null; target: string | null; mode: number | null }
/** One fd supplies bytes and target identity; an existing dangling/unreadable entry is not absent. */
export function captureProvenanceFile(path: string): ProvenanceFileSnapshot {
  let entry: Stats;
  try { entry = lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { bytes: null, entry: null, target: null, mode: null }; throw error; }
  const descriptor = openSync(path, "r");
  try {
    const target = fstatSync(descriptor);
    if (!target.isFile()) throw new Error("provenance path is not a regular file");
    return { bytes: readFileSync(descriptor), entry: `${entry.dev}:${entry.ino}:${entry.mode}:${entry.isSymbolicLink() ? readlinkSync(path) : ""}`,
      target: `${target.dev}:${target.ino}`, mode: target.mode & 0o777 };
  } finally { closeSync(descriptor); }
}
export function assertProvenanceFile(path: string, expected: ProvenanceFileSnapshot): void {
  const current = captureProvenanceFile(path);
  if (current.entry !== expected.entry || current.target !== expected.target || current.mode !== expected.mode
    || (current.bytes === null ? expected.bytes !== null : expected.bytes === null || !current.bytes.equals(expected.bytes))) throw new Error("provenance input or destination changed while signing");
}
export function assertDistinctProvenanceFiles(paths: readonly string[], files: readonly ProvenanceFileSnapshot[]): void {
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
    if (paths[i] === paths[j] || (files[i]!.target !== null && files[i]!.target === files[j]!.target)) throw new Error("provenance artifact, manifest and signature paths must differ");
  }
}
/** Bounded three-file family locks; all are released before evidence SQL. No await/provider work is allowed inside. */
export function withProvenanceFiles<T>(paths: readonly string[], operation: () => T): T {
  const selected = [...new Set(paths)].sort();
  const next = (index: number): T => index === selected.length ? operation() : withControlFileLock({ root: dirname(selected[index]!),
    name: `artifact-provenance-${sha256Hex(selected[index]!)}`, operation: () => next(index + 1) });
  return next(0);
}
export function assertSelectedProvenanceEvidence(workspace: string, selected: readonly { eventId: string; eventHash: string }[]): void {
  if (!selected.length) return;
  const ledger = openLedger(workspace, { readonly: true });
  try { for (const row of selected) if (ledger.getEventById(row.eventId)?.event_hash !== row.eventHash) throw new Error("selected provenance evidence changed while signing"); }
  finally { ledger.close(); }
}
export class ArtifactProvenancePublicationError extends Error {
  readonly code = "ARTIFACT_PROVENANCE_PUBLICATION_INCOMPLETE";
  readonly evidenceCommitted: null = null;
  readonly failedPathCommitted: null = null;
  constructor(readonly publishedPaths: readonly string[], readonly phase: string, readonly evidenceState: "not-started" | "attempted", cause: unknown, readonly failedPath: string | null = null) {
    super("artifact provenance publication did not complete; inspect the published paths and evidence state", { cause });
    this.name = "ArtifactProvenancePublicationError";
  }
}
