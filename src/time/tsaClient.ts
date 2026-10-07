import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { canonicalHost, decideEgress } from "../enforce/egressAllowlist.js";
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

/** POSTs a timestamp query and returns the reply body. Redirects, other statuses and other content types are refused. */
export async function postTimestampQuery(url: URL, body: Buffer, timeoutMs = TSA_TIMEOUT_MS): Promise<Buffer> {
  if (url.username || url.password) throw new Error("a TSA URL must not carry credentials");
  const host = canonicalHost(url.hostname);
  const address = await checkedAddress(host);
  const https = url.protocol === "https:";
  const options: RequestOptions & { servername?: string } = {
    host: address, port: url.port || (https ? 443 : 80), method: "POST", path: `${url.pathname}${url.search}`, agent: false, setHost: false,
    headers: { host: url.host, "content-type": "application/timestamp-query", accept: "application/timestamp-reply", "content-length": body.length },
    signal: AbortSignal.timeout(timeoutMs),
    // TLS checks the certificate against the configured name, not the address it resolved to.
    ...(https && isIP(host) === 0 ? { servername: host } : {})
  };
  return await new Promise<Buffer>((resolve, reject) => {
    const request = (https ? httpsRequest : httpRequest)(options, (response: IncomingMessage) => {
      const type = (response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const status = response.statusCode ?? 0;
      if (status !== 200 || type !== "application/timestamp-reply") {
        response.resume();
        reject(new Error(status >= 300 && status < 400 ? `redirect (HTTP ${status}) refused`
          : status !== 200 ? `HTTP ${status}` : `content type "${type}" is not application/timestamp-reply`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > TIMESTAMP_TOKEN_MAX_BYTES) request.destroy(new Error(`reply exceeds ${TIMESTAMP_TOKEN_MAX_BYTES} bytes`));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(body);
  });
}

export interface TimestampGrant { tsa: string; tokenDer: Buffer; attested: AttestedTime }

/** Tries each configured TSA in order; the first reply that verifies (imprint, nonce, policy, pinned anchor) wins. */
export async function requestTimestamp(input: {
  digestHex: string;
  config: Pick<TimeConfig, "tsa">;
  anchors: readonly TimestampAuthority[];
  timeoutMs?: number;
}): Promise<{ grant: TimestampGrant | null; failures: string[] }> {
  const failures: string[] = [];
  for (const tsa of input.config.tsa) {
    const anchors = input.anchors.filter(anchor => tsa.anchorIds.includes(anchor.anchorId));
    if (!anchors.length) {
      failures.push(`${tsa.name}: none of its anchorIds (${tsa.anchorIds.join(", ")}) is in a verified trust list`);
      continue;
    }
    try {
      const { der, nonceHex } = buildTimestampRequest(input.digestHex, tsa.reqPolicy);
      const reply = await postTimestampQuery(new URL(tsa.url), der, input.timeoutMs);
      const verified = verifyTimestampToken({ token: reply, expectedDigestHex: input.digestHex, nonceHex, anchors });
      if (!verified.ok) failures.push(`${tsa.name}: ${verified.code}: ${verified.detail}`);
      else if (tsa.reqPolicy && verified.attested.policyOid !== tsa.reqPolicy) failures.push(`${tsa.name}: token policy ${verified.attested.policyOid} is not the requested ${tsa.reqPolicy}`);
      else return { grant: { tsa: tsa.name, tokenDer: Buffer.from(verified.attested.tokenDerB64, "base64"), attested: verified.attested }, failures };
    } catch (error) {
      failures.push(`${tsa.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { grant: null, failures };
}

/**
 * Timestamps `digestHex` with the workspace's configured TSAs and the operator's TSA anchors. `grant` is null when no
 * TSA is configured or none granted a verified token; the caller decides, with `config.required`, whether that fails.
 */
export async function timestampDigest(workspace: string, digestHex: string, trust?: TrustContext): Promise<{
  config: TimeConfig; grant: TimestampGrant | null; failures: string[];
}> {
  const config = loadTimeConfig(workspace);
  if (!config.tsa.length) return { config, grant: null, failures: [] };
  return { config, ...await requestTimestamp({ digestHex, config, anchors: timestampAnchors(trust ?? loadTrustContext()) }) };
}
