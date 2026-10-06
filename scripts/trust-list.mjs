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
  verify   --list <file> --root <sha256>...      verify under pinned roots; exit 1 when refused`;

const OPTIONS = {
  out: { type: "string" }, name: { type: "string" }, "list-id": { type: "string" }, days: { type: "string" },
  sequence: { type: "string" }, list: { type: "string" }, pubkey: { type: "string" }, purpose: { type: "string", multiple: true },
  subject: { type: "string" }, "valid-from": { type: "string" }, "valid-to": { type: "string" },
  "allow-key-history": { type: "boolean" }, source: { type: "string" }, "key-id": { type: "string" }, reason: { type: "string" },
  note: { type: "string" }, from: { type: "string" }, reference: { type: "string" }, key: { type: "string" },
  root: { type: "string", multiple: true }, help: { type: "boolean" }
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

/** Validates the edited list before anything is written; an edit invalidates every signature. */
async function editList(values, edit) {
  const { trustListSchema, TrustListError } = await trust();
  const path = required(values, "list");
  const list = edit(readJson(path).list);
  const parsed = trustListSchema.safeParse(list);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TrustListError("TRUST_LIST_INVALID", `${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`);
  }
  writeJson(path, { list: parsed.data, signatures: [] });
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
    const { canonicalEd25519Pem, ed25519KeyId } = await trust();
    // Stored in canonical form, so a CRLF copy gets the key's real id; a private key or certificate is refused.
    const text = readFileSync(required(values, "pubkey"), "utf8");
    const publicKeyPem = canonicalEd25519Pem(text) ?? text;
    await editList(values, list => ({ ...list, entries: [...list.entries, {
      keyId: ed25519KeyId(publicKeyPem) ?? "not-an-ed25519-key", algorithm: "ed25519", publicKeyPem,
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
    const { signTrustList } = await trust();
    const path = required(values, "list");
    const current = readJson(path);
    const [signature] = signTrustList(current.list, readFileSync(required(values, "key"), "utf8")).signatures;
    const others = (current.signatures ?? []).filter(existing => existing.keyId !== signature.keyId);
    writeJson(path, { list: current.list, signatures: [...others, signature] });
    console.log(`Signed ${path} with root ${signature.keyId}`);
  },
  async verify(values) {
    const { readSignedTrustListFile, verifySignedTrustList } = await trust();
    const list = verifySignedTrustList(readSignedTrustListFile(required(values, "list")),
      { pinnedRootKeyIds: required(values, "root"), now: new Date() });
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
