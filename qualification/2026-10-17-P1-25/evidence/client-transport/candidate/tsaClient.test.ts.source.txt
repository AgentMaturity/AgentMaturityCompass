import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, test } from "vitest";
import { buildTimestampRequest, postTimestampQuery, TSA_TIMEOUT_MS } from "../../src/time/tsaClient.js";

const DIGEST = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const RAW_REPLY = Buffer.from([0x00, 0xff, 0x80, 0x81, 0x7f]);
const REPLY_TYPE = "application/timestamp-reply";

type Reply = {
  status?: number;
  contentType?: string;
  body?: Buffer;
  location?: string;
  stall?: boolean;
  allowPeerAbort?: boolean;
};
type RequestRecord = {
  method: string | undefined;
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  ended: boolean;
  aborted: boolean;
  closed: boolean;
  responseFinished: boolean;
  responseClosed: boolean;
  replyEndCalled: boolean;
  allowPeerAbort: boolean;
  stall: boolean;
};
type SocketRecord = { closed: boolean; request?: RequestRecord };
type OwnedError = { owner: string; error: unknown; expectedPeerAbort: boolean };
type Fixture = {
  workspace: string;
  origin: string;
  requests: RequestRecord[];
  url: (path: string) => URL;
};

/** No timer, environment, resolver, transport, policy, registry or guard replacement. */
async function withHttpFixture(
  replyFor: (path: string, origin: string) => Reply,
  body: (fixture: Fixture) => Promise<void>
): Promise<void> {
  const requests: RequestRecord[] = [];
  const sockets = new Map<Socket, SocketRecord>();
  const terminalPromises: Promise<void>[] = [];
  const errors: OwnedError[] = [];
  let workspace: string | undefined;
  let origin = "";
  let listenerStarted = false;
  let listenerClosed = false;
  let failed = false;
  let primary: unknown;
  const cleanupErrors: unknown[] = [];
  const observeError = (owner: string, error: unknown, request?: RequestRecord): void => {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    errors.push({ owner, error, expectedPeerAbort: request?.allowPeerAbort === true
      && (code === "ECONNRESET" || code === "EPIPE") });
  };
  const finishReply = (response: ServerResponse, reply: Reply, record: RequestRecord): void => {
    record.allowPeerAbort = reply.allowPeerAbort === true;
    record.stall = reply.stall === true;
    if (record.stall) return; // The real client default abort must close this response.
    const bytes = reply.body ?? RAW_REPLY;
    response.writeHead(reply.status ?? 200, {
      "content-type": reply.contentType ?? REPLY_TYPE,
      "content-length": bytes.length,
      connection: "close",
      ...(reply.location === undefined ? {} : { location: reply.location })
    });
    record.replyEndCalled = true;
    response.end(bytes);
  };
  const server = createServer((request, response) => {
    const record: RequestRecord = {
      method: request.method, path: request.url ?? "", headers: { ...request.headers },
      body: Buffer.alloc(0), ended: false, aborted: false, closed: false,
      responseFinished: false, responseClosed: false, replyEndCalled: false,
      allowPeerAbort: false, stall: false
    };
    requests.push(record);
    const socket = sockets.get(request.socket);
    if (socket) socket.request = record;
    const chunks: Buffer[] = [];
    terminalPromises.push(new Promise<void>(resolve => request.once("close", () => {
      record.closed = true;
      resolve();
    })));
    terminalPromises.push(new Promise<void>(resolve => response.once("close", () => {
      record.responseClosed = true;
      resolve();
    })));
    request.on("error", error => observeError("request", error, record));
    response.on("error", error => observeError("response", error, record));
    request.once("aborted", () => { record.aborted = true; });
    response.once("finish", () => { record.responseFinished = true; });
    request.on("data", (chunk: Buffer) => { chunks.push(Buffer.from(chunk)); });
    request.once("end", () => {
      record.ended = true;
      record.body = Buffer.concat(chunks);
      try {
        finishReply(response, replyFor(record.path, origin), record);
      } catch (error) {
        observeError("handler", error, record);
        // A handler failure remains a failure; finish a finite error reply if possible.
        try {
          if (!response.headersSent) response.writeHead(500, { connection: "close", "content-length": 0 });
          record.replyEndCalled = true;
          response.end();
        } catch (replyError) {
          observeError("handler-error-reply", replyError, record);
        }
      }
    });
  });
  server.on("connection", socket => {
    const record: SocketRecord = { closed: false };
    sockets.set(socket, record);
    terminalPromises.push(new Promise<void>(resolve => socket.once("close", () => {
      record.closed = true;
      resolve();
    })));
    socket.on("error", error => observeError("socket", error, record.request));
  });
  server.on("error", error => observeError("server", error));
  server.once("close", () => { listenerClosed = true; });
  try {
    workspace = mkdtempSync(join(tmpdir(), "amc-p125-client-"));
    chmodSync(workspace, 0o700);
    expect(statSync(workspace).mode & 0o777).toBe(0o700);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
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
    await body({ workspace, origin, requests, url: path => new URL(path, origin) });
  } catch (error) {
    failed = true;
    primary = error;
  } finally {
    // Stop accepting, then await natural client/peer terminals; never destroy or retry sockets.
    if (server.listening) {
      try {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } catch (error) { cleanupErrors.push(error); }
    }
    try { await Promise.all(terminalPromises); } catch (error) { cleanupErrors.push(error); }
    for (const owned of errors) {
      if (!owned.expectedPeerAbort && owned.error !== primary) cleanupErrors.push(owned.error);
    }
    try {
      expect(!listenerStarted || listenerClosed).toBe(true);
      expect([...sockets.values()].every(socket => socket.closed)).toBe(true);
      expect(requests.every(request => request.closed && request.responseClosed)).toBe(true);
      expect(requests.every(request => request.ended)).toBe(true);
      expect(requests.every(request => !request.aborted || request.allowPeerAbort)).toBe(true);
      expect(requests.every(request => request.stall
        ? request.allowPeerAbort && !request.replyEndCalled && !request.responseFinished
        : request.replyEndCalled && (request.responseFinished || request.allowPeerAbort))).toBe(true);
    } catch (error) { cleanupErrors.push(error); }
    if (workspace !== undefined) {
      try { rmSync(workspace, { recursive: true }); } catch (error) { cleanupErrors.push(error); }
    }
  }
  if (failed && cleanupErrors.length === 0) throw primary;
  if (failed) throw new AggregateError([primary, ...cleanupErrors], "client body and owned fixture cleanup failed");
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "owned client fixture cleanup failed");
}

