import { request as httpRequest, type ClientRequest } from "node:http";
import type { DoctorCheck } from "./doctorRules.js";

export interface DoctorHttpOutcome {
  readonly status: number | null;
  readonly failure: "deadline" | "connection" | "incomplete" | null;
}
export const DOCTOR_HTTP_DEADLINE_MS = 5_000;

/** Absolute deadline, including a stalled/trickling response body; no body retained. */
export function requestDoctorStatus(url: string, headers: Record<string, string>, body: string, deadlineMs = DOCTOR_HTTP_DEADLINE_MS): Promise<DoctorHttpOutcome> {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error("Doctor HTTP deadline must be a positive integer");
  return new Promise(resolve => {
    let settled = false;
    let request: ClientRequest | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: DoctorHttpOutcome) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (result.failure !== null) request?.destroy();
      resolve(result);
    };
    try {
      request = httpRequest(url, { method: "POST", agent: false,
        headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body), connection: "close" }
      }, response => {
        response.on("error", () => finish({ status: null, failure: "incomplete" }));
        response.on("aborted", () => finish({ status: null, failure: "incomplete" }));
        response.on("end", () => finish({ status: response.statusCode ?? null, failure: response.statusCode === undefined ? "incomplete" : null }));
        response.on("close", () => { if (!response.complete) finish({ status: null, failure: "incomplete" }); });
        response.resume();
      });
      request.on("error", () => finish({ status: null, failure: "connection" }));
      timer = setTimeout(() => finish({ status: null, failure: "deadline" }), deadlineMs);
      request.end(body);
    } catch { finish({ status: null, failure: "connection" }); }
  });
}

/** HTTP success alone is not an independent proof of lease enforcement. */
export function doctorCarrierCheck(id: string, carrier: string, result: DoctorHttpOutcome): DoctorCheck {
  const completed = result.failure === null && result.status !== null && result.status >= 200 && result.status < 300;
  return { id, status: completed ? "PASS" : "FAIL",
    message: completed
      ? `${carrier} live request completed with HTTP ${result.status}; this is not independent proof of lease enforcement or task correctness`
      : `${carrier} live request did not complete successfully (${result.failure ?? `HTTP ${result.status ?? "unknown"}`}); lease acceptance is not established`,
    fixHint: completed ? undefined : "Run: amc gateway status and amc trust status; inspect the selected route, provider credentials and signed lease policy before deliberately retrying amc doctor --live-probes. HTTP 4xx/5xx can originate upstream and are not lease-verification proof."
  };
}
