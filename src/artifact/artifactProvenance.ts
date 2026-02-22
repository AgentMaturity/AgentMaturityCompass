import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { z } from "zod";
import {
  getPrivateKeyPem,
  getPublicKeyHistory,
  getPublicKeyPem,
  signHexDigest,
  verifyHexDigestAny
} from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";

const hexDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const provenanceNodeSchema = z.enum(["artifact", "agent", "model", "prompt", "evidence"]);

export const artifactEvidenceRefSchema = z.object({
  eventId: z.string().min(1),
  eventHash: hexDigestSchema.nullable(),
  note: z.string().min(1).nullable()
});

export const artifactProvenanceEdgeSchema = z.object({
  from: provenanceNodeSchema,
  to: provenanceNodeSchema,
  relation: z.string().min(1)
});

export const artifactProvenanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal("AMC-C2PA-INSPIRED/1"),
  manifestId: z.string().min(1),
  generatedTs: z.number().int().nonnegative(),
  claimGenerator: z.object({
    tool: z.literal("amc"),
    version: z.string().min(1),
    workspace: z.string().min(1)
  }),
  subject: z.object({
    path: z.string().min(1),
    fileName: z.string().min(1),
    mediaType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    sha256: hexDigestSchema
  }),
  assertions: z.object({
    agent: z.object({
      agentId: z.string().min(1),
      sessionId: z.string().nullable(),
      runtime: z.string().nullable()
    }),
    model: z.object({
      modelId: z.string().min(1),
      provider: z.string().nullable()
    }),
    prompt: z.object({
      promptId: z.string().nullable(),
      promptRef: z.string().nullable(),
      promptTextSha256: hexDigestSchema.nullable()
    }),
    evidence: z.object({
      eventIds: z.array(z.string().min(1)),
      refs: z.array(artifactEvidenceRefSchema),
      datasetSha256: hexDigestSchema.nullable()
    })
  }),
  chain: z.array(artifactProvenanceEdgeSchema).min(4),
  c2pa: z.object({
    format: z.literal("application/vnd.c2pa.manifest+json"),
    title: z.string().min(1),
    claimGenerator: z.string().min(1),
    assertions: z.array(z.string().min(1)),
    ingredients: z.array(
      z.object({
        title: z.string().min(1),
        relationship: z.string().min(1),
        sha256: hexDigestSchema
      })
    )
  })
});

export const artifactProvenanceSignatureSchema = z.object({
  schemaVersion: z.literal(1),
  signer: z.literal("monitor"),
  signedTs: z.number().int().nonnegative(),
  manifestSha256: hexDigestSchema,
  keyFingerprint: hexDigestSchema,
  signature: z.string().min(1)
});

export type ArtifactProvenanceManifest = z.infer<typeof artifactProvenanceManifestSchema>;
export type ArtifactProvenanceSignature = z.infer<typeof artifactProvenanceSignatureSchema>;

const REQUIRED_CHAIN_EDGES = [
  { from: "artifact", to: "agent", relation: "generated-by" },
  { from: "agent", to: "model", relation: "executed-with" },
  { from: "model", to: "prompt", relation: "prompted-by" },
  { from: "prompt", to: "evidence", relation: "supported-by" }
] as const;

const TAMPER_CODES = new Set([
  "MISSING_ARTIFACT",
  "MISSING_MANIFEST",
  "MISSING_SIGNATURE",
  "MANIFEST_PARSE_ERROR",
  "SIGNATURE_PARSE_ERROR",
  "ARTIFACT_SHA_MISMATCH",
  "ARTIFACT_SIZE_MISMATCH",
  "MANIFEST_SHA_MISMATCH",
  "SIGNATURE_INVALID",
  "SIGNER_FINGERPRINT_MISMATCH"
]);

export interface SignArtifactProvenanceInput {
  workspace: string;
  file: string;
  agentId: string;
  modelId: string;
  provider?: string;
  sessionId?: string;
  runtime?: string;
  promptText?: string;
  promptId?: string;
  promptRef?: string;
  promptTextSha256?: string;
  evidenceEventIds?: string[];
  evidenceRefs?: Array<{
    eventId: string;
    eventHash?: string;
    note?: string;
  }>;
  evidenceDatasetSha256?: string;
  manifestFile?: string;
  signatureFile?: string;
  recordEvidence?: boolean;
}

export interface SignArtifactOutputInput
  extends Omit<SignArtifactProvenanceInput, "file"> {
  file: string;
  output: string | Buffer;
}

export interface SignArtifactProvenanceResult {
  file: string;
  fileSha256: string;
  manifestPath: string;
  signaturePath: string;
  manifestSha256: string;
  manifest: ArtifactProvenanceManifest;
  signature: ArtifactProvenanceSignature;
}

