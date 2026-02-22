import { amcVersion } from "../version.js";

export interface SdkVersionPolicy {
  packageVersion: string;
  bridgeApiVersion: "v1";
  versioning: "semver";
  minimumDeprecationNoticeDays: number;
  policyDocPath: string;
}

export interface DeprecatedBridgeRoute {
  legacyPath: string;
  replacementPath: string;
  deprecated: boolean;
  announcedOn: string;
  sunsetOn: string;
}

export const sdkVersionPolicy: SdkVersionPolicy = {
  packageVersion: amcVersion,
  bridgeApiVersion: "v1",
  versioning: "semver",
  minimumDeprecationNoticeDays: 90,
  policyDocPath: "docs/SDK_VERSIONING.md"
};

export const deprecatedBridgeRoutes: DeprecatedBridgeRoute[] = [
  {
    legacyPath: "/api/v1/chat/completions",
    replacementPath: "/bridge/openai/v1/chat/completions",
    deprecated: true,
    announcedOn: "2026-02-22",
    sunsetOn: "2026-06-01"
  },
  {
    legacyPath: "/api/v1/completions",
    replacementPath: "/bridge/openai/v1/completions",
    deprecated: true,
    announcedOn: "2026-02-22",
    sunsetOn: "2026-06-01"
  },
  {
    legacyPath: "/api/v1/embeddings",
    replacementPath: "/bridge/openai/v1/embeddings",
    deprecated: true,
    announcedOn: "2026-02-22",
    sunsetOn: "2026-06-01"
  }
];

export function deprecatedBridgeRoute(pathname: string): DeprecatedBridgeRoute | null {
  return deprecatedBridgeRoutes.find((row) => row.legacyPath === pathname) ?? null;
}
