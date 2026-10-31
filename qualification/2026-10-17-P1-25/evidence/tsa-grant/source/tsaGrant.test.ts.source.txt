import { spawn } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { accessSync, appendFileSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { children, expectTag, parseDer, uintHex } from "../../src/time/der.js";
import { requestTimestamp, TSA_TIMEOUT_MS } from "../../src/time/tsaClient.js";
import { TIMESTAMP_TOKEN_MAX_BYTES, verifyTimestampToken } from "../../src/time/verifyTimestamp.js";
import type { AttestedTime } from "../../src/time/timeEvidence.js";
import type { TimestampAuthority } from "../../src/trust/trustList.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const DIGEST = createHash("sha256").update("AMC P1-25 fresh grant fixture; test only").digest("hex");
const POLICY = "1.2.3.4.1";
const ANCHOR_ID = "amc-p125-grant-test-root";
const REPLY_TYPE = "application/timestamp-reply";
// Design was reviewed against these installed docs; each future run records its actual tool.
const REVIEWED_OPENSSL_DOC = "/opt/homebrew/Cellar/openssl@3/3.6.5/share/man/man1/openssl-ts.1ssl";
const REVIEWED_OPENSSL_VERSION = "3.6.5";
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

type ErrorFact = { name: string; message: string; properties: Record<string, unknown> };
type ChildRecord = {
  id: string; argv: string[]; cwd: string; pid: number | null; startIso: string; startMs: number;
  spawned: boolean; exitSeen: boolean; exitCode: number | null; exitSignal: NodeJS.Signals | null;
  closeSeen: boolean; closeCode: number | null; closeSignal: NodeJS.Signals | null;
  events: { event: string; atMs: number; code?: number | null; signal?: NodeJS.Signals | null; error?: ErrorFact }[];
  errors: unknown[]; stdout: string; stderr: string; stdoutBytes: number; stderrBytes: number;
  stdoutSha256: string | null; stderrSha256: string | null;
};
type RequestRecord = {
  method: string | undefined; path: string; headers: IncomingHttpHeaders; body: Buffer;
  ended: boolean; aborted: boolean; closed: boolean; responseFinished: boolean; responseClosed: boolean;
  replyEndCalled: boolean; queryFile: string | null; responseFile: string | null; responseBytes: number;
};
type SocketRecord = { closed: boolean };
type OwnedError = { owner: string; error: unknown };
type SelectedTool = { invoked: string; physical: string; sha256: string; version: string | null };
type Fixture = {
  workspace: string; anchor: TimestampAuthority; requests: RequestRecord[];
  url: (path: string) => string;
  recordResult: (result: Awaited<ReturnType<typeof requestTimestamp>>) => void;
  verifyReply: (path: string) => Promise<AttestedTime>;
};

function errorFact(error: unknown): ErrorFact {
  const properties: Record<string, unknown> = {};
  if (typeof error === "object" && error !== null) {
    for (const name of Object.getOwnPropertyNames(error)) properties[name] = Reflect.get(error, name);
  }
  return { name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error), properties };
}

function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** Like existing resolveCommand's PATH lookup, without its unobserved synchronous `which` child. */
function opensslOnPath(): string | null {
  const name = process.platform === "win32" ? "openssl.exe" : "openssl";
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(isAbsolute)) {
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      const physical = realpathSync(candidate);
      if (lstatSync(physical).isFile()) return candidate;
    } catch { /* This PATH entry does not provide an executable regular OpenSSL file. */ }
  }
  return null;
}

const OPENSSL_PATH = opensslOnPath();
const optionalGrantTest = test.skipIf(OPENSSL_PATH === null);
if (OPENSSL_PATH === null) console.info("P125_TSA_GRANT_UNAVAILABLE", JSON.stringify({
  reason: "No executable OpenSSL on absolute PATH entries; optional interoperability bodies skipped",
  qualificationCredit: false, caseIds: ["FIRST-GRANT", "HTTP500-THEN-GRANT"]
}));

