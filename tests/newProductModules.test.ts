import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { ScratchpadManager, closeScratchpadDb } from '../src/product/scratchpad.js';
import { PromptModuleRegistry, closePromptModulesDb } from '../src/product/promptModules.js';
import { validateAndRepair } from '../src/product/structuredOutput.js';
import { diffOutputs } from '../src/product/outputDiff.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const AMC_DIR = join(process.cwd(), '.amc');

afterAll(() => {
  closeScratchpadDb();
  closePromptModulesDb();
  try { rmSync(join(AMC_DIR, 'scratchpad.sqlite')); } catch (_) {}
  try { rmSync(join(AMC_DIR, 'prompt_modules.sqlite')); } catch (_) {}
});

describe('ScratchpadManager', () => {
  const mgr = new ScratchpadManager();

  beforeEach(() => {
    closeScratchpadDb();
    try { rmSync(join(AMC_DIR, 'scratchpad.sqlite')); } catch (_) {}
  });

  it('set and get', () => {
    const sp = new ScratchpadManager();
    const id = sp.set('sess-1', 'name', 'Alice');
    expect(id).toBeTruthy();
    expect(sp.get('sess-1', 'name')).toBe('Alice');
  });

  it('list returns entries for session', () => {
    const sp = new ScratchpadManager();
    sp.set('sess-2', 'a', 1);
    sp.set('sess-2', 'b', 2);
    sp.set('sess-other', 'c', 3);
    const entries = sp.list('sess-2');
    expect(entries.length).toBe(2);
  });

  it('delete removes entry', () => {
    const sp = new ScratchpadManager();
    sp.set('sess-3', 'x', 'val');
    expect(sp.delete('sess-3', 'x')).toBe(true);
    expect(sp.get('sess-3', 'x')).toBeNull();
  });

  it('expire removes TTL entries', async () => {
    const sp = new ScratchpadManager();
    sp.set('sess-4', 'temp', 'data', { ttlSeconds: 1 }); // 1 second TTL
    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const count = sp.expire('sess-4');
    expect(count).toBe(1);
  });
});

describe('PromptModuleRegistry', () => {
  beforeEach(() => {
    closePromptModulesDb();
    try { rmSync(join(AMC_DIR, 'prompt_modules.sqlite')); } catch (_) {}
  });

  it('add and compose modules', () => {
    const reg = new PromptModuleRegistry();
    const id1 = reg.addModule('sys-role', 'role', 'You are a helpful assistant.');
    const id2 = reg.addModule('json-format', 'format', 'Respond in JSON.');
    const composed = reg.compose('test-template', [id1, id2]);
    expect(composed).toContain('helpful assistant');
    expect(composed).toContain('JSON');
  });

  it('save and get version', () => {
    const reg = new PromptModuleRegistry();
    const vid = reg.saveVersion('Hello World', 'v1');
    expect(reg.getVersion(vid)).toBe('Hello World');
    expect(reg.getVersion('nonexistent')).toBeNull();
  });
});

describe('validateAndRepair', () => {
  it('parses valid JSON', () => {
    const r = validateAndRepair('{"name":"test","age":25}', {
      properties: { name: { type: 'string' }, age: { type: 'number' } },
    });
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe(false);
  });

  it('repairs JSON with code fences', () => {
    const r = validateAndRepair('```json\n{"x":1}\n```', { properties: { x: { type: 'number' } } });
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe(true);
  });

  it('repairs trailing commas', () => {
    const r = validateAndRepair('{"a":1,"b":2,}', { properties: {} });
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe(true);
  });

  it('fills missing required fields', () => {
    const r = validateAndRepair('{}', {
      required: ['name'],
      properties: { name: { type: 'string' } },
    });
    expect(r.repaired).toBe(true);
    expect((r.output as any).name).toBe('');
  });
});

describe('diffOutputs', () => {
  it('identical strings have similarity 1', () => {
    const r = diffOutputs('hello world', 'hello world');
    expect(r.similarity).toBe(1);
    expect(r.added.length).toBe(0);
    expect(r.removed.length).toBe(0);
  });

  it('completely different strings have low similarity', () => {
    const r = diffOutputs('foo bar baz', 'qux quux corge');
    expect(r.similarity).toBeLessThan(0.5);
  });

  it('detects added and removed lines', () => {
    const r = diffOutputs('line1\nline2\nline3', 'line1\nline4\nline3');
    expect(r.added).toContain('line4');
    expect(r.removed).toContain('line2');
  });
});
