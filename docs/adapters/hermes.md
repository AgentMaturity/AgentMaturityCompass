# Hermes Agent Adapter

Adapter ID: `hermes-cli`  
Runtime: Python 3.11+ (Hermes Agent install)  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The Hermes adapter integrates the Hermes Agent runtime with AMC. Runs launched
through AMC route Hermes model traffic through the AMC gateway with a minted
lease and capture process lifecycle, tool activity, and model traffic as
signed, observed evidence.

## Prerequisites

- Hermes Agent installed (`hermes --version` works)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-hermes --adapter hermes-cli -- hermes -z "Summarize this repo"
```

## Setup

### Option 1: Wrap Individual Runs

```bash
amc adapters run --agent my-hermes --adapter hermes-cli -- hermes -z "task description"
```

### Option 2: Configure as Default Adapter

```bash
amc adapters configure --agent my-hermes --adapter hermes-cli
```

## How It Works

Hermes reads OpenAI-compatible environment variables. AMC's adapter runner
injects `OPENAI_BASE_URL` (pointed at the AMC gateway route) and an
`OPENAI_API_KEY` carrying a scoped, expiring lease instead of a raw provider
key. Every model call becomes observed evidence in the ledger; the raw
provider credentials never enter the Hermes process.

Detection probes the `hermes` binary with `--version`
(`Hermes Agent vX.Y.Z`). Capability coverage is published as a signed
receipt via `amc adapters capabilities --adapter hermes-cli`.

## Verification

```bash
amc adapters detect                 # hermes-cli listed with version
amc adapters capabilities --adapter hermes-cli --json
```
