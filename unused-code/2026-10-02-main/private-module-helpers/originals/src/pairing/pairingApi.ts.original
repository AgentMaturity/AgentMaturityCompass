import type { ServerResponse } from "node:http";
import { claimPairingCode, pairingTokenFromCookie, verifyPairingToken } from "./pairingCodes.js";

export function setPairingCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  res.setHeader("set-cookie", `amc_pairing=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(60, maxAgeSeconds)}`);
}

export function clearPairingCookie(res: ServerResponse): void {
  res.setHeader("set-cookie", "amc_pairing=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
}

export function claimPairingForResponse(params: {
  workspace: string;
  code: string;
  res: ServerResponse;
  ttlSeconds?: number;
}): { ok: boolean; error?: string; pairingId?: string; expiresTs?: number } {
  const claimed = claimPairingCode({
    workspace: params.workspace,
    code: params.code,
    pairingTtlMs: Math.max(60, params.ttlSeconds ?? 10 * 60) * 1000
  });
  if (!claimed.ok || !claimed.token || !claimed.expiresTs) {
    return {
      ok: false,
      error: claimed.error ?? "pairing claim failed"
    };
  }
  setPairingCookie(params.res, claimed.token, Math.max(60, Math.floor((claimed.expiresTs - Date.now()) / 1000)));
  return {
    ok: true,
    pairingId: claimed.pairingId,
    expiresTs: claimed.expiresTs
  };
}

export function pairingCookieValid(workspace: string, rawCookieHeader: string | undefined): boolean {
  const token = pairingTokenFromCookie(rawCookieHeader);
  if (!token) {
    return false;
  }
  return verifyPairingToken({
    workspace,
    token
  }).ok;
}
