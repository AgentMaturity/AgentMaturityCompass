/**
 * Signed delegation chains (P2-25): who authorized an agent run, from the human principal (or a service principal the
 * signed workload trust config declares) through each agent and subagent.
 *
 * Each link is signed by the lease authority (the workspace's `lease` purpose key, through the P2-08 provider path), so
 * only Studio or the lease issuer can make one. A link an agent wrote is untrusted and fails verification. Every child
 * link only narrows: its scopes and resources are subsets of its parent's, its notAfter is no later, and its depth stays
 * within DEFAULT_MAX_DELEGATION_DEPTH. `governedAs` (delegationIdentity.ts) keeps its meaning: the chain records who
 * authorized the run, it never changes whose budget and guards govern it.
 *
 * A lease v2 carries the chain's digest; the verifier loads the chain by that digest from the workspace's chain store,
 * so a chain that is missing, tampered with or revoked refuses the lease.
 */
import { randomUUID, sign } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { getSigningKey } from "../crypto/keys.js";
import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { agentLeaseRevocationId } from "../leases/leaseSchema.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { DEFAULT_MAX_DELEGATION_DEPTH } from "./delegationIdentity.js";

const delegateSchema = z.strictObject({ agentId: z.string().min(1), runAs: z.string().min(1), spiffeId: z.string().startsWith("spiffe://").nullable() });
const delegationLinkSchema = z.strictObject({
  v: z.literal(1),
  linkId: z.string().regex(/^dlink_[a-f0-9]{32}$/),
  parentLinkId: z.string().min(1).nullable(),
  depth: z.number().int().nonnegative(),
  principal: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("human"), providerId: z.string().min(1), subject: z.string().min(1) }),
    z.strictObject({ kind: z.literal("service"), serviceId: z.string().min(1) }),
    z.strictObject({ kind: z.literal("agent"), ...delegateSchema.shape })
  ]),
  delegate: delegateSchema,
  scopes: z.array(z.string().min(1)),
  resources: z.array(z.string().min(1)),
  purpose: z.string().min(1).nullable(),
  notBefore: z.number().int(),
  notAfter: z.number().int(),
  /** The P2-24 approval that authorized this hop, when one did. */
  approvalId: z.string().min(1).nullable(),
  signature: z.string().min(1)
});
const delegationChainSchema = z.strictObject({ links: z.array(delegationLinkSchema).min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) });

export type DelegationLink = z.infer<typeof delegationLinkSchema>;
export interface DelegationChain { links: DelegationLink[]; digest: string }
export type UnsignedLink = Omit<DelegationLink, "v" | "linkId" | "parentLinkId" | "depth" | "signature">;

export interface ChainTrust {
  readonly workspace: string;
  /** Service principals the verified workload trust config declares; a chain may start only at one of these or a human. */
  readonly declaredServices: readonly string[];
  /** The verified lease revocation list's ids (`revokedLeaseIdSet`): a revoked link or a revoked agent refuses the chain. */
  readonly revokedIds: ReadonlySet<string>;
  readonly nowMs?: number;
  readonly maxDepth?: number;
}

/** The revocation-list id that revokes one delegation link and every chain below it. */
export function delegationLinkRevocationId(linkId: string): string {
  return `link:${linkId}`;
}

const signingBytes = (link: Omit<DelegationLink, "signature">): Buffer =>
  Buffer.from(`AMC_DELEGATION_LINK_V1\0${canonicalize(link)}`, "utf8");

/** sha256 over the whole chain, signatures included: the value a lease v2 binds. */
export function delegationChainDigest(links: readonly DelegationLink[]): string {
  return sha256Hex(`AMC_DELEGATION_CHAIN_V1\0${canonicalize(links)}`);
}

/** Every element of `child` is in `parent`; a parent "*" covers anything. */
function within(child: readonly string[], parent: readonly string[]): boolean {
  return parent.includes("*") || child.every((item) => parent.includes(item));
}

function sameDelegate(a: DelegationLink["delegate"], b: DelegationLink["delegate"]): boolean {
  return a.agentId === b.agentId && a.runAs === b.runAs && a.spiffeId === b.spiffeId;
}

