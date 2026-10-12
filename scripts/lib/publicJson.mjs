/**
 * GET a public JSON endpoint without credentials, refusing redirects, with a 20 s timeout. A failure is returned as a
 * reason ("HTTP 503", the network error), never as a value, so callers record it as "not measured".
 * @returns {Promise<{ ok: true; body: any } | { ok: false; reason: string }>}
 */
export async function getPublicJson(fetchImpl, url, headers = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "amc-release-train", ...headers },
      redirect: "error",
      signal: AbortSignal.timeout(20_000)
    });
    if (response.status !== 200) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
