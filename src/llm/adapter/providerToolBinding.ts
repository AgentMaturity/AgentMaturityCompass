import { LlmError } from "../llmFailure.js";
import type { StreamChunk } from "../streamChunk.js";
import { providerToolWireName } from "../request/providerToolNames.js";

/**
 * A provider may only call the names offered by this exact signed request.
 *
 * An offered wire name is bound to its canonical tool identity. Any other name is passed through verbatim and marked
 * `unoffered` — never bound, not even to an offered tool whose canonical name it happens to equal — so the loop can
 * answer that one call with a refusal the model can correct instead of failing the whole turn (smoke M-5).
 */
export class ProviderToolBinding {
  private readonly observed = new Map<number, string>();

  constructor(private readonly names: ReadonlyMap<string, string>) {}

  private resolve(index: number, wireName: string): string | undefined {
    const previous = this.observed.get(index);
    if (previous !== undefined && previous !== wireName) {
      throw new LlmError(`provider changed tool name from ${JSON.stringify(previous)} to ${JSON.stringify(wireName)}`,
        "AMC_LLM_TOOL_NAME_CHANGED");
    }
    this.observed.set(index, wireName);
    const name = this.names.get(wireName);
    if (name === undefined) {
      // The refused call is replayed in later requests under this name, so it must be a name the encoder can carry.
      try { providerToolWireName(wireName); } catch {
        throw new LlmError(`provider returned unoffered tool name ${JSON.stringify(wireName)}`, "AMC_LLM_UNOFFERED_TOOL_NAME");
      }
    }
    return name;
  }

  /** Decoded provider identity is retained alongside the exact internal name. */
  bind(chunk: StreamChunk): StreamChunk {
    if (chunk.type === "tool-call-delta") {
      // Only this boundary may supply provenance, including on an interrupted
      // nameless delta from a custom adapter.
      const { providerWireName: _ignored, unoffered: _unoffered, ...raw } = chunk;
      if (chunk.name === undefined || chunk.name.length === 0) return raw;
      const name = this.resolve(chunk.index, chunk.name);
      return name === undefined ? { ...raw, unoffered: true } : { ...raw, name, providerWireName: chunk.name };
    }
    if (chunk.type === "block-end" && chunk.block.kind === "tool_use") {
      const { providerWireName: _ignored, unoffered: _unoffered, ...block } = chunk.block;
      const name = this.resolve(chunk.index, block.name);
      return { ...chunk, block: name === undefined ? { ...block, unoffered: true } : { ...block, name, providerWireName: block.name } };
    }
    return chunk;
  }
}
