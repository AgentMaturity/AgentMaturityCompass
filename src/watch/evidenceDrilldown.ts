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

export interface WatchObsStudioSourceArtifactLinksParams {
  doi: string;
  openAlexWorkId: string;
  publisherUrl?: string | null;
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

/**
 * Build metadata-only source artifact links for observability Studio drilldown rows.
 *
 * These links point to live source identity records (DOI/OpenAlex/publisher) while
 * the actual preview, empty, and error-state evidence remains AMC-owned and signed
 * in the Score evidence drilldown response.
 */
export function buildWatchObsStudioSourceArtifactLinks(
  params: WatchObsStudioSourceArtifactLinksParams,
): string[] {
  return [params.doi, params.openAlexWorkId, params.publisherUrl ?? null]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}
