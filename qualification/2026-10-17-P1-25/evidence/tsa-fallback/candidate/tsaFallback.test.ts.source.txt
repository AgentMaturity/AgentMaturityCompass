import { createHash, X509Certificate } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { loadTimeConfig, requestTimestamp, timestampDigest, TSA_TIMEOUT_MS, type TimeConfig } from "../../src/time/tsaClient.js";
import { verifyTimestampToken } from "../../src/time/verifyTimestamp.js";
import type { TimestampAuthority } from "../../src/trust/trustList.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const OTHER_DIGEST = "0".repeat(64);
const REPLY_TYPE = "application/timestamp-reply";
const MALFORMED = Buffer.from([0x30, 0x00]);
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const hex256 = z.string().regex(/^[0-9a-f]{64}$/);
const provenanceSchema = z.object({
  schema: z.literal("p125-offline-signed-fixtures/1"),
  input: z.object({ dataUtf8: z.string(), digestHex: hex256, nonceHex: z.string().regex(/^[0-9a-f]{16}$/),
    genTimeIso: z.iso.datetime(), policyOid: z.string().min(1) }),
  files: z.record(z.string(), z.object({ bytes: z.number().int().positive(), sha256: hex256 })),
  primary: z.object({ rootCertSha256: hex256 })
});
const certificatesSchema = z.object({
  schema: z.literal("p125-public-certificates/1"), testOnly: z.literal(true),
  certificates: z.object({ root: z.object({ pem: z.string(), derSha256: hex256,
    pemBytes: z.number().int().positive(), pemSha256: hex256 }) })
});

/** Genuine fixed public bytes; no private key, signed-list fixture or fresh-nonce grant. */
function genuineFixture() {
  const directory = realpathSync(fileURLToPath(new URL("../fixtures/rfc3161/", import.meta.url)));
  expect(directory).toBe(join(CHECKOUT, "tests", "fixtures", "rfc3161"));
  const read = (name: string): Buffer => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`public fixture ${name} must be a regular file`);
    return readFileSync(path);
  };
  const provenance = provenanceSchema.parse(JSON.parse(read("provenance.json").toString("utf8")));
  const pinned = (name: string): Buffer => {
    const expected = provenance.files[name];
    if (expected === undefined) throw new Error(`missing public fixture pin for ${name}`);
    const bytes = read(name);
    expect({ bytes: bytes.length, sha256: sha256(bytes) }).toEqual(expected);
    return bytes;
  };
  const root = certificatesSchema.parse(JSON.parse(pinned("public-certificates.json").toString("utf8"))).certificates.root;
  const pem = Buffer.from(root.pem, "utf8");
  expect({ bytes: pem.length, sha256: sha256(pem) }).toEqual({ bytes: root.pemBytes, sha256: root.pemSha256 });
  expect(sha256(new X509Certificate(pem).raw)).toBe(root.derSha256);
  expect(root.derSha256).toBe(provenance.primary.rootCertSha256);
  expect(sha256(Buffer.from(provenance.input.dataUtf8, "utf8"))).toBe(provenance.input.digestHex);
  const token = pinned("valid.token.der");
  const anchor: TimestampAuthority = { anchorId: "p125-fallback-root", name: "public test-only TSA root",
    rootCertificatePem: root.pem, policyOids: [provenance.input.policyOid] };
  const positive = verifyTimestampToken({ token, expectedDigestHex: provenance.input.digestHex,
    nonceHex: provenance.input.nonceHex, anchors: [anchor] });
  expect(positive.ok).toBe(true);
  if (!positive.ok) throw new Error(`genuine public fixture refused: ${positive.code}`);
  expect(positive.attested.messageImprint.digest).toBe(provenance.input.digestHex);
  expect(positive.attested.genTime).toBe(provenance.input.genTimeIso);
  expect(positive.attested.tsa.anchorId).toBe(anchor.anchorId);
  expect(positive.attested.revocationChecked).toBe(false);
  expect(provenance.input.digestHex).not.toBe(OTHER_DIGEST);
  return { token, anchor };
}

