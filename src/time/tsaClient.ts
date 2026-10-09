import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { canonicalHost, decideEgress } from "../enforce/egressAllowlist.js";
import { getWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { checkScopedEgress, EgressBlocked } from "../residency/checkEgress.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import type { TimestampAuthority } from "../trust/trustList.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { encode, encodeOid, encodeUint } from "./der.js";
import { DEFAULT_TOLERANCE_MINUTES, type AttestedTime } from "./timeEvidence.js";
import { TIMESTAMP_TOKEN_MAX_BYTES, timestampAnchors, verifyTimestampToken } from "./verifyTimestamp.js";

/**
 * RFC 3161 client (P1-25). TSAs come only from the operator's `.amc/amc.config.yaml` `time.tsa`, are tried in order,
 * and every reply is verified offline against the TSA anchors of the operator's signature-verified trust lists before
 * it counts. Transport is RFC 3161 §3.4 over HTTP(S), one POST per TSA, no redirects, a 10-second timeout and a
 * 64 KiB reply cap.
 */
export const TSA_TIMEOUT_MS = 10_000;
const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const oidPattern = /^[0-2](\.(0|[1-9][0-9]*))+$/;

export const timeConfigSchema = z.strictObject({
  tsa: z.array(z.strictObject({
    name: z.string().min(1),
    url: z.url({ protocol: /^https?$/ }),
    /** Trust-list `timestampAuthorities[].anchorId`s this TSA's tokens must chain to. */
    anchorIds: z.array(z.string().min(1)).min(1),
    reqPolicy: z.string().regex(oidPattern).optional()
  })).default([]),
  /** When true, ledger checkpoints and certificate issuance fail without a verified token. */
  required: z.boolean().default(false),
  toleranceMinutes: z.number().int().min(0).max(1440).default(DEFAULT_TOLERANCE_MINUTES),
  checkpoint: z.strictObject({
    everyEvents: z.number().int().min(1).default(1000),
    everyMinutes: z.number().int().min(1).default(15)
  }).prefault({})
}).refine(config => !config.required || config.tsa.length > 0, "time.required needs at least one time.tsa entry");
export type TimeConfig = z.infer<typeof timeConfigSchema>;

/** The `time` section of `.amc/amc.config.yaml`, defaults when absent; an invalid section throws. */
export function loadTimeConfig(workspace: string): TimeConfig {
  const path = join(workspace, ".amc", "amc.config.yaml");
  const raw = pathExists(path) ? (YAML.parse(readUtf8(path)) as { time?: unknown } | null)?.time : undefined;
  const parsed = timeConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new Error(`amc.config.yaml time: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
}

/** DER TimeStampReq v1: SHA-256 imprint, a random nonce (top bit set, so 64 bits on the wire), certReq true. */
export function buildTimestampRequest(digestHex: string, reqPolicy?: string): { der: Buffer; nonceHex: string } {
  if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new Error("a timestamp request needs a sha256 hex digest");
  const nonce = randomBytes(8);
  nonce[0] = nonce[0]! | 0x80;
  const der = encode(0x30,
    encode(0x02, Buffer.from([1])),
    encode(0x30, encode(0x30, encodeOid(SHA256_OID), Buffer.from([0x05, 0x00])), encode(0x04, Buffer.from(digestHex, "hex"))),
    ...(reqPolicy ? [encodeOid(reqPolicy)] : []),
    encodeUint(nonce),
    Buffer.from([0x01, 0x01, 0xff]));
  return { der, nonceHex: nonce.toString("hex") };
}

/**
 * The address to connect to, decided by decideEgress with the configured host as the only entry: a name must resolve
 * to public addresses only (no DNS rebinding or metadata SSRF through it), and a non-public address is reachable
 * only when the operator wrote that exact IP literal in the URL. The connection goes to the checked address.
 */
async function checkedAddress(host: string): Promise<string> {
  if (isIP(host) !== 0) return host;
  const addresses = (await lookup(host, { all: true, verbatim: true })).map(entry => entry.address);
  const decision = addresses.length ? decideEgress(host, addresses, { allowHosts: [host] }) : { allowed: false, reason: `${host} did not resolve` };
  if (!decision.allowed) throw new Error(`egress refused: ${decision.reason}`);
  return addresses[0]!;
}

/**
 * POSTs `body` to an operator-configured URL through the egress check (checkedAddress) and returns the reply body.
 * Only `expect.status` with content type `expect.accept` is accepted; redirects are refused, replies are capped at
 * `expect.maxBytes`. P1-26's Rekor client shares it.
 */
export async function postToConfiguredUrl(url: URL, body: Buffer, expect: {
  contentType: string; accept: string; status: number; maxBytes: number; timeoutMs: number;
}, workspace?: string): Promise<Buffer> {
  const scope = workspace === undefined ? getWorkspaceScope() : workspace;
  const capturedUrl = url.href;
  const target = new URL(capturedUrl);
  const payload = Buffer.from(body);
  const { contentType, accept, status: expectedStatus, maxBytes, timeoutMs } = expect;
  if (target.username || target.password) throw new Error("a configured URL must not carry credentials");
  const host = canonicalHost(target.hostname);
  const address = await checkedAddress(host);
  const https = target.protocol === "https:";
  const options: RequestOptions & { servername?: string } = {
    host: address, port: target.port || (https ? 443 : 80), method: "POST", path: `${target.pathname}${target.search}`, agent: false, setHost: false,
    headers: { host: target.host, "content-type": contentType, accept, "content-length": payload.length },
    signal: AbortSignal.timeout(timeoutMs),
    // TLS checks the certificate against the configured name, not the address it resolved to.
    ...(https && isIP(host) === 0 ? { servername: host } : {})
  };
  return await new Promise<Buffer>((resolve, reject) => {
    checkScopedEgress(scope, "network-tool", capturedUrl, { dataClasses: null, purpose: null, agentId: "system" });
    const request = (https ? httpsRequest : httpRequest)(options, (response: IncomingMessage) => {
      const type = (response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const status = response.statusCode ?? 0;
      if (status !== expectedStatus || type !== accept) {
        response.resume();
        reject(new Error(status >= 300 && status < 400 ? `redirect (HTTP ${status}) refused`
          : status !== expectedStatus ? `HTTP ${status}` : `content type "${type}" is not ${accept}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) request.destroy(new Error(`reply exceeds ${maxBytes} bytes`));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(payload);
  });
}

