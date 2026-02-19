/**
 * Honeytoken generation and detection — pure TypeScript, no external deps.
 * Uses deterministic AMC_HONEY_ prefix for detectability.
 */

const HONEY_PREFIX = "AMC_HONEY_";

let counter = 0;

function nextId(): string {
  return String(++counter).padStart(6, "0");
}

export interface HoneytokenResult {
  token: string;
  marker: string;
}

export function generateHoneytoken(kind: "api_key" | "password" | "email"): HoneytokenResult {
  const id = nextId();
  const marker = `${HONEY_PREFIX}${kind}_${id}`;

  switch (kind) {
    case "api_key":
      return { token: `sk-${marker}`, marker };
    case "password":
      return { token: marker, marker };
    case "email":
      return { token: `${marker.toLowerCase()}@honeypot.amc.local`, marker };
  }
}

export function isHoneytoken(value: string): boolean {
  return value.includes(HONEY_PREFIX) || value.toLowerCase().includes(HONEY_PREFIX.toLowerCase());
}
