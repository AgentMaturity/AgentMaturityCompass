#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOutputPathArg } from './lib/outputPathArg.mjs';

const outPath =
  readOutputPathArg(process.argv, "compat-matrix-report", "node scripts/compat-matrix-report.mjs [out.json]") ||
  path.join(process.cwd(), 'compat-matrix.json');
const payload = {
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  ci: Boolean(process.env.CI),
  job: process.env.GITHUB_JOB || null,
  ref: process.env.GITHUB_REF || null,
  repo: process.env.GITHUB_REPOSITORY || null,
  osRelease: typeof os.version === 'function' ? os.version() : os.release(),
  checks: {
    npmPackInstall: process.env.AMC_MATRIX_PACK_INSTALL === 'ok',
    doctorJson: process.env.AMC_MATRIX_DOCTOR_JSON === 'ok',
    quickscoreJson: process.env.AMC_MATRIX_QUICKSCORE_JSON === 'ok',
    liteScore: process.env.AMC_MATRIX_LITE_SCORE === 'ok',
    commsCheck: process.env.AMC_MATRIX_COMMS_CHECK === 'ok'
  }
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`wrote ${outPath}`);
