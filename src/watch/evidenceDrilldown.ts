export interface WatchEvidenceDrilldownArtifactLink {
  label: string;
  kind: "watch-explain";
  href: string;
  hash?: string;
}

export interface BuildWatchEvidenceDrilldownArtifactLinkParams {
  agentId: string;
  runId: string;
  manifestHash?: string | null;
}

/**
 * Build the Watch-side source artifact link used by Score evidence drilldowns.
 *
 * The linked API returns the existing Watch explain packet for a scored run; it is
 * intentionally metadata-only and points back to signed Score/Shield evidence
 * rather than embedding third-party observability UI assets or prose.
 */
export function buildWatchEvidenceDrilldownArtifactLink(
  params: BuildWatchEvidenceDrilldownArtifactLinkParams,
): WatchEvidenceDrilldownArtifactLink {
  const query = `agentId=${encodeURIComponent(params.agentId)}`;
  return {
    label: "Watch explain packet",
    kind: "watch-explain",
    href: `/api/v1/watch/explain/${encodeURIComponent(params.runId)}?${query}`,
    hash: params.manifestHash ?? undefined,
  };
}