/** Why one link is not a valid child of `parent` (or a valid root when `parent` is null), or null when it is. */
function linkDefect(link: DelegationLink, index: number, parent: DelegationLink | null, trust: ChainTrust, now: number): string | null {
  const maxDepth = trust.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
  if (link.depth !== index) return `link ${index} claims depth ${link.depth}`;
  if (link.depth > maxDepth) return `delegation depth ${link.depth} exceeds maxDepth ${maxDepth}`;
  const { signature, ...unsigned } = link;
  if (!verifyCurrentPurposeCredentialSignature(trust.workspace, "lease", signingBytes(unsigned), Buffer.from(signature, "base64url"))) {
    return `link ${link.linkId} is not signed by this workspace's lease authority`;
  }
  if (link.notBefore > link.notAfter) return `link ${link.linkId} has an empty validity window`;
  if (now < link.notBefore || now > link.notAfter) return `link ${link.linkId} is not valid now`;
  if (trust.revokedIds.has(delegationLinkRevocationId(link.linkId)) || trust.revokedIds.has(agentLeaseRevocationId(link.delegate.agentId))) {
    return `link ${link.linkId} is revoked`;
  }
  if (parent === null) {
    if (link.parentLinkId !== null) return "the root link names a parent";
    if (link.principal.kind === "agent") return "a chain must start at a human or a declared service, not an agent";
    if (link.principal.kind === "service" && !trust.declaredServices.includes(link.principal.serviceId)) {
      return `service ${link.principal.serviceId} is not declared in the workload trust config`;
    }
    return null;
  }
  if (link.parentLinkId !== parent.linkId) return `link ${link.linkId} does not follow ${parent.linkId}`;
  if (link.principal.kind !== "agent" || !sameDelegate(link.principal, parent.delegate)) return `link ${link.linkId} is not delegated by its parent's delegate`;
  if (!within(link.scopes, parent.scopes)) return `link ${link.linkId} widens its parent's scopes`;
  if (!within(link.resources, parent.resources)) return `link ${link.linkId} widens its parent's resources`;
  if (link.notAfter > parent.notAfter) return `link ${link.linkId} outlives its parent`;
  return null;
}

// ponytail: per-process cache of signature and narrowing results by digest for at most a minute (and never past the
// chain's earliest notAfter); time and revocation are rechecked on every call, so a lease-key revocation takes up to a
// minute to reach a cached chain. Keyed by workspace so one workspace's verdict never answers for another.
const CACHE_MS = 60_000;
const verified = new Map<string, number>();

/**
 * Verify a chain end to end: its digest, every signature, the root, every narrowing step, depth, validity windows and
 * revocations. Pure apart from the signature check against the workspace's lease keys.
 */
export function verifyChain(chain: DelegationChain, trust: ChainTrust): { ok: true } | { ok: false; reason: string } {
  const now = trust.nowMs ?? Date.now();
  const parsed = delegationChainSchema.safeParse(chain);
  if (!parsed.success) return { ok: false, reason: "delegation chain is malformed" };
  const { links, digest } = parsed.data;
  if (delegationChainDigest(links) !== digest) return { ok: false, reason: "delegation chain digest does not match its links" };
  const key = `${trust.workspace}\0${digest}\0${trust.declaredServices.join(",")}\0${trust.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH}`;
  const cachedUntil = verified.get(key);
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index]!;
    if (cachedUntil !== undefined && cachedUntil >= now) {
      // Signatures and narrowing verified before; time and revocation are re-read now.
      if (now < link.notBefore || now > link.notAfter) return { ok: false, reason: `link ${link.linkId} is not valid now` };
      if (trust.revokedIds.has(delegationLinkRevocationId(link.linkId)) || trust.revokedIds.has(agentLeaseRevocationId(link.delegate.agentId))) {
        return { ok: false, reason: `link ${link.linkId} is revoked` };
      }
      continue;
    }
    const defect = linkDefect(link, index, index === 0 ? null : links[index - 1]!, trust, now);
    if (defect !== null) return { ok: false, reason: defect };
  }
  if (new Set(links.map((link) => link.linkId)).size !== links.length) return { ok: false, reason: "delegation chain repeats a link" };
  verified.set(key, Math.min(now + CACHE_MS, ...links.map((link) => link.notAfter)));
  return { ok: true };
}

/** The leaf delegate: the agent this chain authorizes. */
export function chainLeaf(chain: DelegationChain): DelegationLink {
  return chain.links[chain.links.length - 1]!;
}

type Unsigned = Omit<DelegationLink, "signature">;
const newLinkId = (): string => `dlink_${randomUUID().replace(/-/g, "")}`;
const rootUnsigned = (root: UnsignedLink): Unsigned => ({ v: 1, linkId: newLinkId(), parentLinkId: null, depth: 0, ...root });

function childUnsigned(parent: DelegationChain, child: Omit<UnsignedLink, "principal">, trust: ChainTrust): Unsigned {
  const parentCheck = verifyChain(parent, trust);
  if (!parentCheck.ok) throw new Error(`delegation refused: ${parentCheck.reason}`);
  const leaf = chainLeaf(parent);
  return { v: 1, linkId: newLinkId(), parentLinkId: leaf.linkId, depth: leaf.depth + 1, principal: { kind: "agent", ...leaf.delegate }, ...child };
}

/** The chain with `link` appended, verified as a whole; anything that widens, deepens past the cap or does not verify throws. */
function appended(parent: readonly DelegationLink[], link: DelegationLink, trust: ChainTrust): DelegationChain {
  const links = [...parent, link];
  const chain = { links, digest: delegationChainDigest(links) };
  const check = verifyChain(chain, trust);
  if (!check.ok) throw new Error(`delegation refused: ${check.reason}`);
  return chain;
}

