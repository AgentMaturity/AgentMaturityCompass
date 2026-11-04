/**
 * The one place AMC loads `@earendil-works/pi-ai` (P1-38, ADR-016).
 *
 * pi-ai is an OPTIONAL peer pinned to one reviewed version. A competitor controls it and releases often, so a version
 * that merely satisfies a range is refused: the request bytes AMC records are a function of this exact build (see
 * piAiEncoder.ts), and a different build is a different encoder. Nothing here runs unless a `pi-ai:<provider>` route
 * is selected or a session that used one is verified; every other import of this directory is lazy.
 *
 * Types below are AMC's own description of the subset it reads. Importing pi-ai's declarations would make AMC's
 * published types depend on an optional package.
 */
import { readFileSync } from "node:fs";
import semver from "semver";

export const PI_AI_PACKAGE = "@earendil-works/pi-ai";
export const PI_AI_VERSION = "1.3.0";
/** `engines.node` of the pinned build. AMC's own floor stays >=20 (D-12 owns raising it). */
export const PI_AI_NODE_FLOOR = "22.19.0";
/** Providers no native route covers whose pinned catalog uses `openai-completions` (ADR-016 allowlist). */
export const PI_AI_PROVIDERS = ["groq", "huggingface", "together"] as const;
export type PiAiProviderId = typeof PI_AI_PROVIDERS[number];

export const PI_AI_REMEDIATION = `The pi-ai route needs ${PI_AI_PACKAGE}@${PI_AI_VERSION} and Node ${PI_AI_NODE_FLOOR} or later; `
  + `install it with pnpm add -D ${PI_AI_PACKAGE}@${PI_AI_VERSION}, or use a native route.`;

/** A pinned catalog entry, as far as AMC reads it. The object itself is handed back to pi-ai untouched. */
export interface PiAiModel {
  readonly id: string;
  readonly api: string;
  readonly provider: string;
  readonly baseUrl: string;
  readonly reasoning: boolean;
  readonly input: readonly string[];
  readonly contextWindow: number;
  readonly maxTokens: number;
}

export interface PiAiLibrary {
  readonly version: string;
  /** `api/openai-completions` `stream`: builds the payload, hands it to `onPayload`, then sends. */
  readonly streamCompletions: (model: PiAiModel, context: unknown, options: Record<string, unknown>) => unknown;
  /** `utils/transcript` `normalizeContext`: folds system prompt and tools into the leading system message. */
  readonly normalizeContext: (context: Record<string, unknown>) => unknown;
  readonly catalogs: Readonly<Record<PiAiProviderId, Readonly<Record<string, PiAiModel>>>>;
}

export class PiAiUnavailableError extends Error {
  readonly code = "AMC_PI_AI_UNAVAILABLE";
  constructor(reason: string) {
    super(`${reason}. ${PI_AI_REMEDIATION}`);
    this.name = "PiAiUnavailableError";
  }
}

export interface PiAiLoaderDeps {
  readonly nodeVersion?: string;
  /** The installed package's version, or null when it is absent. */
  readonly installedVersion?: () => string | null;
  readonly importModule?: (specifier: string) => Promise<Record<string, unknown>>;
}

const CATALOG_EXPORTS: Readonly<Record<PiAiProviderId, string>> = Object.freeze({
  groq: "GROQ_MODELS", huggingface: "HUGGINGFACE_MODELS", together: "TOGETHER_MODELS"
});

/** Version from the manifest next to the resolved entry point; null when the package does not resolve. */
function installedPiAiVersion(): string | null {
  let entry: string;
  try { entry = import.meta.resolve(PI_AI_PACKAGE); } catch { return null; }
  // The pinned build's entry is dist/index.js. A different layout fails to parse here and is refused below.
  try {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", entry), "utf8")) as { name?: unknown; version?: unknown };
    return manifest.name === PI_AI_PACKAGE && typeof manifest.version === "string" ? manifest.version : "unreadable";
  } catch {
    return "unreadable";
  }
}

async function member(load: NonNullable<PiAiLoaderDeps["importModule"]>, subpath: string, name: string): Promise<unknown> {
  const specifier = `${PI_AI_PACKAGE}/${subpath}`;
  const value = (await load(specifier))[name];
  if (value === undefined || value === null) {
    throw new PiAiUnavailableError(`${PI_AI_PACKAGE}@${PI_AI_VERSION} does not export ${name} from ${specifier}`);
  }
  return value;
}

/** Check Node, then the installed version, then import the reviewed modules. Each failure names the remediation. */
export async function loadPiAi(deps: PiAiLoaderDeps = {}): Promise<PiAiLibrary> {
  const node = deps.nodeVersion ?? process.versions.node;
  if (!semver.valid(node) || semver.lt(node, PI_AI_NODE_FLOOR)) {
    throw new PiAiUnavailableError(`Node ${node} is below the pi-ai floor ${PI_AI_NODE_FLOOR}`);
  }
  const installed = (deps.installedVersion ?? installedPiAiVersion)();
  if (installed === null) throw new PiAiUnavailableError(`${PI_AI_PACKAGE} is not installed`);
  if (installed !== PI_AI_VERSION) {
    throw new PiAiUnavailableError(`${PI_AI_PACKAGE}@${installed} is installed, not the reviewed pin ${PI_AI_VERSION}`);
  }
  const load = deps.importModule ?? ((specifier: string) => import(specifier) as Promise<Record<string, unknown>>);
  const streamCompletions = await member(load, "api/openai-completions", "stream");
  const normalizeContext = await member(load, "utils/transcript", "normalizeContext");
  if (typeof streamCompletions !== "function" || typeof normalizeContext !== "function") {
    throw new PiAiUnavailableError(`${PI_AI_PACKAGE}@${PI_AI_VERSION} exports an unexpected stream or normalizeContext shape`);
  }
  const catalogs = {} as Record<PiAiProviderId, Readonly<Record<string, PiAiModel>>>;
  for (const provider of PI_AI_PROVIDERS) {
    catalogs[provider] = await member(load, `providers/${provider}.models`, CATALOG_EXPORTS[provider]) as Record<string, PiAiModel>;
  }
  return Object.freeze({ version: installed, streamCompletions: streamCompletions as PiAiLibrary["streamCompletions"],
    normalizeContext: normalizeContext as PiAiLibrary["normalizeContext"], catalogs: Object.freeze(catalogs) });
}
