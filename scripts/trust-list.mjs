#!/usr/bin/env node
/**
 * Maintainer tooling for AMC trust lists (P0-09; not shipped in the npm package). Run `npm run build` first:
 * it signs and verifies through dist/trust, the same code the verifiers use. See docs/TRUST_LIST.md.
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage: node scripts/trust-list.mjs <command> [options]

Commands:
  keygen   --out <dir> --name <name>             write <name>.key (0600) and <name>.pub, print the key id
                                                 (missing directories are created with mode 0700)
  init     --list-id <id> --out <file> [--days 90] [--sequence 1]
                                                 write an empty, unsigned trust list
  add      --list <file> --pubkey <pem> --purpose <purpose>... --subject <text>
           [--valid-from <utc>] [--valid-to <utc>] [--allow-key-history] [--source operator]
                                                 add a key entry (removes existing signatures)
  distrust --list <file> --key-id <sha256> --reason <reason> --note <text>
           [--from <utc>] [--reference <id or URL>] [--source operator]
                                                 add a distrust entry (removes existing signatures)
  sign     --list <file> --key <private pem>     sign with a trust-list root key
           or --provider <id> --key-ref <ref> --provider-key-id <pinned sha256> [--key-version <version>]
                                                 use that external root holder's provider; never a workspace purpose key
           [--digest-v2]                        select the explicit digest envelope before the first holder signs
  verify   --list <file> --root <sha256>...      verify under pinned roots and the threshold <AMC home>/trust/trust-roots.json
                                                 sets; exit 1 when refused
  root-rotate --roots <trust-roots.json> --new-pub <pem>... --new-threshold <n> --out <file>
           [--previous <last applied rotation>] [--allow-decrease] [--current-key <key>...] [--new-key <key>...]
                                                 write an amc.root-rotation statement for the pinned root set (P1-08)
  root-sign   --statement <file> --key <private pem> --as current|new
           or --provider <id> --key-ref <ref> --provider-key-id <pinned sha256> [--key-version <version>] --as current|new
                                                 add one root holder's signature: m of the current set authorize,
                                                 m of the new set prove possession
  root-apply  --statement <file> --root-pub <pem>...
                                                 verify against the pinned current set and apply to <AMC home>/trust`;

const OPTIONS = {
  out: { type: "string" }, name: { type: "string" }, "list-id": { type: "string" }, days: { type: "string" },
  sequence: { type: "string" }, list: { type: "string" }, pubkey: { type: "string" }, purpose: { type: "string", multiple: true },
  subject: { type: "string" }, "valid-from": { type: "string" }, "valid-to": { type: "string" },
  "allow-key-history": { type: "boolean" }, source: { type: "string" }, "key-id": { type: "string" }, reason: { type: "string" },
  note: { type: "string" }, from: { type: "string" }, reference: { type: "string" }, key: { type: "string" },
  root: { type: "string", multiple: true }, help: { type: "boolean" },
  roots: { type: "string" }, "new-pub": { type: "string", multiple: true }, "new-threshold": { type: "string" }, previous: { type: "string" },
  "allow-decrease": { type: "boolean" }, "current-key": { type: "string", multiple: true }, "new-key": { type: "string", multiple: true },
  statement: { type: "string" }, as: { type: "string" }, "root-pub": { type: "string", multiple: true },
  provider: { type: "string" }, "key-ref": { type: "string" }, "key-version": { type: "string" }, "provider-key-id": { type: "string" }, "digest-v2": { type: "boolean" }
};

async function trust() {
  try {
    return await import("../dist/trust/index.js");
  } catch (error) {
    throw new Error(`dist/trust is missing; run npm run build first (${error instanceof Error ? error.message : String(error)})`);
  }
}
function required(values, name) {
  const value = values[name];
  if (value === undefined || value === "") throw new Error(`--${name} is required\n\n${USAGE}`);
  return value;
}
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const privateDir = dir => mkdirSync(dir, { recursive: true, mode: 0o700 });
const writeJson = (path, value, flag = "w") => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag });

/** Explicit external root selection only. The expected id is recorded independently by this holder, not trusted from describe. */
async function providerSigner(values) {
  const selected = values.provider !== undefined || values["key-ref"] !== undefined || values["key-version"] !== undefined || values["provider-key-id"] !== undefined;
  if (!selected) return null;
  if (values.key !== undefined) throw new Error("--key cannot be combined with provider signing options");
  const id = required(values, "provider"), expected = required(values, "provider-key-id");
  // `file` is the workspace vault provider. External private-key files keep their existing --key path.
  if (!["aws-kms", "gcp-kms", "azure-kv", "pkcs11"].includes(id)) throw new Error("--provider must be aws-kms, gcp-kms, azure-kv or pkcs11");
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("--provider-key-id must be 64 lowercase hex characters");
  const ref = { provider: id, id: required(values, "key-ref"), ...(values["key-version"] === undefined ? {} : { version: values["key-version"] }) };
  const { loadKeyProvider } = await import("../dist/keys/purposeProviders.js");
  const { attempt, checkedDescription, KeyProviderError } = await import("../dist/keys/provider.js");
  const { SIGNING_ALGORITHMS } = await import("../dist/keys/algorithmPolicy.js");
  const provider = loadKeyProvider(process.cwd(), id);
  const description = checkedDescription(await attempt(id, "describe", () => provider.describe(ref)), { allowed: SIGNING_ALGORITHMS, requireNonExportable: true });
  if (description.keyId !== expected || description.ref.provider !== ref.provider || description.ref.id !== ref.id || description.ref.version !== ref.version) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", id, "the provider key is not the external root holder's pinned key and ref");
  }
  return { provider, description };
}

