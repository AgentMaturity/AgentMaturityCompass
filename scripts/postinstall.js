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
  │     amc                                      │
  │     amc up                                   │
  │     amc quickscore --rapid                   │
  │                                              │
  │   Docs:  amc --help                          │
  │                                              │
  └──────────────────────────────────────────────┘
`;

console.log(msg);
