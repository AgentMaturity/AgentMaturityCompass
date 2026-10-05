import type { IncomingHttpHeaders } from "node:http";
import type { URL } from "node:url";

export type LeaseCarrier =
  | "x-amc-lease"
  | "authorization"
  | "x-api-key"
  | "x-goog-api-key"
  | "api-key"
  | "query";

export interface LeaseCarrierResolution {
  leaseToken: string | null;
  leaseCarrier: LeaseCarrier | null;
  nonLeaseCarrier: LeaseCarrier | null;
  nonLeaseValue: string | null;
  queryCarrierUsed: boolean;
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

function parseBearer(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /^\s*Bearer\s+(.+)\s*$/i.exec(value);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].trim();
}

export function looksLikeLeaseToken(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}

export function extractLeaseCarrier(params: {
  headers: IncomingHttpHeaders;
  url?: URL;
  allowQueryCarrier?: boolean;
}): LeaseCarrierResolution {
  const allowQueryCarrier = params.allowQueryCarrier === true;

  const xAmcLease = firstString(params.headers["x-amc-lease"]);
  if (xAmcLease && xAmcLease.length > 0) {
    return looksLikeLeaseToken(xAmcLease)
      ? {
          leaseToken: xAmcLease,
          leaseCarrier: "x-amc-lease",
          nonLeaseCarrier: null,
          nonLeaseValue: null,
          queryCarrierUsed: false
        }
      : {
          leaseToken: null,
          leaseCarrier: null,
          nonLeaseCarrier: "x-amc-lease",
          nonLeaseValue: xAmcLease,
          queryCarrierUsed: false
        };
  }

  const bearer = parseBearer(firstString(params.headers.authorization));
  if (bearer && bearer.length > 0) {
    return looksLikeLeaseToken(bearer)
      ? {
          leaseToken: bearer,
          leaseCarrier: "authorization",
          nonLeaseCarrier: null,
          nonLeaseValue: null,
          queryCarrierUsed: false
        }
      : {
          leaseToken: null,
          leaseCarrier: null,
          nonLeaseCarrier: "authorization",
          nonLeaseValue: bearer,
          queryCarrierUsed: false
        };
  }
  if (firstString(params.headers.authorization)) {
    return {
      leaseToken: null,
      leaseCarrier: null,
      nonLeaseCarrier: "authorization",
      nonLeaseValue: firstString(params.headers.authorization),
      queryCarrierUsed: false
    };
  }

  const xApiKey = firstString(params.headers["x-api-key"]);
  if (xApiKey && xApiKey.length > 0) {
    return looksLikeLeaseToken(xApiKey)
      ? {
          leaseToken: xApiKey,
          leaseCarrier: "x-api-key",
          nonLeaseCarrier: null,
          nonLeaseValue: null,
          queryCarrierUsed: false
        }
      : {
          leaseToken: null,
          leaseCarrier: null,
          nonLeaseCarrier: "x-api-key",
          nonLeaseValue: xApiKey,
          queryCarrierUsed: false
        };
  }

  const xGoogApiKey = firstString(params.headers["x-goog-api-key"]);
  if (xGoogApiKey && xGoogApiKey.length > 0) {
    return looksLikeLeaseToken(xGoogApiKey)
      ? {
          leaseToken: xGoogApiKey,
          leaseCarrier: "x-goog-api-key",
          nonLeaseCarrier: null,
          nonLeaseValue: null,
          queryCarrierUsed: false
        }
      : {
          leaseToken: null,
          leaseCarrier: null,
          nonLeaseCarrier: "x-goog-api-key",
          nonLeaseValue: xGoogApiKey,
          queryCarrierUsed: false
        };
  }

  const apiKey = firstString(params.headers["api-key"]);
  if (apiKey && apiKey.length > 0) {
    return looksLikeLeaseToken(apiKey)
      ? {
          leaseToken: apiKey,
          leaseCarrier: "api-key",
          nonLeaseCarrier: null,
          nonLeaseValue: null,
          queryCarrierUsed: false
        }
      : {
          leaseToken: null,
          leaseCarrier: null,
          nonLeaseCarrier: "api-key",
          nonLeaseValue: apiKey,
          queryCarrierUsed: false
        };
  }

  if (allowQueryCarrier && params.url) {
    const queryLease = params.url.searchParams.get("amc_lease");
    if (queryLease && queryLease.length > 0) {
      return looksLikeLeaseToken(queryLease)
        ? {
            leaseToken: queryLease,
            leaseCarrier: "query",
            nonLeaseCarrier: null,
            nonLeaseValue: null,
            queryCarrierUsed: true
          }
        : {
            leaseToken: null,
            leaseCarrier: null,
            nonLeaseCarrier: "query",
            nonLeaseValue: queryLease,
            queryCarrierUsed: true
          };
    }
  }

  return {
    leaseToken: null,
    leaseCarrier: null,
    nonLeaseCarrier: null,
    nonLeaseValue: null,
    queryCarrierUsed: false
  };
}