export interface VerifyArtifactProvenanceInput {
  workspace: string;
  file: string;
  manifestFile?: string;
  signatureFile?: string;
  promptText?: string;
  requireLedgerEvidence?: boolean;
}

export interface ArtifactProvenanceIssue {
  code: string;
  message: string;
}

export interface VerifyArtifactProvenanceResult {
  ok: boolean;
  tampered: boolean;
  fileSha256: string | null;
  manifestPath: string;
  signaturePath: string;
  manifest: ArtifactProvenanceManifest | null;
  signature: ArtifactProvenanceSignature | null;
  issues: ArtifactProvenanceIssue[];
}

function normalizePathForManifest(workspace: string, file: string): string {
  const rel = relative(resolve(workspace), file).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) {
    return file;
  }
  return rel;
}

function mediaTypeFromFile(file: string): string {
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

function defaultManifestPath(file: string): string {
  return `${file}.amcprov.json`;
}

function defaultSignaturePath(file: string): string {
  return `${file}.amcprov.sig.json`;
}

function computePromptDigest(input: SignArtifactProvenanceInput): string | null {
  if (input.promptTextSha256) {
    return input.promptTextSha256;
  }
  if (input.promptText) {
    return sha256Hex(Buffer.from(input.promptText, "utf8"));
  }
  return null;
}

function normalizeEvidenceRefs(input: SignArtifactProvenanceInput): {
  eventIds: string[];
  refs: Array<{ eventId: string; eventHash: string | null; note: string | null }>;
} {
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
    const ledger = openLedger(input.workspace);
    try {
      for (const id of eventIds) {
        const existing = map.get(id);
        if (!existing || existing.eventHash) {
          continue;
        }
        const event = ledger.getEventById(id);
        if (event) {
          existing.eventHash = event.event_hash;
        }
      }
    } finally {
      ledger.close();
    }
  }

  return {
    eventIds: [...eventIds].sort((a, b) => a.localeCompare(b)),
    refs: [...map.values()].sort((a, b) => a.eventId.localeCompare(b.eventId))
  };
}

function buildChain(): ArtifactProvenanceManifest["chain"] {
  return REQUIRED_CHAIN_EDGES.map((edge) => ({
    from: edge.from,
    to: edge.to,
    relation: edge.relation
  }));
}

