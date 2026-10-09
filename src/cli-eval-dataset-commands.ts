/**
 * CLI commands for user-defined evaluation datasets (golden sets)
 * and non-agent "lite" scoring mode.
 *
 * Gap 2: Golden set management — teams curate business-specific test cases
 * Gap 8: Non-agent "lite" scoring mode for vanilla LLMs/chatbots
 */

import type { Command } from "commander";
import chalk from "chalk";
import { printClaimResult, runClaimEnvelope, withClaimFields } from "./cli/claimOutput.js";
import { checkScopedEgress, EgressBlocked } from "./residency/checkEgress.js";

export function registerEvalDatasetCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const dataset = program
    .command("dataset")
    .description("Manage evaluation datasets (golden sets) — curate business-specific test cases");

  /* ── dataset create ────────────────────────────────────────── */
  dataset
    .command("create")
    .description("Create a new evaluation dataset")
    .argument("<name>", "dataset name")
    .option("--description <text>", "dataset description")
    .option("--category <cat>", "category: safety|quality|compliance|custom", "custom")
    .action(async (name: string, opts: { description?: string; category: string }) => {
      try {
        const { join } = await import("node:path");
        const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
        const { randomUUID } = await import("node:crypto");
        const datasetDir = join(process.cwd(), ".amc", "datasets");
        mkdirSync(datasetDir, { recursive: true });
        
        const datasetPath = join(datasetDir, `${name}.json`);
        if (existsSync(datasetPath)) {
          console.error(chalk.red(`Dataset "${name}" already exists.`));
          process.exit(1);
        }
        
        const dataset = {
          id: randomUUID(),
          name,
          description: opts.description ?? "",
          category: opts.category,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
          cases: [] as any[],
        };
        
        writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
        console.log(chalk.green(`✅ Dataset "${name}" created at .amc/datasets/${name}.json`));
        console.log(chalk.dim(`  Add test cases: amc dataset add-case ${name} --prompt "..." --expected "..."`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── dataset add-case ──────────────────────────────────────── */
  dataset
    .command("add-case")
    .description("Add a test case to a dataset")
    .argument("<name>", "dataset name")
    .requiredOption("--prompt <text>", "input prompt")
    .option("--expected <text>", "expected output (substring or exact)")
    .option("--not-expected <text>", "output must NOT contain this")
    .option("--tags <tags>", "comma-separated tags")
    .option("--weight <n>", "case weight (0-1)", "1.0")
    .option("--assertion <type>", "assertion type: contains|exact|regex|custom", "contains")
    .option("--json", "JSON output")
    .action(async (name: string, opts: any) => {
      try {
        const { join } = await import("node:path");
        const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
        const { randomUUID } = await import("node:crypto");
        
        const datasetPath = join(process.cwd(), ".amc", "datasets", `${name}.json`);
        if (!existsSync(datasetPath)) {
          console.error(chalk.red(`Dataset "${name}" not found. Create it first: amc dataset create ${name}`));
          process.exit(1);
        }
        
        const dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
        const testCase = {
          id: randomUUID(),
          prompt: opts.prompt,
          expected: opts.expected ?? null,
          notExpected: opts.notExpected ?? null,
          assertion: opts.assertion,
          tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [],
          weight: parseFloat(opts.weight),
          addedAt: new Date().toISOString(),
        };
        
        dataset.cases.push(testCase);
        dataset.updatedAt = new Date().toISOString();
        dataset.version += 1;
        writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
        
        if (opts.json) {
          console.log(JSON.stringify(testCase, null, 2));
          return;
        }
        console.log(chalk.green(`✅ Case added to "${name}" (${dataset.cases.length} total)`));
        console.log(chalk.dim(`  Prompt: ${opts.prompt.slice(0, 60)}${opts.prompt.length > 60 ? "..." : ""}`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── dataset list ──────────────────────────────────────────── */
  dataset
    .command("list")
    .description("List all evaluation datasets")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { join } = await import("node:path");
        const { readdirSync, readFileSync, existsSync } = await import("node:fs");
        const datasetDir = join(process.cwd(), ".amc", "datasets");
        
        if (!existsSync(datasetDir)) {
          console.log(chalk.dim("No datasets found. Create one: amc dataset create <name>"));
          return;
        }
        
        const files = readdirSync(datasetDir).filter(f => f.endsWith(".json"));
        const datasets = files.map(f => {
          const d = JSON.parse(readFileSync(join(datasetDir, f), "utf-8"));
          return { name: d.name, cases: d.cases.length, category: d.category, version: d.version, updatedAt: d.updatedAt };
        });
        
        if (opts.json) {
          console.log(JSON.stringify(datasets, null, 2));
          return;
        }
        
        console.log(chalk.bold(`\n📋 Evaluation Datasets (${datasets.length}):\n`));
        for (const d of datasets) {
          console.log(`  ${chalk.cyan(d.name)}  ${d.cases} cases  [${d.category}]  v${d.version}  ${d.updatedAt.slice(0, 10)}`);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── dataset run ───────────────────────────────────────────── */
  dataset
    .command("run")
    .description("Run a dataset against an agent (via gateway proxy)")
    .argument("<name>", "dataset name")
    .option("--agent <agentId>", "agent ID")
    .option("--endpoint <url>", "LLM endpoint (defaults to gateway)")
    .option("--model <model>", "model name")
    .option("--json", "JSON output")
    .action(async (name: string, opts: { agent?: string; endpoint?: string; model?: string; json?: boolean }) => {
      try {
        const workspace = process.cwd();
        const explicitEndpoint = opts.endpoint;
        const endpoint = explicitEndpoint ?? "http://127.0.0.1:3210/openai/v1/chat/completions";
        const channel = explicitEndpoint !== undefined ? "provider" : "bridge";
        const model = opts.model ?? "default";
        const { join } = await import("node:path");
        const { readFileSync, existsSync } = await import("node:fs");
        
        const datasetPath = join(workspace, ".amc", "datasets", `${name}.json`);
        if (!existsSync(datasetPath)) {
          console.error(chalk.red(`Dataset "${name}" not found.`));
          process.exit(1);
        }
        
        const dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
        if (dataset.cases.length === 0) {
          console.log(chalk.yellow("Dataset is empty. Add cases: amc dataset add-case ..."));
          return;
        }
        
        console.log(chalk.bold(`\n🏃 Running dataset "${name}" (${dataset.cases.length} cases)...\n`));
        
        let passed = 0;
        let failed = 0;
        const results: any[] = [];
        
        for (const tc of dataset.cases) {
          // Run against endpoint
          let output = "";
          let error: string | null = null;
          
          try {
            const request: RequestInit = {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: tc.prompt }],
                max_tokens: 500,
              }),
              redirect: "manual",
            };
            checkScopedEgress(workspace, channel, endpoint, { dataClasses: null, purpose: null, agentId: "system" });
            const resp = await fetch(endpoint, request);
            
            if (resp.ok) {
              const data = await resp.json() as any;
              output = data.choices?.[0]?.message?.content ?? "";
            } else {
              error = `HTTP ${resp.status}`;
            }
          } catch (e: any) {
            if (e instanceof EgressBlocked) throw e;
            error = e.message;
          }
          
          // Evaluate
          let pass = true;
          let reason = "";
          
          if (error) {
            pass = false;
            reason = `Error: ${error}`;
          } else if (tc.expected && tc.assertion === "contains") {
            pass = output.toLowerCase().includes(tc.expected.toLowerCase());
            reason = pass ? "contains expected" : `missing: "${tc.expected}"`;
          } else if (tc.expected && tc.assertion === "exact") {
            pass = output.trim() === tc.expected.trim();
            reason = pass ? "exact match" : "mismatch";
          } else if (tc.expected && tc.assertion === "regex") {
            pass = new RegExp(tc.expected, "i").test(output);
            reason = pass ? "regex match" : "regex fail";
          }
          
          if (tc.notExpected && output.toLowerCase().includes(tc.notExpected.toLowerCase())) {
            pass = false;
            reason = `contains forbidden: "${tc.notExpected}"`;
          }
          
          if (pass) passed++; else failed++;
          
          const icon = pass ? chalk.green("✅") : chalk.red("❌");
          console.log(`  ${icon} ${tc.prompt.slice(0, 50).padEnd(50)} ${reason}`);
          
          results.push({
            caseId: tc.id,
            prompt: tc.prompt,
            output: output.slice(0, 200),
            pass,
            reason,
            weight: tc.weight,
          });
        }
        
        const score = dataset.cases.length > 0 ? (passed / dataset.cases.length * 100) : 0;
        console.log(chalk.bold(`\n  Results: ${passed}/${dataset.cases.length} passed (${score.toFixed(1)}%)\n`));
        
        if (opts.json) {
          console.log(JSON.stringify({ dataset: name, passed, failed, total: dataset.cases.length, score, results }, null, 2));
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── dataset import ────────────────────────────────────────── */
  dataset
    .command("import")
    .description("Import test cases from CSV/JSON file")
    .argument("<name>", "dataset name")
    .requiredOption("--file <path>", "path to CSV or JSON file")
    .action(async (name: string, opts: { file: string }) => {
      try {
        const { join } = await import("node:path");
        const { readFileSync, writeFileSync, existsSync, mkdirSync } = await import("node:fs");
        const { randomUUID } = await import("node:crypto");
        
        const datasetDir = join(process.cwd(), ".amc", "datasets");
        mkdirSync(datasetDir, { recursive: true });
        const datasetPath = join(datasetDir, `${name}.json`);
        
        let dataset: any;
        if (existsSync(datasetPath)) {
          dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
        } else {
          dataset = { id: randomUUID(), name, description: "Imported", category: "custom", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, cases: [] };
        }
        
        const raw = readFileSync(opts.file, "utf-8");
        let imported = 0;
        
        if (opts.file.endsWith(".json") || opts.file.endsWith(".jsonl")) {
          // JSON or JSONL
          const lines = opts.file.endsWith(".jsonl") ? raw.split("\n").filter(Boolean).map(l => JSON.parse(l)) : JSON.parse(raw);
          const items = Array.isArray(lines) ? lines : [lines];
          for (const item of items) {
            dataset.cases.push({
              id: randomUUID(),
              prompt: item.prompt ?? item.input ?? item.question ?? "",
              expected: item.expected ?? item.output ?? item.answer ?? null,
              notExpected: item.notExpected ?? null,
              assertion: item.assertion ?? "contains",
              tags: item.tags ?? [],
              weight: item.weight ?? 1.0,
              addedAt: new Date().toISOString(),
            });
            imported++;
          }
        } else {
          // CSV: prompt,expected
          const lines = raw.split("\n").filter(Boolean);
          const hasHeader = lines[0]?.toLowerCase().includes("prompt");
          for (const line of hasHeader ? lines.slice(1) : lines) {
            const [prompt, expected] = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
            if (prompt) {
              dataset.cases.push({
                id: randomUUID(),
                prompt,
                expected: expected ?? null,
                notExpected: null,
                assertion: "contains",
                tags: [],
                weight: 1.0,
                addedAt: new Date().toISOString(),
              });
              imported++;
            }
          }
        }
        
        dataset.updatedAt = new Date().toISOString();
        dataset.version += 1;
        writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
        console.log(chalk.green(`✅ Imported ${imported} cases into "${name}" (${dataset.cases.length} total)`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

export function registerLiteScoreCommands(program: Command): void {
  /* ── lite-score ────────────────────────────────────────────── */
  program
    .command("lite-score")
    .description("Lite scoring mode for non-agent LLMs / chatbots — simplified assessment without agentic features")
    .option("--agent <agentId>", "agent ID", "default")
    .option("--json", "JSON output")
    .option("--eu-ai-act", "include EU AI Act mapping")
    .action(async (opts: { agent: string; json?: boolean; euAiAct?: boolean }) => {
      try {
        const { openLedger } = await import("./ledger/ledger.js");
        const { runDiagnostic } = await import("./diagnostic/runner.js");
        const { sha256Hex } = await import("./utils/hash.js");
        
        // Lite-mode questions — only the ones relevant to non-agentic LLMs
        const liteQuestions = [
          // Safety & Content
          "AMC-2.1", "AMC-2.2", "AMC-2.3", "AMC-2.4", "AMC-2.5",
          // Truthfulness & Hallucination  
          "AMC-THR-1", "AMC-THR-2", "AMC-THR-3",
          // Privacy & PII
          "AMC-3.1.1", "AMC-3.1.2", "AMC-3.1.3",
          // Governance basics
          "AMC-1.1", "AMC-1.7", "AMC-1.8",
          // Output integrity
          "AMC-OINT-1",
          // Behavioral contract
          "AMC-BCON-1",
          // Social responsibility
          "AMC-SOCIAL-1",
          // Operational discipline (subset)
          "AMC-OPDISC-1", "AMC-OPDISC-2",
        ];
        
        console.log(chalk.bold("\n🔍 AMC Lite Score — Non-Agent LLM Assessment\n"));
        console.log(chalk.dim(`  Scoring ${liteQuestions.length} questions relevant to chatbots/LLM APIs\n`));
        console.log(chalk.dim("  Skipping: tool use, delegation, memory, multi-step chains, fleet management\n"));
        
        // Run full diagnostic
        const report = await runDiagnostic({
          workspace: process.cwd(),
          window: "30d",
          targetName: opts.agent,
        });
        
        // Filter to lite questions only
        const liteScores = report.questionScores.filter(q => liteQuestions.includes(q.questionId));
        const skippedScores = report.questionScores.filter(q => !liteQuestions.includes(q.questionId));
        
        // Calculate lite integrity index
        const liteAvg = liteScores.length > 0
          ? liteScores.reduce((sum, q) => sum + q.finalLevel, 0) / liteScores.length
          : 0;
        const liteIndex = liteAvg / 5; // Normalize to 0-1
        
        // Determine lite maturity level
        const liteLevel = liteAvg < 0.5 ? "L0" :
                          liteAvg < 1.5 ? "L1" :
                          liteAvg < 2.5 ? "L2" :
                          liteAvg < 3.5 ? "L3" :
                          liteAvg < 4.5 ? "L4" : "L5";
        
        const liteReport = {
          mode: "lite",
          agentId: opts.agent,
          ts: Date.now(),
          questionsScored: liteScores.length,
          questionsSkipped: skippedScores.length,
          liteIntegrityIndex: liteIndex,
          liteMaturityLevel: liteLevel,
          liteAvgLevel: liteAvg,
          categories: {
            safety: liteScores.filter(q => q.questionId.startsWith("AMC-2")).map(q => ({ id: q.questionId, level: q.finalLevel })),
            truthfulness: liteScores.filter(q => q.questionId.startsWith("AMC-THR")).map(q => ({ id: q.questionId, level: q.finalLevel })),
            privacy: liteScores.filter(q => q.questionId.startsWith("AMC-3")).map(q => ({ id: q.questionId, level: q.finalLevel })),
            governance: liteScores.filter(q => q.questionId.startsWith("AMC-1") || q.questionId.startsWith("AMC-OPDISC")).map(q => ({ id: q.questionId, level: q.finalLevel })),
            integrity: liteScores.filter(q => ["AMC-OINT-1", "AMC-BCON-1", "AMC-SOCIAL-1"].includes(q.questionId)).map(q => ({ id: q.questionId, level: q.finalLevel })),
          },
          fullReportRunId: report.runId,
        };
        
        // A subset of the fresh run: it carries the run's claim.
        const claim = runClaimEnvelope(report);
        if (opts.json) {
          console.log(JSON.stringify(withClaimFields(liteReport, claim), null, 2));
          return;
        }
        printClaimResult(claim, opts);
        console.log(chalk.bold(`  Lite Maturity Level: ${liteLevel}`));
        console.log(`  Lite Integrity Index: ${(liteIndex * 100).toFixed(1)}%`);
        console.log(`  Average Level: ${liteAvg.toFixed(2)} / 5.0`);
        console.log(`  Questions Scored: ${liteScores.length} (${skippedScores.length} agent-specific skipped)`);
        
        console.log(chalk.bold("\n  Category Breakdown:"));
        for (const [cat, scores] of Object.entries(liteReport.categories)) {
          const avg = scores.length > 0 ? scores.reduce((s: number, q: any) => s + q.level, 0) / scores.length : 0;
          const bar = "█".repeat(Math.floor(avg * 4)) + "░".repeat(20 - Math.floor(avg * 4));
          console.log(`    ${cat.padEnd(16)} ${bar} ${avg.toFixed(1)}/5`);
        }
        
        console.log(chalk.dim("\n  Tip: Use 'amc quickscore' for full agent-level assessment with all 118 questions.\n"));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}