async function signLink(workspace: string, unsigned: Unsigned): Promise<DelegationLink> {
  const signed = await signWithPurposeKey(workspace, "lease", signingBytes(unsigned));
  return { ...unsigned, signature: signed.signature.toString("base64url") };
}

/**
 * Signs with the vault's lease key in-process, exactly as `issueLeaseToken` signs the lease that will bind this link, for
 * the synchronous session-composition paths (Studio native tasks, CLI and ACP runs, in-process children). A workspace
 * whose lease key lives in an external provider cannot mint those leases either; it uses the async variants.
 */
function signLinkSync(workspace: string, unsigned: Unsigned): DelegationLink {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize delegation");
  return { ...unsigned, signature: sign(null, signingBytes(unsigned), getSigningKey(workspace, "lease")).toString("base64url") };
}

/**
 * Start a chain at an authenticated human (from a Studio session) or a declared service principal. The caller is the
 * authority: Studio or the lease issuer, never an agent.
 */
export async function issueRootDelegation(workspace: string, root: UnsignedLink, trust: ChainTrust): Promise<DelegationChain> {
  return appended([], await signLink(workspace, rootUnsigned(root)), trust);
}

/** `issueRootDelegation`, signed in-process (see `signLinkSync`). */
export function issueRootDelegationSync(workspace: string, root: UnsignedLink, trust: ChainTrust): DelegationChain {
  return appended([], signLinkSync(workspace, rootUnsigned(root)), trust);
}

/** Extend a verified chain by one hop from its leaf delegate to `child`; refuses anything that would widen. */
export async function extendDelegation(workspace: string, parent: DelegationChain,
  child: Omit<UnsignedLink, "principal">, trust: ChainTrust): Promise<DelegationChain> {
  return appended(parent.links, await signLink(workspace, childUnsigned(parent, child, trust)), trust);
}

/** `extendDelegation`, signed in-process (see `signLinkSync`). */
export function extendDelegationSync(workspace: string, parent: DelegationChain, child: Omit<UnsignedLink, "principal">, trust: ChainTrust): DelegationChain {
  return appended(parent.links, signLinkSync(workspace, childUnsigned(parent, child, trust)), trust);
}

const CHAIN_DIR = ".amc/delegation/chains";
const chainFile = (digest: string): string => `${CHAIN_DIR}/${digest}.json`;

/** Store a chain under its digest. The digest is content-addressed, so a rewritten file fails `verifyChain`. */
export function saveDelegationChain(workspace: string, chain: DelegationChain): string {
  const parsed = delegationChainSchema.parse(chain);
  if (delegationChainDigest(parsed.links) !== parsed.digest) throw new Error("delegation chain digest does not match its links");
  ensureDir(join(workspace, CHAIN_DIR));
  const path = join(workspace, chainFile(parsed.digest));
  writeFileAtomic(path, canonicalize(parsed), 0o644);
  return path;
}

/** The stored chain for `digest`, or null when none is stored or it does not parse; callers verify it. */
export function loadDelegationChain(workspace: string, digest: string): DelegationChain | null {
  if (!/^[a-f0-9]{64}$/.test(digest)) return null;
  try {
    const bytes = readContainedOrNull(workspace, chainFile(digest), 1_048_576);
    if (bytes === null) return null;
    const parsed = delegationChainSchema.safeParse(JSON.parse(bytes.toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** What Studio's session detail shows of a chain (P2-25): each link's principal, delegate, scopes and window, and whether it verifies now. */
export interface DelegationChainView {
  readonly chainDigest: string;
  readonly status: "verified" | "refused" | "unavailable";
  readonly reason: string | null;
  readonly links: readonly { readonly linkId: string; readonly depth: number; readonly principal: string; readonly delegate: string;
    readonly scopes: readonly string[]; readonly notAfter: number }[];
}

export function delegationChainView(workspace: string, digest: string, trust: Omit<ChainTrust, "workspace">): DelegationChainView {
  const chain = loadDelegationChain(workspace, digest);
  if (chain === null || chain.digest !== digest) return { chainDigest: digest, status: "unavailable", reason: "the chain is not in this workspace's chain store", links: [] };
  const verified = verifyChain(chain, { ...trust, workspace });
  const principal = (link: DelegationLink): string => link.principal.kind === "human" ? `human:${link.principal.providerId}:${link.principal.subject}`
    : link.principal.kind === "service" ? `service:${link.principal.serviceId}` : `agent:${link.principal.runAs}`;
  return { chainDigest: digest, status: verified.ok ? "verified" : "refused", reason: verified.ok ? null : verified.reason,
    links: chain.links.map((link) => ({ linkId: link.linkId, depth: link.depth, principal: principal(link), delegate: link.delegate.runAs,
      scopes: [...link.scopes], notAfter: link.notAfter })) };
}
