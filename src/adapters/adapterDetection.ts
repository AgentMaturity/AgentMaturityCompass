import { spawnSync } from "node:child_process";
import { stripProviderKeys } from "../utils/providerKeys.js";
import { accessSync, constants as fsConstants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { AdapterDefinition } from "./adapterTypes.js";

export interface AdapterDetectionResult {
  adapterId: string;
  installed: boolean;
  command: string | null;
  version: string | null;
  detail: string;
}

const DEFAULT_DETECTION_TIMEOUT_MS = 3_000;
const parseRegexCache = new Map<string, RegExp>();

interface ProbeResult {
  ok: boolean;
  exists: boolean;
  output: string;
  status: number | null;
  errorCode: string | null;
}

/**
 * Ask an UNVETTED binary its version, without handing it anything.
 *
 * The candidates are bare names resolved off PATH (`claude`, `codex`, `sh`), so
 * whatever answers is whatever PATH says it is. `amc adapters list` probes the
 * whole builtin catalogue in one command, which makes this the widest
 * foreign-binary surface in the product.
 *
 * The fence is the same one `probeBinaryVersion` in ../ledger/monitor.ts already
 * documents: strip the provider keys, and give the probe no stdin it could read
 * from. This function had neither, so a probe leaked every provider key in the
 * environment to a program AMC had not yet identified.
 */
function probeVersion(command: string, args: string[], timeoutMs: number): ProbeResult {
  const out = spawnSync(command, args, {
    encoding: "utf8",
    env: stripProviderKeys(process.env),
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const merged = `${out.stdout ?? ""}${out.stderr ?? ""}`.trim();
  const error = out.error as NodeJS.ErrnoException | undefined;
  const errorCode = error?.code ?? null;
  return {
    ok: out.status === 0 && !out.error,
    exists: errorCode !== "ENOENT",
    output: merged,
    status: out.status,
    errorCode
  };
}

const commandExistsCache = new Map<string, boolean>();

function commandExistsInPath(command: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const cacheKey = `${pathEnv}\u0000${command}`;
  const cached = commandExistsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const candidates: string[] = [];
  if (command.includes("/") || isAbsolute(command)) {
    candidates.push(command);
  } else {
    for (const root of pathEnv.split(delimiter)) {
      if (!root) {
        continue;
      }
      candidates.push(join(root, command));
    }
  }

  for (const candidatePath of candidates) {
    try {
      accessSync(candidatePath, fsConstants.X_OK);
      commandExistsCache.set(cacheKey, true);
      return true;
    } catch {
      // continue
    }
  }

  commandExistsCache.set(cacheKey, false);
  return false;
}

export function detectAdapter(definition: AdapterDefinition, options?: { timeoutMs?: number }): AdapterDetectionResult {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DETECTION_TIMEOUT_MS;
  const failedCandidates: string[] = [];
  for (const candidate of definition.detection.commandCandidates) {
    if (!commandExistsInPath(candidate)) {
      continue;
    }
    const probe = probeVersion(candidate, definition.detection.versionArgs, timeoutMs);
    if (!probe.ok) {
      const reason = probe.errorCode ? `error=${probe.errorCode}` : `status=${probe.status ?? "unknown"}`;
      failedCandidates.push(`${candidate}(${reason})`);
      continue;
    }
    const parseRegex = parseRegexCache.get(definition.detection.parseVersionRegex) ?? new RegExp(definition.detection.parseVersionRegex);
    parseRegexCache.set(definition.detection.parseVersionRegex, parseRegex);
    const match = parseRegex.exec(probe.output)?.[1];
    if (definition.detection.requireVersionMatch && !match) {
      return { adapterId: definition.id, installed: true, command: candidate, version: null, detail: `${candidate}: version output did not match the declared format` };
    }
    const version = (match ?? probe.output) || "unknown";
    return {
      adapterId: definition.id,
      installed: true,
      command: candidate,
      version,
      detail: `${candidate} ${version}`
    };
  }
  if (failedCandidates.length > 0) {
    return {
      adapterId: definition.id,
      installed: true,
      command: failedCandidates[0]!.split("(")[0] ?? definition.detection.commandCandidates[0] ?? null,
      version: null,
      detail: `found command(s) but version probe failed: ${failedCandidates.join(", ")}`
    };
  }
  return {
    adapterId: definition.id,
    installed: false,
    command: null,
    version: null,
    detail: `missing commands: ${definition.detection.commandCandidates.join(", ")}`
  };
}
