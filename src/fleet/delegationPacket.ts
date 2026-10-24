import {
  createHandoffPacket,
  removeHandoffPacket,
  removeHandoffPacketIfCurrent,
  verifyHandoffPacket,
  type HandoffPacket
} from "./handoffPacket.js";
import { createHandoffPacketAsync } from "./handoffPacketSigning.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";

/**
 * The signed packet that authorises one child run to exist (P6.1a).
 *
 * WHY A WRAPPER RATHER THAN A NEW PACKET FORMAT. `createHandoffPacket` already
 * produces a zod-schema'd, canonically-signed, receipt-bearing record, and it is
 * the format `amc fleet handoff verify` already knows how to check. Inventing a
 * second one would give delegation its own unverifiable dialect.
 *
 * WHY IT CANNOT BE UNSIGNED. `createHandoffPacket` degrades quietly:
 *
 *     let signature = "unsigned";
 *     try { signature = signHexDigest(...); } catch { /* unsigned *\/ }
 *     writeFileAtomic(handoffFilePath(workspace, packetId), ...);
 *
 * The file is written either way, and `verifyHandoffPacket` reports it invalid
 * later — `verifyCanonicalBodySignature` returns false the moment it sees
 * `"unsigned"`. For a handoff between two operators that deferral is survivable:
 * someone verifies before accepting.
 *
 * For a DELEGATION it is not. The packet is what authorises the child to run, so
 * a packet that cannot be verified authorises nothing — and discovering that
 * after the child has already executed is discovering it too late. So minting
 * fails loudly at mint time, and **leaves no file behind**: an unsigned packet on
 * disk is worse than no packet, because a later reader finds a record of an
 * authorisation that never held.
 */

export interface DelegationPacketRequest {
  /** The parent's identity. `governedAs` travels with the packet. */
  readonly parent: DelegationIdentity;
  /** The child's identity, from `delegateTo`. */
  readonly child: DelegationIdentity;
  /** What the child is being asked to do. */
  readonly goal: string;
  /**
   * Action classes the parent is willing to sub-delegate.
   *
   * Recorded on the packet as the parent's declared intent. It is not the
   * enforcement point — guards are — and this module does not pretend otherwise.
   */
  readonly delegationScope?: readonly string[];
  /**
   * Signed declaration. Native spawn validates and enforces max-turns:N and
   * timeout-ms:N; minting this packet alone does not execute or enforce them.
   */
  readonly stopConditions?: readonly string[];
}

/** A refused delegation. A partial publication cause records any uncertain on-disk member. */
export class UnsignablePacketError extends Error {
  constructor(reason: string, cause?: unknown) {
    super(`refusing to authorise a delegation without a signed packet: ${reason}`, { cause });
    this.name = "UnsignablePacketError";
  }
}

/**
 * Mint the packet that authorises a child, or refuse.
 *
 * `fromAgentId`/`toAgentId` carry the two runs' OWN names, because that is what
 * the packet is a record of. The governance identity travels separately in
 * `constraints`, where a reader can see that both ends are metered as the same
 * root — a packet whose two ends disagreed about that would be a delegation
 * across a governance boundary, which this path does not do.
 */
export function mintDelegationPacket(
  workspace: string,
  request: DelegationPacketRequest
): HandoffPacket {
  if (request.child.governedAs !== request.parent.governedAs) {
    throw new UnsignablePacketError(
      `child is governed as ${request.child.governedAs} but parent as ${request.parent.governedAs}`
    );
  }

  const packet = createHandoffPacket(workspace, {
    fromAgentId: request.parent.runAs,
    toAgentId: request.child.runAs,
    goal: request.goal,
    delegationScope: [...(request.delegationScope ?? [])],
    stopConditions: [...(request.stopConditions ?? [])],
    constraints: [
      `governedAs=${request.child.governedAs}`,
      `depth=${request.child.depth}`
    ]
  });

  // The post-check is the load-bearing one: it asks the same verifier the rest
  // of the product asks, rather than trusting that signing worked.
  const verification = verifyHandoffPacket(workspace, packet.packetId);
  if (!verification.valid || !verification.signatureValid || packet.signature === "unsigned") {
    // Through the owner module, not a path rebuilt here. A duplicated layout
    // would leave exactly the orphan this branch exists to prevent — the first
    // version of this file guessed the directory name and the orphan test
    // caught it.
    removeHandoffPacket(workspace, packet.packetId);
    throw new UnsignablePacketError(
      verification.errors.length > 0 ? verification.errors.join("; ") : "signature did not verify"
    );
  }

  return packet;
}

/** Actual native mint; no announcement/session/runner effect occurs while signing is awaited. */
export async function mintDelegationPacketAsync(workspace: string, request: DelegationPacketRequest,
  options: { signal?: AbortSignal } = {}): Promise<HandoffPacket> {
  const captured = structuredClone(request), signal = options.signal;
  if (captured.child.governedAs !== captured.parent.governedAs) {
    throw new UnsignablePacketError(`child is governed as ${captured.child.governedAs} but parent as ${captured.parent.governedAs}`);
  }
  let packet: HandoffPacket;
  try {
    packet = await createHandoffPacketAsync(workspace, {
      fromAgentId: captured.parent.runAs, toAgentId: captured.child.runAs, goal: captured.goal,
      delegationScope: [...(captured.delegationScope ?? [])], stopConditions: [...(captured.stopConditions ?? [])],
      constraints: [`governedAs=${captured.child.governedAs}`, `depth=${captured.child.depth}`]
    }, { signal, requireUnexpired: true });
  } catch (cause) {
    const code = (cause as { code?: unknown } | null)?.code;
    throw new UnsignablePacketError(code === "HANDOFF_PUBLICATION_PARTIAL" ? "HANDOFF_PUBLICATION_PARTIAL; an attempted packet member may exist"
      : typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "handoff signing or publication refused", cause);
  }
  const verification = verifyHandoffPacket(workspace, packet.packetId);
  if (signal?.aborted || !verification.valid || !verification.signatureValid || packet.signature === "unsigned") {
    removeHandoffPacketIfCurrent(workspace, packet);
    throw new UnsignablePacketError(signal?.aborted ? "parent gave up before the delegation was authorised" : "signature did not verify");
  }
  return packet;
}
