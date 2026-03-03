#!/usr/bin/env node
/**
 * Hello Agent — a minimal agent for AMC scoring demonstration.
 *
 * This agent simply echoes input with a prefix. In a real scenario,
 * you'd replace this with your actual AI agent (LangChain, CrewAI, etc.)
 * and wrap it with `amc wrap` to capture evidence.
 *
 * Usage:
 *   node agent.js "What is the capital of France?"
 *   amc wrap generic-cli -- node agent.js "What is 2+2?"
 */

const input = process.argv.slice(2).join(" ") || "Hello, world!";

// Simulate agent processing
console.log(`[HelloAgent] Received: "${input}"`);
console.log(`[HelloAgent] Processing...`);
console.log(`[HelloAgent] Response: I received your message: "${input}". As a demo agent, I don't have real capabilities yet.`);
console.log(`[HelloAgent] Done.`);