/** Signing can await a remote holder. Never overwrite an edit or another holder's signature made during that wait. */
async function writeUnchanged(path, original, bytes) {
  const { withControlFileLock } = await import("../dist/lifecycle/controlFileLock.js");
  withControlFileLock({ root: dirname(path), name: "trust-list-authoring", operation: () => {
    if (!readFileSync(path).equals(original)) throw new Error("the trust file changed while signing or editing; retry from its current bytes");
    writeFileSync(path, bytes, { mode: 0o600 });
  } });
}

function selectedVersion(current, values, holder, legacyBytes) {
  const selected = current.signatureVersion ?? 1, hasRows = current.signatures.length > 0;
  if (hasRows) {
    if (selected !== 2 && (values["digest-v2"] || (holder?.provider.id === "aws-kms" && legacyBytes.length > 4096))) {
      throw new Error("existing v1 signatures cannot be mixed with v2; start an unsigned envelope and select --digest-v2 before its first signature");
    }
    return selected;
  }
  return selected === 2 || values["digest-v2"] || (holder?.provider.id === "aws-kms" && legacyBytes.length > 4096) ? 2 : 1;
}

/** Validates the edited list before anything is written; an edit invalidates every signature. */
async function editList(values, edit) {
  const { trustListSchema, signedTrustListSchema, TrustListError } = await trust();
  const path = required(values, "list");
  const original = readFileSync(path), current = signedTrustListSchema.parse(JSON.parse(original.toString("utf8")));
  // A verifier refuses other content at a sequence it already accepted (P1-08), so the first edit after signing bumps it.
  const signed = (current.signatures ?? []).length > 0;
  const list = edit({ ...current.list, sequence: current.list.sequence + (signed ? 1 : 0) });
  const parsed = trustListSchema.safeParse(list);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TrustListError("TRUST_LIST_INVALID", `${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`);
  }
  await writeUnchanged(path, original, JSON.stringify({ ...(current.signatureVersion === 2 ? { signatureVersion: 2 } : {}), list: parsed.data, signatures: [] }, null, 2) + "\n");
  console.log(`Updated ${path}; signatures removed, sign it again`);
}

