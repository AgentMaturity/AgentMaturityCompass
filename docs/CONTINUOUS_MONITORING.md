# Continuous Production Monitoring

**Real-time agent observability that closes the LangSmith/LangFuse gap.**

## Overview

AMC's continuous monitoring system provides production-grade observability for AI agents:

- **Continuous scoring** — Automatic periodic scoring (default: every 5 minutes)
- **Drift detection** — Automatic regression detection (default: every 15 minutes)
- **Alert thresholds** — Configurable score drop and anomaly alerts
- **Dashboard metrics feed** — Real-time metrics for dashboards
- **Webhook notifications** — Instant alerts on score drops and incidents

## Quick Start

```bash
# Start monitoring an agent
amc monitor start --agent my-agent

# Check monitoring status
amc monitor status

# View recent events
amc monitor events --limit 50

# Get metrics for a specific agent
amc monitor metrics --agent my-agent
```

## Configuration

### Scoring Interval

Control how often the agent is scored:

```bash
amc monitor start --agent my-agent --scoring-interval 300000  # 5 minutes (default)
```

### Drift Check Interval

Control how often drift detection runs:

```bash
amc monitor start --agent my-agent --drift-interval 900000  # 15 minutes (default)
```

### Score Drop Threshold

Set the threshold for score drop alerts (0-1):

```bash
amc monitor start --agent my-agent --score-drop-threshold 0.1  # 10% drop (default)
```

### Webhook Notifications

Disable webhook notifications:

```bash
amc monitor start --agent my-agent --no-webhooks
```

## Monitoring Events

The continuous monitor emits the following events:

### Score Events

Emitted after each scoring cycle:

```json
{
  "type": "score",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "score": 3.45,
    "runId": "run-123",
    "delta": -0.12
  }
}
```

### Drift Events

Emitted after each drift check:

```json
{
  "type": "drift",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "triggered": true,
    "ruleId": "maturity-regression",
    "reasons": ["Overall score dropped by 0.8 points"],
    "incidentId": "incident-456"
  }
}
```

### Anomaly Events

Emitted when anomalies are detected:

```json
{
  "type": "anomaly",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "type": "SCORE_VOLATILITY_SPIKE",
    "severity": "HIGH",
    "message": "Score volatility spiked 3.2x"
  }
}
```

### Alert Events

Emitted when alerts are dispatched:

```json
{
  "type": "alert",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "ruleId": "continuous-monitor-score-drop",
    "summary": "Score dropped 12.5% (3.45 → 3.02)"
  }
}
```

## Metrics

Each monitored agent tracks the following metrics:

- `currentScore` — Latest overall score
- `previousScore` — Previous overall score
- `scoreDelta` — Change from previous score
- `lastScoredAt` — Timestamp of last scoring
- `lastDriftCheckAt` — Timestamp of last drift check
- `activeIncidents` — Number of active incidents
- `anomaliesDetected` — Total anomalies detected
- `totalScores` — Total number of scores collected
- `uptime` — Monitor uptime in milliseconds

## Dashboard Integration

The continuous monitor integrates with the AMC Studio dashboard via the `DashboardFeed`:

```typescript
import { globalDashboardFeed } from "agent-maturity-compass";

// Get real-time snapshot
const snapshot = globalDashboardFeed.getSnapshot();

// Listen for events
globalDashboardFeed.on("event", (event) => {
  console.log("New event:", event);
});

// Get agent metrics
const metrics = globalDashboardFeed.getAgentMetrics("my-agent");
```

## Programmatic Usage

```typescript
import { createContinuousMonitor } from "agent-maturity-compass";

const monitor = createContinuousMonitor({
  workspace: "/path/to/workspace",
  agentId: "my-agent",
  scoringIntervalMs: 300000,  // 5 minutes
  driftCheckIntervalMs: 900000,  // 15 minutes
  scoreDropThreshold: 0.1,  // 10%
  enableWebhooks: true
});

// Event handlers
monitor.on("score", (event) => {
  console.log("Score:", event.data.score);
});

monitor.on("drift", (event) => {
  if (event.data.triggered) {
    console.log("Drift detected:", event.data.reasons);
  }
});

monitor.on("alert", (event) => {
  console.log("Alert:", event.data.summary);
});

// Start monitoring
await monitor.start();

// Get metrics
const metrics = monitor.getMetrics();
console.log("Current score:", metrics.currentScore);

// Stop monitoring
await monitor.stop();
```

## Alert Configuration

Alerts are configured via `.amc/alerts.yaml`:

```yaml
alerts:
  version: 1
  channels:
    - type: webhook
      name: slack-alerts
      url: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
      secretRef: vault:alerts/slack
  rules:
    - id: maturity-regression
      when:
        overallDropGte: 0.5
        layerDropGte: 0.7
        integrityDropGte: 0.15
        correlationDropBelow: 0.9
        assuranceDropBelow:
          injection: 80
          hallucination: 80
      actions:
        - ALERT_OWNER
        - FREEZE_EXECUTE
        - CREATE_INCIDENT
      freezeActionClasses:
        - DEPLOY
        - WRITE_HIGH
        - SECURITY
```

## Comparison to LangSmith/LangFuse

| Feature | LangSmith/LangFuse | AMC Continuous Monitoring |
|---------|-------------------|---------------------------|
| Continuous scoring | ❌ Manual | ✅ Automatic (configurable intervals) |
| Drift detection | ❌ No | ✅ Built-in with alert thresholds |
| Alert thresholds | ❌ No | ✅ Configurable score drops & anomalies |
| Dashboard metrics | ✅ Yes | ✅ Real-time feed |
| Webhook notifications | ✅ Yes | ✅ On score drops & incidents |
| Evidence-backed | ❌ No | ✅ Ed25519 + Merkle tree proof chains |
| Tamper-evident | ❌ No | ✅ Cryptographic signatures |

## Best Practices

1. **Start with defaults** — The default intervals (5min scoring, 15min drift) work well for most agents
2. **Tune thresholds** — Adjust `scoreDropThreshold` based on your agent's stability
3. **Monitor the monitor** — Check `amc monitor status` regularly to ensure monitors are running
4. **Review events** — Use `amc monitor events` to understand agent behavior patterns
5. **Set up webhooks** — Configure `.amc/alerts.yaml` for instant notifications

## Troubleshooting

### Monitor not starting

Check that the workspace is initialized:

```bash
amc init
```

### No score events

Ensure the agent has at least one scoring run:

```bash
amc quickscore --agent my-agent
```

### Webhooks not firing

Verify alerts configuration:

```bash
cat .amc/alerts.yaml
amc drift alerts test
```

## See Also

- [Drift Detection](./DRIFT_DETECTION.md)
- [Alert Configuration](./ALERTS.md)
- [Dashboard API](./DASHBOARD_API.md)
- [AMC Studio](./STUDIO.md)
