import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, existsSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canonical = value => JSON.stringify(sorted(value));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const syncDirectory = dir => { const fd = openSync(dir, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } };
const writeAll = (fd, bytes, position = null) => {
  let offset = 0;
  while (offset < bytes.length) { const count = writeSync(fd, bytes, offset, bytes.length - offset, position === null ? null : position + offset); if (count < 1) throw new Error('fixture write incomplete'); offset += count; }
};
export function ownerOnly(path, type = 'file') {
  if (!process.getuid) throw new Error('POSIX ownership required');
  const stat = lstatSync(path);
  if (stat.uid !== process.getuid() || stat.isSymbolicLink() || !(type === 'dir' ? stat.isDirectory() : type === 'socket' ? stat.isSocket() : stat.isFile())) throw new Error('unsafe fixture storage');
  chmodSync(path, type === 'dir' ? 0o700 : 0o600);
  return stat;
}
export function prepareDirectory(dir) { mkdirSync(dir, { recursive: true, mode: 0o700 }); ownerOnly(dir, 'dir'); }
export function readJson(path, max = 1_048_576) {
  if (lstatSync(path).size > max) throw new Error('fixture input too large');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)));
}
const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev;
export function removeOwnedSocket(path, identity) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!identity || !sameFile(stat, identity)) throw new Error('unclaimed fixture socket');
  ownerOnly(path, 'socket');
  unlinkSync(path);
}
export function writePrivateJson(path, value) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeAll(fd, Buffer.from(`${canonical(value)}\n`)); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
export function acquireWriter(dir) {
  const path = join(dir, 'writer.lock');
  let recovered = null;
  let fd;
  const create = () => openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { fd = create(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const original = ownerOnly(path);
    const previous = readJson(path, 8192);
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1) throw new Error('invalid writer lock');
    try { process.kill(previous.pid, 0); throw new Error('fixture writer already active'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    const claim = join(dir, 'writer-recovery.lock');
    writePrivateJson(claim, { pid: process.pid });
    const claimStat = lstatSync(claim);
    try {
      if (!sameFile(original, lstatSync(path))) throw new Error('writer lock changed');
      renameSync(path, `${path}.stale-${randomUUID()}`);
      recovered = previous;
      fd = create();
    } finally { if (existsSync(claim) && sameFile(claimStat, lstatSync(claim))) unlinkSync(claim); }
  }
  const identity = lstatSync(path);
  const metadata = { pid: process.pid, nonce: randomUUID(), sockets: {} };
  const update = sockets => {
    metadata.sockets = Object.fromEntries(Object.entries(sockets).map(([name, stat]) => [name, { ino: stat.ino, dev: stat.dev }]));
    ftruncateSync(fd, 0); writeAll(fd, Buffer.from(`${canonical(metadata)}\n`), 0); fsyncSync(fd); syncDirectory(dir);
  };
  update({});
  return { recovered, update, release() { closeSync(fd); if (existsSync(path) && sameFile(identity, lstatSync(path))) unlinkSync(path); } };
}
export function openTxLog(dir) {
  const path = join(dir, 'txlog.jsonl');
  if (existsSync(path)) { ownerOnly(path); if (lstatSync(path).size > 67_108_864) throw new Error('fixture log too large'); }
  const bytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  if (bytes.length && bytes.at(-1) !== 10) throw new Error('truncated fixture log');
  const records = [];
  const kinds = new Set(['request', 'commit', 'replay', 'reject', 'fault', 'response', 'admin']);
  let head = 'GENESIS';
  for (const line of new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n').slice(0, -1)) {
    const record = JSON.parse(line), { hash, ...body } = record;
    if (canonical(record) !== line || record.seq !== records.length + 1 || record.prevHash !== head || !kinds.has(record.kind)
      || typeof record.ts !== 'string' || !Number.isFinite(Date.parse(record.ts)) || hash !== sha256(canonical(body))) throw new Error('invalid fixture log chain');
    head = hash; records.push(record);
  }
  const headPath = join(dir, 'txlog-head.json');
  if (!existsSync(headPath)) {
    if (bytes.length) throw new Error('fixture log checkpoint missing');
    writePrivateJson(headPath, { seq: 0, hash: 'GENESIS' });
  }
  ownerOnly(headPath);
  const checkpoint = readJson(headPath, 4096);
  if (checkpoint.seq !== records.length || checkpoint.hash !== head) throw new Error('fixture log checkpoint mismatch');
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  ownerOnly(path); syncDirectory(dir);
  let failed = false, size = bytes.length;
  return { path, records, get head() { return head; }, get nextSeq() { return records.length + 1; },
    append(kind, data = {}) {
      if (failed) throw new Error('fixture log unavailable');
      const body = { ...data, seq: records.length + 1, ts: new Date().toISOString(), kind, prevHash: head };
      const record = { ...body, hash: sha256(canonical(body)) }, line = Buffer.from(`${canonical(record)}\n`);
      if (size + line.length > 67_108_864) { failed = true; throw new Error('fixture log capacity reached'); }
      try {
        writeAll(fd, line); fsyncSync(fd);
        const temp = join(dir, `txlog-head-${randomUUID()}.tmp`);
        writePrivateJson(temp, { seq: record.seq, hash: record.hash });
        ownerOnly(headPath); renameSync(temp, headPath); syncDirectory(dir);
      }
      catch (error) { failed = true; throw error; }
      size += line.length; records.push(record); head = record.hash; return record;
    }, close() { closeSync(fd); } };
}
