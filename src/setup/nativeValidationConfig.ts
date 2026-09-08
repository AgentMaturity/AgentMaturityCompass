import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import type { NativeValidationPlan } from "../agent/nativeValidation.js";

export interface LoadedNativeValidationConfiguration {
  readonly path: string;
  readonly sha256: string;
  readonly config: { readonly schemaVersion: 1; readonly checks: NativeValidationPlan["checks"] };
}
export class NativeValidationConfigError extends Error {}
const refuse = (message: string): never => { throw new NativeValidationConfigError(message); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const sameFile = (a: ReturnType<typeof lstatSync>, b: ReturnType<typeof lstatSync>) =>
  ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every(key => a[key as keyof typeof a] === b[key as keyof typeof b]);
const LIMIT = 32 * 1024;

/** Explicit operator input, captured once; no discovery, execution or tool grants. */
export function loadNativeValidationConfiguration(path: string, expectedSha256?: string): LoadedNativeValidationConfiguration {
  const absolute = resolve(path);
  let bytes: Buffer;
  try {
    const linked = lstatSync(absolute);
    if (!linked.isFile() || linked.isSymbolicLink() || linked.size > LIMIT) return refuse("Validation config must be a regular JSON file no larger than 32 KiB.");
    if (typeof constants.O_NOFOLLOW !== "number") return refuse("This platform cannot safely open the explicit validation config file.");
    const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || !sameFile(linked, before) || before.size > LIMIT) return refuse("Validation config changed while being read.");
      const buffer = Buffer.alloc(before.size + 1); let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length !== before.size || !sameFile(before, fstatSync(fd)) || !sameFile(before, lstatSync(absolute))) return refuse("Validation config changed while being read.");
      bytes = buffer.subarray(0, length);
    } finally { closeSync(fd); }
  } catch (error) {
    if (error instanceof NativeValidationConfigError) throw error;
    return refuse("Could not read the explicit validation config file.");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined && (!/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== sha256))
    return refuse("Validation configuration changed from its pinned digest. Review it before starting another run.");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return refuse("Validation config must contain valid UTF-8 JSON. File content is withheld."); }
  if (!object(value) || value.schemaVersion !== 1 || !onlyKeys(value, ["schemaVersion", "checks"])
    || !Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 8)
    return refuse("Validation config requires schemaVersion 1 and one through eight public checks.");
  const ids = new Set<string>();
  const checks = value.checks.map(check => {
    if (!object(check) || !onlyKeys(check, ["id", "title", "command", "timeoutMs"])
      || typeof check.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(check.id) || ids.has(check.id)
      || typeof check.title !== "string" || !check.title.trim() || check.title.length > 160 || /[\x00-\x1f\x7f]/.test(check.title)
      || typeof check.command !== "string" || !check.command.trim() || Buffer.byteLength(check.command) > 8192 || check.command.includes("\0"))
      return refuse("Each validation check requires a unique ID, short title and explicit bounded command; unsupported fields are refused.");
    const timeoutMs = check.timeoutMs ?? 120_000;
    if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000)
      return refuse("Validation timeoutMs must be an integer from 1 through 600000.");
    ids.add(check.id);
    return Object.freeze({ id: check.id, title: check.title, command: check.command, timeoutMs });
  });
  return Object.freeze({ path: absolute, sha256, config: Object.freeze({ schemaVersion: 1 as const, checks: Object.freeze(checks) }) });
}

/** File order is not execution authority: only the explicitly selected IDs run. */
export function selectNativeValidationChecks(loaded: LoadedNativeValidationConfiguration, ids: readonly string[]): NativeValidationPlan {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 8 || new Set(ids).size !== ids.length)
    return refuse("Select one through eight distinct public validation check IDs.");
  const checks = ids.map(id => {
    const check = loaded.config.checks.find(candidate => candidate.id === id);
    if (!check) return refuse("A selected validation check is absent from the pinned configuration.");
    return check;
  });
  return Object.freeze({ configSha256: loaded.sha256, checks: Object.freeze(checks) });
}

export function resolveNativeValidationSelection(options: {
  readonly validationConfig?: string; readonly validationConfigSha256?: string; readonly validate?: readonly string[];
}): NativeValidationPlan | undefined {
  if (options.validationConfig === undefined) {
    if (options.validationConfigSha256 !== undefined || options.validate !== undefined)
      return refuse("Validation check selection and digest pins require an explicit validation config file.");
    return undefined;
  }
  return selectNativeValidationChecks(loadNativeValidationConfiguration(options.validationConfig, options.validationConfigSha256), options.validate ?? []);
}
