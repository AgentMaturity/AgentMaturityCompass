import { describe, expect, it } from "vitest";
import { redactBridgeText } from "../src/bridge/bridgeRedaction.js";
import { blindSecrets } from "../src/enforce/secretBlind.js";
import { SECRET_PATTERNS } from "../src/shield/redaction/secretPatterns.js";
import { redactSecrets } from "../src/shield/redaction/redactSecrets.js";

/**
 * One redaction table, verified by COVERAGE COMPARISON (P5.3, ADR-0021's lesson).
 *
 * Consolidating the injection matchers in P5.1 silently narrowed two patterns,
 * and reading the regexes did not catch it — two unrelated suites did. So this
 * file carries one sample per ORIGINAL pattern from BOTH engines and asserts
 * every one still matches. A merge that drops or narrows anything turns it red.
 */
const BRIDGE_ORIGINALS: Array<[string, string]> = [
  ["Bearer", "Authorization: Bearer abcdefghijklmnop"],
  ["sk- generic", "sk-abcdefghijkl0"],
  ["Google AIza", "AIzaSyAbcdefghijklmnopqrstuvwxyz01234"],
  ["xAI", "xai-abcdefghijklmnopqrst"],
  ["PEM header", "-----BEGIN RSA PRIVATE KEY-----"],
  ["AMC lease", "lease_abcdefghij0123"],
  ["AMC token", "amc_abcdefghijkl0123"],
  ["AWS AKIA", "AKIAIOSFODNN7EXAMPLE"],
  ["GitHub ghp_", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["GitHub gho_", "gho_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["Anthropic sk-ant-", "sk-ant-abcdefghijklmnopqrstuvwxyz"],
  ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"]
];

const SECRETBLIND_ORIGINALS: Array<[string, string]> = [
  ["aws_key", "AKIAIOSFODNN7EXAMPLE"],
  ["aws_secret", 'aws_secret_access_key="abcdefghijklmnopqrstuvwxyz0123456789ABCD"'],
  ["github_token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["github_oauth", "gho_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["openai_key", "sk-abcdefghijklmnopqrstuvwxyz"],
  ["slack_token", "xoxb-1234567890-abcdefghijk"],
  ["slack_webhook", "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX"],
  ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"],
  ["private_key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
  ["connection_string", "postgres://user:pass@host:5432/db"],
  ["generic_api_key", 'api_key: "abcdefghijklmnop123"'],
  ["password_in_url", "https://alice:hunter2@example.com/x"],
  ["bearer_token", "Bearer abcdefghijklmnopqrstuvwxyz0123"]
];

describe("nothing either engine used to catch was lost", () => {
  it("still redacts every pattern bridgeRedaction carried", () => {
    for (const [label, sample] of BRIDGE_ORIGINALS) {
      expect(redactBridgeText(sample), `bridge original: ${label}`).not.toBe(sample);
      expect(blindSecrets(sample).secretsFound, `secretBlind now covers: ${label}`).toBeGreaterThan(0);
    }
  });

  it("still redacts every pattern secretBlind carried", () => {
    for (const [label, sample] of SECRETBLIND_ORIGINALS) {
      expect(blindSecrets(sample).secretsFound, `secretBlind original: ${label}`).toBeGreaterThan(0);
      expect(redactBridgeText(sample), `bridge now covers: ${label}`).not.toBe(sample);
    }
  });

  it("keeps both original sources represented in the merged table", () => {
    // If a whole source vanished, the samples above might still pass by
    // coincidence through the other engine's patterns.
    const sources = new Set(SECRET_PATTERNS.map((p) => p.source));
    expect(sources.has("bridge") || sources.has("both")).toBe(true);
    expect(sources.has("secretBlind") || sources.has("both")).toBe(true);
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(18);
  });
});

describe("the private-key hole bridgeRedaction shipped", () => {
  it("redacts all five real PEM header forms", () => {
    // bridge carried /BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY/gi, which needs
    // " KEY" straight after the algorithm word. A real header reads
    // "BEGIN RSA PRIVATE KEY", so it matched exactly ONE of these five and let
    // RSA, EC, OPENSSH and DSA private keys through into durable signed rows.
    for (const header of [
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN DSA PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "-----BEGIN PRIVATE KEY-----"
    ]) {
      expect(redactBridgeText(header), header).not.toContain("PRIVATE KEY");
    }
  });
});

describe("the two engines now agree", () => {
  it("gives the same verdict on every sample that used to split them", () => {
    // 15 of these 18 got different answers before the merge.
    const samples = [
      ...BRIDGE_ORIGINALS.map(([, s]) => s),
      ...SECRETBLIND_ORIGINALS.map(([, s]) => s)
    ];
    for (const sample of samples) {
      const bridgeRedacted = redactBridgeText(sample) !== sample;
      const blindRedacted = blindSecrets(sample).secretsFound > 0;
      expect(bridgeRedacted, `disagreement on: ${sample.slice(0, 40)}`).toBe(blindRedacted);
    }
  });

  it("leaves ordinary prose alone", () => {
    // A redactor that fires on normal text teaches an operator to ignore it.
    for (const benign of [
      "the deployment plan for next quarter",
      "Bearer with no token after it",
      "sk- is a common prefix",
      "https://example.com/path?q=1"
    ]) {
      expect(redactBridgeText(benign), benign).toBe(benign);
      expect(blindSecrets(benign).secretsFound, benign).toBe(0);
    }
  });
});

describe("each caller keeps its own placeholder", () => {
  it("writes an anonymous marker on the durable bridge path", () => {
    // A signed bridge row naming the KIND of secret present is itself a small
    // disclosure.
    const out = redactBridgeText("key AKIAIOSFODNN7EXAMPLE here");
    expect(out).toContain("<AMC_REDACTED>");
    expect(out).not.toContain("aws_key");
  });

  it("names the kind where the caller acts on it", () => {
    expect(blindSecrets("key AKIAIOSFODNN7EXAMPLE here").blinded).toContain("[SECRET_BLIND:aws_key]");
  });

  it("still honours caller-supplied extra patterns", () => {
    const result = blindSecrets("internal-code ZZ-9999", [/ZZ-\d{4}/]);
    expect(result.secretsFound).toBe(1);
    expect(result.blinded).toContain("[SECRET_BLIND:custom]");
  });
});

describe("the table cannot carry stateful flags", () => {
  it("declares no g or y flag", () => {
    // A shared global regex keeps `lastIndex` between calls, so the same input
    // matches and then does not. The service adds `g` per use. This is the same
    // invariant ADR-0021 established for the injection table, where the
    // hand-rolled defence against it turned out to be dead code.
    const stateful = SECRET_PATTERNS.filter((p) => p.pattern.flags.includes("g") || p.pattern.flags.includes("y"));
    expect(stateful.map((p) => p.type)).toEqual([]);
  });

  it("matches the same input twice in a row", () => {
    // The empirical half: a sticky regex would pass the first call and fail the
    // second.
    const sample = "AKIAIOSFODNN7EXAMPLE";
    expect(redactBridgeText(sample)).toBe(redactBridgeText(sample));
    expect(blindSecrets(sample).secretsFound).toBe(blindSecrets(sample).secretsFound);
  });
});

describe("findings are reported against the original text", () => {
  it("does not let one replacement shift another's offset", () => {
    // Placeholders are a different length from what they replace, so collecting
    // offsets against the partially-redacted string would misreport every
    // finding after the first.
    const text = "first AKIAIOSFODNN7EXAMPLE then sk-abcdefghijklmnop";
    const { findings } = redactSecrets(text, (t) => `[${t}]`);
    for (const finding of findings) {
      expect(finding.index, `${finding.type} offset within original`).toBeLessThan(text.length);
    }
    const aws = findings.find((f) => f.type === "aws_key");
    expect(aws?.index).toBe(text.indexOf("AKIA"));
  });
});

describe("the other copies of the private-key hole", () => {
  it("redacts every PEM form through the SDK path too", async () => {
    // src/sdk/amcEvidence.ts carried its own five patterns — a strict subset of
    // the bridge's, including the SAME broken PEM header. It was the fourth
    // copy of that bug in the tree.
    const { redactSdkText } = await import("../src/sdk/amcEvidence.js");
    for (const header of [
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN DSA PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----"
    ]) {
      expect(redactSdkText(header), header).not.toContain("PRIVATE KEY");
    }
  });

  it("detects every PEM form in the validators scanner", async () => {
    // A DETECTOR, not a redactor, so it stays separate (ADR-0021) — but it
    // listed only RSA and EC, so OPENSSH and DSA private keys scanned clean.
    const { validateSecretLeakage } = await import("../src/shield/validators/index.js");
    for (const header of [
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN DSA PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "-----BEGIN PRIVATE KEY-----"
    ]) {
      const found = validateSecretLeakage(header).violations.some((v) => v.type === "private_key");
      expect(found, header).toBe(true);
    }
  });
});
