import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runBootstrap } from "../bootstrap/bootstrap.js";
import { defaultGatewayConfig, initGatewayConfig } from "../gateway/config.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { refreshForecastForApi } from "../forecast/forecastApi.js";
import { benchCreateCli, benchInitCli, benchVerifyCli } from "../bench/benchCli.js";
import { backupCreateCli, backupVerifyCli } from "../ops/backup/backupCli.js";
import { releaseVerifyCli } from "../release/releaseCli.js";
import { loadTrustContext, workspaceSelfTrust } from "../trust/trustContext.js";
import { createReleaseBundle } from "../release/releaseBundle.js";
import { verifyTransparencyLog } from "../transparency/logChain.js";
import { verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import type { SmokeMode, SmokeReport } from "./smokeSchema.js";
import { smokeReportSchema } from "./smokeSchema.js";
import {
  httpGetJson,
  pickFreePort,
  runShell,
  runStep,
  startFakeOpenAiServer,
  startStudioChildProcess,
  waitForReady
} from "./smokeSteps.js";
import { readStudioState } from "../studio/studioState.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { openLedger } from "../ledger/ledger.js";

interface SmokeParams {
  mode: SmokeMode;
  workspace?: string;
  repoRoot?: string;
}

async function runLocalSmoke(params: SmokeParams): Promise<SmokeReport> {
  const repoRoot = resolve(params.repoRoot ?? process.cwd());
  const tempRoot = mkdtempSync(join(tmpdir(), "amc-e2e-local-"));
  const workspace = resolve(params.workspace ?? join(tempRoot, "workspace"));
  const debugWorkspace = workspace;

  const steps = [] as SmokeReport["steps"];
  const artifacts: Record<string, string> = {};
  const warnings: string[] = [];

  const vaultPassphrase = "amc-smoke-passphrase-12345";
  const backupPassphrase = "amc-smoke-backup-passphrase-12345";

  let fakeUpstream: { baseUrl: string; close: () => Promise<void> } | null = null;
  let studio: { close: () => Promise<void> } | null = null;

  const host = "127.0.0.1";
  const apiPort = await pickFreePort(host);
  const gatewayPort = await pickFreePort(host);
  const proxyPort = await pickFreePort(host);
  const metricsPort = await pickFreePort(host);
  const dashboardPort = await pickFreePort(host);

  try {
    artifacts.workspace = debugWorkspace;
    steps.push(
      await runStep("workspace-bootstrap", async () => {
        let boot;
        try {
          boot = await runBootstrap({
            workspace,
            vaultPassphrase,
            ownerUsername: "owner",
            ownerPassword: "owner-password",
            lanMode: false,
            bind: host,
            studioPort: apiPort,
            allowedCidrs: ["127.0.0.1/32", "::1/128"],
            enableNotary: false,
            notaryBaseUrl: "http://127.0.0.1:4343",
            notaryRequiredAttestation: "SOFTWARE",
            notaryAuthSecret: null
          });
        } catch (error) {
          throw new Error(error instanceof Error && error.stack ? error.stack : String(error));
        }
        artifacts.bootstrapReport = boot.reportPath;
        artifacts.workspace = workspace;
        return [`workspace=${workspace}`, `report=${boot.reportPath}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "bootstrap failed");
    }

    steps.push(
      await runStep("fake-upstream", async () => {
        fakeUpstream = await startFakeOpenAiServer(host);
        const gatewayConfig = defaultGatewayConfig();
        initGatewayConfig(workspace, {
          ...gatewayConfig,
          listen: { host, port: gatewayPort },
          upstreams: {
            local_test: {
              baseUrl: fakeUpstream.baseUrl,
              auth: { type: "none" },
              allowLocalhost: true,
              providerId: "local_test"
            }
          },
          routes: [{ prefix: "/openai", upstream: "local_test", stripPrefix: true, openaiCompatible: true }],
          proxy: {
            ...gatewayConfig.proxy,
            enabled: true,
            port: proxyPort,
            allowlistHosts: ["127.0.0.1"],
            denyByDefault: true
          }
        });
        return [`upstream=${fakeUpstream.baseUrl}`, `gatewayPort=${gatewayPort}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "fake upstream setup failed");
    }

    steps.push(
      await runStep("studio-start", async () => {
        studio = await startStudioChildProcess({
          repoRoot,
          workspace,
          host,
          apiPort,
          dashboardPort,
          gatewayPort,
          proxyPort,
          metricsPort,
          vaultPassphrase
        });
        await waitForReady(`http://${host}:${apiPort}/readyz`);
        return [`studio=http://${host}:${apiPort}`, `console=http://${host}:${apiPort}/console`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "studio start failed");
    }

    let leaseToken = "";
    steps.push(
      await runStep("lease-issue", () => {
        const lease = issueLeaseForCli({
          workspace,
          agentId: "default",
          ttl: "60m",
          scopes: "gateway:llm,toolhub:intent,toolhub:execute",
          routes: "/openai",
          models: "gpt-*",
          rpm: 60,
          tpm: 100000
        });
        leaseToken = lease.token;
        return ["lease issued for agent=default"];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "lease issue failed");
    }

    steps.push(
      await runStep("gateway-and-toolhub-cycle", async () => {
        const gatewayRes = await fetch(`http://${host}:${gatewayPort}/openai/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${leaseToken}`,
            "content-type": "application/json",
            "x-amc-agent-id": "default"
          },
          body: JSON.stringify({
            model: "gpt-test",
            messages: [{ role: "user", content: "smoke" }]
          })
        });
        if (gatewayRes.status < 200 || gatewayRes.status >= 300) {
          const body = await gatewayRes.text();
          throw new Error(`gateway request failed (${gatewayRes.status}): ${body}`);
        }
        const receipt = gatewayRes.headers.get("x-amc-receipt");
        if (!receipt) {
          throw new Error("gateway response missing x-amc-receipt");
        }
        await gatewayRes.text();

        const intentRes = await fetch(`http://${host}:${apiPort}/toolhub/intent`, {
          method: "POST",
          headers: {
            "x-amc-lease": leaseToken,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            agentId: "default",
            toolName: "git.status",
            args: {},
            requestedMode: "SIMULATE"
          })
        });
        if (intentRes.status !== 200) {
          throw new Error(`toolhub intent failed (${intentRes.status}): ${await intentRes.text()}`);
        }
        const intent = (await intentRes.json()) as { intentId?: string };
        if (!intent.intentId) {
          throw new Error("toolhub intent response missing intentId");
        }

        const execRes = await fetch(`http://${host}:${apiPort}/toolhub/execute`, {
          method: "POST",
          headers: {
            "x-amc-lease": leaseToken,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            intentId: intent.intentId
          })
        });
        if (execRes.status !== 200) {
          throw new Error(`toolhub execute failed (${execRes.status}): ${await execRes.text()}`);
        }
        return ["gateway receipt minted", "toolhub intent+execute completed"];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "gateway/toolhub cycle failed");
    }

    steps.push(
      await runStep("diagnostic-and-ledger", async () => {
        const reportPath = join(workspace, ".amc", "reports", "smoke-latest.md");
        const run = await runDiagnostic(
          {
            workspace,
            window: "14d",
            targetName: "default"
          },
          reportPath
        );
        artifacts.diagnosticReport = reportPath;
        artifacts.runId = run.runId;

        const tlog = verifyTransparencyLog(workspace);
        const merkle = verifyTransparencyMerkle(workspace);
        if (!tlog.ok) {
          throw new Error(`transparency verify failed: ${tlog.errors.join("; ")}`);
        }
        if (!merkle.ok) {
          throw new Error(`merkle verify failed: ${merkle.errors.join("; ")}`);
        }
        return [`runId=${run.runId}`, `transparencyEntries=${tlog.entryCount}`, `merkleLeafCount=${merkle.leafCount}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "diagnostic failed");
    }

    steps.push(
      await runStep("forecast-refresh", () => {
        const refreshed = refreshForecastForApi({
          workspace,
          scope: "workspace"
        });
        const artifactPath = refreshed.latestPath ?? refreshed.snapshotPath;
        if (!artifactPath) {
          throw new Error("forecast refresh did not return persisted artifact paths");
        }
        artifacts.forecastLatest = artifactPath;
        const verify = verifySignedFileWithAuditor(workspace, artifactPath);
        if (!verify.valid) {
          throw new Error(`forecast artifact signature invalid: ${verify.reason ?? "unknown"}`);
        }
        return [`forecast=${artifactPath}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "forecast refresh failed");
    }

    steps.push(
      await runStep("bench-create-verify", () => {
        benchInitCli(workspace);
        const benchOut = join(workspace, ".amc", "bench", "exports", "workspace", "workspace", "smoke.amcbench");
        const created = benchCreateCli({
          workspace,
          scope: "workspace",
          id: "workspace",
          outFile: benchOut,
          windowDays: 14,
          named: false
        });
        // The smoke run's own export, checked with its own keys: a self-check, labelled workspace-self.
        const verified = benchVerifyCli({
          file: created.outFile,
          trust: workspaceSelfTrust(workspace)
        });
        if (!verified.ok) {
          throw new Error(`bench verify failed: ${verified.errors.map((row) => row.message).join("; ")}`);
        }
        artifacts.bench = created.outFile;
        return [`benchId=${created.bench.benchId}`, `sha=${created.sha256}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "bench creation failed");
    }

    steps.push(
      await runStep("backup-create-verify", () => {
        const old = process.env.AMC_BACKUP_PASSPHRASE;
        process.env.AMC_BACKUP_PASSPHRASE = backupPassphrase;
        try {
          const backupFile = join(workspace, ".amc", "backup", "smoke.amcbackup");
          const created = backupCreateCli(workspace, backupFile);
          const verified = backupVerifyCli({
            backupFile: created.outFile,
            passphrase: backupPassphrase,
            trust: workspaceSelfTrust(workspace)
          });
          if (!verified.ok) {
            throw new Error(`backup verify failed: ${verified.errors.join("; ")}`);
          }
          artifacts.backup = created.outFile;
          return [`backup=${created.outFile}`];
        } finally {
          if (typeof old === "string") {
            process.env.AMC_BACKUP_PASSPHRASE = old;
          } else {
            delete process.env.AMC_BACKUP_PASSPHRASE;
          }
        }
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "backup failed");
    }

    steps.push(
      await runStep("release-pack-verify", () => {
        const keyPath = join(tempRoot, "release-signing.key");
        const keyPair = generateKeyPairSync("ed25519");
        const privatePem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
        writeFileSync(keyPath, privatePem, { mode: 0o600, encoding: "utf8" });
        // The smoke run owns this signing key, so it pins the public half as the release key (P0-09).
        const publicKeyPath = join(tempRoot, "release-signing.pub");
        writeFileSync(publicKeyPath, keyPair.publicKey.export({ format: "pem", type: "spki" }).toString(), "utf8");
        const bundlePath = join(tempRoot, "smoke.amcrelease");
        createReleaseBundle({
          workspace: repoRoot,
          outFile: bundlePath,
          privateKeyPath: keyPath,
          skipInstallBuild: true
        });
        const verified = releaseVerifyCli({
          bundleFile: bundlePath,
          trust: loadTrustContext({ pubkey: { path: publicKeyPath, purposes: ["release"] } })
        });
        if (!verified.ok) {
          throw new Error(`release verify failed: ${verified.errors.join("; ")}`);
        }
        artifacts.releaseBundle = bundlePath;
        return [`bundle=${bundlePath}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; ") ?? "release pack failed");
    }

    steps.push(
      await runStep("studio-stop", async () => {
        if (!studio) {
          throw new Error("studio handle missing");
        }
        await studio.close();
        const ledger = openLedger(workspace);
        try {
          const shutdownEvent = ledger
            .getAllEvents()
            .reverse()
            .find((event) => {
              try {
                const meta = JSON.parse(event.meta_json) as { auditType?: unknown };
                return meta.auditType === "STUDIO_RUNTIME_STOPPED";
              } catch {
                return false;
              }
            });
          if (!shutdownEvent) {
            throw new Error("missing STUDIO_RUNTIME_STOPPED audit event");
          }
          artifacts.studioShutdownEventHash = shutdownEvent.event_hash;
        } finally {
          ledger.close();
        }
        const state = readStudioState(workspace);
        if (state) {
          warnings.push("studio state file still present after shutdown");
        }
        return ["studio child terminated gracefully (SIGTERM)", "shutdown audit event recorded"];
      })
    );
  } catch (error) {
    warnings.push(String(error));
    const studioHandle = studio as { close: () => Promise<void> } | null;
    if (studioHandle) {
      await studioHandle.close().catch(() => undefined);
    }
  } finally {
    const upstreamHandle = fakeUpstream as { close: () => Promise<void> } | null;
    if (upstreamHandle) {
      await upstreamHandle.close().catch(() => undefined);
    }
  }

  const hasFail = steps.some((step) => step.status === "FAIL");
  return smokeReportSchema.parse({
    status: hasFail ? "FAIL" : "PASS",
    mode: "local",
    generatedTs: Date.now(),
    steps,
    artifacts,
    warnings
  });
}

async function runDockerSmoke(params: SmokeParams): Promise<SmokeReport> {
  const repoRoot = resolve(params.repoRoot ?? process.cwd());
  const composeDir = join(repoRoot, "deploy", "compose");
  const projectName = `amcsmoke${Date.now()}`;
  const steps = [] as SmokeReport["steps"];
  const artifacts: Record<string, string> = {};
  const warnings: string[] = [];

  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: projectName,
    AMC_BOOTSTRAP: "1",
    AMC_ENABLE_NOTARY: "0"
  };

  try {
    steps.push(
      await runStep("docker-secrets", () => {
        const secretsDir = join(composeDir, "secrets");
        mkdirSync(secretsDir, { recursive: true });
        writeFileSync(join(secretsDir, "amc_vault_passphrase.txt"), "e2e-vault-passphrase-12345\n", "utf8");
        writeFileSync(join(secretsDir, "amc_owner_username.txt"), "owner\n", "utf8");
        writeFileSync(join(secretsDir, "amc_owner_password.txt"), "owner-password\n", "utf8");
        writeFileSync(join(secretsDir, "amc_notary_passphrase.txt"), "e2e-notary-passphrase-12345\n", "utf8");
        writeFileSync(join(secretsDir, "amc_notary_auth_secret.txt"), "e2e-notary-auth-secret-12345678901234567890\n", "utf8");
        return [`secrets=${secretsDir}`];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; "));
    }

    steps.push(
      await runStep("docker-compose-up", () => {
        const up = runShell("docker", ["compose", "-f", "docker-compose.yml", "up", "-d", "--build"], composeDir, env);
        if (!up.ok) {
          throw new Error(up.stderr || up.stdout || "docker compose up failed");
        }
        return ["docker compose up -d --build"];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; "));
    }

    steps.push(
      await runStep("docker-ready", async () => {
        await waitForReady("http://127.0.0.1:3212/readyz", 60_000);
        const consoleRes = await httpGetJson("http://127.0.0.1:3212/console");
        if (consoleRes.status !== 200) {
          throw new Error(`console status ${consoleRes.status}`);
        }
        return ["studio ready", "console 200"];
      })
    );
    if (steps.at(-1)?.status === "FAIL") {
      throw new Error(steps.at(-1)?.details.join("; "));
    }

    steps.push(
      await runStep("docker-doctor", () => {
        const doctor = runShell(
          "docker",
          ["exec", "amc-studio", "node", "dist/cli.js", "doctor", "--json"],
          composeDir,
          env
        );
        if (!doctor.ok) {
          throw new Error(doctor.stderr || doctor.stdout || "docker doctor failed");
        }
        artifacts.dockerDoctorJson = doctor.stdout.trim();
        return ["doctor --json PASS inside container"];
      })
    );
  } catch (error) {
    warnings.push(String(error));
  } finally {
    const down = runShell("docker", ["compose", "-f", "docker-compose.yml", "down", "-v"], composeDir, env);
    if (!down.ok) {
      warnings.push(down.stderr || down.stdout || "docker compose down failed");
    }
  }

  const hasFail = steps.some((step) => step.status === "FAIL");
  return smokeReportSchema.parse({
    status: hasFail ? "FAIL" : "PASS",
    mode: "docker",
    generatedTs: Date.now(),
    steps,
    artifacts,
    warnings
  });
}

async function runHelmTemplateSmoke(params: SmokeParams): Promise<SmokeReport> {
  const repoRoot = resolve(params.repoRoot ?? process.cwd());
  const chartDir = join(repoRoot, "deploy", "helm", "amc");
  const steps = [] as SmokeReport["steps"];
  const artifacts: Record<string, string> = {};
  const warnings: string[] = [];

  steps.push(
    await runStep("helm-lint", () => {
      const lint = runShell("helm", ["lint", chartDir], repoRoot);
      if (!lint.ok) {
        throw new Error(lint.stderr || lint.stdout || "helm lint failed");
      }
      return ["helm lint passed"];
    })
  );
  if (steps.at(-1)?.status === "FAIL") {
    return smokeReportSchema.parse({
      status: "FAIL",
      mode: "helm-template",
      generatedTs: Date.now(),
      steps,
      artifacts,
      warnings
    });
  }

  let rendered = "";
  steps.push(
    await runStep("helm-template", () => {
      const tpl = runShell("helm", ["template", "amc", chartDir], repoRoot);
      if (!tpl.ok) {
        throw new Error(tpl.stderr || tpl.stdout || "helm template failed");
      }
      rendered = tpl.stdout;
      if (!rendered.includes("kind: Deployment")) {
        throw new Error("rendered chart missing Deployment");
      }
      if (!rendered.includes("kind: Service")) {
        throw new Error("rendered chart missing Service");
      }
      if (!rendered.includes("kind: Ingress")) {
        throw new Error("rendered chart missing Ingress");
      }
      if (!rendered.includes("kind: PersistentVolumeClaim")) {
        throw new Error("rendered chart missing PersistentVolumeClaim");
      }
      if (!rendered.includes("kind: NetworkPolicy")) {
        throw new Error("rendered chart missing NetworkPolicy");
      }
      if (!rendered.includes("kind: PodDisruptionBudget")) {
        throw new Error("rendered chart missing PodDisruptionBudget");
      }
      return ["helm template rendered required resources"];
    })
  );
  if (steps.at(-1)?.status === "FAIL") {
    return smokeReportSchema.parse({
      status: "FAIL",
      mode: "helm-template",
      generatedTs: Date.now(),
      steps,
      artifacts,
      warnings
    });
  }

  steps.push(
    await runStep("helm-security-context", () => {
      if (!rendered.includes("runAsNonRoot: true")) {
        throw new Error("missing runAsNonRoot: true");
      }
      if (!rendered.includes("readOnlyRootFilesystem: true")) {
        throw new Error("missing readOnlyRootFilesystem: true");
      }
      if (!rendered.includes("allowPrivilegeEscalation: false")) {
        throw new Error("missing allowPrivilegeEscalation: false");
      }
      return ["securityContext hardening present"];
    })
  );

  const hasFail = steps.some((step) => step.status === "FAIL");
  return smokeReportSchema.parse({
    status: hasFail ? "FAIL" : "PASS",
    mode: "helm-template",
    generatedTs: Date.now(),
    steps,
    artifacts,
    warnings
  });
}

export async function runSmoke(params: SmokeParams): Promise<SmokeReport> {
  if (params.mode === "local") {
    return runLocalSmoke(params);
  }
  if (params.mode === "docker") {
    return runDockerSmoke(params);
  }
  return runHelmTemplateSmoke(params);
}
