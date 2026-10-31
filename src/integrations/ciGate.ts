/**
 * CI/CD Gate & Integration Ecosystem — Gap 10
 *
 * GitHub Actions, generic CI gate, webhook notifiers, and
 * observability platform connectors.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { amcVersion } from "../version.js";
import type { ObservabilityProvider } from "../watch/observabilityBridge.js";
import * as fs from 'node:fs';

/* ── Types ───────────────────────────────────────────────────────── */

export type IntegrationType = "github-action" | "gitlab-ci" | "slack" | "discord" | "pagerduty" | "webhook" | "datadog" | "langfuse" | "helicone";

export interface CIGateConfig {
  workspace: string;
  agentId?: string;
  minScore?: number;
  failOnCritical?: boolean;
  outputFormat?: "json" | "markdown" | "github-annotations";
}

export interface CIGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  criticalViolations: number;
  summary: string;
  details: string[];
  annotations?: GitHubAnnotation[];
}

export interface GitHubAnnotation {
  file: string;
  line: number;
  level: "notice" | "warning" | "error";
  message: string;
}

export interface WebhookNotifierConfig {
  type: IntegrationType;
  url: string;
  token?: string;
  channel?: string;
  mentionOn?: "critical" | "warning" | "all";
}

/* ── CI Gate ──────────────────────────────────────────────────────── */

export function evaluateCIGate(config: CIGateConfig, scoreData: {
  overallScore: number;
  criticalCount: number;
  warnings: string[];
  dimensions: Record<string, number>;
}): CIGateResult {
  const threshold = config.minScore ?? 60;
  const criticalThreshold = config.failOnCritical ?? true;

  const passed = scoreData.overallScore >= threshold &&
    (!criticalThreshold || scoreData.criticalCount === 0);

  const details: string[] = [];
  details.push(`Overall score: ${scoreData.overallScore.toFixed(1)} / 100 (threshold: ${threshold})`);

  for (const [dim, score] of Object.entries(scoreData.dimensions)) {
    const status = score >= threshold ? "✅" : "❌";
    details.push(`${status} ${dim}: ${score.toFixed(1)}`);
  }

  if (scoreData.criticalCount > 0) {
    details.push(`⚠️ ${scoreData.criticalCount} critical violation(s) found`);
  }

  for (const w of scoreData.warnings) {
    details.push(`⚠️ ${w}`);
  }

  const annotations: GitHubAnnotation[] = scoreData.warnings.map((w, i) => ({
    file: "amc-report.json",
    line: i + 1,
    level: "warning" as const,
    message: w,
  }));

  if (scoreData.criticalCount > 0) {
    annotations.push({
      file: "amc-report.json",
      line: 1,
      level: "error",
      message: `${scoreData.criticalCount} critical AMC violation(s) — deployment blocked`,
    });
  }

  return {
    passed,
    score: scoreData.overallScore,
    threshold,
    criticalViolations: scoreData.criticalCount,
    summary: passed
      ? `✅ AMC Gate PASSED — score ${scoreData.overallScore.toFixed(1)}% meets threshold ${threshold}%`
      : `❌ AMC Gate FAILED — score ${scoreData.overallScore.toFixed(1)}% below threshold ${threshold}%${scoreData.criticalCount > 0 ? ` with ${scoreData.criticalCount} critical violation(s)` : ""}`,
    details,
    annotations,
  };
}

/* ── GitHub Action Generator ─────────────────────────────────────── */

/** Installs this AMC version from its GitHub Release tarball, checked against the release's SHA256SUMS. */
const installAmc = (indent: string) => [
  `VERSION="${amcVersion}"`,
  `BASE="https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v\${VERSION}"`,
  `curl -fsSL -o /tmp/amc.tgz "\${BASE}/agent-maturity-compass-\${VERSION}.tgz"`,
  `curl -fsSL -o /tmp/SHA256SUMS "\${BASE}/SHA256SUMS"`,
  `grep "agent-maturity-compass-\${VERSION}.tgz" /tmp/SHA256SUMS | (cd /tmp && sha256sum -c -)`,
  `npm i -g /tmp/amc.tgz`
].join(`\n${indent}`);