/** Every run is retained; private keys and full child streams are never console evidence. */
async function withGrantFixture(caseId: string, signPath: string, body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const requests: RequestRecord[] = [];
  const sockets = new Map<Socket, SocketRecord>();
  const terminals: Promise<void>[] = [];
  const drivers: Promise<void>[] = [];
  const childrenRun: ChildRecord[] = [];
  const ownedFiles = new Set<string>();
  const errors: OwnedError[] = [];
  const cleanupErrors: unknown[] = [];
  let privateRoot: string | undefined;
  let workspace: string | undefined;
  let childEnv: NodeJS.ProcessEnv = {};
  let selectedTool: SelectedTool | undefined;
  let resultObservation: Record<string, unknown> | null = null;
  let replyObservation: Record<string, unknown> | null = null;
  let origin = "";
  let listenerStarted = false;
  let listenerClosed = false;
  let failed = false;
  let primary: unknown;
  const observeError = (owner: string, error: unknown): void => { errors.push({ owner, error }); };
  const addCleanup = (error: unknown): void => {
    if (error !== primary && !cleanupErrors.includes(error)) cleanupErrors.push(error);
  };
  const pathFor = (name: string): string => {
    if (privateRoot === undefined) throw new Error("owned signing root is not initialized");
    const path = join(privateRoot, name);
    if (!contains(privateRoot, path) || path === privateRoot) throw new Error("unowned signing path");
    return path;
  };
  const writeOwned = (name: string, data: string | Buffer): string => {
    const path = pathFor(name);
    writeFileSync(path, data, { flag: "wx", mode: 0o600 });
    ownedFiles.add(name);
    return path;
  };
  const checkOwnedFile = (name: string): void => {
    const path = pathFor(name);
    const st = lstatSync(path);
    expect(st.isFile() && !st.isSymbolicLink()).toBe(true);
    expect(st.nlink).toBe(1);
    expect(st.mode & 0o777).toBe(0o600);
    expect(realpathSync(path)).toBe(path);
    if (workspace === undefined) throw new Error("owned workspace is not initialized");
    expect(contains(workspace, path)).toBe(false);
    expect(contains(CHECKOUT, path)).toBe(false);
  };
  const runOpenSsl = async (id: string, args: readonly string[]): Promise<ChildRecord> => {
    if (privateRoot === undefined || selectedTool === undefined) throw new Error("owned signing root/tool is not initialized");
    const index = childrenRun.length + 1;
    const stdout = writeOwned(`child-${index}.stdout`, Buffer.alloc(0));
    const stderr = writeOwned(`child-${index}.stderr`, Buffer.alloc(0));
    const record: ChildRecord = { id, argv: [selectedTool.invoked, ...args], cwd: privateRoot, pid: null,
      startIso: new Date().toISOString(), startMs: performance.now(), spawned: false,
      exitSeen: false, exitCode: null, exitSignal: null, closeSeen: false, closeCode: null, closeSignal: null,
      events: [], errors: [], stdout, stderr, stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null };
    childrenRun.push(record);
    const childError = (event: string, error: unknown): void => {
      record.errors.push(error);
      record.events.push({ event, atMs: performance.now(), error: errorFact(error) });
    };
    try {
      // Explicit argv/environment; no shell, inherited private environment, detach, timer or signal.
      const child = spawn(selectedTool.invoked, [...args], { cwd: privateRoot, env: childEnv, shell: false,
        detached: false, stdio: ["ignore", "pipe", "pipe"] });
      record.pid = child.pid ?? null;
      const closed = new Promise<void>(resolve => {
        child.once("spawn", () => {
          record.spawned = true;
          record.pid = child.pid ?? null;
          record.events.push({ event: "spawn", atMs: performance.now() });
        });
        child.on("error", error => childError("error", error));
        child.once("exit", (code, signal) => {
          record.exitSeen = true; record.exitCode = code; record.exitSignal = signal;
          record.events.push({ event: "exit", atMs: performance.now(), code, signal });
        });
        child.once("close", (code, signal) => {
          record.closeSeen = true; record.closeCode = code; record.closeSignal = signal;
          record.events.push({ event: "close", atMs: performance.now(), code, signal });
          resolve();
        });
        child.stdout.on("data", (chunk: Buffer) => {
          record.stdoutBytes += chunk.length;
          try { appendFileSync(stdout, chunk); } catch (error) { childError("stdout-write-error", error); }
        });
        child.stderr.on("data", (chunk: Buffer) => {
          record.stderrBytes += chunk.length;
          try { appendFileSync(stderr, chunk); } catch (error) { childError("stderr-write-error", error); }
        });
        child.stdout.on("error", error => childError("stdout-error", error));
        child.stderr.on("error", error => childError("stderr-error", error));
      });
      await closed;
    } catch (error) { childError("spawn-throw", error); }
    // close is the child/stdio boundary, not merely its exit event.
    record.stdoutSha256 = sha256(readFileSync(stdout));
    record.stderrSha256 = sha256(readFileSync(stderr));
    writeOwned(`child-${index}.json`, JSON.stringify({ ...record, errors: record.errors.map(errorFact) }, null, 2));
    if (record.errors.length) throw record.errors[0];
    expect(record.spawned && record.exitSeen && record.closeSeen).toBe(true);
    expect(record.pid).not.toBeNull();
    expect([record.exitCode, record.closeCode]).toEqual([0, 0]);
    expect([record.exitSignal, record.closeSignal]).toEqual([null, null]);
    expect(readFileSync(stdout).length).toBe(record.stdoutBytes);
    expect(readFileSync(stderr).length).toBe(record.stderrBytes);
    return record;
  };
  const reply = (response: ServerResponse, record: RequestRecord, status: number, bytes: Buffer): void => {
    response.writeHead(status, { "content-type": REPLY_TYPE, "content-length": bytes.length, connection: "close" });
    record.replyEndCalled = true;
    record.responseBytes = bytes.length;
    response.end(bytes);
  };
  const server = createServer((request, response) => {
    const record: RequestRecord = { method: request.method, path: request.url ?? "", headers: { ...request.headers },
      body: Buffer.alloc(0), ended: false, aborted: false, closed: false, responseFinished: false,
      responseClosed: false, replyEndCalled: false, queryFile: null, responseFile: null, responseBytes: 0 };
    requests.push(record);
    const chunks: Buffer[] = [];
    terminals.push(new Promise<void>(resolve => request.once("close", () => { record.closed = true; resolve(); })));
    terminals.push(new Promise<void>(resolve => response.once("close", () => { record.responseClosed = true; resolve(); })));
    request.on("error", error => observeError("request", error));
    response.on("error", error => observeError("response", error));
    request.once("aborted", () => { record.aborted = true; });
    response.once("finish", () => { record.responseFinished = true; });
    request.on("data", (chunk: Buffer) => { chunks.push(Buffer.from(chunk)); });
    request.once("end", () => {
      record.ended = true;
      record.body = Buffer.concat(chunks);
      const requestIndex = requests.length;
      const driver = (async (): Promise<void> => {
        if (record.method !== "POST" || record.body.length === 0 || record.body.length > 4096) throw new Error("invalid owned TSA query");
        if (record.path === "/http-first" || record.path === "/unused-last") {
          reply(response, record, 500, Buffer.alloc(0));
          return;
        }
        if (record.path !== signPath) throw new Error(`unexpected owned TSA route ${record.path}`);
        record.queryFile = writeOwned(`request-${requestIndex}.tsq`, record.body);
        record.responseFile = writeOwned(`response-${requestIndex}.tsr`, Buffer.alloc(0));
        await runOpenSsl("sign-captured-query", ["ts", "-reply", "-config", "tsa.cnf", "-section", "tsa_local",
          "-queryfile", record.queryFile, "-out", record.responseFile]);
        checkOwnedFile(`request-${requestIndex}.tsq`);
        checkOwnedFile(`response-${requestIndex}.tsr`);
        const bytes = readFileSync(record.responseFile);
        if (bytes.length === 0 || bytes.length > TIMESTAMP_TOKEN_MAX_BYTES) throw new Error("owned TSA reply has invalid size");
        reply(response, record, 200, bytes);
      })().catch(error => {
        observeError("TSA-driver", error);
        // A finite HTTP failure never converts a failed signer into passing acceptance.
        try {
          if (!response.headersSent && !response.destroyed) reply(response, record, 500, Buffer.alloc(0));
        } catch (replyError) { observeError("TSA-driver-error-reply", replyError); }
      });
      drivers.push(driver);
    });
  });
  server.on("connection", socket => {
    const record: SocketRecord = { closed: false };
    sockets.set(socket, record);
    terminals.push(new Promise<void>(resolve => socket.once("close", () => { record.closed = true; resolve(); })));
    socket.on("error", error => observeError("socket", error));
  });
  server.on("error", error => observeError("server", error));
  server.once("close", () => { listenerClosed = true; });
  try {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p125-grant-workspace-")));
    privateRoot = realpathSync(mkdtempSync(join(tmpdir(), "amc-p125-grant-private-")));
    for (const root of [workspace, privateRoot]) {
      chmodSync(root, 0o700);
      expect(lstatSync(root).mode & 0o777).toBe(0o700);
      expect(contains(CHECKOUT, root)).toBe(false);
    }
    expect(contains(workspace, privateRoot) || contains(privateRoot, workspace)).toBe(false);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
    const home = pathFor("home");
    mkdirSync(home, { mode: 0o700 });
    const tool = OPENSSL_PATH;
    if (tool === null) throw new Error("OpenSSL is unavailable on PATH; genuine grant qualification did not run");
    const physicalTool = realpathSync(tool);
    selectedTool = { invoked: tool, physical: physicalTool, sha256: sha256(readFileSync(physicalTool)), version: null };
    writeOwned("root.cnf", "[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=AMC TSA GRANT ROOT TEST ONLY\n[root_ca]\nbasicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n");
    writeOwned("req.cnf", "[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=AMC TSA GRANT SIGNER TEST ONLY\n");
    writeOwned("extensions.cnf", "[tsa_leaf]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer\n");
    const tsaConfig = writeOwned("tsa.cnf", "[tsa]\ndefault_tsa=tsa_local\n[tsa_local]\nserial=tsa-serial.txt\nsigner_cert=tsa.pem\nsigner_key=tsa.key\ncerts=root.pem\nsigner_digest=sha256\ndefault_policy=1.2.3.4.1\ndigests=sha256\ness_cert_id_alg=sha256\ness_cert_id_chain=no\nordering=no\nclock_precision_digits=0\ntsa_name=no\n");
    writeOwned("tsa-serial.txt", "01\n");
    for (const name of ["root.key", "root.pem", "tsa.key", "tsa.csr", "tsa.pem"]) writeOwned(name, Buffer.alloc(0));
    childEnv = { HOME: home, OPENSSL_CONF: tsaConfig,
      PATH: [dirname(physicalTool), ...(process.env.PATH ?? "").split(delimiter).filter(isAbsolute)].join(delimiter),
      TEMP: privateRoot, TMP: privateRoot, TMPDIR: privateRoot, LANG: "C", LC_ALL: "C",
      ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
      ...(process.env.WINDIR === undefined ? {} : { WINDIR: process.env.WINDIR }) };
    const version = await runOpenSsl("tool-version", ["version"]);
    const versionMatch = /^OpenSSL (\d+\.\d+(?:\.\d+)?[a-z]?)(?:\s|$)/.exec(readFileSync(version.stdout, "utf8"));
    expect(versionMatch).not.toBeNull();
    if (versionMatch === null) throw new Error("discovered tool did not report an OpenSSL version");
    selectedTool.version = versionMatch[1]!;
    await runOpenSsl("create-root", ["req", "-new", "-x509", "-newkey", "rsa:2048", "-noenc", "-sha256", "-days", "2",
      "-set_serial", "1", "-subj", "/CN=AMC TSA GRANT ROOT TEST ONLY", "-config", "root.cnf", "-extensions", "root_ca",
      "-keyout", "root.key", "-out", "root.pem"]);
    await runOpenSsl("create-tsa-csr", ["req", "-new", "-newkey", "rsa:2048", "-noenc", "-sha256",
      "-subj", "/CN=AMC TSA GRANT SIGNER TEST ONLY", "-config", "req.cnf", "-keyout", "tsa.key", "-out", "tsa.csr"]);
    await runOpenSsl("issue-tsa", ["x509", "-req", "-in", "tsa.csr", "-CA", "root.pem", "-CAkey", "root.key",
      "-set_serial", "2", "-days", "1", "-sha256", "-extfile", "extensions.cnf", "-extensions", "tsa_leaf", "-out", "tsa.pem"]);
    for (const name of ["root.key", "root.pem", "tsa.key", "tsa.csr", "tsa.pem", "root.cnf", "req.cnf", "extensions.cnf", "tsa.cnf", "tsa-serial.txt"]) checkOwnedFile(name);
    const root = new X509Certificate(readFileSync(pathFor("root.pem")));
    const leaf = new X509Certificate(readFileSync(pathFor("tsa.pem")));
    expect(root.ca).toBe(true);
    expect(leaf.ca).toBe(false);
    expect(leaf.checkIssued(root) && leaf.verify(root.publicKey)).toBe(true);
    const anchor: TimestampAuthority = { anchorId: ANCHOR_ID, name: "fresh test root only",
      rootCertificatePem: readFileSync(pathFor("root.pem"), "utf8"), policyOids: [POLICY] };
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => { reject(error); };
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => { listenerStarted = true; server.off("error", onError); resolve(); });
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("owned TSA has no IP listener");
    const bound: AddressInfo = address;
    expect(bound.address).toBe("127.0.0.1");
    origin = `http://127.0.0.1:${bound.port}`;
    await body({ workspace, anchor, requests, url: path => new URL(path, origin).href,
      recordResult: result => {
        resultObservation = { failures: [...result.failures], grantPresent: result.grant !== null,
          grant: result.grant === null ? null : { tsa: result.grant.tsa, tokenDerBytes: result.grant.tokenDer.length,
            tokenDerSha256: sha256(result.grant.tokenDer), genTime: result.grant.attested.genTime,
            anchorId: result.grant.attested.tsa.anchorId, signerCertSha256: result.grant.attested.tsa.certSha256,
            policyOid: result.grant.attested.policyOid, messageImprint: { ...result.grant.attested.messageImprint },
            revocationChecked: result.grant.attested.revocationChecked } };
      },
      verifyReply: async path => {
        await Promise.all(drivers);
        if (errors.length) throw errors[0]!.error;
        const signed = requests.filter(request => request.path === path);
        expect(signed).toHaveLength(1);
        const request = signed[0]!;
        if (request.queryFile === null || request.responseFile === null) throw new Error("owned query/response is absent");
        await runOpenSsl("verify-query-bound-reply", ["ts", "-verify", "-queryfile", request.queryFile,
          "-in", request.responseFile, "-CAfile", pathFor("root.pem")]);
        const fields = children(expectTag(parseDer(request.body), 0x30, "captured query"));
        const nonce = uintHex(fields.slice(2).find(field => field.tag === 0x02), "captured request nonce");
        const verified = verifyTimestampToken({ token: readFileSync(request.responseFile), expectedDigestHex: DIGEST,
          nonceHex: nonce, anchors: [anchor] });
        replyObservation = { path, querySha256: sha256(request.body), responseSha256: sha256(readFileSync(request.responseFile)),
          queryBoundOpenSslVerified: true, amcVerified: verified.ok, refusalCode: verified.ok ? null : verified.code };
        expect(verified.ok).toBe(true);
        if (!verified.ok) throw new Error(`real owned reply refused: ${verified.code}`);
        expect(verified.attested.tsa.certSha256).toBe(sha256(leaf.raw));
        expect(verified.attested.tsa.anchorId).toBe(ANCHOR_ID);
        expect(verified.attested.policyOid).toBe(POLICY);
        expect(verified.attested.messageImprint).toEqual({ hashAlgorithm: "sha256", digest: DIGEST });
        expect(verified.attested.revocationChecked).toBe(false);
        return verified.attested;
      } });
  } catch (error) { failed = true; primary = error; }
  finally {
    if (server.listening) {
      try { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      catch (error) { addCleanup(error); }
    }
    try { await Promise.all(drivers); } catch (error) { addCleanup(error); }
    try { await Promise.all(terminals); } catch (error) { addCleanup(error); }
    for (const owned of errors) addCleanup(owned.error);
    try {
      expect(!listenerStarted || listenerClosed).toBe(true);
      expect([...sockets.values()].every(socket => socket.closed)).toBe(true);
      expect(requests.every(request => request.ended && request.closed && request.responseClosed
        && request.responseFinished && request.replyEndCalled && !request.aborted)).toBe(true);
      // Exit status/signals are body assertions; cleanup adds only missing natural closure.
      expect(childrenRun.every(child => child.closeSeen && (!child.spawned || child.exitSeen)
        || child.pid === null && !child.spawned && child.events.some(event => event.event === "spawn-throw"))).toBe(true);
      if (privateRoot !== undefined) {
        expect(lstatSync(privateRoot).mode & 0o777).toBe(0o700);
        if (existsSync(pathFor("home"))) expect(lstatSync(pathFor("home")).mode & 0o777).toBe(0o700);
        for (const name of ownedFiles) checkOwnedFile(name);
      }
    } catch (error) { addCleanup(error); }
    if (privateRoot !== undefined) {
      const publicRecord = { caseId, checkout: CHECKOUT, workspace, retainedPrivateRoot: privateRoot,
        tool: selectedTool ?? null, reviewedDocumentation: { version: REVIEWED_OPENSSL_VERSION, path: REVIEWED_OPENSSL_DOC },
        resultObservation, replyObservation,
        listenerStarted, listenerClosed, socketCount: sockets.size, socketsClosed: [...sockets.values()].every(socket => socket.closed),
        requests: requests.map(({ body: query, headers, ...request }) => ({ ...request, queryBytes: query.length,
          querySha256: sha256(query), contentType: headers["content-type"], accept: headers.accept })),
        children: childrenRun.map(({ errors: childErrors, events, stdout, stderr, ...child }) => ({ ...child,
          events: events.map(({ error, ...event }) => ({ ...event, errorName: error?.name ?? null })),
          errors: childErrors.map(error => ({ name: errorFact(error).name })),
          stdoutArtifact: stdout, stderrArtifact: stderr })),
        ownedErrors: errors.map(({ owner, error }) => ({ owner, name: errorFact(error).name })),
        bodyFailed: failed, cleanupErrorCount: cleanupErrors.length };
      try {
        const privateRecord = { ...publicRecord, primary: failed ? errorFact(primary) : null,
          cleanupErrors: cleanupErrors.map(errorFact), ownedErrors: errors.map(({ owner, error }) => ({ owner, error: errorFact(error) })) };
        writeOwned("private-run.json", JSON.stringify(privateRecord, null, 2));
        const publicPath = writeOwned("public-evidence.json", JSON.stringify(publicRecord, null, 2));
        console.info("P125_TSA_GRANT_EVIDENCE", publicPath);
        console.info("P125_TSA_GRANT_LIFECYCLE", JSON.stringify(publicRecord));
      } catch (error) { addCleanup(error); }
    }
  }
  if (failed && cleanupErrors.length === 0) throw primary;
  if (failed) throw new AggregateError([primary, ...cleanupErrors], "grant body and owned cleanup failed");
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "owned grant cleanup failed");
}