const COMMANDS = {
  async keygen(values) {
    const { ed25519KeyId } = await trust();
    const dir = required(values, "out"), name = required(values, "name");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    privateDir(dir);
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    writeFileSync(join(dir, `${name}.key`), privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { mode: 0o600, flag: "wx" });
    writeFileSync(join(dir, `${name}.pub`), publicKeyPem, { mode: 0o644, flag: "wx" });
    console.log(`keyId ${ed25519KeyId(publicKeyPem)}`);
  },
  async init(values) {
    const { trustListSchema } = await trust();
    const now = new Date();
    const days = Number(values.days ?? "90");
    const list = trustListSchema.parse({
      type: "amc.trust-list", version: 1, listId: required(values, "list-id"), sequence: Number(values.sequence ?? "1"),
      issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(), entries: [], distrust: []
    });
    const out = required(values, "out");
    privateDir(dirname(out));
    writeJson(out, { list, signatures: [] }, "wx");
  },
  async add(values) {
    const { canonicalSigningKey, signingKeyId } = await import("../dist/keys/algorithmPolicy.js");
    // Stored in canonical form, so a CRLF copy gets the key's real id; a private key or certificate is refused.
    const text = readFileSync(required(values, "pubkey"), "utf8");
    const key = canonicalSigningKey(text), publicKeyPem = key?.pem ?? text;
    await editList(values, list => ({ ...list, entries: [...list.entries, {
      keyId: signingKeyId(publicKeyPem) ?? "not-a-supported-signing-key", algorithm: key?.algorithm ?? "unsupported", publicKeyPem,
      purposes: required(values, "purpose"), subject: required(values, "subject"),
      validFrom: values["valid-from"] ?? new Date().toISOString(), validTo: values["valid-to"] ?? null,
      allowKeyHistory: values["allow-key-history"] === true, source: values.source ?? "operator"
    }] }));
  },
  async distrust(values) {
    await editList(values, list => ({ ...list, distrust: [...list.distrust, {
      keyId: required(values, "key-id"), distrustedFrom: values.from ?? null, reason: required(values, "reason"),
      note: required(values, "note"), ...(values.reference ? { reference: values.reference } : {}), source: values.source ?? "operator"
    }] }));
  },
  async sign(values) {
    const { signTrustList, signTrustListWithProvider, signedTrustListSchema, trustListSigningBytes } = await trust();
    const path = required(values, "list");
    const original = readFileSync(path), current = signedTrustListSchema.parse(JSON.parse(original.toString("utf8")));
    const holder = await providerSigner(values);
    const signatureVersion = selectedVersion(current, values, holder, trustListSigningBytes(current.list));
    const signed = holder ? await signTrustListWithProvider(current.list, holder.provider, holder.description, { signatureVersion })
      : signTrustList(current.list, readFileSync(required(values, "key"), "utf8"), { signatureVersion });
    const [signature] = signed.signatures;
    const others = (current.signatures ?? []).filter(existing => existing.keyId !== signature.keyId);
    await writeUnchanged(path, original, JSON.stringify({ ...(signed.signatureVersion === 2 ? { signatureVersion: 2 } : {}), list: signed.list, signatures: [...others, signature] }, null, 2) + "\n");
    console.log(`Signed ${path} with root ${signature.keyId}`);
  },
  async "root-rotate"(values) {
    const { signRootRotation } = await trust();
    const { canonicalSigningKey, signingKeyId } = await import("../dist/keys/algorithmPolicy.js");
    const { createHash } = await import("node:crypto");
    const pinned = readJson(required(values, "roots"));
    const previous = values.previous ? readFileSync(values.previous) : null;
    const newRootPublicKeyPems = required(values, "new-pub").map(path => {
      const key = canonicalSigningKey(readFileSync(path, "utf8"));
      if (key === null) throw new Error("--new-pub must name an Ed25519 or P-256 SPKI public key");
      return key.pem;
    });
    const statement = {
      type: "amc.root-rotation", version: 1, rootSetId: pinned.rootSetId, sequence: previous ? JSON.parse(previous).statement.sequence + 1 : 1,
      previousSha256: previous ? createHash("sha256").update(previous).digest("hex") : null,
      previousRoots: pinned.roots, previousThreshold: pinned.threshold ?? 1,
      newRoots: newRootPublicKeyPems.map(pem => signingKeyId(pem)), newThreshold: Number(required(values, "new-threshold")), newRootPublicKeyPems,
      allowDecrease: values["allow-decrease"] === true, issuedAt: new Date().toISOString()
    };
    const keys = name => (values[name] ?? []).map(path => readFileSync(path, "utf8"));
    writeFileSync(required(values, "out"), signRootRotation(statement, { current: keys("current-key"), next: keys("new-key") }, { signatureVersion: values["digest-v2"] ? 2 : 1 }), { mode: 0o600, flag: "wx" });
    console.log(`Wrote root rotation ${statement.sequence} of ${statement.rootSetId}: ${statement.newRoots.length} roots, threshold ${statement.newThreshold}`);
  },
  async "root-sign"(values) {
    const { addRootRotationSignature, addRootRotationSignatureWithProvider, rootRotationSigningBytes, signedRootRotationSchema } = await trust();
    const path = required(values, "statement");
    const as = required(values, "as");
    if (as !== "current" && as !== "new") throw new Error(`--as must be current or new\n\n${USAGE}`);
    const bytes = readFileSync(path), holder = await providerSigner(values);
    const current = signedRootRotationSchema.parse(JSON.parse(bytes.toString("utf8")));
    const signatureVersion = selectedVersion(current, values, holder, rootRotationSigningBytes(current.statement));
    const signed = holder ? await addRootRotationSignatureWithProvider(bytes, as, holder.provider, holder.description, { signatureVersion })
      : addRootRotationSignature(bytes, as, readFileSync(required(values, "key"), "utf8"), { signatureVersion });
    await writeUnchanged(path, bytes, signed);
    console.log(`Signed ${path} as a ${as} root`);
  },
  async "root-apply"(values) {
    const { applyTrustRootRotation } = await trust();
    const result = applyTrustRootRotation({ statement: readFileSync(required(values, "statement")), currentRootPublicKeyPems: required(values, "root-pub").map(path => readFileSync(path, "utf8")) });
    console.log(`Applied root rotation ${result.sequence} of ${result.rootSetId}: ${result.roots.length} roots, threshold ${result.threshold}`);
  },
  async verify(values) {
    const { readSignedTrustListFile, verifySignedTrustList } = await trust();
    const { readPinnedTrustRoots } = await import("../dist/trust/rootRotation.js");
    const { resolveAmcHome } = await import("../dist/credentials/credentialsPaths.js");
    // The operator's m-of-n policy applies here as in every verifier: --root names the roots, never a lower threshold.
    const policy = readPinnedTrustRoots(resolveAmcHome({ env: process.env }));
    const list = verifySignedTrustList(readSignedTrustListFile(required(values, "list")),
      { pinnedRootKeyIds: required(values, "root"), now: new Date(), threshold: policy?.threshold ?? 1 });
    console.log(`OK ${list.listId} sequence ${list.sequence}: ${list.entries.length} entries, ${list.distrust.length} distrusted, expires ${list.expiresAt}`);
  }
};

try {
  const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true });
  const command = positionals[0];
  if (values.help || command === "help") {
    console.log(USAGE);
  } else if (!command || !Object.hasOwn(COMMANDS, command) || positionals.length > 1) {
    console.error(USAGE);
    process.exitCode = 1;
  } else {
    await COMMANDS[command](values);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
