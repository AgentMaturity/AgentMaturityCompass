/**
 * customerSupportBot.ts — Multi-channel customer support agent with
 * intent classification, sentiment analysis, escalation logic, and
 * ticket lifecycle management.
 *
 * This is a more complex agent than the existing bots — it has internal
 * state (ticket store), multi-step routing, PII detection for governance,
 * and configurable SLA thresholds. It exercises more AMC governance
 * concerns (PII handling, escalation, audit trail, rate limiting).
 */

import { randomUUID } from 'node:crypto';
import { AMCAgentBase } from './agentBase.js';
import { ratioOrNull } from '../utils/ratio.js';

/* ── Types ──────────────────────────────────────────────────────── */

export type Intent =
  | 'billing' | 'technical' | 'account' | 'refund'
  | 'complaint' | 'general' | 'cancellation' | 'unknown';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'angry';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';

export interface SupportTicket {
  ticketId: string;
  customerId: string;
  channel: string;
  intent: Intent;
  sentiment: Sentiment;
  priority: Priority;
  status: TicketStatus;
  message: string;
  response: string;
  piiDetected: string[];
  escalationReason?: string;
  assignedTo?: string;
  tags: string[];
  createdAt: number;
  resolvedAt?: number;
  slaBreached: boolean;
}

export interface SupportRequest {
  customerId: string;
  message: string;
  channel?: string;           // email | chat | phone | social
  previousTicketIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface SupportResponse {
  ticket: SupportTicket;
  suggestedResponse: string;
  requiresHumanReview: boolean;
  piiWarnings: string[];
  confidenceScore: number;
  escalated: boolean;
  relatedTickets: string[];
}

export interface BotStats {
  totalTickets: number;
  byIntent: Record<Intent, number>;
  bySentiment: Record<Sentiment, number>;
  byPriority: Record<Priority, number>;
  avgResponseConfidence: number;
  /** Null with no tickets: a rate over zero tickets was not measured. */
  escalationRate: number | null;
  slaBreachRate: number | null;
  piiDetectionCount: number;
}

/* ── Intent classification ─────────────────────────────────────── */

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  billing: [
    /\b(bill|invoice|charge|payment|subscript|pric|cost|fee|receipt|overcharg)\w*\b/i,
    /\b(how\s+much|pay|owe|balance|statement)\b/i,
  ],
  technical: [
    /\b(bug|error|crash|broken|not\s+working|fail|issue|problem|glitch|slow|down)\b/i,
    /\b(install|setup|configur|connect|integrat|api|login)\w*\b/i,
  ],
  account: [
    /\b(account|profile|password|reset|verify|email\s+change|update\s+my)\b/i,
    /\b(sign\s+(up|in)|log\s*(in|out)|register|two.?factor|mfa)\b/i,
  ],
  refund: [
    /\b(refund|money\s+back|return|reimburse|credit\s+back|chargeback)\b/i,
  ],
  complaint: [
    /\b(complaint|unacceptable|terrible|worst|awful|disgust|furious|ridiculous)\b/i,
    /\b(speak\s+to\s+(a\s+)?manager|supervisor|escalat)\b/i,
  ],
  cancellation: [
    /\b(cancel|unsubscrib|close\s+my\s+account|delete\s+my|opt\s+out|terminate)\b/i,
  ],
  general: [
    /\b(how\s+do\s+i|where\s+can|what\s+is|can\s+you|help\s+me|information|question)\b/i,
  ],
  unknown: [],
};

function classifyIntent(message: string): { intent: Intent; confidence: number } {
  const scores: Array<{ intent: Intent; score: number }> = [];

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as Array<[Intent, RegExp[]]>) {
    if (intent === 'unknown') continue;
    let matches = 0;
    for (const p of patterns) {
      p.lastIndex = 0;
      if (p.test(message)) matches++;
    }
    if (matches > 0) {
      scores.push({ intent, score: matches / patterns.length });
    }
  }

  if (scores.length === 0) {
    return { intent: 'unknown', confidence: 0.2 };
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;
  // Confidence is higher when there's a clear winner
  const confidence = scores.length === 1
    ? Math.min(0.95, 0.6 + best.score * 0.3)
    : Math.min(0.95, 0.5 + (best.score - (scores[1]?.score ?? 0)) * 0.4);

  return { intent: best.intent, confidence };
}

