import { resolveAgentId } from "../fleet/paths.js";
import type { LessonTransferRequest } from "../learning/lessonProvenance.js";
import { assertPromptLessonOutputs, assertPromptLessonsCurrent } from "./promptLessonTransfer.js";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { collectFiles } from "../utils/archiveFiles.js";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonicalize } from "../utils/json.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { promptArchiveBytes } from "./promptArchive.js";
import { capturePromptFiles, publishPromptFiles } from "./promptPublication.js";
import { compilePromptPack } from "./promptCompiler.js";
import {
  promptLintSchema,
  promptPackSchema,
  promptPackSignatureSchema,
  promptProviderAnthropicSchema,
  promptProviderGeminiSchema,
  promptProviderGenericSchema,
  promptProviderOpenAiSchema,
  type PromptLintReport,
  type PromptPack,
  type PromptPackSignature,
  type PromptProviderFiles
} from "./promptPackSchema.js";
import { signPromptPack } from "./promptPackSigner.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolvePromptRoot(tmp: string): string {
  const direct = join(tmp, "amc-prompt");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(tmp, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = join(tmp, entry.name);
    if (pathExists(join(candidate, "pack.json")) && pathExists(join(candidate, "pack.sig"))) {
      return candidate;
    }
  }
  return tmp;
}

function parseProviderFiles(root: string): PromptProviderFiles {
  return {
    openai: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "openai.json"))) as unknown),
    anthropic: promptProviderAnthropicSchema.parse(JSON.parse(readUtf8(join(root, "provider", "anthropic.json"))) as unknown),
    gemini: promptProviderGeminiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "gemini.json"))) as unknown),
    xai: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "xai.json"))) as unknown),
    openrouter: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "openrouter.json"))) as unknown),
    generic: promptProviderGenericSchema.parse(pathExists(join(root, "provider", "generic.json")) ? JSON.parse(readUtf8(join(root, "provider", "generic.json"))) : {
      v: 1,
      systemMessage: readUtf8(join(root, "provider", "openai.json")).length > 0
        ? (JSON.parse(readUtf8(join(root, "provider", "openai.json"))) as { systemMessage: string }).systemMessage
        : ""
    })
  };
}

export interface PromptPackBuildResult {
  outFile: string;
  sha256: string;
  pack: PromptPack;
  signature: PromptPackSignature;
  lint: PromptLintReport;
  providerFiles: PromptProviderFiles;
}

export function buildPromptPackArtifact(params: {
  workspace: string;
  agentId?: string;
  outFile: string;
  lessons?: LessonTransferRequest;
}): PromptPackBuildResult {
  const outFile = resolve(params.outFile);
  assertPromptLessonOutputs(params.workspace, [outFile], params.lessons !== undefined);
  const before = capturePromptFiles([outFile]);
  const agentId = resolveAgentId(params.workspace, params.agentId ?? "default");
  const compiled = compilePromptPack({ workspace: params.workspace, agentId, lessons: params.lessons });
  const signature = promptPackSignatureSchema.parse(signPromptPack(params.workspace, compiled.pack));
  const signerPub = signature.envelope ? Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8") : (getPublicKeyHistory(params.workspace, "auditor")[0] ?? "");
  if (!signerPub) throw new Error("missing signer pubkey for prompt pack");
  const lint = `${canonicalize(promptLintSchema.parse(compiled.lint))}\n`;
  const lintSignature = JSON.stringify(signSerializedPayloadWithAuditor(params.workspace, lint), null, 2);
  const bytes = promptArchiveBytes(compiled, signature, signerPub, lintSignature);
  const assertLessons = () => {
    assertPromptLessonOutputs(params.workspace, [outFile], params.lessons !== undefined);
    assertPromptLessonsCurrent(params.workspace, agentId, compiled.pack.checkpoints.lessonTransfer);
  };
  publishPromptFiles(params.workspace, before, [{ path: outFile, bytes }], assertLessons);
  return { outFile, sha256: sha256Hex(bytes), pack: compiled.pack, signature, lint: compiled.lint, providerFiles: compiled.providerFiles };
}

/** Members a rebuild from unchanged inputs always rewrites (fresh signatures); everything else is what the pack says. */
const SIGNATURE_MEMBERS = new Set(["amc-prompt/pack.sig", "amc-prompt/lint/lint.json.sig", "amc-prompt/lint/lint.sig"]);

/**
 * A digest of what a prompt pack says rather than of its archive bytes: every member except the three signatures, with
 * pack.json read without its build id and build time. A scheduled rebuild from unchanged inputs gives the same digest
 * (only `packId`, `generatedTs`, the signatures and the gzip framing differ); a change to any other byte of any member,
 * an added or a removed member gives another. Bytes that do not extract as an archive answer their own sha256.
 */
export function promptPackContentSha256(bytes: Buffer): string {
  const temp = mkdtempSync(join(tmpdir(), "amc-prompt-content-"));
  try {
    const file = join(temp, "pack.amcprompt"), out = join(temp, "members");
    writeFileSync(file, bytes, { mode: 0o600 });
    mkdirSync(out);
    try {
      tarExtract(file, out);
    } catch {
      return sha256Hex(bytes);
    }
    const members = collectFiles(out).filter((path) => !SIGNATURE_MEMBERS.has(path)).map((path) => {
      const raw = readFileSync(join(out, path));
      if (path !== "amc-prompt/pack.json") return [path, sha256Hex(raw)];
      try {
        const { packId: _packId, generatedTs: _generatedTs, ...rest } = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
        return [path, sha256Hex(canonicalize(rest))];
      } catch {
        return [path, sha256Hex(raw)];
      }
    });
    return sha256Hex(canonicalize({ schema: "amc.prompt-pack-content/v1", members }));
  } finally {
    cleanupDir(temp);
  }
}

export function inspectPromptPackArtifact(file: string): {
  pack: PromptPack;
  signature: PromptPackSignature;
  lint: PromptLintReport | null;
  lintSignature: unknown | null;
  lintDigestSha256: string | null;
  providerFiles: PromptProviderFiles;
  signerPub: string;
  sha256: string;
} {
  const bundle = resolve(file);
  const temp = mkdtempSync(join(tmpdir(), "amc-prompt-inspect-"));
  try {
    tarExtract(bundle, temp);
    const root = resolvePromptRoot(temp);
    const pack = promptPackSchema.parse(JSON.parse(readUtf8(join(root, "pack.json"))) as unknown);
    const signature = promptPackSignatureSchema.parse(JSON.parse(readUtf8(join(root, "pack.sig"))) as unknown);
    const lintPath = join(root, "lint", "lint.json");
    const lintSigPath = join(root, "lint", "lint.sig");
    const lint = pathExists(lintPath) ? promptLintSchema.parse(JSON.parse(readUtf8(lintPath)) as unknown) : null;
    const lintDigestSha256 = pathExists(lintPath) ? sha256Hex(readFileSync(lintPath)) : null;
    const lintSignature = pathExists(lintSigPath) ? JSON.parse(readUtf8(lintSigPath)) : null;
    const providerFiles = parseProviderFiles(root);
    const signerPub = readUtf8(join(root, "signer.pub"));
    return {
      pack,
      signature,
      lint,
      lintDigestSha256,
      lintSignature,
      providerFiles,
      signerPub,
      sha256: sha256Hex(readFileSync(bundle))
    };
  } finally {
    cleanupDir(temp);
  }
}