type Reply = { status?: number; body?: Buffer; stall?: boolean; allowPeerAbort?: boolean };
type RequestRecord = {
  method: string | undefined; path: string; bodyBytes: number; ended: boolean; aborted: boolean; closed: boolean;
  responseFinished: boolean; responseClosed: boolean; replyEndCalled: boolean; allowPeerAbort: boolean; stall: boolean;
};
type SocketRecord = { closed: boolean; request?: RequestRecord };
type OwnedError = { owner: string; error: unknown; expectedPeerAbort: boolean };
type Fixture = { workspace: string; requests: RequestRecord[]; url: (path: string) => string };

/** Same ordinary guarded HTTP and natural closure pattern as the qualified client cohort. */
async function withFixture(
  caseId: string,
  replies: Readonly<Record<string, Reply>> | null,
  body: (fixture: Fixture) => Promise<void>
): Promise<void> {
  const requests: RequestRecord[] = [];
  const sockets = new Map<Socket, SocketRecord>();
  const terminals: Promise<void>[] = [];
  const errors: OwnedError[] = [];
  const cleanupErrors: unknown[] = [];
  let workspace: string | undefined;
  let origin = "";
  let listenerStarted = false;
  let listenerClosed = false;
  let failed = false;
  let primary: unknown;
  const observeError = (owner: string, error: unknown, request?: RequestRecord): void => {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    errors.push({ owner, error, expectedPeerAbort: request?.allowPeerAbort === true
      && (code === "ECONNRESET" || code === "EPIPE") });
  };
  const finishReply = (response: ServerResponse, reply: Reply, record: RequestRecord): void => {
    record.allowPeerAbort = reply.allowPeerAbort === true;
    record.stall = reply.stall === true;
    if (record.stall) return; // The actual default client abort must close the peer naturally.
    const bytes = reply.body ?? MALFORMED;
    response.writeHead(reply.status ?? 200, { "content-type": REPLY_TYPE,
      "content-length": bytes.length, connection: "close" });
    record.replyEndCalled = true;
    response.end(bytes);
  };
  const server = createServer((request, response) => {
    const record: RequestRecord = { method: request.method, path: request.url ?? "", bodyBytes: 0,
      ended: false, aborted: false, closed: false, responseFinished: false, responseClosed: false,
      replyEndCalled: false, allowPeerAbort: false, stall: false };
    requests.push(record);
    const socket = sockets.get(request.socket);
    if (socket) socket.request = record;
    terminals.push(new Promise<void>(resolve => request.once("close", () => { record.closed = true; resolve(); })));
    terminals.push(new Promise<void>(resolve => response.once("close", () => { record.responseClosed = true; resolve(); })));
    request.on("error", error => observeError("request", error, record));
    response.on("error", error => observeError("response", error, record));
    request.once("aborted", () => { record.aborted = true; });
    response.once("finish", () => { record.responseFinished = true; });
    request.on("data", (chunk: Buffer) => { record.bodyBytes += chunk.length; });
    request.once("end", () => {
      record.ended = true;
      try {
        const reply = replies?.[record.path];
        if (reply === undefined) throw new Error(`unexpected owned fixture route ${record.path}`);
        finishReply(response, reply, record);
      } catch (error) {
        observeError("handler", error, record);
        try {
          if (!response.headersSent) response.writeHead(500, { connection: "close", "content-length": 0 });
          record.replyEndCalled = true;
          response.end();
        } catch (replyError) { observeError("handler-error-reply", replyError, record); }
      }
    });
  });
  server.on("connection", socket => {
    const record: SocketRecord = { closed: false };
    sockets.set(socket, record);
    terminals.push(new Promise<void>(resolve => socket.once("close", () => { record.closed = true; resolve(); })));
    socket.on("error", error => observeError("socket", error, record.request));
  });
  server.on("error", error => observeError("server", error));
  server.once("close", () => { listenerClosed = true; });
  try {
    workspace = mkdtempSync(join(tmpdir(), "amc-p125-fallback-"));
    chmodSync(workspace, 0o700);
    expect(statSync(workspace).mode & 0o777).toBe(0o700);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
    if (replies !== null) {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => { reject(error); };
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
          listenerStarted = true;
          server.off("error", onError);
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("fixture has no IP listener");
      const bound: AddressInfo = address;
      expect(bound.address).toBe("127.0.0.1");
      origin = `http://127.0.0.1:${bound.port}`;
    }
    await body({ workspace, requests, url: path => new URL(path, origin).href });
  } catch (error) {
    failed = true;
    primary = error;
  } finally {
    if (server.listening) {
      try { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      catch (error) { cleanupErrors.push(error); }
    }
    try { await Promise.all(terminals); } catch (error) { cleanupErrors.push(error); }
    for (const owned of errors) {
      if (!owned.expectedPeerAbort && owned.error !== primary && !cleanupErrors.includes(owned.error)) cleanupErrors.push(owned.error);
    }
    try {
      expect(!listenerStarted || listenerClosed).toBe(true);
      expect([...sockets.values()].every(socket => socket.closed)).toBe(true);
      expect(requests.every(request => request.ended && request.closed && request.responseClosed)).toBe(true);
      expect(requests.every(request => !request.aborted || request.allowPeerAbort)).toBe(true);
      expect(requests.every(request => request.stall
        ? request.allowPeerAbort && !request.replyEndCalled && !request.responseFinished
        : request.replyEndCalled && (request.responseFinished || request.allowPeerAbort))).toBe(true);
    } catch (error) { cleanupErrors.push(error); }
    if (workspace !== undefined) {
      try { rmSync(workspace, { recursive: true }); } catch (error) { cleanupErrors.push(error); }
    }
    console.info("P125_TSA_FALLBACK_LIFECYCLE", JSON.stringify({ caseId, checkout: CHECKOUT,
      listenerStarted, listenerClosed, requests, socketCount: sockets.size,
      socketsClosed: [...sockets.values()].every(socket => socket.closed),
      ownedErrors: errors.map(({ owner, error, expectedPeerAbort }) => ({ owner, expectedPeerAbort,
        name: error instanceof Error ? error.name : typeof error,
        code: error instanceof Error && "code" in error ? String(error.code) : null })),
      bodyFailed: failed, cleanupErrorCount: cleanupErrors.length }));
  }
  if (failed && cleanupErrors.length === 0) throw primary;
  if (failed) throw new AggregateError([primary, ...cleanupErrors], "fallback body and owned cleanup failed");
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "owned fallback fixture cleanup failed");
}

