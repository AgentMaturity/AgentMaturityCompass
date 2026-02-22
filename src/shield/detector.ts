import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface Attack {
  type: string;
  pattern: string;
  confidence: number;
  position: number;
}

export interface DetectorResult {
  detected: boolean;
  attacks: Attack[];
  riskScore: number;
  confidence: number;
}

interface PatternDef {
  type: string;
  regex: RegExp;
  confidence: number;
}

const PATTERNS: PatternDef[] = [
  // System override
  { type: 'system_override', regex: /ignore\s+(all\s+)?previous\s+(instructions|prompts)/i, confidence: 0.95 },
  { type: 'system_override', regex: /you\s+are\s+now\s+/i, confidence: 0.9 },
  { type: 'system_override', regex: /new\s+instructions?\s*:/i, confidence: 0.9 },
  { type: 'system_override', regex: /disregard\s+(all\s+)?(prior|above|previous)/i, confidence: 0.95 },
  { type: 'system_override', regex: /forget\s+(everything|all|your)\s+(above|previous|prior)/i, confidence: 0.9 },
  // Role-play escape
  { type: 'roleplay_escape', regex: /pretend\s+you'?r?e?\s+/i, confidence: 0.8 },
  { type: 'roleplay_escape', regex: /act\s+as\s+if\s+/i, confidence: 0.8 },
  { type: 'roleplay_escape', regex: /roleplay\s+as\s+/i, confidence: 0.75 },
  { type: 'roleplay_escape', regex: /you\s+must\s+obey/i, confidence: 0.85 },
  // Delimiter injection
  { type: 'delimiter_injection', regex: /```\s*(system|assistant|user)\b/i, confidence: 0.85 },
  { type: 'delimiter_injection', regex: /---\s*(system|instruction)/i, confidence: 0.8 },
  { type: 'delimiter_injection', regex: /\[INST\]/i, confidence: 0.85 },
  // Base64 obfuscation
  { type: 'base64_obfuscation', regex: /[A-Za-z0-9+/]{40,}={0,2}/g, confidence: 0.6 },
  // Encoding tricks
  { type: 'encoding_trick', regex: /&#x?[0-9a-f]+;/i, confidence: 0.7 },
  { type: 'encoding_trick', regex: /%[0-9a-f]{2}/i, confidence: 0.5 },
];

export function detectInjection(prompt: string): DetectorResult {
  const attacks: Attack[] = [];

  for (const def of PATTERNS) {
    const re = new RegExp(def.regex.source, def.regex.flags.includes('g') ? def.regex.flags : def.regex.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(prompt)) !== null) {
      attacks.push({
        type: def.type,
        pattern: match[0].slice(0, 80),
        confidence: def.confidence,
        position: match.index,
      });
      if (!def.regex.flags.includes('g')) break;
    }
  }

  const riskScore = attacks.length === 0 ? 0 : Math.min(1, attacks.reduce((s, a) => s + a.confidence, 0) / attacks.length);

  const result = { detected: attacks.length > 0, attacks, riskScore, confidence: riskScore };
  emitGuardEvent({
    agentId: 'system', moduleCode: 'S2',
    decision: result.detected ? 'deny' : 'allow',
    reason: result.detected ? `Detected ${attacks.length} injection attacks` : 'No injection detected',
    severity: result.detected ? 'critical' : 'low',
    meta: { attackCount: attacks.length, riskScore },
  });
  return result;
}

export function detect(input: string): DetectorResult {
  return detectInjection(input);
}
