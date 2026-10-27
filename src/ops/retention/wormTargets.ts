/**
 * WORM targets (P2-09b). S3 Object Lock ships first; Azure immutable blobs and GCS bucket lock follow the same
 * `WormTarget` interface. `@aws-sdk/client-s3` is an optional peer loaded only when an S3 target is used; credentials
 * and region come from the SDK's default chain, never from AMC config. `filesystem-test` is a local stand-in for tests
 * and CI: it refuses overwrites and records retention beside each object, but it locks nothing and proves nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import type { WormTarget } from "./wormExport.js";

type S3Operation = "GetObjectLockConfiguration" | "PutObject" | "HeadObject";
/** One S3 API call; tests inject a fake. */
export type S3Call = (operation: S3Operation, input: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function s3Sdk(region: string | undefined): Promise<S3Call> {
  type Sdk = { S3Client: new (config: { region?: string }) => { send(command: unknown): Promise<Record<string, unknown>> } } & Record<string, unknown>;
  let sdk: Sdk;
  try {
    sdk = await import("@aws-sdk/client-s3" as string) as Sdk;
  } catch {
    throw new Error("install @aws-sdk/client-s3 to export to S3 Object Lock");
  }
  const client = new sdk.S3Client(region === undefined ? {} : { region });
  return (operation, input) => client.send(new (sdk[`${operation}Command`] as new (input: Record<string, unknown>) => unknown)(input));
}

function isNotFound(error: unknown): boolean {
  const value = (error ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

/** An S3 bucket with Object Lock. `prefix` is prepended to every key. */
export function s3ObjectLockTarget(p: { bucket: string; prefix?: string; region?: string; call?: S3Call }): WormTarget {
  let s3: Promise<S3Call> | null = p.call ? Promise.resolve(p.call) : null;
  const send = async (operation: S3Operation, input: Record<string, unknown>) => (await (s3 ??= s3Sdk(p.region)))(operation, { Bucket: p.bucket, ...input });
  const key = (name: string) => `${p.prefix ?? ""}${name}`;
  return {
    kind: "s3-object-lock",
    async lockConfiguration() {
      try {
        const answer = await send("GetObjectLockConfiguration", {});
        return { enabled: (answer.ObjectLockConfiguration as { ObjectLockEnabled?: unknown } | undefined)?.ObjectLockEnabled === "Enabled" };
      } catch (error) {
        if ((error as { name?: unknown }).name === "ObjectLockConfigurationNotFoundError") return { enabled: false };
        throw error;
      }
    },
    async putObject(name, body, opts) {
      const answer = await send("PutObject", { Key: key(name), Body: body, ObjectLockMode: opts.mode, ObjectLockRetainUntilDate: opts.retainUntil,
        ChecksumSHA256: Buffer.from(sha256Hex(body), "hex").toString("base64"), IfNoneMatch: "*" });
      return { versionId: typeof answer.VersionId === "string" ? answer.VersionId : null, etag: String(answer.ETag ?? "") };
    },
    async headObject(name) {
      try {
        const answer = await send("HeadObject", { Key: key(name), ChecksumMode: "ENABLED" });
        const until = answer.ObjectLockRetainUntilDate;
        // A full-object SHA-256 checksum is base64; a multipart composite ("…-N") is not comparable and counts as none.
        const checksum = typeof answer.ChecksumSHA256 === "string" && !answer.ChecksumSHA256.includes("-") ? Buffer.from(answer.ChecksumSHA256, "base64").toString("hex") : null;
        return { mode: typeof answer.ObjectLockMode === "string" ? answer.ObjectLockMode : null,
          retainUntil: until instanceof Date ? until : typeof until === "string" ? new Date(until) : null,
          sha256: checksum, versionId: typeof answer.VersionId === "string" ? answer.VersionId : null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }
  };
}

/**
 * A directory standing in for a locked bucket, for tests and CI. `lock: false` models a bucket without object lock;
 * `mode` and `clampRetainUntil` model a store that answers with weaker retention than requested.
 */
export function filesystemTestTarget(root: string, opts: { lock?: boolean; mode?: string; clampRetainUntil?: Date } = {}): WormTarget & { puts: string[] } {
  const puts: string[] = [];
  const meta = (name: string) => `${join(root, name)}.retention.json`;
  return {
    kind: "filesystem-test",
    puts,
    async lockConfiguration() { return { enabled: opts.lock ?? true }; },
    async putObject(name, body, put) {
      const path = join(root, name);
      if (existsSync(path)) throw new Error(`filesystem-test target refuses to overwrite ${name}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
      const retainUntil = opts.clampRetainUntil ?? put.retainUntil;
      writeFileSync(meta(name), JSON.stringify({ mode: opts.mode ?? put.mode, retainUntil: retainUntil.toISOString() }));
      puts.push(name);
      return { versionId: null, etag: sha256Hex(body) };
    },
    async headObject(name) {
      if (!existsSync(meta(name))) return null;
      const stored = JSON.parse(readFileSync(meta(name), "utf8")) as { mode: string; retainUntil: string };
      return { mode: stored.mode, retainUntil: new Date(stored.retainUntil), sha256: sha256Hex(readFileSync(join(root, name))), versionId: null };
    }
  };
}