function validateChain(
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

function buildC2paSection(params: {
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

function recordArtifactEvidence(params: {
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

export function signArtifactProvenance(
  input: SignArtifactProvenanceInput
): SignArtifactProvenanceResult {
  const workspace = resolve(input.workspace);
  const file = resolve(workspace, input.file);
  if (!pathExists(file)) {
    throw new Error(`artifact file not found: ${file}`);
  }
  const bytes = readFileSync(file);
  const fileSha256 = sha256Hex(bytes);
  const promptSha256 = computePromptDigest(input);
  if (!promptSha256 && !input.promptRef && !input.promptId) {
    throw new Error("prompt provenance is required (provide prompt text, prompt hash, prompt ref, or prompt id)");
  }
  const evidence = normalizeEvidenceRefs({
    ...input,
    workspace
  });
  if (evidence.eventIds.length === 0 && evidence.refs.length === 0) {
    throw new Error("at least one evidence reference is required for provenance chain");
  }
  const manifestPath = resolve(
    workspace,
    input.manifestFile ?? defaultManifestPath(file)
  );
  const signaturePath = resolve(
    workspace,
    input.signatureFile ?? defaultSignaturePath(file)
  );

  const manifest = artifactProvenanceManifestSchema.parse({
    schemaVersion: 1,
    profile: "AMC-C2PA-INSPIRED/1",
    manifestId: `aprov_${randomUUID().replace(/-/g, "")}`,
    generatedTs: Date.now(),
    claimGenerator: {
      tool: "amc",
      version: amcVersion,
      workspace
    },
    subject: {
      path: normalizePathForManifest(workspace, file),
      fileName: basename(file),
      mediaType: mediaTypeFromFile(file),
      sizeBytes: bytes.byteLength,
      sha256: fileSha256
    },
    assertions: {
      agent: {
        agentId: input.agentId.trim(),
        sessionId: input.sessionId?.trim() || null,
        runtime: input.runtime?.trim() || null
      },
      model: {
        modelId: input.modelId.trim(),
        provider: input.provider?.trim() || null
      },
      prompt: {
        promptId: input.promptId?.trim() || null,
        promptRef: input.promptRef?.trim() || null,
        promptTextSha256: promptSha256
      },
      evidence: {
        eventIds: evidence.eventIds,
        refs: evidence.refs,
        datasetSha256: input.evidenceDatasetSha256?.trim() || null
      }
    },
    chain: buildChain(),
    c2pa: buildC2paSection({
      filePath: file,
      promptSha: promptSha256,
      promptRef: input.promptRef?.trim() || null,
      evidenceRefs: evidence.refs,
      evidenceDatasetSha256: input.evidenceDatasetSha256?.trim() || null
    })
  });

  const manifestSha256 = sha256Hex(Buffer.from(canonicalize(manifest), "utf8"));
  const monitorPublicKey = getPublicKeyPem(workspace, "monitor");
  const signature = artifactProvenanceSignatureSchema.parse({
    schemaVersion: 1,
    signer: "monitor",
    signedTs: Date.now(),
    manifestSha256,
    keyFingerprint: sha256Hex(Buffer.from(monitorPublicKey, "utf8")),
    signature: signHexDigest(manifestSha256, getPrivateKeyPem(workspace, "monitor"))
  });

  writeFileAtomic(manifestPath, `${canonicalize(manifest)}\n`, 0o644);
  writeFileAtomic(signaturePath, `${canonicalize(signature)}\n`, 0o644);

  if (input.recordEvidence ?? true) {
    recordArtifactEvidence({
      workspace,
      subjectPath: manifest.subject.path,
      subjectSha256: manifest.subject.sha256,
      manifestPath,
      signaturePath,
      manifestSha256,
      agentId: manifest.assertions.agent.agentId,
      modelId: manifest.assertions.model.modelId,
      promptSha256: manifest.assertions.prompt.promptTextSha256
    });
  }

  return {
    file,
    fileSha256,
    manifestPath,
    signaturePath,
    manifestSha256,
    manifest,
    signature
  };
}

export function signArtifactOutput(
  input: SignArtifactOutputInput
): SignArtifactProvenanceResult {
  const workspace = resolve(input.workspace);
  const file = resolve(workspace, input.file);
  const bytes = Buffer.isBuffer(input.output)
    ? input.output
    : Buffer.from(input.output, "utf8");
  writeFileAtomic(file, bytes, 0o644);
  return signArtifactProvenance({
    ...input,
    workspace,
    file
  });
}

export function verifyArtifactProvenance(
  input: VerifyArtifactProvenanceInput
): VerifyArtifactProvenanceResult {
  const workspace = resolve(input.workspace);
  const file = resolve(workspace, input.file);
  const manifestPath = resolve(
    workspace,
    input.manifestFile ?? defaultManifestPath(file)
  );
  const signaturePath = resolve(
    workspace,
    input.signatureFile ?? defaultSignaturePath(file)
  );
  const issues: ArtifactProvenanceIssue[] = [];
  let manifest: ArtifactProvenanceManifest | null = null;
  let signature: ArtifactProvenanceSignature | null = null;
  let fileSha256: string | null = null;

  if (!pathExists(file)) {
    issues.push({
      code: "MISSING_ARTIFACT",
      message: `artifact file not found: ${file}`
    });
  } else {
    fileSha256 = sha256Hex(readFileSync(file));
  }

  if (!pathExists(manifestPath)) {
    issues.push({
      code: "MISSING_MANIFEST",
      message: `provenance manifest not found: ${manifestPath}`
    });
  } else {
    try {
      manifest = artifactProvenanceManifestSchema.parse(
        JSON.parse(readFileSync(manifestPath, "utf8")) as unknown
      );
    } catch (error) {
      issues.push({
        code: "MANIFEST_PARSE_ERROR",
        message: String(error)
      });
    }
  }

  if (!pathExists(signaturePath)) {
    issues.push({
      code: "MISSING_SIGNATURE",
      message: `provenance signature not found: ${signaturePath}`
    });
  } else {
    try {
      signature = artifactProvenanceSignatureSchema.parse(
        JSON.parse(readFileSync(signaturePath, "utf8")) as unknown
      );
    } catch (error) {
      issues.push({
        code: "SIGNATURE_PARSE_ERROR",
        message: String(error)
      });
    }
  }

  if (manifest && pathExists(file)) {
    const actualBytes = readFileSync(file);
    const actualSha256 = sha256Hex(actualBytes);
    if (actualSha256 !== manifest.subject.sha256) {
      issues.push({
        code: "ARTIFACT_SHA_MISMATCH",
        message: `artifact sha256 mismatch: expected ${manifest.subject.sha256}, got ${actualSha256}`
      });
    }
    if (actualBytes.byteLength !== manifest.subject.sizeBytes) {
      issues.push({
        code: "ARTIFACT_SIZE_MISMATCH",
        message: `artifact size mismatch: expected ${manifest.subject.sizeBytes}, got ${actualBytes.byteLength}`
      });
    }
  }

  if (manifest && signature) {
    const recalculatedManifestSha = sha256Hex(
      Buffer.from(canonicalize(manifest), "utf8")
    );
    if (recalculatedManifestSha !== signature.manifestSha256) {
      issues.push({
        code: "MANIFEST_SHA_MISMATCH",
        message: `manifest digest mismatch: expected ${signature.manifestSha256}, got ${recalculatedManifestSha}`
      });
    }

    const monitorKeys = getPublicKeyHistory(workspace, "monitor");
    if (
      !verifyHexDigestAny(
        signature.manifestSha256,
        signature.signature,
        monitorKeys
      )
    ) {
      issues.push({
        code: "SIGNATURE_INVALID",
        message: "manifest signature verification failed"
      });
    }
    const knownFingerprints = new Set(
      monitorKeys.map((pem) => sha256Hex(Buffer.from(pem, "utf8")))
    );
    if (!knownFingerprints.has(signature.keyFingerprint)) {
      issues.push({
        code: "SIGNER_FINGERPRINT_MISMATCH",
        message: "signature key fingerprint does not match monitor key history"
      });
    }

    const missingEdges = validateChain(manifest.chain);
    for (const edge of missingEdges) {
      issues.push({
        code: "CHAIN_EDGE_MISSING",
        message: `missing provenance edge ${edge.from} -> ${edge.to} (${edge.relation})`
      });
    }

    if (
      manifest.assertions.evidence.eventIds.length === 0 &&
      manifest.assertions.evidence.refs.length === 0
    ) {
      issues.push({
        code: "EVIDENCE_LINK_MISSING",
        message: "provenance evidence link is missing"
      });
    }

    const requiredAssertions = new Set([
      "amc.agent",
      "amc.model",
      "amc.prompt",
      "amc.evidence"
    ]);
    for (const label of requiredAssertions) {
      if (!manifest.c2pa.assertions.includes(label)) {
        issues.push({
          code: "C2PA_ASSERTION_MISSING",
          message: `missing c2pa assertion label ${label}`
        });
      }
    }

    if (manifest.c2pa.ingredients.length === 0) {
      issues.push({
        code: "C2PA_INGREDIENTS_EMPTY",
        message: "c2pa ingredients are empty"
      });
    }

    if (input.promptText && manifest.assertions.prompt.promptTextSha256) {
      const providedPromptSha = sha256Hex(Buffer.from(input.promptText, "utf8"));
      if (providedPromptSha !== manifest.assertions.prompt.promptTextSha256) {
        issues.push({
          code: "PROMPT_TEXT_HASH_MISMATCH",
          message: "provided prompt text does not match signed prompt hash"
        });
      }
    }

    if (input.requireLedgerEvidence ?? true) {
      const ledgerPath = resolve(workspace, ".amc", "evidence.sqlite");
      if (!pathExists(ledgerPath)) {
        issues.push({
          code: "LEDGER_UNAVAILABLE",
          message: "ledger not found; cannot verify evidence references"
        });
      } else {
        const ledger = openLedger(workspace);
        try {
          const refById = new Map<string, { eventHash: string | null }>();
          for (const id of manifest.assertions.evidence.eventIds) {
            refById.set(id, { eventHash: null });
          }
          for (const ref of manifest.assertions.evidence.refs) {
            refById.set(ref.eventId, { eventHash: ref.eventHash });
          }

          for (const [eventId, expected] of refById) {
            const event = ledger.getEventById(eventId);
            if (!event) {
              issues.push({
                code: "EVIDENCE_EVENT_MISSING",
                message: `referenced evidence event not found: ${eventId}`
              });
              continue;
            }
            if (expected.eventHash && expected.eventHash !== event.event_hash) {
              issues.push({
                code: "EVIDENCE_EVENT_HASH_MISMATCH",
                message: `event hash mismatch for ${eventId}`
              });
            }
          }
        } finally {
          ledger.close();
        }
      }
    }
  }

  const tampered = issues.some((issue) => TAMPER_CODES.has(issue.code));
  return {
    ok: issues.length === 0,
    tampered,
    fileSha256,
    manifestPath,
    signaturePath,
    manifest,
    signature,
    issues
  };
}

export function detectArtifactTampering(
  input: VerifyArtifactProvenanceInput
): {
  tampered: boolean;
  issues: ArtifactProvenanceIssue[];
  verification: VerifyArtifactProvenanceResult;
} {
  const verification = verifyArtifactProvenance(input);
  return {
    tampered: verification.tampered,
    issues: verification.issues,
    verification
  };
}
