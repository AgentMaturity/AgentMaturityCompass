import { LlmError } from "../llmFailure.js";
import type { StreamChunk } from "../streamChunk.js";

/** A provider may only call the names offered by this exact signed request. */
export class ProviderToolBinding {
  private readonly observed = new Map<number, string>();

  constructor(private readonly names: ReadonlyMap<string, string>) {}

  private resolve(index: number, wireName: string): string {
    const previous = this.observed.get(index);
    if (previous !== undefined && previous !== wireName) {
      throw new LlmError(`provider changed tool name from ${JSON.stringify(previous)} to ${JSON.stringify(wireName)}`,
        "AMC_LLM_TOOL_NAME_CHANGED");
    }
    const name = this.names.get(wireName);
    if (name === undefined) {
      throw new LlmError(`provider returned unoffered tool name ${JSON.stringify(wireName)}`,
        "AMC_LLM_UNOFFERED_TOOL_NAME");
    }
    this.observed.set(index, wireName);
    return name;
  }

  /** Decoded provider identity is retained alongside the exact internal name. */
  bind(chunk: StreamChunk): StreamChunk {
    if (chunk.type === "tool-call-delta") {
      // Only this boundary may supply provenance, including on an interrupted
      // nameless delta from a custom adapter.
      const { providerWireName: _ignored, ...raw } = chunk;
      return chunk.name !== undefined && chunk.name.length > 0
        ? { ...raw, name: this.resolve(chunk.index, chunk.name), providerWireName: chunk.name } : raw;
    }
    if (chunk.type === "block-end" && chunk.block.kind === "tool_use") {
      return { ...chunk, block: { ...chunk.block, name: this.resolve(chunk.index, chunk.block.name),
        providerWireName: chunk.block.name } };
    }
    return chunk;
  }
}