/**
 * A committed .amc workspace is used as it is (its vault passphrase from AMC_VAULT_PASSPHRASE); a fresh one gets a
 * vault whose generated passphrase lives only in this job. `persist` hands it to later steps (GitHub's GITHUB_ENV).
 */
const initAmc = (indent: string, persist: string) => [
  `if [ ! -d .amc ]; then`,
  `  if [ -z "\${AMC_VAULT_PASSPHRASE:-}" ]; then`,
  `    export AMC_VAULT_PASSPHRASE="amc-ci-$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')"`,
  ...(persist ? [`    ${persist}`] : []),
  `  fi`,
  `  amc init --minimal --profile ci`,
  `fi`
].join(`\n${indent}`);

/**
 * `amc --json` writes the full score to amc-report.json. No accepted evidence (INSUFFICIENT_EVIDENCE) is "no evidence
 * yet": never a score, and a threshold above 0 then fails with that reason. `say` prints a summary line.
 */
const assessAmc = (indent: string, agentFlag: string, minScore: number, say: (text: string) => string, output?: (kv: string) => string) => [
  `amc --json${agentFlag ? ` ${agentFlag}` : ""} > amc-report.json`,
  `if [ "$(node -p 'require("./amc-report.json").evidenceStatus')" = "INSUFFICIENT_EVIDENCE" ]; then`,
  ...(output ? [`  ${output("evidence=none")}`] : []),
  `  ${say("AMC: no evidence yet")}`,
  `  ${say("$(node -p 'require(\"./amc-report.json\").nextEvidenceStep ?? \"No measured maturity score was produced.\"')")}`,
  ...(minScore > 0 ? [`  ${say(`❌ AMC Gate FAILED: no evidence yet, so no measured score to compare with the ${minScore}% threshold`)}`, `  exit 1`]
    : [`  exit 0`]),
  `fi`,
  `SCORE=$(node -p 'require("./amc-report.json").score')`,
  ...(output ? [output("score=$SCORE")] : []),
  `${say("AMC Score: $SCORE%")}`,
  `if [ "$(node -p "Number(require('./amc-report.json').score) < ${minScore}")" = "true" ]; then`,
  `  ${say(`❌ AMC Gate FAILED: score $SCORE% is below the ${minScore}% threshold`)}`,
  `  exit 1`,
  `fi`,
  `${say("✅ AMC Gate PASSED")}`
].join(`\n${indent}`);

