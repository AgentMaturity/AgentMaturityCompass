/**
 * One table of secret patterns (P5.3).
 *
 * THE THREE ENGINES DID NOT MERELY DUPLICATE — THEY DISAGREED. Measured against
 * eighteen samples before touching anything, **15 of 18 got different answers**
 * depending on which engine saw them:
 *
 *   sample                bridge  secretBlind  gateway(default)
 *   AWS access key        yes     yes          no
 *   Anthropic key         yes     NO           no
 *   Google API key        yes     NO           no
 *   xAI key               yes     NO           no
 *   Slack bot token       NO      yes          no
 *   Slack webhook         NO      yes          no
 *   RSA private key       NO      yes          no
 *   Postgres conn string  NO      yes          no
 *   password in URL       NO      yes          no
 *   generic api_key       NO      yes          no
 *
 * The row to dwell on is the private key. `bridgeRedaction` carried
 * `/BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY/gi`, which requires `" KEY"`
 * immediately after the algorithm word — but a real PEM header reads
 * the algorithm followed by the private-key label. It matched only the generic
 * PKCS#8 header and missed RSA, EC, OPENSSH and DSA. A private key
 * pasted through the bridge was written unredacted. Duplication hid it, because
 * `secretBlind`'s pattern was correct and covered the other path.
 *
 * WHERE OVERLAPS EXISTED THE BROADER PATTERN WON. That is the lesson from
 * ADR-0021, where consolidating the injection matchers silently narrowed two
 * patterns: `sk-` keeps bridge's `{12,}` over secretBlind's `{20,}`, `Bearer`
 * keeps bridge's `{8,}` over secretBlind's `{20,}`, and the JWT pattern keeps
 * bridge's, whose second segment need not itself start with `eyJ`.
 *
 * `source` records which engine contributed each pattern so a reviewer can check
 * nothing was dropped, and `tests/secretRedaction.test.ts` asserts one sample
 * per ORIGINAL pattern from both engines still matches — a coverage comparison,
 * not a reading of regexes.
 *
 * NO `g` OR `y` FLAG HERE. A shared sticky regex keeps `lastIndex` between
 * calls, so the same input matches and then does not. The service adds `g` when
 * it uses a pattern, and a test refuses any entry that carries one.
 *
 * WHAT IS DELIBERATELY NOT MERGED: the gateway's `redactBody`. It is
 * policy-driven by design — operators supply `textRegexDenylist` — and folding
 * a hardcoded table into it would override a deliberate configuration surface.
 * Its default is two patterns, which is why it caught almost nothing above; that
 * is an operator-configuration question, not a duplicate engine.
 */

export type SecretPatternSource = "bridge" | "secretBlind" | "both";

export interface SecretPattern {
  /** Stable label; `secretBlind` renders it into its placeholder. */
  readonly type: string;
  /** Which original engine contributed this pattern. */
  readonly source: SecretPatternSource;
  readonly pattern: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { type: "aws_key", source: "both", pattern: /AKIA[A-Z0-9]{16}/ },
  { type: "aws_secret", source: "secretBlind", pattern: /(?:aws_secret_access_key|AWS_SECRET)["\s:=]+[A-Za-z0-9/+=]{40}/i },
  { type: "github_token", source: "both", pattern: /gh[ps]_[A-Za-z0-9]{36,}/ },
  { type: "github_oauth", source: "both", pattern: /gho_[A-Za-z0-9]{36,}/ },
  // Anthropic before the generic `sk-` rule: `sk-ant-` has a hyphen four
  // characters in, so the generic pattern stops short and never covers it.
  { type: "anthropic_key", source: "bridge", pattern: /sk-ant-[a-zA-Z0-9-]{20,}/ },
  { type: "openai_key", source: "both", pattern: /\bsk-[A-Za-z0-9]{12,}\b/ },
  { type: "google_api_key", source: "bridge", pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/ },
  { type: "xai_key", source: "bridge", pattern: /\bxai-[A-Za-z0-9\-_]{12,}\b/ },
  { type: "slack_token", source: "secretBlind", pattern: /xox[bprs]-[A-Za-z0-9-]{10,}/ },
  { type: "slack_webhook", source: "secretBlind", pattern: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/ },
  // secretBlind's spelling, because bridge's missed four of the five real forms.
  { type: "private_key", source: "secretBlind", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { type: "connection_string", source: "secretBlind", pattern: /(mongodb|postgres|mysql|redis|amqp):\/\/[^\s"']+/i },
  { type: "generic_api_key", source: "secretBlind", pattern: /(?:api[_-]?key|apikey|api_secret)["\s:=]+["']?[A-Za-z0-9_\-]{16,}["']?/i },
  { type: "password_in_url", source: "secretBlind", pattern: /\/\/[^:\s]+:[^@\s]+@/ },
  { type: "bearer_token", source: "both", pattern: /Bearer\s+[A-Za-z0-9._-]{8,}/i },
  { type: "jwt", source: "both", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
  { type: "amc_lease", source: "bridge", pattern: /\blease_[a-z0-9]{10,}\b/i },
  { type: "amc_token", source: "bridge", pattern: /\bamc_[a-z0-9]{12,}\b/i }
];
