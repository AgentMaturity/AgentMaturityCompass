import { execSync } from 'child_process';
import path from 'path';
import { query } from './db.js';

const AMC_ROOT = path.resolve(__dirname, '../..');

export interface VitestResult {
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  failures: { testName: string; errorMessage: string; stackTrace?: string }[];
}

export async function runAmcTests(pattern?: string): Promise<{ runId: number; result: VitestResult }> {
  const startTime = Date.now();

  const args = ['npx', 'vitest', 'run'];
  if (pattern) args.push(pattern);

  let stdout: string;
  let exitCode = 0;

  try {
    stdout = execSync(args.join(' '), {
      encoding: 'utf8',
      timeout: 300_000,
      cwd: AMC_ROOT,
    });
  } catch (err: any) {
    stdout = err.stdout || '';
    exitCode = err.status || 1;
  }

  const durationMs = Date.now() - startTime;
  const result = parseVitestOutput(stdout, durationMs, exitCode);

  // Record in DB
  const { rows: [run] } = await query(
    `INSERT INTO test_runs (runner, platform, status, total_tests, passed, failed, skipped, duration_ms, started_at, finished_at)
     VALUES ('vitest', 'node', $1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
    [result.status, result.totalTests, result.passed, result.failed, result.skipped, result.durationMs, new Date(Date.now() - result.durationMs)]
  );

  // Record failures
  for (const f of result.failures) {
    await query(
      `INSERT INTO test_failures (test_run_id, test_name, error_message, stack_trace)
       VALUES ($1, $2, $3, $4)`,
      [run.id, f.testName, f.errorMessage, f.stackTrace || null]
    );
  }

  return { runId: run.id, result };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function parseVitestOutput(rawStdout: string, durationMs: number, exitCode: number): VitestResult {
  const stdout = stripAnsi(rawStdout);
  // Parse "Test Files  X passed | Y failed (Z)"
  const filesMatch = stdout.match(/Test Files\s+(?:(\d+) failed\s*\|?\s*)?(\d+) passed/);
  // Parse "Tests  X passed | Y failed (Z)"
  const testsMatch = stdout.match(/Tests\s+(?:(\d+) failed\s*\|?\s*)?(\d+) passed/);

  const testsFailed = parseInt(testsMatch?.[1] || '0');
  const testsPassed = parseInt(testsMatch?.[2] || '0');
  const totalTests = testsFailed + testsPassed;

  // Extract FAIL lines
  const failures: VitestResult['failures'] = [];
  const failRegex = /FAIL\s+(.+?)\s*>\s*(.+)/g;
  let match;
  while ((match = failRegex.exec(stdout)) !== null) {
    failures.push({
      testName: `${match[1]} > ${match[2]}`.trim(),
      errorMessage: match[2].trim(),
    });
  }

  return {
    status: exitCode === 0 && testsFailed === 0 ? 'passed' : testsFailed > 0 ? 'failed' : 'error',
    totalTests,
    passed: testsPassed,
    failed: testsFailed,
    skipped: 0,
    durationMs,
    failures,
  };
}
