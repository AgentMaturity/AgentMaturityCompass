import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDomainProof, type DomainProofCheckResult } from "./domainProofCheck.js";
import type { DomainProofDomainId } from "./domainProofArtifact.js";

export interface DomainProofCheckCliOptions {
  workspace: string;
  domain: string;
  manifest: string;
  input: string;
  outFile?: string;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function domainProofCheckCli(options: DomainProofCheckCliOptions): DomainProofCheckResult {
  const manifestPath = resolve(options.workspace, options.manifest);
  const inputPath = resolve(options.workspace, options.input);
  const out = checkDomainProof({
    domain: options.domain as DomainProofDomainId,
    manifest: readJson(manifestPath),
    input: readJson(inputPath),
  });

  if (options.outFile) {
    writeFileSync(resolve(options.workspace, options.outFile), `${JSON.stringify(out.artifact, null, 2)}\n`);
  }

  return out;
}
