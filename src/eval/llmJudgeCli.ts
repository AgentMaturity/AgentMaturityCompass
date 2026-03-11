#!/usr/bin/env node
/**
 * LLM-as-Judge CLI
 * 
 * Command-line interface for running LLM-as-Judge evaluations.
 * Supports single evaluations, batch processing, and integration with AMC test harness.
 * 
 * Usage:
 *   amc judge --metric faithfulness --input "What is AI?" --output "AI is..." --context "..."
 *   amc judge --category rag --input "..." --output "..." --context "..."
 *   amc judge --all --input "..." --output "..." --context "..."
 *   amc judge --batch evaluations.jsonl
 * 
 * Issue: AMC-48 — BUILD: LLM-as-Judge Metrics (CLI)
 */

import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { ExtendedLLMJudgeEngine, JudgeContext, JudgeResult, aggregateMetricsByCategory, calculateOverallScore } from './extendedLLMJudge.js';

const program = new Command();

// ---------------------------------------------------------------------------
// CLI Commands
// ---------------------------------------------------------------------------

program
  .name('amc-judge')
  .description('LLM-as-Judge evaluation CLI')
  .version('1.0.0');

program
  .command('evaluate')
  .description('Evaluate using LLM-as-Judge metrics')
  .option('-m, --metric <metric>', 'Specific metric to evaluate')
  .option('-c, --category <category>', 'Metric category to evaluate (rag, safety, quality, etc.)')
  .option('-a, --all', 'Evaluate all metrics')
  .option('-i, --input <input>', 'Input text/prompt')
  .option('-o, --output <output>', 'Output text to evaluate')
  .option('--context <context>', 'Context for RAG evaluation')
  .option('--expected <expected>', 'Expected output for comparison')
  .option('--task-type <type>', 'Task type (rag, summarization, conversation, etc.)')
  .option('--model <model>', 'Judge model (gpt-4, claude-3-opus, claude-3-sonnet)', 'claude-3-sonnet')
  .option('--temperature <temp>', 'Judge model temperature', '0.1')
  .option('--format <format>', 'Output format (json, table, summary)', 'table')
  .option('--output-file <file>', 'Save results to file')
  .action(async (options) => {
    try {
      await runEvaluation(options);
    } catch (error) {
      console.error('Evaluation failed:', error);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Run batch evaluation from JSONL file')
  .argument('<file>', 'JSONL file with evaluation contexts')
  .option('--model <model>', 'Judge model', 'claude-3-sonnet')
  .option('--temperature <temp>', 'Judge model temperature', '0.1')
  .option('--format <format>', 'Output format (json, table, summary)', 'summary')
  .option('--output-file <file>', 'Save results to file')
  .option('--parallel <count>', 'Parallel evaluations', '3')
  .action(async (file, options) => {
    try {
      await runBatchEvaluation(file, options);
    } catch (error) {
      console.error('Batch evaluation failed:', error);
      process.exit(1);
    }
  });

program
  .command('categories')
  .description('List available metric categories')
  .action(() => {
    const engine = new ExtendedLLMJudgeEngine();
    const categories = engine.getMetricCategories();
    
    console.log('Available metric categories:\n');
    for (const [category, metrics] of Object.entries(categories)) {
      console.log(`${category}:`);
      metrics.forEach(metric => console.log(`  - ${metric}`));
      console.log();
    }
  });

program
  .command('metrics')
  .description('List all available metrics')
  .action(() => {
    const engine = new ExtendedLLMJudgeEngine();
    const categories = engine.getMetricCategories();
    const allMetrics = new Set<string>();
    
    Object.values(categories).forEach(metrics => {
      metrics.forEach(metric => allMetrics.add(metric));
    });
    
    console.log('Available metrics:\n');
    Array.from(allMetrics).sort().forEach(metric => {
      console.log(`- ${metric}`);
    });
  });

// ---------------------------------------------------------------------------
// Implementation Functions
// ---------------------------------------------------------------------------

async function runEvaluation(options: any): Promise<void> {
  const engine = new ExtendedLLMJudgeEngine({
    model: options.model,
    temperature: parseFloat(options.temperature),
    enableCache: true,
    batchSize: 5
  });

  const context: JudgeContext = {
    input: options.input,
    output: options.output,
    context: options.context,
    expected: options.expected,
    taskType: options.taskType
  };

  let results: JudgeResult[] = [];

  if (options.all) {
    console.log('Running comprehensive evaluation (17 metrics)...');
    results = await engine.evaluateComprehensive(context);
  } else if (options.category) {
    console.log(`Running ${options.category} category evaluation...`);
    results = await engine.evaluateByCategory(options.category, context);
  } else if (options.metric) {
    console.log(`Running ${options.metric} metric evaluation...`);
    const result = await engine.evaluateExtendedMetric(options.metric, context);
    results = [result];
  } else {
    console.error('Must specify --metric, --category, or --all');
    process.exit(1);
  }

  await outputResults(results, options.format, options.outputFile);
}

async function runBatchEvaluation(file: string, options: any): Promise<void> {
  const engine = new ExtendedLLMJudgeEngine({
    model: options.model,
    temperature: parseFloat(options.temperature),
    enableCache: true,
    batchSize: parseInt(options.parallel)
  });

  console.log(`Loading batch file: ${file}`);
  const content = await readFile(file, 'utf-8');
  const lines = content.trim().split('\n');
  const contexts: JudgeContext[] = lines.map(line => JSON.parse(line));

  console.log(`Processing ${contexts.length} evaluations...`);
  
  const allResults: JudgeResult[] = [];
  let processed = 0;

  for (const context of contexts) {
    const results = await engine.evaluateComprehensive(context);
    allResults.push(...results);
    processed++;
    
    if (processed % 10 === 0) {
      console.log(`Processed ${processed}/${contexts.length} evaluations`);
    }
  }

  console.log(`Completed ${processed} evaluations`);
  await outputResults(allResults, options.format, options.outputFile);
}

async function outputResults(results: JudgeResult[], format: string, outputFile?: string): Promise<void> {
  let output: string;

  switch (format) {
    case 'json':
      output = JSON.stringify(results, null, 2);
      break;
    
    case 'table':
      output = formatAsTable(results);
      break;
    
    case 'summary':
      output = formatAsSummary(results);
      break;
    
    default:
      throw new Error(`Unknown format: ${format}`);
  }

  if (outputFile) {
    await writeFile(outputFile, output);
    console.log(`Results saved to ${outputFile}`);
  } else {
    console.log(output);
  }
}

function formatAsTable(results: JudgeResult[]): string {
  if (results.length === 0) return 'No results to display';

  const headers = ['Metric', 'Score', 'Confidence', 'Explanation'];
  const rows = results.map(r => [
    r.metric,
    r.score.toFixed(3),
    r.confidence.toFixed(3),
    r.explanation.substring(0, 60) + (r.explanation.length > 60 ? '...' : '')
  ]);

  // Simple table formatting
  const colWidths = headers.map((header, i) => 
    Math.max(header.length, ...rows.map(row => row[i].length))
  );

  const separator = colWidths.map(w => '-'.repeat(w)).join(' | ');
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const dataRows = rows.map(row => 
    row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

function formatAsSummary(results: JudgeResult[]): string {
  if (results.length === 0) return 'No results to display';

  const summaries = aggregateMetricsByCategory(results);
  const overallScore = calculateOverallScore(results);

  let output = `LLM-as-Judge Evaluation Summary\n`;
  output += `================================\n\n`;
  output += `Overall Score: ${overallScore.toFixed(3)}\n`;
  output += `Total Metrics: ${results.length}\n\n`;

  output += `Category Breakdown:\n`;
  for (const summary of summaries) {
    output += `\n${summary.category.toUpperCase()}:\n`;
    output += `  Average Score: ${summary.averageScore.toFixed(3)}\n`;
    output += `  Range: ${summary.minScore.toFixed(3)} - ${summary.maxScore.toFixed(3)}\n`;
    output += `  Metrics: ${summary.metricCount}\n`;
    
    // Show individual metrics
    for (const result of summary.results) {
      output += `    ${result.metric}: ${result.score.toFixed(3)}\n`;
    }
  }

  // Show lowest scoring metrics
  const sortedResults = [...results].sort((a, b) => a.score - b.score);
  const lowestScoring = sortedResults.slice(0, 3);
  
  if (lowestScoring.length > 0) {
    output += `\nLowest Scoring Metrics:\n`;
    for (const result of lowestScoring) {
      output += `  ${result.metric}: ${result.score.toFixed(3)} - ${result.explanation}\n`;
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

export function createBatchFile(contexts: JudgeContext[], filename: string): Promise<void> {
  const content = contexts.map(ctx => JSON.stringify(ctx)).join('\n');
  return writeFile(filename, content);
}

export function parseBatchFile(filename: string): Promise<JudgeContext[]> {
  return readFile(filename, 'utf-8').then(content => 
    content.trim().split('\n').map(line => JSON.parse(line))
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}