import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
/** Checked async direct-purpose handoffs. Existing synchronous APIs remain in the owner module. */
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import {
  captureHandoffFiles, assertHandoffFilesCurrent, handoffFilePath, handoffPacketSchema, handoffReceiverReceiptSchema,
  prepareHandoffPacket, prepareHandoffAcceptance, publishHandoffPacket, publishHandoffAcceptance,
  type HandoffCreateParams, type HandoffAcceptParams, type HandoffPacket, type HandoffReceiverReceipt
} from "./handoffPacket.js";

function assertAsyncHandoffSigning(): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Handoff signing is unavailable in no-sign mode");
}
function assertPacketAdmission(packet: Pick<HandoffPacket, "expiryTs">, options: { signal?: AbortSignal; requireUnexpired?: boolean }): void {
  if (options.signal?.aborted) throw new Error("parent gave up before the delegation was authorised");
  if (options.requireUnexpired && Date.now() > packet.expiryTs) throw new Error("Cannot authorise an expired handoff packet");
}
function digest(body: unknown): Buffer { return Buffer.from(sha256Hex(canonicalize(body)), "hex"); }

/** Direct create retains expired-record compatibility; native mint requests strict unexpired admission. */
export async function createHandoffPacketAsync(workspace: string, params: HandoffCreateParams,
  options: { signal?: AbortSignal; requireUnexpired?: boolean } = {}): Promise<HandoffPacket> {
  const capturedOptions = { ...options };
  assertAsyncHandoffSigning();
  const prepared = prepareHandoffPacket(params), authority = capturePurposePublication(workspace, "artifact-seal");
  const files = captureHandoffFiles([handoffFilePath(workspace, prepared.baseBody.packetId)]);
  const originalAuthority = captureRunHashAuthority(workspace, false);
  const beforeSenderSign = () => {
    assertAsyncHandoffSigning(); assertPacketAdmission(prepared.baseBody, capturedOptions);
    originalAuthority(); assertHandoffFilesCurrent(files);
  };
  beforeSenderSign();
  const sender = await signWithPurposeKey(workspace, "artifact-seal", digest(prepared.senderReceiptWithoutSignature), { beforeSign: beforeSenderSign });
  const senderReceipt = handoffPacketSchema.shape.senderReceipt.parse({
    ...prepared.senderReceiptWithoutSignature, signature: sender.signature.toString("base64")
  });
  const body = { ...prepared.baseBody, senderReceipt };
  const beforeOuterSign = () => { beforeSenderSign(); assertPurposePublicationCurrent(workspace, authority, sender); assertHandoffFilesCurrent(files); };
  beforeOuterSign();
  const outer = await signWithPurposeKey(workspace, "artifact-seal", digest(body), { beforeSign: beforeOuterSign });
  const packet = handoffPacketSchema.parse({ ...body, signature: outer.signature.toString("base64") });
  publishHandoffPacket(workspace, packet, files, () => {
    beforeOuterSign(); assertPurposePublicationCurrent(workspace, authority, outer);
  });
  return packet;
}

export async function acceptHandoffPacketAsync(workspace: string, packetId: string,
  params: HandoffAcceptParams = {}): Promise<HandoffReceiverReceipt> {
  assertAsyncHandoffSigning();
  const prepared = prepareHandoffAcceptance(workspace, packetId, params);
  const authority = capturePurposePublication(workspace, "artifact-seal"), originalAuthority = captureRunHashAuthority(workspace, false);
  const beforeSign = () => {
    assertAsyncHandoffSigning(); originalAuthority();
    if (Date.now() > prepared.packet.expiryTs) throw new Error("Cannot accept an expired handoff packet");
    assertHandoffFilesCurrent(prepared.files);
  };
  const signed = await signWithPurposeKey(workspace, "artifact-seal", digest(prepared.receiptWithoutSignature), { beforeSign });
  const receipt = handoffReceiverReceiptSchema.parse({ ...prepared.receiptWithoutSignature, signature: signed.signature.toString("base64") });
  publishHandoffAcceptance(workspace, prepared, receipt, () => {
    beforeSign(); assertPurposePublicationCurrent(workspace, authority, signed);
  });
  return receipt;
}
