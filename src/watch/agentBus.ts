/**
 * Inter-agent messaging bus.
 */

import { createHash, randomUUID } from 'node:crypto';

type BusMessage = Record<string, unknown>;
type Subscriber = (message: AgentMessage) => void;

export interface AgentMessage {
  messageId: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp: Date;
  /**
   * Content digest — NOT a cryptographic signature. It is an unkeyed SHA-256
   * over the message, so anyone who can craft a message can craft a matching
   * digest; it detects accidental corruption, not forgery.
   */
  contentDigest?: string;
}

export class AgentBus {
  private messages = new Map<string, AgentMessage[]>();
  private subscribers = new Set<Subscriber>();

  send(from: string, to: string, payload: unknown): AgentMessage {
    const msg: AgentMessage = {
      messageId: randomUUID(),
      from,
      to,
      payload,
      timestamp: new Date(),
      contentDigest: createHash('sha256').update(`${from}:${to}:${JSON.stringify(payload)}`).digest('hex'),
    };

    const existing = this.messages.get(to) ?? [];
    existing.push(msg);
    this.messages.set(to, existing);

    for (const fn of this.subscribers) fn(msg);

    return msg;
  }

  receive(agentId: string): AgentMessage[] {
    const msgs = this.messages.get(agentId) ?? [];
    this.messages.delete(agentId);
    return msgs;
  }

  verify(message: AgentMessage): boolean {
    const expected = createHash('sha256')
      .update(`${message.from}:${message.to}:${JSON.stringify(message.payload)}`)
      .digest('hex');
    return expected === message.contentDigest;
  }

  /**
   * Compatibility API for legacy call pattern.
   */
  publish(message: BusMessage): void {
    const typed = message as { type?: string; data?: unknown; to?: string; from?: string };
    const to = typeof typed.to === 'string' ? typed.to : '*';
    const from = typed.from ?? 'unknown';
    const payload = typed.data ?? typed;
    this.send(from, to, payload);
  }

  subscribe(handler: Subscriber): void {
    this.subscribers.add(handler);
  }
}