describe("P1-25 request DER and configured raw HTTP transport", () => {
  test("encodes the full SHA-256 request, captured positive nonce and literal certReq true", () => {
    const { der, nonceHex } = buildTimestampRequest(DIGEST);
    expect(nonceHex).toMatch(/^[89a-f][0-9a-f]{15}$/);
    const beforeCertReq = `30440201013031300d060960864801650304020105000420${DIGEST}020900${nonceHex}`;
    expect(der.subarray(0, -3).toString("hex")).toBe(beforeCertReq);
    // C1's first intended bit witness follows the complete version/imprint/nonce positive.
    expect(der.subarray(-3).toString("hex")).toBe("0101ff");
    expect(der.toString("hex")).toBe(`${beforeCertReq}0101ff`);
  });

  test("inserts the independent literal policy OID without changing the required fields", () => {
    const { der, nonceHex } = buildTimestampRequest(DIGEST, "1.2.3.4.1");
    expect(nonceHex).toMatch(/^[89a-f][0-9a-f]{15}$/);
    const expectedHex = `304a0201013031300d060960864801650304020105000420${DIGEST}06042a030401020900${nonceHex}0101ff`;
    expect(der.toString("hex")).toBe(expectedHex);
  });

  test("rejects invalid digest strings beside a real valid request", () => {
    expect(buildTimestampRequest(DIGEST).der.length).toBe(70);
    for (const digest of ["", "g".repeat(64), "A".repeat(64), "0".repeat(63), "0".repeat(65)]) {
      expect(() => buildTimestampRequest(digest)).toThrow("a timestamp request needs a sha256 hex digest");
    }
  });

  test("POSTs the real request with exact headers/path/body and returns only raw reply bytes", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture(() => ({}), async fixture => {
      const url = fixture.url("/tsa/query?source=p125&mode=raw");
      expect(await postTimestampQuery(url, der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      expect(fixture.requests).toHaveLength(1);
      const received = fixture.requests[0]!;
      expect(received.method).toBe("POST");
      expect(received.path).toBe("/tsa/query?source=p125&mode=raw");
      expect(received.headers.host).toBe(url.host);
      expect(received.headers["content-type"]).toBe("application/timestamp-query");
      expect(received.headers.accept).toBe(REPLY_TYPE);
      expect(received.headers["content-length"]).toBe(String(der.length));
      expect(received.body).toEqual(der);
    });
  });

  test("normalizes response MIME case and parameters", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture(() => ({ contentType: "Application/Timestamp-Reply ; charset=binary" }), async fixture => {
      expect(await postTimestampQuery(fixture.url("/normalized"), der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      expect(fixture.requests).toHaveLength(1);
    });
  });

  test("refuses configured URL credentials before a second request reaches the listener", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture(() => ({}), async fixture => {
      expect(await postTimestampQuery(fixture.url("/positive"), der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      const credentialUrl = fixture.url("/credentials");
      credentialUrl.username = "synthetic-user";
      credentialUrl.password = "synthetic-password";
      await expect(postTimestampQuery(credentialUrl, der, undefined, fixture.workspace))
        .rejects.toThrow("a configured URL must not carry credentials");
      expect(fixture.requests.map(request => request.path)).toEqual(["/positive"]);
    });
  });

  test("refuses finite non-200 statuses before MIME admission", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture(path => path === "/positive" ? {} : {
      status: path === "/status/201" ? 201 : 500, contentType: "text/plain"
    }, async fixture => {
      expect(await postTimestampQuery(fixture.url("/positive"), der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      for (const status of [201, 500]) {
        await expect(postTimestampQuery(fixture.url(`/status/${status}`), der, undefined, fixture.workspace))
          .rejects.toThrow(`HTTP ${status}`);
      }
      expect(fixture.requests.map(request => request.path)).toEqual(["/positive", "/status/201", "/status/500"]);
    });
  });

  test("refuses a same-listener redirect without requesting its target", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture((path, origin) => path === "/redirect"
      ? { status: 302, location: `${origin}/redirect-target` } : {}, async fixture => {
      expect(await postTimestampQuery(fixture.url("/positive"), der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      await expect(postTimestampQuery(fixture.url("/redirect"), der, undefined, fixture.workspace))
        .rejects.toThrow("redirect (HTTP 302) refused");
      expect(fixture.requests.filter(request => request.path === "/redirect")).toHaveLength(1);
      expect(fixture.requests.filter(request => request.path === "/redirect-target")).toHaveLength(0);
    });
  });

  test("refuses wrong response MIME after the adjacent real positive", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    await withHttpFixture(path => path === "/wrong-mime" ? { contentType: "text/plain" } : {}, async fixture => {
      expect(await postTimestampQuery(fixture.url("/positive"), der, undefined, fixture.workspace)).toEqual(RAW_REPLY);
      // C2's first intended witness must stay before request-count and cleanup assertions.
      await expect(postTimestampQuery(fixture.url("/wrong-mime"), der, undefined, fixture.workspace))
        .rejects.toThrow('content type "text/plain" is not application/timestamp-reply');
      expect(fixture.requests.map(request => request.path)).toEqual(["/positive", "/wrong-mime"]);
    });
  });

  test("returns exactly 65536 bytes and refuses a finite 65537-byte reply", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    const atCap = Buffer.alloc(65_536, 0x4a);
    const overCap = Buffer.alloc(65_537, 0x4a);
    await withHttpFixture(path => path === "/oversize"
      ? { body: overCap, allowPeerAbort: true } : { body: atCap }, async fixture => {
      expect(await postTimestampQuery(fixture.url("/at-cap"), der, undefined, fixture.workspace)).toEqual(atCap);
      await expect(postTimestampQuery(fixture.url("/oversize"), der, undefined, fixture.workspace))
        .rejects.toThrow("reply exceeds 65536 bytes");
      expect(fixture.requests.map(request => request.path)).toEqual(["/at-cap", "/oversize"]);
      expect(fixture.requests.every(request => request.body.equals(der))).toBe(true);
    });
  });

  test("uses the unchanged 10000 ms client default against an owned stalled response", async () => {
    const { der } = buildTimestampRequest(DIGEST);
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withHttpFixture(() => ({ stall: true, allowPeerAbort: true }), async fixture => {
      const started = performance.now();
      let elapsedMs = 0;
      await expect(postTimestampQuery(fixture.url("/stall"), der, undefined, fixture.workspace)
        .finally(() => { elapsedMs = performance.now() - started; }))
        .rejects.toMatchObject({ name: "AbortError", code: "ABORT_ERR" });
      expect(fixture.requests.map(request => request.path)).toEqual(["/stall"]);
      expect(fixture.requests[0]!.body).toEqual(der);
      // Actual measured duration is evidence; no shortened timer or predicted scheduling bound.
      console.info("P125_CLIENT_DEFAULT_TIMEOUT", JSON.stringify({ configuredMs: TSA_TIMEOUT_MS, elapsedMs }));
    });
  });
});
