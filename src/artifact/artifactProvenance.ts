import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { z } from "zod";
import {
  getSigningKey,
  getPublicKeyPem,
  signHexDigest
} from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { SIGNING_ALGORITHMS, canonicalSigningKey, signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertKeysetComplete, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, getSigningPublicKeyPem, readHistory } from "../keys/signingKeys.js";
import { assertKeyNotRevoked } from "../keys/keyRevocations.js";
import { builtInDistrust } from "../trust/builtInDistrust.js";
import { vaultStatus } from "../vault/vault.js";
import { distrustAt } from "../trust/admissionRule.js";
import { normalizePathForManifest, mediaTypeFromFile, defaultManifestPath, defaultSignaturePath, computePromptDigest, normalizeEvidenceRefs,
  buildChain, validateChain, buildC2paSection, recordArtifactEvidence, captureProvenanceFile, assertProvenanceFile, assertDistinctProvenanceFiles,
  withProvenanceFiles, assertSelectedProvenanceEvidence, ArtifactProvenancePublicationError } from "./artifactProvenanceSupport.js";
export { ArtifactProvenancePublicationError } from "./artifactProvenanceSupport.js";

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

const artifactProvenanceLegacySignatureSchema = z.object({
  schemaVersion: z.literal(1),
  signer: z.literal("monitor"),
  signedTs: z.number().int().nonnegative(),
  manifestSha256: hexDigestSchema,
  keyFingerprint: hexDigestSchema,
  signature: z.string().min(1)
});

const artifactProvenanceReceiptSignatureSchema = z.strictObject({
  schemaVersion: z.literal(2), signer: z.literal("receipt"), signedTs: z.number().int().nonnegative(), manifestSha256: hexDigestSchema,
  keyFingerprint: hexDigestSchema, algorithm: z.enum(SIGNING_ALGORITHMS), publicKeyPem: z.string().min(1).max(4096), signature: z.string().min(1)
});
export const artifactProvenanceSignatureSchema = z.union([artifactProvenanceLegacySignatureSchema, artifactProvenanceReceiptSignatureSchema]);

export type ArtifactProvenanceManifest = z.infer<typeof artifactProvenanceManifestSchema>;
export type ArtifactProvenanceSignature = z.infer<typeof artifactProvenanceSignatureSchema>;

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

function prepareArtifactProvenance(input: SignArtifactProvenanceInput, output?: Buffer, readonlyLookup = false) {
  const workspace = resolve(input.workspace);
  const file = resolve(workspace, input.file);
  if (output === undefined && !pathExists(file)) {
    throw new Error(`artifact file not found: ${file}`);
  }
  const bytes = output ?? readFileSync(file);
  const fileSha256 = sha256Hex(bytes);
  const promptSha256 = computePromptDigest(input);
  if (!promptSha256 && !input.promptRef && !input.promptId) {
    throw new Error("prompt provenance is required (provide prompt text, prompt hash, prompt ref, or prompt id)");
  }
  const evidence = normalizeEvidenceRefs({
    ...input,
    workspace
  }, readonlyLookup);
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
  return { workspace, file, fileSha256, promptSha256, manifestPath, signaturePath, manifest, manifestSha256, evidence };
}