/* ── Sentiment analysis ────────────────────────────────────────── */

const SENTIMENT_WORDS: Record<Sentiment, string[]> = {
  positive: ['thank', 'great', 'awesome', 'excellent', 'love', 'happy', 'perfect', 'amazing', 'appreciate', 'wonderful'],
  neutral: ['ok', 'fine', 'alright', 'sure', 'understand', 'noted'],
  negative: ['bad', 'poor', 'disappointing', 'frustrated', 'unhappy', 'issue', 'problem', 'difficult', 'slow', 'confusing'],
  angry: ['terrible', 'worst', 'awful', 'furious', 'ridiculous', 'unacceptable', 'outraged', 'disgusting', 'scam', 'fraud', 'sue'],
};

function analyzeSentiment(message: string): Sentiment {
  const lower = message.toLowerCase();
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0, angry: 0 };

  for (const [sentiment, words] of Object.entries(SENTIMENT_WORDS) as Array<[Sentiment, string[]]>) {
    for (const word of words) {
      if (lower.includes(word)) counts[sentiment]++;
    }
  }

  // Angry overrides negative
  if (counts.angry >= 2) return 'angry';
  if (counts.angry >= 1 && counts.negative >= 1) return 'angry';
  if (counts.negative > counts.positive) return 'negative';
  if (counts.positive > counts.negative) return 'positive';
  return 'neutral';
}

/* ── PII detection ─────────────────────────────────────────────── */

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g },
  { type: 'phone', pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'credit_card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { type: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: 'date_of_birth', pattern: /\b(dob|date\s+of\s+birth|born\s+on)[:\s]+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/gi },
];

function detectPII(message: string): string[] {
  const detected: string[] = [];
  for (const { type, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(message)) {
      detected.push(type);
    }
  }
  return detected;
}

/* ── Priority assignment ───────────────────────────────────────── */

function assignPriority(intent: Intent, sentiment: Sentiment, piiCount: number): Priority {
  // Critical: angry + complaint/cancellation, or PII exposure
  if (piiCount >= 2) return 'critical';
  if (sentiment === 'angry' && (intent === 'complaint' || intent === 'cancellation')) return 'critical';

  // High: any cancellation, refund, or angry customer
  if (intent === 'cancellation' || intent === 'refund') return 'high';
  if (sentiment === 'angry') return 'high';

  // Medium: negative sentiment or billing issues
  if (sentiment === 'negative') return 'medium';
  if (intent === 'billing' || intent === 'complaint') return 'medium';

  // Low: everything else
  return 'low';
}

/* ── Response templates ────────────────────────────────────────── */

const RESPONSE_TEMPLATES: Record<Intent, string> = {
  billing: "I understand you have a billing concern. Let me look into your account details. Could you provide your account number or the invoice reference?",
  technical: "I'm sorry you're experiencing technical difficulties. Let me help troubleshoot. Could you describe the steps that led to the issue and any error messages you see?",
  account: "I can help with your account request. For security purposes, I'll need to verify your identity. Can you confirm the email address associated with your account?",
  refund: "I understand you'd like a refund. Let me review your recent transactions. Could you provide the order or transaction ID?",
  complaint: "I sincerely apologize for the inconvenience. Your feedback is important to us. Let me connect you with a senior representative who can address your concern directly.",
  cancellation: "I'm sorry to hear you'd like to cancel. Before we proceed, may I ask what prompted this decision? We may be able to offer a solution that works better for you.",
  general: "Thank you for reaching out! I'd be happy to help. Could you provide a bit more detail about what you're looking for?",
  unknown: "Thank you for contacting us. Let me make sure I understand your request correctly. Could you provide more details about how I can help you today?",
};

