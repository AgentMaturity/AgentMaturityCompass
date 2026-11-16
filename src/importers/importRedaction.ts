/** The redaction every import applies before anything is stored: secret-shaped text and secret-named keys become "[REDACTED]". */
const SECRET_RE = /(sk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._-]{10,}|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,})/gi;
const SECRET_KEY_RE = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret|private[_-]?key|authorization|cookie)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactString(value: string): { value: string; count: number } {
  let count = 0;
  const redacted = value.replace(SECRET_RE, () => {
    count += 1;
    return "[REDACTED]";
  });
  return { value: redacted, count };
}

export function redactDeep(value: unknown): { value: unknown; count: number } {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    let count = 0;
    const out = value.map((item) => {
      const redacted = redactDeep(item);
      count += redacted.count;
      return redacted.value;
    });
    return { value: out, count };
  }
  if (isRecord(value)) {
    let count = 0;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key) && item !== null && item !== "") {
        out[key] = "[REDACTED]"; count += 1; continue;
      }
      const redacted = redactDeep(item);
      count += redacted.count;
      out[key] = redacted.value;
    }
    return { value: out, count };
  }
  return { value, count: 0 };
}
