import {
  lstatSync,
  readdirSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { posix, relative, resolve, sep } from "node:path";

export interface TarArchiveLimits {
  maxEntries: number;
  maxCompressedBytes: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxPathBytes: number;
}

export interface TarArchiveInspection {
  members: string[];
  totalBytes: number;
  compressedBytes: number;
}

const MONTH = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function tarCommand(args: string[], label: string): string {
  const output = spawnSync("tar", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (output.status !== 0) {
    throw new Error(`${label}: ${(`${output.stdout ?? ""}${output.stderr ?? ""}`).trim()}`);
  }
  return String(output.stdout ?? "");
}

export function assertSafeTarMemberPath(input: {
  rawPath: string;
  label: string;
  maxPathBytes: number;
}): string {
  const { rawPath, label, maxPathBytes } = input;
  if (
    !rawPath
    || /[\u0000-\u001f\u007f]/.test(rawPath)
    || rawPath.includes("\\")
    || Buffer.byteLength(rawPath, "utf8") > maxPathBytes
  ) {
    throw new Error(`${label} contains an unsafe member path: ${JSON.stringify(rawPath)}`);
  }
  if (rawPath.startsWith("/") || /^[A-Za-z]:/.test(rawPath)) {
    throw new Error(`${label} contains an absolute member path: ${rawPath}`);
  }
  const portablePath = rawPath.replace(/\/+$/, "");
  const normalized = posix.normalize(portablePath);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || normalized !== portablePath
    || normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} member escapes the extraction root: ${rawPath}`);
  }
  return normalized;
}

function parseVerboseSize(row: string, label: string): number {
  const tokens = row.trim().split(/\s+/);
  const dateIndex = tokens.findIndex((token, index) => index > 0 && (MONTH.test(token) || ISO_DATE.test(token)));
  if (dateIndex < 1) {
    throw new Error(`${label} member size could not be parsed safely`);
  }
  const rawSize = tokens[dateIndex - 1];
  if (!/^\d+$/.test(rawSize ?? "")) {
    throw new Error(`${label} member size is invalid`);
  }
  const size = Number(rawSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`${label} member size is outside the supported range`);
  }
  return size;
}

export function inspectTarGzipArchive(input: {
  file: string;
  label: string;
  limits: TarArchiveLimits;
}): TarArchiveInspection {
  const file = resolve(input.file);
  const compressedBytes = statSync(file).size;
  if (compressedBytes > input.limits.maxCompressedBytes) {
    throw new Error(`${input.label} compressed size exceeds the ${input.limits.maxCompressedBytes}-byte limit`);
  }

  const members = tarCommand(["-tzf", file], `failed to list ${input.label}`)
    .split(/\r?\n/)
    .filter((entry) => entry.length > 0);
  if (members.length === 0 || members.length > input.limits.maxEntries) {
    throw new Error(`${input.label} has an invalid member count: ${members.length}`);
  }

  const normalizedMembers = members.map((rawPath) => assertSafeTarMemberPath({
    rawPath,
    label: input.label,
    maxPathBytes: input.limits.maxPathBytes,
  }));
  if (new Set(normalizedMembers).size !== normalizedMembers.length) {
    throw new Error(`${input.label} contains duplicate member paths`);
  }

  const rows = tarCommand(["-tvzf", file], `failed to inspect ${input.label}`)
    .split(/\r?\n/)
    .filter((entry) => entry.length > 0);
  if (rows.length !== members.length) {
    throw new Error(`${input.label} type listing does not match its member listing`);
  }

  let totalBytes = 0;
  for (const row of rows) {
    const type = row[0];
    if (type !== "-" && type !== "d") {
      throw new Error(`${input.label} contains an unsupported link or special archive type: ${type ?? "unknown"}`);
    }
    const size = parseVerboseSize(row, input.label);
    if (size > input.limits.maxEntryBytes) {
      throw new Error(`${input.label} member size exceeds the ${input.limits.maxEntryBytes}-byte limit`);
    }
    totalBytes += size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > input.limits.maxTotalBytes) {
      throw new Error(`${input.label} uncompressed size exceeds the ${input.limits.maxTotalBytes}-byte limit`);
    }
  }

  return { members: normalizedMembers, totalBytes, compressedBytes };
}

function verifyExtractedTree(root: string, label: string, limits: TarArchiveLimits): void {
  const resolvedRoot = resolve(root);
  let entries = 0;
  let totalBytes = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      entries += 1;
      if (entries > limits.maxEntries) {
        throw new Error(`${label} extracted entry count exceeds the ${limits.maxEntries}-entry limit`);
      }
      const path = resolve(dir, entry.name);
      const rel = relative(resolvedRoot, path);
      if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
        throw new Error(`${label} extracted outside its destination root`);
      }
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
        throw new Error(`${label} extracted an unsupported link or special entry`);
      }
      if (metadata.isDirectory()) {
        walk(path);
      } else {
        totalBytes += metadata.size;
        if (metadata.size > limits.maxEntryBytes || totalBytes > limits.maxTotalBytes) {
          throw new Error(`${label} extracted size exceeds its configured byte limits`);
        }
      }
    }
  };
  walk(resolvedRoot);
}

export function extractValidatedTarGzipArchive(input: {
  file: string;
  destination: string;
  label: string;
  limits: TarArchiveLimits;
}): TarArchiveInspection {
  const inspection = inspectTarGzipArchive(input);
  const destination = resolve(input.destination);
  tarCommand(
    ["--no-same-owner", "--no-same-permissions", "-xzf", resolve(input.file), "-C", destination],
    `failed to extract ${input.label}`,
  );
  verifyExtractedTree(destination, input.label, input.limits);
  return inspection;
}
