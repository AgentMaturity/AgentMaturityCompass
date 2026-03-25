#!/usr/bin/env node
"use strict";

// Skip in CI environments
if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) process.exit(0);

const msg = `
  ┌──────────────────────────────────────────────┐
  │                                              │
  │   🧭  Agent Maturity Compass installed!      │
  │                                              │
  │   Quick start:                               │
  │     npx amc quickscore                       │
  │     npx amc quickscore --rapid               │
  │                                              │
  │   Docs:  npx amc help                        │
  │                                              │
  └──────────────────────────────────────────────┘
`;

console.log(msg);