/** POSTs a timestamp query and returns the reply body. Redirects, other statuses and other content types are refused. */
export async function postTimestampQuery(url: URL, body: Buffer, timeoutMs = TSA_TIMEOUT_MS, workspace?: string): Promise<Buffer> {
  return await postToConfiguredUrl(url, body, { contentType: "application/timestamp-query", accept: "application/timestamp-reply",
    status: 200, maxBytes: TIMESTAMP_TOKEN_MAX_BYTES, timeoutMs }, workspace);
}

export interface TimestampGrant { tsa: string; tokenDer: Buffer; attested: AttestedTime }

/** Tries each configured TSA in order; the first reply that verifies (imprint, nonce, policy, pinned anchor) wins. */
export async function requestTimestamp(input: {
  digestHex: string;
  config: Pick<TimeConfig, "tsa">;
  anchors: readonly TimestampAuthority[];
  timeoutMs?: number;
}, workspace?: string): Promise<{ grant: TimestampGrant | null; failures: string[] }> {
  const scope = workspace === undefined ? getWorkspaceScope() : workspace;
  const { digestHex, timeoutMs } = input;
  const tsas = input.config.tsa.map(tsa => ({ name: tsa.name, url: tsa.url, reqPolicy: tsa.reqPolicy, anchorIds: [...tsa.anchorIds] }));
  const pinned = input.anchors.map(anchor => ({ anchorId: anchor.anchorId, name: anchor.name, rootCertificatePem: anchor.rootCertificatePem,
    policyOids: anchor.policyOids ? [...anchor.policyOids] : undefined }));
  const failures: string[] = [];
  let firstBlocked: EgressBlocked | undefined;
  let denied = 0;
  for (const tsa of tsas) {
    const anchors = pinned.filter(anchor => tsa.anchorIds.includes(anchor.anchorId));
    if (!anchors.length) {
      failures.push(`${tsa.name}: none of its anchorIds (${tsa.anchorIds.join(", ")}) is in a verified trust list`);
      continue;
    }
    try {
      const { der, nonceHex } = buildTimestampRequest(digestHex, tsa.reqPolicy);
      const reply = await postTimestampQuery(new URL(tsa.url), der, timeoutMs, scope);
      const verified = verifyTimestampToken({ token: reply, expectedDigestHex: digestHex, nonceHex, anchors });
      if (!verified.ok) failures.push(`${tsa.name}: ${verified.code}: ${verified.detail}`);
      else if (tsa.reqPolicy && verified.attested.policyOid !== tsa.reqPolicy) failures.push(`${tsa.name}: token policy ${verified.attested.policyOid} is not the requested ${tsa.reqPolicy}`);
      else return { grant: { tsa: tsa.name, tokenDer: Buffer.from(verified.attested.tokenDerB64, "base64"), attested: verified.attested }, failures };
    } catch (error) {
      if (error instanceof EgressBlocked) { firstBlocked ??= error; denied += 1; }
      failures.push(`${tsa.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (firstBlocked && denied === tsas.length) throw firstBlocked;
  return { grant: null, failures };
}

/**
 * Timestamps `digestHex` with the workspace's configured TSAs and the operator's TSA anchors. `grant` is null when no
 * TSA is configured or none granted a verified token; the caller decides, with `config.required`, whether that fails.
 * When residency denies every configured TSA, the original typed refusal propagates.
 */
export async function timestampDigest(workspace: string, digestHex: string, trust?: TrustContext): Promise<{
  config: TimeConfig; grant: TimestampGrant | null; failures: string[];
}> {
  const config = loadTimeConfig(workspace);
  if (!config.tsa.length) return { config, grant: null, failures: [] };
  return { config, ...await requestTimestamp({ digestHex, config, anchors: timestampAnchors(trust ?? loadTrustContext()) }, workspace) };
}
