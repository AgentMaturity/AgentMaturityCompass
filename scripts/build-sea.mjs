#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const distCli = path.join(root, 'dist', 'cli.js');
const outDir = path.join(root, 'dist', 'sea');
const vendorDir = path.join(outDir, 'vendor-node');
const seaPrepBlob = path.join(outDir, 'amc-prep.blob');
const exeName = process.platform === 'win32' ? 'amc.exe' : 'amc';
const seaConfigPath = path.join(outDir, 'sea-config.json');
const seaBundle = path.join(outDir, exeName);
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
let downloadedNodeUrl = null;

if (!fs.existsSync(distCli)) {
  console.error('dist/cli.js is missing. Run `npm run build` first.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const seaConfig = {
  main: distCli,
  output: seaPrepBlob,
  disableExperimentalSEAWarning: true
};
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

function platformTriple() {
  const map = {
    darwin: { x64: 'darwin-x64', arm64: 'darwin-arm64' },
    linux: { x64: 'linux-x64', arm64: 'linux-arm64' },
    win32: { x64: 'win-x64', arm64: 'win-arm64' }
  };
  return map[process.platform]?.[process.arch] || null;
}

function downloadOfficialNodeBinary() {
  const triple = platformTriple();
  if (!triple) {
    throw new Error(`Unsupported SEA download target: ${process.platform}/${process.arch}`);
  }

  fs.rmSync(vendorDir, { recursive: true, force: true });
  fs.mkdirSync(vendorDir, { recursive: true });

  const version = process.version;
  const isWin = process.platform === 'win32';
  const ext = isWin ? 'zip' : 'tar.gz';
  const baseName = `node-${version}-${triple}`;
  const archive = path.join(vendorDir, `${baseName}.${ext}`);
  const url = `https://nodejs.org/dist/${version}/${baseName}.${ext}`;
  downloadedNodeUrl = url;

  console.log(`Downloading official Node binary for SEA host: ${url}`);
  execFileSync('curl', ['-fsSL', url, '-o', archive], { stdio: 'inherit' });

  if (isWin) {
    execFileSync('unzip', ['-oq', archive, '-d', vendorDir], { stdio: 'inherit' });
    return path.join(vendorDir, baseName, 'node.exe');
  }

  execFileSync('tar', ['-xzf', archive, '-C', vendorDir], { stdio: 'inherit' });
  return path.join(vendorDir, baseName, 'bin', 'node');
}

function buildBlob(nodeExe) {
  execFileSync(nodeExe, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });
}

function inject(baseNodeExe) {
  const darwin = process.platform === 'darwin';
  fs.copyFileSync(baseNodeExe, seaBundle);
  fs.chmodSync(seaBundle, 0o755);
  // macOS: Node reads the blob from the NODE_SEA segment (postject's default, __POSTJECT, crashes the binary at
  // startup), and the signature comes off before injection and back on after, as Node's SEA instructions say.
  if (darwin) execFileSync('codesign', ['--remove-signature', seaBundle], { stdio: 'inherit' });
  execFileSync(
    'npx',
    ['--yes', 'postject', seaBundle, 'NODE_SEA_BLOB', seaPrepBlob, '--sentinel-fuse', seaFuse,
      ...(darwin ? ['--macho-segment-name', 'NODE_SEA'] : [])],
    { stdio: 'inherit' }
  );
  if (darwin) {
    execFileSync('codesign', ['--sign', '-', '--force', seaBundle], { stdio: 'inherit' });
  }
}

let baseNodeExe = process.execPath;
let source = 'current-node';

buildBlob(baseNodeExe);

try {
  inject(baseNodeExe);
} catch (err) {
  console.warn('\nLocal Node binary could not host SEA injection. Falling back to official Node release binary for the same version/platform...');
  baseNodeExe = downloadOfficialNodeBinary();
  source = 'official-node-release';
  inject(baseNodeExe);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  sourceCli: path.relative(root, distCli),
  baseNodeBinary: source === 'current-node' ? path.relative(root, baseNodeExe) : 'downloaded-official-node-binary',
  downloadedNodeUrl,
  outputBinary: path.relative(root, seaBundle),
  blob: path.relative(root, seaPrepBlob),
  packager: 'node-sea',
  injector: 'npx postject',
  source,
  notes: [
    'Experimental single-binary build using Node SEA.',
    'Binary is built for the current host OS/arch and is not cross-compiled.',
    'If local Node lacks the SEA fuse, the script falls back to the official Node release binary for the same version/platform.'
  ]
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(vendorDir, { recursive: true, force: true });

// A binary that does not start is not a build result: fail here instead of handing one on (docs/SINGLE_BINARY.md).
const probe = spawnSync(seaBundle, ['--version'], { encoding: 'utf8', timeout: 60_000 });
if (probe.status !== 0) {
  const how = probe.error ? probe.error.message : probe.signal ? `killed by ${probe.signal}` : `exit ${probe.status}`;
  const output = `${probe.stderr ?? ''}${probe.stdout ?? ''}`.trim();
  console.error(`\nSEA build failed: ${path.relative(root, seaBundle)} does not start (\`--version\`: ${how}).`);
  if (output) console.error(output.slice(-2000));
  console.error('The single binary is experimental and does not start yet; see docs/SINGLE_BINARY.md.');
  process.exit(1);
}
console.log(`SEA binary ready: ${seaBundle} (${probe.stdout.trim()})`);
