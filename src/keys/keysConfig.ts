/**
 * The `keys` section of `.amc/amc.config.yaml` (P2-08). Absent, every purpose signs with the vault exactly as before.
 *
 *   keys:
 *     provider: aws-kms                      # default provider for refs that name none (default: file, the vault)
 *     refs:
 *       artifact-seal: { id: "arn:aws:kms:eu-west-1:111122223333:key/…" }
 *       ledger-row: { provider: pkcs11, id: "pkcs11:token=amc;object=ledger-issuer" }
 *     requireNonExportable: true             # refuse the file provider (vault) for every purpose
 *     algorithmPolicy: { allowed: [ed25519, ecdsa-p256-sha256] }
 *
 * The section holds identifiers only: never credentials, PINs, endpoints or module paths (those come from the
 * environment). A provider key is used only once the committed key set binds it (src/keys/purposeProviders.ts).
 */
import YAML from "yaml";
import { z } from "zod";
import { readContainedOrNull, statStamp } from "../utils/containedFs.js";
import { LOCAL_PURPOSES, type LocalPurpose } from "../vault/vaultPayload.js";
import { SIGNING_ALGORITHMS } from "./algorithmPolicy.js";
import { KEY_PROVIDER_IDS, KeyProviderError, type KeyPolicy, type KeyRef } from "./provider.js";
import { join } from "node:path";

const refSchema = z.strictObject({
  provider: z.enum(KEY_PROVIDER_IDS).optional(),
  id: z.string().min(1).max(2048),
  version: z.string().min(1).max(256).optional()
});

const keysConfigSchema = z.strictObject({
  provider: z.enum(KEY_PROVIDER_IDS).default("file"),
  refs: z.partialRecord(z.enum(LOCAL_PURPOSES), refSchema).default({}),
  requireNonExportable: z.boolean().default(false),
  algorithmPolicy: z.strictObject({ allowed: z.array(z.enum(SIGNING_ALGORITHMS)).min(1) }).default({ allowed: [...SIGNING_ALGORITHMS] })
});
export type KeysConfig = z.infer<typeof keysConfigSchema>;

const CONFIG_REL = ".amc/amc.config.yaml";
const memo = new Map<string, { stamp: string; config: KeysConfig }>();

/** The parsed `keys` section (defaults when absent), re-read only after the file changed. An invalid section throws. */
export function loadKeysConfig(workspace: string): KeysConfig {
  const stamp = statStamp([join(workspace, CONFIG_REL)]);
  const cached = memo.get(workspace);
  if (cached?.stamp === stamp) return cached.config;
  const bytes = readContainedOrNull(workspace, CONFIG_REL, 1024 * 1024);
  const raw = bytes === null ? undefined : (YAML.parse(bytes.toString("utf8")) as { keys?: unknown } | null)?.keys;
  const parsed = keysConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`amc.config.yaml keys: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
  }
  memo.set(workspace, { stamp, config: parsed.data });
  return parsed.data;
}

export function keyPolicy(config: KeysConfig): KeyPolicy {
  return { allowed: config.algorithmPolicy.allowed, requireNonExportable: config.requireNonExportable };
}

/** The provider ref configured for `purpose`, or null when it signs with the vault (the file provider). */
export function configuredRef(config: KeysConfig, purpose: LocalPurpose): KeyRef | null {
  const ref = config.refs[purpose];
  const provider = ref?.provider ?? config.provider;
  if (provider === "file") return null;
  if (ref === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, `keys.provider is ${provider} but keys.refs.${purpose} names no key`);
  return { provider, id: ref.id, ...(ref.version === undefined ? {} : { version: ref.version }) };
}
