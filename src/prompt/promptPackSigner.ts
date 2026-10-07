import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { promptPackSignatureSchema, type PromptPack, type PromptPackSignature } from "./promptPackSchema.js";

export function signPromptPack(workspace: string, pack: PromptPack): PromptPackSignature {
  const signed = signSerializedPayloadWithAuditor(workspace, canonicalize(pack));
  return promptPackSignatureSchema.parse(signed);
}

export function digestPromptPack(pack: PromptPack): string {
  return sha256Hex(Buffer.from(canonicalize(pack), "utf8"));
}

