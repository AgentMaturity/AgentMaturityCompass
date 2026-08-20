import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
/**
 * File attachment detonation — analyzes files for threats.
 */

export interface DetonationResult {
  safe: boolean;
  mimeType: string;
  threats: string[];
  quarantined: boolean;
}

const DANGEROUS_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.ps1', '.sh', '.vbs', '.js', '.msi', '.dll', '.scr', '.com']);
const SCRIPT_EXTENSIONS = new Set(['.py', '.rb', '.pl', '.php']);
const MACRO_EXTENSIONS = new Set(['.xlsm', '.docm', '.pptm']);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function getMimeType(filename: string): string {
  const ext = getExtension(filename);
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain', '.pdf': 'application/pdf', '.json': 'application/json',
    '.exe': 'application/x-executable', '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

export function detonateAttachment(filename: string, content: string): DetonationResult {
  const threats: string[] = [];
  const ext = getExtension(filename);

  if (DANGEROUS_EXTENSIONS.has(ext)) threats.push(`Dangerous file extension: ${ext}`);
  if (SCRIPT_EXTENSIONS.has(ext)) threats.push(`Script file: ${ext}`);
  if (MACRO_EXTENSIONS.has(ext)) threats.push(`Macro-enabled document: ${ext}`);

  // Double extension check
  const parts = filename.split('.');
  if (parts.length > 2) threats.push('Double extension detected');

  // Content checks
  if (content.includes('#!/') || content.includes('powershell')) threats.push('Script content detected');
  if (/MZ[\x90\x00]/.test(content)) threats.push('PE executable signature');

  const safe = threats.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'S11', decision: 'allow', reason: 'S11 observation (no allow/deny decision was made here)', severity: 'high' });
  return { safe, mimeType: getMimeType(filename), threats, quarantined: !safe };
}