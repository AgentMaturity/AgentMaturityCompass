export const EGRESS_CHANNELS = ["provider", "mcp-http", "bridge", "network-tool", "callback", "storage"] as const;
export type EgressChannel = typeof EGRESS_CHANNELS[number];

export interface DestinationRecordV1 {
  readonly destinationId: string;
  readonly match: { readonly hosts: readonly string[]; readonly pathPrefixes?: readonly string[] };
  readonly channels: readonly EgressChannel[];
  readonly region: { readonly jurisdiction: string; readonly code: string } | null;
  /** An operator declaration, never proof of a lawful transfer or independent legal approval. */
  readonly transferBasis: { readonly kind: string; readonly reference: string; readonly reviewedBy: string } | null;
}
export interface ResidencyRuleV1 {
  readonly ruleId: string;
  readonly controlId: string;
  readonly appliesTo: { readonly dataClasses: readonly string[]; readonly jurisdictions: readonly string[] };
  readonly allowedJurisdictions: readonly string[];
  readonly acceptsTransferBasis: boolean;
}
/** The single deployment profile whose normalized digest the active plan pins. Storage remains an operator declaration. */
export interface ResidencyProfileReferenceV1 {
  readonly path: string;
  readonly storageUrl: string;
}
export interface DestinationRegistryV1 {
  readonly schemaVersion: "amc.residency-destinations/v1";
  readonly profile: ResidencyProfileReferenceV1 | null;
  readonly destinations: readonly DestinationRecordV1[];
  readonly rules: readonly ResidencyRuleV1[];
}
export type DestinationRegistrySnapshot =
  | { readonly state: "missing" }
  | { readonly state: "invalid"; readonly reason: "registry_unreadable" | "signature_missing" | "signature_invalid" | "schema_invalid" }
  | { readonly state: "verified"; readonly digestSha256: string; readonly registry: DestinationRegistryV1 };
export type EgressDecision =
  | { readonly verdict: "allowed"; readonly destinationId: string; readonly region: string; readonly ruleIds: readonly string[] }
  | { readonly verdict: "blocked"; readonly reason: "destination_unregistered" | "region_unknown" | "region_not_allowed" | "registry_unverifiable";
      readonly ruleIds: readonly string[]; readonly detail?: string; readonly destinationId?: string }
  | { readonly verdict: "no_rule"; readonly destinationId: string | null };
export interface ResidencyControlResult {
  readonly status: "not_evaluated";
  readonly controlIds: readonly string[];
  readonly reason: string;
}
export interface CheckEgressInput {
  readonly workspace: string;
  readonly channel: EgressChannel;
  readonly url: string;
  readonly dataClasses?: readonly string[] | null;
  readonly purpose?: string | null;
  readonly agentId?: string;
}
