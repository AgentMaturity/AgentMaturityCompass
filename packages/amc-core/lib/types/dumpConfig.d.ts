import type { CompositionSource } from "./composition.ts";
export interface DumpedEntry {
    id: string;
    name: string;
    disabled: boolean;
    /** Where this entry came from — the composition file, or a patch over it. */
    source: string;
    config: unknown;
    children?: DumpedEntry[];
}
export interface CompositionDump {
    composition: {
        path: string;
        sha256: string;
        signed: boolean;
        signatureReason: string | null;
    };
    entries: DumpedEntry[];
}
/**
 * Reads the composition file and describes the tree it declares.
 *
 * Deliberately reads the file rather than the live context: `--dump-config`
 * must work without booting, so an operator can inspect a composition that does
 * not currently start.
 */
export declare function dumpComposition(composition: CompositionSource): CompositionDump;
/** Human-readable form, for the CLI's non-JSON output. */
export declare function renderCompositionDump(dump: CompositionDump): string;
//# sourceMappingURL=dumpConfig.d.ts.map