export function signArtifactProvenance(
  input: SignArtifactProvenanceInput
): SignArtifactProvenanceResult {
  const { workspace, file, fileSha256, promptSha256, manifestPath, signaturePath, manifest, manifestSha256 } = prepareArtifactProvenance(input);
  const monitorPublicKey = getPublicKeyPem(workspace, "monitor");
  const signature = artifactProvenanceSignatureSchema.parse({
    schemaVersion: 1,
    signer: "monitor",
    signedTs: Date.now(),
    manifestSha256,
    keyFingerprint: sha256Hex(Buffer.from(monitorPublicKey, "utf8")),
    signature: signHexDigest(manifestSha256, getSigningKey(workspace, "receipt"))
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


function provenanceInput(input: SignArtifactProvenanceInput): SignArtifactProvenanceInput {
  return { ...input, evidenceEventIds: input.evidenceEventIds?.slice(), evidenceRefs: input.evidenceRefs?.map(row => ({ ...row })) };
}
function provenanceMaySign(): void { if (process.env.AMC_NO_SIGN === "1") throw new Error("artifact provenance signing is unavailable in no-sign mode"); }
async function signPreparedArtifactProvenance(input: SignArtifactProvenanceInput, output?: Buffer): Promise<SignArtifactProvenanceResult> {
  provenanceMaySign(); const workspace = resolve(input.workspace), captured = capturePurposePublication(workspace, "receipt");
  const file = resolve(workspace, input.file), manifestPath = resolve(workspace, input.manifestFile ?? defaultManifestPath(file)), signaturePath = resolve(workspace, input.signatureFile ?? defaultSignaturePath(file));
  if (output === undefined && !pathExists(file)) throw new Error("artifact file not found");
  const paths = [file, manifestPath, signaturePath], original = withProvenanceFiles(paths, () => {
    const files = paths.map(captureProvenanceFile); assertDistinctProvenanceFiles(paths, files); return files;
  });
  const prepared = prepareArtifactProvenance({ ...input, workspace, file }, output ?? original[0]!.bytes!, true);
  const monitor = getPublicKeyPem(workspace, "monitor"), signedTs = Date.now();
  const signed = await signWithPurposeKey(workspace, "receipt", Buffer.from(prepared.manifestSha256, "hex"));
  const assertVaultCurrent = () => { if (signed.provider === "file" && !vaultStatus(workspace).unlocked) throw new Error("vault locked; unlock required for artifact provenance publication"); };
  assertVaultCurrent();
  const legacy = signed.provider === "file" && signed.algorithm === "ed25519" && canonicalSigningKey(monitor)?.pem === monitor && signed.publicKeyPem === monitor;
  const signature = artifactProvenanceSignatureSchema.parse({ schemaVersion: legacy ? 1 : 2, signer: legacy ? "monitor" : "receipt", signedTs,
    manifestSha256: prepared.manifestSha256, keyFingerprint: signed.keyId, signature: signed.signature.toString("base64"),
    ...(legacy ? {} : { algorithm: signed.algorithm, publicKeyPem: signed.publicKeyPem }) });
  const manifestBytes = `${canonicalize(prepared.manifest)}\n`, signatureBytes = `${canonicalize(signature)}\n`, published: string[] = [];
  let phase = "files", attemptedPath: string | null = null, evidenceState: "not-started" | "attempted" = "not-started";
  try {
    withProvenanceFiles(paths, () => {
      provenanceMaySign(); assertVaultCurrent(); assertPurposePublicationCurrent(workspace, captured, signed);
      paths.forEach((path, index) => assertProvenanceFile(path, original[index]!)); assertDistinctProvenanceFiles(paths, original);
      assertSelectedProvenanceEvidence(workspace, prepared.evidence.usedLedgerRefs);
      if (output !== undefined) { phase = "artifact"; attemptedPath = file; writeFileAtomic(file, output, 0o644); published.push(file); }
      phase = "manifest"; attemptedPath = manifestPath; writeFileAtomic(manifestPath, manifestBytes, 0o644); published.push(manifestPath);
      phase = "signature"; attemptedPath = signaturePath; writeFileAtomic(signaturePath, signatureBytes, 0o644); published.push(signaturePath);
    });
    attemptedPath = null;
    if (input.recordEvidence ?? true) {
      phase = "record-evidence"; evidenceState = "attempted";
      recordArtifactEvidence({ workspace, subjectPath: prepared.manifest.subject.path, subjectSha256: prepared.manifest.subject.sha256,
        manifestPath, signaturePath, manifestSha256: prepared.manifestSha256, agentId: prepared.manifest.assertions.agent.agentId,
        modelId: prepared.manifest.assertions.model.modelId, promptSha256: prepared.promptSha256 });
    }
  } catch (cause) { if (published.length || attemptedPath !== null) throw new ArtifactProvenancePublicationError([...published], phase, evidenceState, cause, attemptedPath); throw cause; }
  return { file, fileSha256: prepared.fileSha256, manifestPath, signaturePath, manifestSha256: prepared.manifestSha256, manifest: prepared.manifest, signature };
}
/** Used SDK successor: the literal receipt issuer signs the original raw32 manifest digest. */
export async function signArtifactProvenanceAsync(input: SignArtifactProvenanceInput): Promise<SignArtifactProvenanceResult> {
  return signPreparedArtifactProvenance(provenanceInput(input));
}
/** New async output publishes no artifact until its signature/authority/input checks have completed. */
export async function signArtifactOutputAsync(input: SignArtifactOutputInput): Promise<SignArtifactProvenanceResult> {
  const copied = provenanceInput(input), bytes = Buffer.isBuffer(input.output) ? Buffer.from(input.output) : Buffer.from(input.output, "utf8");
  return signPreparedArtifactProvenance(copied, bytes);
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

    const record = signature;
    assertKeysetComplete(workspace);
    const receiptKeys = getPurposeKeyHistory(workspace, "receipt"), bytes = Buffer.from(record.manifestSha256, "hex"), raw = Buffer.from(record.signature, "base64");
    const matching = receiptKeys.filter(pem => verifyWithKey(bytes, pem, raw));
    const distrust = builtInDistrust(), now = Date.now();
    const usable = matching.length > 0 && matching.every(pem => {
      const keyId = signingKeyId(pem); if (keyId === null) return false;
      try { assertKeyNotRevoked(workspace, keysetDeclared(workspace), keyId, "receipt"); return distrustAt(distrust, keyId, now) === undefined; }
      catch { return false; }
    });
    if (!usable || raw.toString("base64") !== record.signature) issues.push({ code: "SIGNATURE_INVALID", message: "manifest receipt-purpose signature verification failed" });
    const localReceipt = record.schemaVersion === 1 && keysetDeclared(workspace)
      ? new Set(readHistory(workspace, "receipt", getSigningPublicKeyPem(workspace, "receipt"))?.entries.filter(entry => entry.source === "local").map(entry => entry.publicKeyPem) ?? []) : null;
    const localMonitor = record.schemaVersion === 1 && keysetDeclared(workspace)
      ? new Set(readHistory(workspace, "ledger-row", getSigningPublicKeyPem(workspace, "ledger-row"))?.entries.filter(entry => entry.source === "local").map(entry => entry.publicKeyPem) ?? []) : null;
    const identity = matching.some(pem => signingKeyId(pem) === record.keyFingerprint && (record.schemaVersion === 1
      ? canonicalSigningKey(pem)?.algorithm === "ed25519" && canonicalSigningKey(pem)?.pem === pem && (localMonitor === null || localMonitor.has(pem)) && (localReceipt === null || localReceipt.has(pem))
      : canonicalSigningKey(pem)?.pem === record.publicKeyPem && canonicalSigningKey(pem)?.algorithm === record.algorithm));
    if (!identity) issues.push({ code: "SIGNER_FINGERPRINT_MISMATCH", message: "signature key identity does not match its verifying receipt-purpose key" });

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
        const ledger = openLedger(workspace, { readonly: true });
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
