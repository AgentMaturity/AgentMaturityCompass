/**
 * `amc identity workload-trust publish|verify|show` (P2-25): the signed workload trust config that pins SPIFFE
 * bundles, OIDC agent-token issuers, declared service principals and subject-to-agent bindings. It configures what AMC
 * trusts; it creates no identity anywhere. See docs/AGENT_IDENTITY.md.
 */
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import YAML from "yaml";
import { loadWorkloadTrustConfig, publishWorkloadTrustConfig, workloadTrustConfigSchema, type WorkloadTrustConfig } from "./identity/workload/workloadTrust.js";
import { assertOwnerMode } from "./mode/mode.js";

/** Counts and names only: what is pinned, never key material. */
function workloadTrustSummary(config: WorkloadTrustConfig) {
  return {
    trustDomains: config.spiffe.trustDomains.map((domain) => ({ trustDomain: domain.trustDomain, audience: domain.audience,
      x509Authorities: domain.x509Authorities.length, jwtAuthorities: domain.jwtAuthorities.length })),
    oidcAgentIssuers: config.oidcAgentIssuers.map((issuer) => ({ issuer: issuer.issuer, audience: issuer.audience, profile: issuer.profile,
      keys: issuer.jwks !== undefined ? `${issuer.jwks.length} pinned` : `jwksUri ${issuer.jwksUri}` })),
    services: [...config.services],
    bindings: config.bindings.map((binding) => ({ agentId: binding.agentId, spiffeIds: [...binding.spiffeIds],
      oidcSubjects: binding.oidcSubjects.map((subject) => `${subject.issuer} ${subject.subject}`) }))
  };
}

export function registerWorkloadTrustCommands(identity: Command): void {
  const trust = identity.command("workload-trust").description("Signed workload trust config: pinned SPIFFE bundles, agent-token issuers and bindings (experimental)");

  trust.command("publish <file>")
    .description("Validate a YAML workload trust config and publish it signed with the auditor key (owner mode)")
    .action(async (file: string) => {
      assertOwnerMode(process.cwd(), "identity workload-trust publish");
      const config = workloadTrustConfigSchema.parse(YAML.parse(readFileSync(file, "utf8")));
      const { path } = await publishWorkloadTrustConfig(process.cwd(), config);
      console.log(`published ${path} (signed); AMC trusts only what it pins, and identity grants no scope`);
    });

  trust.command("verify")
    .description("Verify the workload trust config's signature and schema; exits 1 when it does not verify")
    .action(() => {
      try {
        const config = loadWorkloadTrustConfig(process.cwd());
        console.log(config === null ? "no workload trust config: every presented workload credential is refused" : "workload trust config verifies");
      } catch (error) {
        console.error(`workload trust config does not verify: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });

  trust.command("show")
    .description("Show what the verified workload trust config pins (names and counts, no key material)")
    .option("--json", "print JSON")
    .action((opts: { json?: boolean }) => {
      const config = loadWorkloadTrustConfig(process.cwd());
      const summary = config === null ? null : workloadTrustSummary(config);
      console.log(opts.json ? JSON.stringify(summary, null, 2) : summary === null ? "no workload trust config" : YAML.stringify(summary));
    });
}