describe("P1-25 optional OpenSSL genuine fresh-query timestamp grants", () => {
  optionalGrantTest("accepts the genuine first grant and never dispatches the later TSA", async () => {
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withGrantFixture("FIRST-GRANT", "/good-first", async fixture => {
      const result = await requestTimestamp({ digestHex: DIGEST, anchors: [fixture.anchor], config: { tsa: [
        { name: "good-first", url: fixture.url("/good-first"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "unused-last", url: fixture.url("/unused-last"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }
      ] } }, fixture.workspace);
      fixture.recordResult(result);
      const attested = await fixture.verifyReply("/good-first");
      expect(fixture.requests.map(request => request.path)).toEqual(["/good-first"]);
      expect(result.failures).toEqual([]);
      // A missing real grant is decisive only after the independent query-bound positive.
      expect(result.grant).not.toBeNull();
      if (result.grant === null) throw new Error("verified first response produced no grant");
      expect(result.grant.tsa).toBe("good-first");
      expect(result.grant.attested).toEqual(attested);
      expect(result.grant.tokenDer).toEqual(Buffer.from(attested.tokenDerB64, "base64"));
    });
  });

  optionalGrantTest("preserves the finite first refusal then accepts the genuine second grant", async () => {
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withGrantFixture("HTTP500-THEN-GRANT", "/good-second", async fixture => {
      const result = await requestTimestamp({ digestHex: DIGEST, anchors: [fixture.anchor], config: { tsa: [
        { name: "http-first", url: fixture.url("/http-first"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "good-second", url: fixture.url("/good-second"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "unused-last", url: fixture.url("/unused-last"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }
      ] } }, fixture.workspace);
      fixture.recordResult(result);
      const attested = await fixture.verifyReply("/good-second");
      expect(fixture.requests.map(request => request.path)).toEqual(["/http-first", "/good-second"]);
      expect(result.failures).toEqual(["http-first: HTTP 500"]);
      expect(result.grant).not.toBeNull();
      if (result.grant === null) throw new Error("verified second response produced no grant");
      expect(result.grant.tsa).toBe("good-second");
      expect(result.grant.attested).toEqual(attested);
      expect(result.grant.tokenDer).toEqual(Buffer.from(attested.tokenDerB64, "base64"));
    });
  });
});
