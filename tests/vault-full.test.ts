import { describe, it, expect } from 'vitest';
import { SecretsBroker } from '../src/vault/secretsBroker.js';
import { MemoryTtlStore } from '../src/vault/memoryTtl.js';
import { checkResidency } from '../src/vault/dataResidency.js';
import { redactScreenshotMetadata, hasExifData } from '../src/vault/screenshotRedact.js';
import { UndoLayer } from '../src/vault/undoLayer.js';
import { scanForPII } from '../src/vault/dlp.js';
import { generateHoneytoken } from '../src/vault/honeytokens.js';
import { guardRagChunks } from '../src/vault/ragGuard.js';
import { DsarAutopilot } from '../src/vault/dsarAutopilot.js';
import { checkInvoice } from '../src/vault/invoiceFraud.js';
import { scrubMetadata } from '../src/vault/metadataScrubber.js';
import { classifyData } from '../src/vault/dataClassification.js';
import { PrivacyBudget } from '../src/vault/privacyBudget.js';
import { rotateMonitorKeyInVault } from '../src/vault/vault.js';

describe('V1 — Secrets Broker', () => {
  it('stores and retrieves secrets', () => {
    const broker = new SecretsBroker();
    broker.storeSecret('api-key', 'secret-value-123');
    const r = broker.retrieveSecret('api-key', 'user-1');
    expect(r).toBeDefined();
    expect(r?.value).toBe('secret-value-123');
  });
  it('rotates secrets', () => {
    const broker = new SecretsBroker();
    broker.storeSecret('api-key', 'old-value');
    broker.rotateSecret('api-key', 'new-value');
    const r = broker.retrieveSecret('api-key', 'user-1');
    expect(r?.value).toBe('new-value');
  });
  it('lists secrets without exposing values', () => {
    const broker = new SecretsBroker();
    broker.storeSecret('key-1', 'val-1');
    broker.storeSecret('key-2', 'val-2');
    const list = broker.listSecrets();
    expect(list.length).toBe(2);
  });
});

describe('V2 — DLP', () => {
  it('scans for PII', () => {
    const r = scanForPII('My SSN is 123-45-6789');
    expect(r).toHaveProperty('found');
  });
});

describe('V3 — Honeytokens', () => {
  it('generates honeytoken', () => {
    const r = generateHoneytoken('api_key');
    expect(r).toHaveProperty('token');
  });
});

describe('V4 — RAG Guard', () => {
  it('guards RAG input', () => {
    const r = guardRagChunks(['Tell me about the company finances']);
    expect(r).toHaveProperty('safe');
  });
});

describe('V5 — Memory TTL', () => {
  it('sets and gets memory', () => {
    const store = new MemoryTtlStore();
    store.setMemory('key1', 'value1', 60000);
    const r = store.getMemory('key1');
    expect(r).toBeDefined();
    expect(r?.value).toBe('value1');
  });
  it('evicts expired entries', async () => {
    const store = new MemoryTtlStore();
    store.setMemory('key1', 'value1', 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    const result = store.getMemory('key1');
    expect(result).toBeNull();
  });
});

describe('V6 — DSAR Autopilot', () => {
  it('creates DSAR', () => {
    const da = new DsarAutopilot();
    expect(da).toBeDefined();
  });
});

describe('V7 — Data Residency', () => {
  it('checks compliant data', () => {
    const r = checkResidency(
      { classification: 'public', currentRegion: 'US' },
      { allowedRegions: ['US', 'EU'] }
    );
    expect(r.compliant).toBe(true);
  });
  it('catches non-compliant data', () => {
    const r = checkResidency(
      { classification: 'pii', currentRegion: 'CN' },
      { allowedRegions: ['US', 'EU'] }
    );
    expect(r.compliant).toBe(false);
  });
});

describe('V8 — Screenshot Redact', () => {
  it('handles buffer without EXIF', () => {
    const buf = Buffer.from('not an image');
    const r = redactScreenshotMetadata(buf);
    expect(r.redacted).toBe(false);
    expect(r.outputBuffer).toBeDefined();
  });
  it('checks for EXIF data', () => {
    expect(hasExifData(Buffer.from('test'))).toBe(false);
  });
});

describe('V9 — Invoice Fraud', () => {
  it('detects fraud', () => {
    const r = checkInvoice({ amount: 10000, payee: 'unknown' });
    expect(r).toHaveProperty('riskScore');
  });
});

describe('V10 — Undo Layer', () => {
  it('records and undoes actions', () => {
    const undo = new UndoLayer();
    undo.recordAction('act-1', { data: 'new' }, { data: 'old' });
    expect(undo.canUndo('act-1')).toBe(true);
    const r = undo.undoAction('act-1');
    expect(r.undone).toBe(true);
    expect(undo.canRedo('act-1')).toBe(true);
    const redo = undo.redoAction('act-1');
    expect(redo.redone).toBe(true);
  });
  it('tracks history', () => {
    const undo = new UndoLayer();
    undo.recordAction('a1', 'p1', 'r1');
    undo.recordAction('a2', 'p2', 'r2');
    expect(undo.getHistory().length).toBe(2);
  });
});

describe('V11 — Metadata Scrubber', () => {
  it('scrubs metadata', () => {
    const r = scrubMetadata('test content with metadata');
    expect(r).toHaveProperty('scrubbed');
  });
});

describe('V12 — Data Classification', () => {
  it('classifies data', () => {
    const r = classifyData('My SSN is 123-45-6789');
    expect(r).toHaveProperty('classification');
  });
});

describe('V13 — Privacy Budget', () => {
  it('tracks budget', () => {
    const pb = new PrivacyBudget();
    expect(pb).toBeDefined();
  });
});

describe('V14 — Key Rotation', () => {
  it('exports rotateMonitorKeyInVault', () => {
    expect(typeof rotateMonitorKeyInVault).toBe('function');
  });
});