export function generateGitHubAction(config: {
  minScore?: number;
  agentId?: string;
  nodeVersion?: string;
}): string {
  const minScore = config.minScore ?? 60;
  const nodeVersion = config.nodeVersion ?? "22";
  const agentId = config.agentId ? `--agent ${config.agentId}` : "";
  const indent = "          ";

  return `# AMC (Agent Maturity Compass) — Trust Gate for AI Agents
# Generated by: amc integrations setup --type github-action

name: AMC Trust Gate
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  amc-gate:
    name: AMC Maturity Assessment
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "${nodeVersion}"

      - name: Install AMC
        run: |
          set -euo pipefail
          ${installAmc(indent)}

      - name: Initialize AMC workspace
        run: |
          set -euo pipefail
          ${initAmc(indent, `echo "::add-mask::$AMC_VAULT_PASSPHRASE"; echo "AMC_VAULT_PASSPHRASE=$AMC_VAULT_PASSPHRASE" >> "$GITHUB_ENV"`)}

      - name: Run AMC assessment
        id: amc
        run: |
          set -euo pipefail
          ${assessAmc(indent, agentId, minScore, (text) => `echo "### ${text}" >> "$GITHUB_STEP_SUMMARY"`, (kv) => `echo "${kv}" >> "$GITHUB_OUTPUT"`)}

      - name: Upload AMC Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: amc-report
          path: amc-report.json

      - name: Comment on PR
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let report = null;
            try { report = JSON.parse(fs.readFileSync('amc-report.json', 'utf8')); } catch {}
            const noEvidence = '\${{ steps.amc.outputs.evidence }}' === 'none';
            const score = '\${{ steps.amc.outputs.score }}';
            const head = noEvidence ? '## AMC: no evidence yet'
              : score ? \`## \${Number(score) >= ${minScore} ? '✅' : '❌'} AMC Score: \${score}%\`
              : '## ❌ AMC: no result (see the job log)';
            const body = [
              head,
              '',
              ...(noEvidence ? [report?.nextEvidenceStep ?? 'No measured maturity score was produced.'] : []),
              \`**Threshold:** ${minScore}%\`,
              '',
              '_Generated by [AMC](https://github.com/AgentMaturity/AgentMaturityCompass)_',
              '<!-- amc-gate -->',
            ].join('\\n');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const existing = comments.find(c => c.body && (c.body.includes('<!-- amc-gate -->') || c.body.includes('AMC Trust Score')));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
`;
}

/* ── GitLab CI Generator ─────────────────────────────────────────── */

export function generateGitLabCI(config: { minScore?: number; agentId?: string }): string {
  const minScore = config.minScore ?? 60;
  const agentId = config.agentId ? `--agent ${config.agentId}` : "";
  const indent = "      ";

  return `# AMC Trust Gate for GitLab CI
# Generated by: amc integrations setup --type gitlab-ci

amc-gate:
  stage: test
  image: node:22
  script:
    - |
      ${installAmc(indent)}
    - |
      ${initAmc(indent, "")}
    - |
      ${assessAmc(indent, agentId, minScore, (text) => `echo "${text}"`)}
  artifacts:
    paths:
      - amc-report.json
    when: always
`;
}

/* ── Webhook Notifier ────────────────────────────────────────────── */

export async function sendWebhookNotification(
  config: WebhookNotifierConfig,
  payload: {
    title: string;
    message: string;
    severity: "info" | "warning" | "critical";
    score?: number;
    agentId?: string;
    details?: Record<string, unknown>;
  },
): Promise<boolean> {
  switch (config.type) {
    case "slack": return sendSlackNotification(config, payload);
    case "discord": return sendDiscordNotification(config, payload);
    case "pagerduty": return sendPagerDutyNotification(config, payload);
    case "webhook": return sendGenericWebhook(config, payload);
    default: return sendGenericWebhook(config, payload);
  }
}

