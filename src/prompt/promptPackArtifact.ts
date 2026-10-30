import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
    generic: promptProviderGenericSchema.parse({
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
}): PromptPackBuildResult {
  const outFile = resolve(params.outFile), before = capturePromptFiles([outFile]);
  const compiled = compilePromptPack({ workspace: params.workspace, agentId: params.agentId });
  const signature = promptPackSignatureSchema.parse(signPromptPack(params.workspace, compiled.pack));
  const signerPub = signature.envelope ? Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8") : (getPublicKeyHistory(params.workspace, "auditor")[0] ?? "");
  if (!signerPub) throw new Error("missing signer pubkey for prompt pack");
  const lint = `${canonicalize(promptLintSchema.parse(compiled.lint))}\n`;
  const lintSignature = JSON.stringify(signSerializedPayloadWithAuditor(params.workspace, lint), null, 2);
  const bytes = promptArchiveBytes(compiled, signature, signerPub, lintSignature);
  publishPromptFiles(params.workspace, before, [{ path: outFile, bytes }]);
  return { outFile, sha256: sha256Hex(bytes), pack: compiled.pack, signature, lint: compiled.lint, providerFiles: compiled.providerFiles };
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
