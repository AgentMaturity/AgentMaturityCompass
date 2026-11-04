// UNEXECUTED P1-01 private read-only supplement; no process, write, copy, build or cleanup operations.
// Usage: node <this-file> <repository-root> vectors|receipt|publication|all [existing-pages-output]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = realpathSync(resolve(process.argv[2] ?? ""));
const mode = process.argv[3];
assert(["vectors", "receipt", "publication", "all"].includes(mode), "explicit probe mode required");
assert(process.argv.length === ((mode === "publication" || mode === "all") ? 5 : 4), "exact mode arguments required");
const pages = (mode === "publication" || mode === "all") ? realpathSync(resolve(process.argv[4])) : null;
const bytes = path => readFileSync(path);
const json = path => JSON.parse(bytes(path).toString("utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const load = path => import(pathToFileURL(join(root, path)).href);
const emit = (section, value) => process.stdout.write(`${JSON.stringify({ section, ...value })}\n`);
emit("context", { root, mode, pages, executable: process.execPath, node: process.version, abi: process.versions.modules,
  inputPins: ["dist/utils/json.js", "dist/ledger/eventHash.js", "dist/contracts/index.js", "dist/contracts/v1/receipt.js",
    "spec/ACCEPTANCE_RULES.md", "spec/schemas/index.json", "spec/schemas/v1/receipt.schema.json",
    "tests/fixtures/contracts/receipt/valid/authorized.json"].map(path => ({ path, sha256: sha256(bytes(join(root, path))) })) });

if (mode === "vectors" || mode === "all") {
  const { canonicalize } = await load("dist/utils/json.js");
  const { canonicalMetadataForHash } = await load("dist/ledger/eventHash.js");
  const canonical = canonicalize({ b: [2, { d: 1, c: "é" }], a: null, "10": true, "9": false, B: 1.50 });
  const expectedCanonical = '{"9":false,"10":true,"B":1.5,"a":null,"b":[2,{"c":"é","d":1}]}';
  const expectedCanonicalDigest = "be049feb25544cbaf5fead41ede37dfc528e19a0d49a90c2be2107769e333fa1";
  const payloadDigest = sha256(Buffer.from("hello", "utf8"));
  const metadata = canonicalMetadataForHash({ id: "evt-1", ts: 1767225600000, sessionId: "session-1", runtime: "amc",
    eventType: "stdout", payloadPath: null, payloadInline: "hello",
    metaJson: '{"trustTier":"OBSERVED","agentId":"agent-1","receipt":"dropped.before.hashing","receipt_sha256":"x"}' });
  const expectedMetadata = '{"event_type":"stdout","id":"evt-1","meta_json":"{\\"trustTier\\":\\"OBSERVED\\",\\"agentId\\":\\"agent-1\\"}","payload_inline":"hello","payload_path":null,"runtime":"amc","session_id":"session-1","ts":1767225600000}';
  const eventHash = sha256(Buffer.from(`GENESIS${metadata}${payloadDigest}`, "utf8"));
  emit("vectors", { canonical, canonicalDigest: sha256(Buffer.from(canonical, "utf8")), metadata, payloadDigest, eventHash });
  assert.equal(canonical, expectedCanonical);
  assert.equal(sha256(Buffer.from(canonical, "utf8")), expectedCanonicalDigest);
  assert.equal(payloadDigest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.equal(metadata, expectedMetadata);
  assert.equal(eventHash, "7d81c2c4b940f5411fa454457be71c7d3e8ee15e086829ff3e5be415dd7b8ffe");
}

if (mode === "receipt" || mode === "all") {
  const { receiptV2Schema, assertContract } = await load("dist/contracts/index.js");
  const Ajv2020 = createRequire(pathToFileURL(join(root, "package.json")))("ajv/dist/2020.js").default;
  const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(json(join(root, "spec/schemas/v1/receipt.schema.json")));
  const base = json(join(root, "tests/fixtures/contracts/receipt/valid/authorized.json"));
  const states = ["requested", "authorized", "started", "outcome_unknown", "completed", "cancelled", "denied"];
  const observations = states.map(state => {
    const clean = { ...base, state, ...(state === "denied" ? { reason: "synthetic refusal" } : {}) };
    const extra = { ...clean, qualificationExtra: "unrecognized" };
    let cleanContractAccepted = false, extraContractAccepted = false, extraContractError = null;
    assertContract("receipt", clean); cleanContractAccepted = true;
    try { assertContract("receipt", extra); extraContractAccepted = true; }
    catch (error) { extraContractError = { name: error.name, message: error.message }; }
    return { state, cleanZod: receiptV2Schema.safeParse(clean).success, cleanContractAccepted, cleanAjv: validate(clean),
      extraZod: receiptV2Schema.safeParse(extra).success, extraContractAccepted, extraContractError, extraAjv: validate(extra) };
  });
  emit("receipt", { observations });
  assert.deepEqual(observations.map(({ state, cleanZod, cleanContractAccepted, cleanAjv, extraZod, extraContractAccepted, extraAjv }) =>
    ({ state, cleanZod, cleanContractAccepted, cleanAjv, extraZod, extraContractAccepted, extraAjv })), states.map(state =>
    ({ state, cleanZod: true, cleanContractAccepted: true, cleanAjv: true, extraZod: false, extraContractAccepted: false, extraAjv: false })));
  assert(observations.every(row => row.extraContractError?.name === "Error" && row.extraContractError.message.startsWith("violates receipt v1:")));
}

if (mode === "publication" || mode === "all") {
  const expectedNames = ["a4-conformance-statement.schema.json", "a4-decision.schema.json", "a4-deployment-receipt.schema.json", "a4-gate-policy.schema.json", "a4-gate.schema.json", "a4-integration-claim.schema.json", "a4-intent.schema.json", "a4-package.schema.json", "a4-project.schema.json", "a4-readiness.schema.json", "a4-record.schema.json", "a4-release.schema.json", "a4-revision.schema.json", "a4-rollback-receipt.schema.json", "a4-transition.schema.json", "a4-value-claim.schema.json", "amcaudit.schema.json", "amcbench.schema.json", "amccert.schema.json", "amcpass.schema.json", "amcprompt.schema.json", "amcproof.schema.json", "authorization-record.schema.json", "catalog-lock.schema.json", "claim-envelope.schema.json", "control-record.schema.json", "control-result.schema.json", "evidence-event.schema.json", "external-evidence.schema.json", "legacy-receipt.schema.json", "pack-manifest.schema.json", "receipt.schema.json", "registry.bench.schema.json", "registry.passport.schema.json", "scoped-attestation.schema.json", "signature-envelope.schema.json", "trust-list.schema.json", "verifier-report.schema.json"];
  const indexPath = join(root, "spec/schemas/index.json");
  const index = json(indexPath);
  assert.equal(index.version, 1);
  assert.deepEqual(index.schemas.map(row => row.name).sort(), [...expectedNames].sort());
  const observations = index.schemas.map(row => {
    const source = bytes(join(root, "spec/schemas/v1", row.name));
    const expectedId = row.name === "external-evidence.schema.json"
      ? "https://agentmaturity.co/standards/external-evidence/v1/schema.json"
      : `https://agentmaturity.co/spec/schemas/v1/${row.name}`;
    const idPath = new URL(expectedId).pathname.slice(1);
    return { name: row.name, indexId: row.$id, schemaId: JSON.parse(source).$id, expectedId, indexSha256: row.sha256,
      sourceSha256: sha256(source), conventionalCopySha256: sha256(bytes(join(pages, "spec/schemas/v1", row.name))),
      idPath, idCopySha256: sha256(bytes(join(pages, idPath))) };
  });
  const pagesIndexMatches = bytes(join(pages, "spec/schemas/index.json")).equals(bytes(indexPath));
  const contractHtml = bytes(join(pages, "spec/index.html")).toString("utf8");
  const acceptanceHtml = bytes(join(pages, "spec/acceptance-rules.html")).toString("utf8");
  const htmlChecks = { contractTitle: contractHtml.includes("<title>AMC public contracts</title>"),
    acceptanceTitle: acceptanceHtml.includes("<title>AMC acceptance rules</title>"),
    acceptanceHeading: acceptanceHtml.includes("Acceptance rules for AMC records"),
    vectorPresent: acceptanceHtml.includes("be049feb25544cbaf5fead41ede37dfc528e19a0d49a90c2be2107769e333fa1") };
  emit("publication", { observations, pagesIndexMatches, htmlChecks });
  assert.equal(observations.length, 38);
  assert(observations.every(row => row.indexId === row.expectedId && row.schemaId === row.expectedId &&
    row.indexSha256 === row.sourceSha256 && row.conventionalCopySha256 === row.sourceSha256 && row.idCopySha256 === row.sourceSha256));
  assert.equal(pagesIndexMatches, true);
  assert(Object.values(htmlChecks).every(Boolean));
}
emit("complete", { mode, ok: true });