const ESCALATION_TEMPLATES: Record<string, string> = {
  angry_customer: "This customer is very upset and requires immediate attention from a senior agent.",
  pii_exposure: "PII detected in customer message. Requires secure handling and potential data incident review.",
  cancellation_retention: "Customer is requesting cancellation. Routing to retention specialist.",
  high_value: "High-priority ticket requiring expedited resolution.",
};

/* ── SLA config ────────────────────────────────────────────────── */

const SLA_THRESHOLDS_MS: Record<Priority, number> = {
  low: 24 * 60 * 60 * 1000,      // 24h
  medium: 8 * 60 * 60 * 1000,    // 8h
  high: 2 * 60 * 60 * 1000,      // 2h
  critical: 30 * 60 * 1000,      // 30min
};

/* ── CustomerSupportBot ────────────────────────────────────────── */

export class CustomerSupportBot extends AMCAgentBase {
  private tickets = new Map<string, SupportTicket>();
  private customerHistory = new Map<string, string[]>();

  constructor() {
    super({ name: 'CustomerSupportBot', type: 'customer-support' });
  }

  async run(input: unknown): Promise<SupportResponse> {
    const req = input as SupportRequest;
    return this.handleRequest(req);
  }

  async handleRequest(req: SupportRequest): Promise<SupportResponse> {
    const { customerId, message, channel = 'chat' } = req;

    // Step 1: Classify intent
    const { intent, confidence: intentConfidence } = classifyIntent(message);

    // Step 2: Analyze sentiment
    const sentiment = analyzeSentiment(message);

    // Step 3: Detect PII
    const piiDetected = detectPII(message);
    const piiWarnings: string[] = [];
    if (piiDetected.length > 0) {
      piiWarnings.push(`PII detected in message: ${piiDetected.join(', ')}. Message must be handled per data protection policy.`);
      if (piiDetected.includes('ssn') || piiDetected.includes('credit_card')) {
        piiWarnings.push('CRITICAL: Sensitive financial/identity data detected. Do NOT store raw message. Redact before logging.');
      }
    }

    // Step 4: Assign priority
    const priority = assignPriority(intent, sentiment, piiDetected.length);

    // Step 5: Determine escalation
    let escalated = false;
    let escalationReason: string | undefined;
    let assignedTo: string | undefined;
    let requiresHumanReview = false;

    if (priority === 'critical') {
      escalated = true;
      escalationReason = sentiment === 'angry'
        ? ESCALATION_TEMPLATES.angry_customer
        : ESCALATION_TEMPLATES.pii_exposure;
      assignedTo = 'senior-agent-queue';
      requiresHumanReview = true;
    } else if (intent === 'cancellation') {
      escalated = true;
      escalationReason = ESCALATION_TEMPLATES.cancellation_retention;
      assignedTo = 'retention-team';
      requiresHumanReview = true;
    } else if (intent === 'complaint' && sentiment !== 'positive') {
      requiresHumanReview = true;
    } else if (intentConfidence < 0.4) {
      requiresHumanReview = true;
    }

    // Step 6: Generate response
    const suggestedResponse = RESPONSE_TEMPLATES[intent] ?? RESPONSE_TEMPLATES.unknown;

    // Step 7: Create ticket
    const ticket: SupportTicket = {
      ticketId: randomUUID(),
      customerId,
      channel,
      intent,
      sentiment,
      priority,
      status: escalated ? 'escalated' : 'open',
      message,
      response: suggestedResponse,
      piiDetected,
      escalationReason,
      assignedTo,
      tags: this.generateTags(intent, sentiment, priority, piiDetected),
      createdAt: Date.now(),
      slaBreached: false,
    };

    await this.executeAction('create-ticket', async () => {
      this.tickets.set(ticket.ticketId, ticket);
      const history = this.customerHistory.get(customerId) ?? [];
      history.push(ticket.ticketId);
      this.customerHistory.set(customerId, history);
    });

    // Step 8: Find related tickets
    const relatedTickets = (req.previousTicketIds ?? []).filter(id => this.tickets.has(id));
    const customerPrevious = (this.customerHistory.get(customerId) ?? [])
      .filter(id => id !== ticket.ticketId)
      .slice(-5);
    relatedTickets.push(...customerPrevious);

    // Step 9: Compute overall confidence
    const confidenceScore = this.computeConfidence(intentConfidence, sentiment, piiDetected.length, escalated);

    return {
      ticket,
      suggestedResponse,
      requiresHumanReview,
      piiWarnings,
      confidenceScore,
      escalated,
      relatedTickets: [...new Set(relatedTickets)],
    };
  }

