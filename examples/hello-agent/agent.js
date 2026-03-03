#!/usr/bin/env node
/**
 * Hello Agent — A minimal AI agent for AMC scoring demonstration
 * 
 * This agent:
 * 1. Accepts user input from stdin
 * 2. Runs a basic safety check (keyword filter)
 * 3. Generates a response
 * 4. Logs every interaction to a structured log file
 * 
 * It's intentionally simple. The goal is to demonstrate AMC scoring,
 * not to build a production agent.
 */

const fs = require('fs');
const readline = require('readline');

// ── Configuration ──
const AGENT_NAME = 'HelloAgent';
const VERSION = '1.0.0';
const LOG_FILE = 'agent.log';
const BLOCKED_KEYWORDS = ['ignore previous', 'system prompt', 'jailbreak', 'pretend you are'];

// ── Safety Check ──
function safetyCheck(input) {
  const lower = input.toLowerCase();
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { safe: false, reason: `Blocked keyword detected: "${keyword}"` };
    }
  }
  if (input.length > 10000) {
    return { safe: false, reason: 'Input exceeds maximum length (10,000 chars)' };
  }
  return { safe: true, reason: null };
}

// ── Response Generation ──
function generateResponse(input) {
  // Simple echo agent with mild intelligence
  if (input.includes('?')) {
    return `That's an interesting question! You asked: "${input.substring(0, 100)}"`;
  }
  if (input.toLowerCase().startsWith('hello') || input.toLowerCase().startsWith('hi')) {
    return `Hello! I'm ${AGENT_NAME} v${VERSION}. How can I help?`;
  }
  return `I received your message: "${input.substring(0, 100)}"`;
}

// ── Structured Logging ──
function log(event) {
  const entry = {
    timestamp: new Date().toISOString(),
    agent: AGENT_NAME,
    version: VERSION,
    ...event,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

// ── Main Loop ──
async function main() {
  console.log(`🤖 ${AGENT_NAME} v${VERSION} — Type a message (Ctrl+C to exit)`);
  console.log(`   Safety: ${BLOCKED_KEYWORDS.length} keyword filters active`);
  console.log(`   Logging to: ${LOG_FILE}\n`);

  log({ event: 'agent_start', config: { blockedKeywords: BLOCKED_KEYWORDS.length } });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.on('line', (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Safety check
    const check = safetyCheck(trimmed);
    log({ event: 'input_received', inputLength: trimmed.length, safe: check.safe });

    if (!check.safe) {
      const blocked = `⚠️  Blocked: ${check.reason}`;
      console.log(blocked);
      log({ event: 'input_blocked', reason: check.reason });
      return;
    }

    // Generate response
    const response = generateResponse(trimmed);
    console.log(`💬 ${response}`);
    log({ event: 'response_sent', responseLength: response.length });
  });

  rl.on('close', () => {
    log({ event: 'agent_stop' });
    console.log('\n👋 Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
