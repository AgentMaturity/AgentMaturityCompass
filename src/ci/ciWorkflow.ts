import { dirname, join, resolve } from "node:path";
import type { AgentPaths } from "../fleet/paths.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";

export function relativeAgentPathFromWorkspace(workspace: string, path: string): string {
  const resolved = resolve(path);
  return resolved.startsWith(resolve(workspace)) ? resolved.slice(resolve(workspace).length + 1).replace(/\\/g, "/") : path;
}

/** The pinned bundle verify a CI step runs: the auditor key and monitor fingerprint come from outside the checkout. */
export function pinnedBundleVerify(bundle: string, auditorPubFile: string): string {
  return `amc bundle verify ${bundle} --pubkey "${auditorPubFile}" --expect-monitor "$AMC_MONITOR_FINGERPRINT"`;
}

/** One actual native suffix shared by retained sync init and its fixed async attempt. Wire is ordinary data, not authority. */
export function writeCiWorkflowSuffix(params: { workspace: string }, agentId: string, agentPaths: AgentPaths,
  signPolicy: boolean, savedPolicy: { policyPath: string; sigPath: string | null }, beforeWrite?: () => void) {
  const workflowPath = join(params.workspace, ".github", "workflows", "amc.yml");
  ensureDir(dirname(workflowPath));

  const suggestedBundlePath = join(agentPaths.bundlesDir, "latest.amcbundle");
  const relBundle = relativeAgentPathFromWorkspace(params.workspace, suggestedBundlePath);
  const relPolicy = relativeAgentPathFromWorkspace(params.workspace, savedPolicy.policyPath);
  const relOutcomeReport = relativeAgentPathFromWorkspace(
    params.workspace,
    join(agentPaths.rootDir, "outcomes", "reports", "ci-latest.json")
  );
  const relExperimentPolicy = relativeAgentPathFromWorkspace(
    params.workspace,
    join(agentPaths.rootDir, "experimentGate.json")
  );
  const gateCommand = `amc gate --bundle ${relBundle} --policy ${relPolicy}${signPolicy ? "" : " --no-sign"}`;
  const bomSteps = signPolicy
    ? [
        "      - name: Generate maturity BOM",
        `        run: amc bom generate --agent ${agentId} --run latest --out amc-bom.json`,
        "      - name: Sign maturity BOM",
        "        run: amc bom sign --in amc-bom.json --out amc-bom.json.sig"
      ]
    : [
        "      - name: Generate maturity BOM",
        `        run: amc bom generate --agent ${agentId} --run latest --out amc-bom.json`,
        "      - name: Unsigned CI boundary",
        "        run: echo \"UNSIGNED CI mode: maturity BOM signing skipped; run amc ci init after vault setup for verifier-ready signatures.\""
      ];

  const workflow = [
    "name: AMC Release Gate",
    "",
    "on:",
    "  push:",
    "  pull_request:",
    "",
    "jobs:",
    "  amc-gate:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: '20'",
    "      - name: Install dependencies",
    "        run: npm ci",
    "      - name: Build",
    "        run: npm run build",
    // P0-09: bundle verify needs pinned keys. Pin ones recorded outside this repository (repository variables),
    // never the .amc/keys files in the checkout, which would let the bundle vouch for itself.
    "      - name: Verify evidence bundle",
    "        env:",
    "          AMC_AUDITOR_PUBKEY: ${{ vars.AMC_AUDITOR_PUBKEY }}",
    "          AMC_MONITOR_FINGERPRINT: ${{ vars.AMC_MONITOR_FINGERPRINT }}",
    `        run: printf '%s\\n' "$AMC_AUDITOR_PUBKEY" > "$RUNNER_TEMP/amc-auditor.pub" && ${pinnedBundleVerify(relBundle, "$RUNNER_TEMP/amc-auditor.pub")}`,
    "      - name: Generate outcomes report",
    `        run: amc outcomes report --agent ${agentId} --window 14d --out ${relOutcomeReport}`,
    "      - name: Optional experiment gate",
    `        run: if [ -n \"${"$"}AMC_EXPERIMENT_ID\" ] && [ -f \"${relExperimentPolicy}\" ]; then amc experiment gate --agent ${agentId} --experiment \"${"$"}AMC_EXPERIMENT_ID\" --policy ${relExperimentPolicy}; else echo \"Experiment gate skipped (set AMC_EXPERIMENT_ID and commit ${relExperimentPolicy})\"; fi`,
    "      - name: Enforce AMC gate policy",
    `        run: ${gateCommand}`,
    ...bomSteps,
    ""
  ].join("\n");

  beforeWrite?.();
  writeFileAtomic(workflowPath, workflow, 0o644);

  const result = {
    workflowPath,
    policyPath: savedPolicy.policyPath,
    policySigPath: savedPolicy.sigPath,
    suggestedBundlePath,
    signed: signPolicy
  };
  return { result, wire: workflow };
}