describe("P1-25 offline and configured TSA refusal continuation", () => {
  test("returns the exact default config and offline result without configured TSAs", async () => {
    await withFixture("OFFLINE", null, async fixture => {
      const expected: TimeConfig = { tsa: [], required: false, toleranceMinutes: 5,
        checkpoint: { everyEvents: 1000, everyMinutes: 15 } };
      expect(loadTimeConfig(fixture.workspace)).toEqual(expected);
      expect(await timestampDigest(fixture.workspace, OTHER_DIGEST)).toEqual({ config: expected, grant: null, failures: [] });
      expect(fixture.requests).toEqual([]);
      expect(existsSync(join(fixture.workspace, ".amc"))).toBe(false);
    });
  });

  test("skips an unmatched anchor before the wire beside a matching-anchor refusal", async () => {
    const genuine = genuineFixture();
    await withFixture("NO-ANCHOR", {
      "/anchor-positive": { status: 500 }, "/missing-anchor": { status: 500 }, "/after-skip": { status: 500 }
    }, async fixture => {
      const positive = await requestTimestamp({ digestHex: OTHER_DIGEST, anchors: [genuine.anchor], config: { tsa: [
        { name: "matching-positive", url: fixture.url("/anchor-positive"), anchorIds: [genuine.anchor.anchorId] }
      ] } }, fixture.workspace);
      expect(positive).toEqual({ grant: null, failures: ["matching-positive: HTTP 500"] });
      const result = await requestTimestamp({ digestHex: OTHER_DIGEST, anchors: [genuine.anchor], config: { tsa: [
        { name: "unmatched", url: fixture.url("/missing-anchor"), anchorIds: ["absent-root"] },
        { name: "matched-next", url: fixture.url("/after-skip"), anchorIds: [genuine.anchor.anchorId] }
      ] } }, fixture.workspace);
      // Direct unpinned-dispatch witness follows an actual matching-anchor wire positive.
      expect(fixture.requests.filter(request => request.path === "/missing-anchor")).toHaveLength(0);
      expect(fixture.requests.map(request => request.path)).toEqual(["/anchor-positive", "/after-skip"]);
      expect(result).toEqual({ grant: null, failures: [
        "unmatched: none of its anchorIds (absent-root) is in a verified trust list", "matched-next: HTTP 500"
      ] });
    });
  });

  test("preserves literal attempt and failure order through finite HTTP, malformed and imprint refusals", async () => {
    const genuine = genuineFixture();
    await withFixture("ORDER", {
      "/single-positive": { status: 500 }, "/http-first": { status: 500 },
      "/malformed-second": { body: MALFORMED }, "/genuine-third": { body: genuine.token }
    }, async fixture => {
      const positive = await requestTimestamp({ digestHex: OTHER_DIGEST, anchors: [genuine.anchor], config: { tsa: [
        { name: "single-positive", url: fixture.url("/single-positive"), anchorIds: [genuine.anchor.anchorId] }
      ] } }, fixture.workspace);
      expect(positive).toEqual({ grant: null, failures: ["single-positive: HTTP 500"] });
      const result = await requestTimestamp({ digestHex: OTHER_DIGEST, anchors: [genuine.anchor], config: { tsa: [
        { name: "http-first", url: fixture.url("/http-first"), anchorIds: [genuine.anchor.anchorId] },
        { name: "malformed-second", url: fixture.url("/malformed-second"), anchorIds: [genuine.anchor.anchorId] },
        { name: "genuine-third", url: fixture.url("/genuine-third"), anchorIds: [genuine.anchor.anchorId] }
      ] } }, fixture.workspace);
      // First order/continuation witness precedes later result assertions.
      expect(fixture.requests.map(request => request.path)).toEqual([
        "/single-positive", "/http-first", "/malformed-second", "/genuine-third"
      ]);
      expect(result.grant).toBeNull();
      expect(result.failures).toEqual(["http-first: HTTP 500",
        expect.stringMatching(/^malformed-second: TST_MALFORMED: /),
        "genuine-third: TST_IMPRINT_MISMATCH: the token's messageImprint is not the expected sha256"]);
      expect(fixture.requests.every(request => request.method === "POST" && request.bodyBytes === 70)).toBe(true);
    });
  });

  test("continues after the unchanged 10000 ms default abort to a real next-route refusal", async () => {
    const genuine = genuineFixture();
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withFixture("TIMEOUT-CONTINUE", {
      "/stall-first": { stall: true, allowPeerAbort: true }, "/after-timeout": { status: 500 }
    }, async fixture => {
      const started = performance.now();
      const result = await requestTimestamp({ digestHex: OTHER_DIGEST, anchors: [genuine.anchor], config: { tsa: [
        { name: "stall-first", url: fixture.url("/stall-first"), anchorIds: [genuine.anchor.anchorId] },
        { name: "after-timeout", url: fixture.url("/after-timeout"), anchorIds: [genuine.anchor.anchorId] }
      ] } }, fixture.workspace); // timeoutMs is deliberately absent, preserving the real default.
      const elapsedMs = performance.now() - started;
      console.info("P125_TSA_FALLBACK_DEFAULT_TIMEOUT", JSON.stringify({ checkout: CHECKOUT,
        configuredMs: TSA_TIMEOUT_MS, elapsedMs, failures: result.failures,
        routes: fixture.requests.map(request => request.path) }));
      expect(fixture.requests.map(request => request.path)).toEqual(["/stall-first", "/after-timeout"]);
      expect(result).toEqual({ grant: null, failures: ["stall-first: The operation was aborted", "after-timeout: HTTP 500"] });
    });
  });
});