  /** Resolve a ticket */
  resolveTicket(ticketId: string, resolution: string): SupportTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.status === 'closed') return undefined;
    ticket.status = 'resolved';
    ticket.response = resolution;
    ticket.resolvedAt = Date.now();
    ticket.slaBreached = (ticket.resolvedAt - ticket.createdAt) > SLA_THRESHOLDS_MS[ticket.priority];
    return ticket;
  }

  /** Close a ticket */
  closeTicket(ticketId: string): SupportTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return undefined;
    if (ticket.status !== 'resolved') return undefined;
    ticket.status = 'closed';
    return ticket;
  }

  /** Get ticket by ID */
  getTicket(ticketId: string): SupportTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /** Get all tickets for a customer */
  getCustomerTickets(customerId: string): SupportTicket[] {
    const ids = this.customerHistory.get(customerId) ?? [];
    return ids.map(id => this.tickets.get(id)!).filter(Boolean);
  }

  /** Get aggregate stats */
  getBotStats(): BotStats {
    const tickets = [...this.tickets.values()];
    const byIntent: Record<Intent, number> = {
      billing: 0, technical: 0, account: 0, refund: 0,
      complaint: 0, cancellation: 0, general: 0, unknown: 0,
    };
    const bySentiment: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0, angry: 0 };
    const byPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let totalConfidence = 0;
    let escalated = 0;
    let breached = 0;
    let piiCount = 0;

    for (const t of tickets) {
      byIntent[t.intent]++;
      bySentiment[t.sentiment]++;
      byPriority[t.priority]++;
      if (t.status === 'escalated') escalated++;
      if (t.slaBreached) breached++;
      piiCount += t.piiDetected.length;
    }

    return {
      totalTickets: tickets.length,
      byIntent,
      bySentiment,
      byPriority,
      avgResponseConfidence: tickets.length > 0 ? totalConfidence / tickets.length : 0,
      escalationRate: ratioOrNull(escalated, tickets.length),
      slaBreachRate: ratioOrNull(breached, tickets.length),
      piiDetectionCount: piiCount,
    };
  }

  /* ── Private helpers ──────────────────────────────────────────── */

  private generateTags(intent: Intent, sentiment: Sentiment, priority: Priority, pii: string[]): string[] {
    const tags = [intent, sentiment, `priority:${priority}`];
    if (pii.length > 0) tags.push('pii-detected');
    if (pii.includes('credit_card') || pii.includes('ssn')) tags.push('sensitive-data');
    if (priority === 'critical') tags.push('urgent');
    return tags;
  }

  private computeConfidence(intentConf: number, sentiment: Sentiment, piiCount: number, escalated: boolean): number {
    let conf = intentConf;
    // Lower confidence when sentiment is extreme
    if (sentiment === 'angry') conf *= 0.7;
    // Lower confidence when PII is present (risky to auto-respond)
    if (piiCount > 0) conf *= 0.8;
    if (piiCount >= 2) conf *= 0.7;
    // Lower confidence for escalated tickets
    if (escalated) conf *= 0.6;
    return Math.round(conf * 100) / 100;
  }
}

/* ── Convenience function ──────────────────────────────────────── */

export function handleSupportRequest(req: SupportRequest): Promise<SupportResponse> {
  const bot = new CustomerSupportBot();
  return bot.handleRequest(req);
}