async function sendSlackNotification(
  config: WebhookNotifierConfig,
  payload: { title: string; message: string; severity: string; score?: number },
): Promise<boolean> {
  const color = payload.severity === "critical" ? "#FF0000" : payload.severity === "warning" ? "#FFA500" : "#36A64F";
  const emoji = payload.severity === "critical" ? "🚨" : payload.severity === "warning" ? "⚠️" : "✅";

  const slackPayload = {
    channel: config.channel,
    attachments: [{
      color,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `${emoji} *${payload.title}*\n${payload.message}` },
        },
        ...(payload.score !== undefined ? [{
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Score:* ${payload.score.toFixed(1)}%` },
            { type: "mrkdwn", text: `*Severity:* ${payload.severity}` },
          ],
        }] : []),
      ],
    }],
  };

  return httpPost(config.url, slackPayload, config.token ? { Authorization: `Bearer ${config.token}` } : {});
}

async function sendDiscordNotification(
  config: WebhookNotifierConfig,
  payload: { title: string; message: string; severity: string; score?: number },
): Promise<boolean> {
  const color = payload.severity === "critical" ? 0xFF0000 : payload.severity === "warning" ? 0xFFA500 : 0x36A64F;

  const discordPayload = {
    embeds: [{
      title: payload.title,
      description: payload.message,
      color,
      fields: payload.score !== undefined ? [
        { name: "Score", value: `${payload.score.toFixed(1)}%`, inline: true },
        { name: "Severity", value: payload.severity, inline: true },
      ] : [],
      footer: { text: "AMC (Agent Maturity Compass)" },
      timestamp: new Date().toISOString(),
    }],
  };

  return httpPost(config.url, discordPayload);
}

async function sendPagerDutyNotification(
  config: WebhookNotifierConfig,
  payload: { title: string; message: string; severity: string },
): Promise<boolean> {
  const pdPayload = {
    routing_key: config.token,
    event_action: payload.severity === "critical" ? "trigger" : "acknowledge",
    payload: {
      summary: `${payload.title}: ${payload.message}`,
      source: "amc",
      severity: payload.severity === "critical" ? "critical" : payload.severity === "warning" ? "warning" : "info",
      component: "agent-maturity-compass",
    },
  };

  return httpPost(config.url || "https://events.pagerduty.com/v2/enqueue", pdPayload);
}

async function sendGenericWebhook(
  config: WebhookNotifierConfig,
  payload: { title: string; message: string; severity: string; score?: number; agentId?: string; details?: Record<string, unknown> },
): Promise<boolean> {
  const webhookPayload = {
    event: "amc.alert",
    ts: new Date().toISOString(),
    ...payload,
  };

  const headers: Record<string, string> = {};
  if (config.token) headers["Authorization"] = `Bearer ${config.token}`;

  return httpPost(config.url, webhookPayload, headers);
}

/* ── Observability Connector Config Generator ────────────────────── */

export interface ObservabilityConnectorConfig {
  provider: ObservabilityProvider;
  endpoint: string;
  apiKey: string;
  projectId?: string;
  headers?: Record<string, string>;
}

export function generateConnectorConfig(provider: IntegrationType): {
  envVars: Record<string, string>;
  configYaml: string;
  instructions: string;
} {
  switch (provider) {
    case "langfuse":
      return {
        envVars: {
          AMC_LANGFUSE_PUBLIC_KEY: "<your-langfuse-public-key>",
          AMC_LANGFUSE_SECRET_KEY: "<your-langfuse-secret-key>",
          AMC_LANGFUSE_HOST: "https://cloud.langfuse.com",
        },
        configYaml: `# AMC Observability — Langfuse Connector
watch:
  providers:
    - provider: langfuse
      endpoint: \${AMC_LANGFUSE_HOST}
      apiKey: \${AMC_LANGFUSE_PUBLIC_KEY}
      headers:
        x-langfuse-secret-key: \${AMC_LANGFUSE_SECRET_KEY}
      pollIntervalMs: 10000
`,
        instructions: `1. Sign up at https://cloud.langfuse.com
2. Create a project and get your API keys
3. Set environment variables: AMC_LANGFUSE_PUBLIC_KEY, AMC_LANGFUSE_SECRET_KEY
4. Run: amc watch connect --provider langfuse --endpoint https://cloud.langfuse.com`,
      };

    case "helicone":
      return {
        envVars: { AMC_HELICONE_API_KEY: "<your-helicone-api-key>" },
        configYaml: `# AMC Observability — Helicone Connector
watch:
  providers:
    - provider: helicone
      endpoint: https://api.helicone.ai
      apiKey: \${AMC_HELICONE_API_KEY}
      pollIntervalMs: 10000
`,
        instructions: `1. Sign up at https://www.helicone.ai
2. Get your API key from the dashboard
3. Set: AMC_HELICONE_API_KEY
4. Run: amc watch connect --provider helicone --endpoint https://api.helicone.ai`,
      };

    case "datadog":
      return {
        envVars: {
          AMC_DD_API_KEY: "<your-datadog-api-key>",
          AMC_DD_SITE: "datadoghq.com",
        },
        configYaml: `# AMC Observability — Datadog Connector
watch:
  providers:
    - provider: datadog
      endpoint: https://api.\${AMC_DD_SITE}
      apiKey: \${AMC_DD_API_KEY}
      pollIntervalMs: 15000
`,
        instructions: `1. Get your Datadog API key from https://app.datadoghq.com/organization-settings/api-keys
2. Set: AMC_DD_API_KEY, AMC_DD_SITE
3. Run: amc watch connect --provider datadog --endpoint https://api.datadoghq.com`,
      };

    default:
      return {
        envVars: { AMC_WEBHOOK_URL: "<your-webhook-endpoint>" },
        configYaml: `# AMC Observability — Generic Webhook
watch:
  providers:
    - provider: webhook
      endpoint: \${AMC_WEBHOOK_URL}
`,
        instructions: `1. Set up an HTTP endpoint that accepts POST requests with trace data
2. Set: AMC_WEBHOOK_URL
3. Run: amc watch connect --provider webhook --endpoint <your-url>`,
      };
  }
}

/* ── Setup Command ───────────────────────────────────────────────── */

export function setupIntegration(
  workspace: string,
  type: IntegrationType,
  options?: { minScore?: number; agentId?: string; outputDir?: string },
): { files: Array<{ path: string; content: string }>; instructions: string } {
  const outputDir = options?.outputDir ?? workspace;
  const files: Array<{ path: string; content: string }> = [];
  let instructions = "";

  switch (type) {
    case "github-action": {
      const yaml = generateGitHubAction({ minScore: options?.minScore, agentId: options?.agentId });
      const filePath = join(outputDir, ".github", "workflows", "amc-gate.yml");
      files.push({ path: filePath, content: yaml });
      instructions = `GitHub Action generated at .github/workflows/amc-gate.yml\nCommit and push to enable AMC trust gates on PRs.`;
      break;
    }

    case "gitlab-ci": {
      const yaml = generateGitLabCI({ minScore: options?.minScore, agentId: options?.agentId });
      const filePath = join(outputDir, ".gitlab-ci-amc.yml");
      files.push({ path: filePath, content: yaml });
      instructions = `GitLab CI config generated at .gitlab-ci-amc.yml\nInclude in your main .gitlab-ci.yml.`;
      break;
    }

    case "slack":
    case "discord":
    case "pagerduty":
    case "webhook": {
      const config = `# AMC Notification — ${type}
# Add to your .amc/config.yaml
notifications:
  - type: ${type}
    url: \${AMC_${type.toUpperCase()}_WEBHOOK_URL}
    ${type === "slack" ? "channel: #ai-alerts" : ""}
    mentionOn: critical
`;
      files.push({ path: join(outputDir, `.amc-${type}-config.yaml`), content: config });
      instructions = `${type} notification config generated.\nSet AMC_${type.toUpperCase()}_WEBHOOK_URL and add to .amc/config.yaml.`;
      break;
    }

    case "langfuse":
    case "helicone":
    case "datadog": {
      const connector = generateConnectorConfig(type);
      files.push({ path: join(outputDir, `.amc-${type}-config.yaml`), content: connector.configYaml });
      instructions = connector.instructions;
      break;
    }
  }

  // Write files
  for (const file of files) {
    const dir = join(file.path, "..");
    ensureDir(dir);
    writeFileAtomic(file.path, file.content);
  }

  return { files, instructions };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function httpPost(url: string, body: unknown, headers?: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const reqFn = parsed.protocol === "https:" ? httpsRequest : httpRequest;
      const payload = JSON.stringify(body);

      const req = reqFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          ...(headers ?? {}),
        },
        timeout: 10_000,
      }, (res) => {
        res.resume();
        res.on("end", () => resolve((res.statusCode ?? 500) < 400));
      });

      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    } catch {
      resolve(false);
    }
  });
}
