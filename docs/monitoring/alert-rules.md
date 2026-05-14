# Alert Rules Configuration

## Overview

This document defines the critical alert rules for the Wedding Digital SaaS platform production environment. Alert rules are designed to detect service degradation before it impacts end users, with notifications delivered through multiple channels within 1 minute of threshold breach.

**Scale context**: 1 active event, maximum 500 guests. Thresholds are calibrated for this scale.

---

## Alert Rules

### 1. API Error Rate — Critical

| Field         | Value                                                           |
| ------------- | --------------------------------------------------------------- |
| **ID**        | `alert-api-error-rate`                                          |
| **Name**      | API Error Rate Critical                                         |
| **Metric**    | `api.error_rate` (percentage of 5xx responses / total requests) |
| **Condition** | Greater than (`gt`)                                             |
| **Threshold** | 5%                                                              |
| **Duration**  | 5 minutes (sustained)                                           |
| **Severity**  | `critical`                                                      |
| **Channels**  | `email`, `telegram`                                             |

**Description**: Triggers when the API returns HTTP 5xx errors for more than 5% of all requests over a 5-minute window. This indicates a systemic backend failure affecting multiple users.

**Possible causes**:

- Database connection pool exhaustion
- Unhandled exceptions in application code
- Downstream service failure (Redis, external APIs)
- Memory exhaustion or OOM kills

**Immediate actions**:

1. Check `/health` endpoint for dependency status
2. Review recent deployments (rollback if deployed within last 30 minutes)
3. Check database and Redis connectivity
4. Review application logs for stack traces

---

### 2. Response Time P95 — Critical

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| **ID**        | `alert-response-time-p95`              |
| **Name**      | P95 Response Time Critical             |
| **Metric**    | `api.response_time.p95` (milliseconds) |
| **Condition** | Greater than (`gt`)                    |
| **Threshold** | 2000 (2 seconds)                       |
| **Duration**  | 5 minutes (sustained)                  |
| **Severity**  | `critical`                             |
| **Channels**  | `email`, `telegram`                    |

**Description**: Triggers when the 95th percentile API response time exceeds 2 seconds for 5 consecutive minutes. This means at least 5% of users are experiencing unacceptable latency.

**Possible causes**:

- Slow database queries (missing indexes, lock contention)
- Redis cache misses causing database overload
- Network latency between services
- CPU saturation on API server

**Immediate actions**:

1. Check database slow query log (queries > 1s)
2. Verify Redis cache hit ratio
3. Check API server CPU and memory usage
4. Review connection pool utilization

---

### 3. Database Connection Pool Usage — Critical

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| **ID**        | `alert-db-connection-pool`               |
| **Name**      | Database Connection Pool High Usage      |
| **Metric**    | `database.connection_pool.usage_percent` |
| **Condition** | Greater than (`gt`)                      |
| **Threshold** | 80%                                      |
| **Duration**  | Immediate (no sustained window required) |
| **Severity**  | `critical`                               |
| **Channels**  | `email`, `telegram`                      |

**Description**: Triggers when database connection pool utilization exceeds 80%. With a pool size of 10 connections (configured for 1 event / ≤500 guests), this means 8+ connections are in use simultaneously, leaving minimal headroom.

**Possible causes**:

- Long-running queries holding connections
- Connection leaks in application code
- Sudden traffic spike (e.g., all guests opening invitation simultaneously)
- Deadlocks preventing connection release

**Immediate actions**:

1. Check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND duration > interval '5 seconds'`
2. Look for connection leaks in recent code changes
3. Consider increasing pool size temporarily
4. Kill idle-in-transaction connections if present

---

### 4. Disk Usage — Critical

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| **ID**        | `alert-disk-usage`                       |
| **Name**      | Disk Usage Critical                      |
| **Metric**    | `database.disk.usage_percent`            |
| **Condition** | Greater than (`gt`)                      |
| **Threshold** | 80%                                      |
| **Duration**  | Immediate (no sustained window required) |
| **Severity**  | `critical`                               |
| **Channels**  | `email`, `telegram`                      |

**Description**: Triggers when database disk usage exceeds 80% capacity. If disk fills completely, the database will become read-only or crash.

**Possible causes**:

- WAL files accumulating (replication lag or failed archiving)
- Large data imports without cleanup
- Unvacuumed dead tuples consuming space
- Excessive logging

**Immediate actions**:

1. Check if auto-scaling storage is available and trigger expansion
2. Run `VACUUM FULL` on tables with high dead tuple count
3. Check WAL archiving status
4. Review and clean up old/unused data if applicable

---

## Alert Rule Configuration (JSON)

```json
[
  {
    "id": "alert-api-error-rate",
    "name": "API Error Rate Critical",
    "metric": "api.error_rate",
    "condition": "gt",
    "threshold": 5,
    "duration": "5m",
    "severity": "critical",
    "channels": ["email", "telegram"]
  },
  {
    "id": "alert-response-time-p95",
    "name": "P95 Response Time Critical",
    "metric": "api.response_time.p95",
    "condition": "gt",
    "threshold": 2000,
    "duration": "5m",
    "severity": "critical",
    "channels": ["email", "telegram"]
  },
  {
    "id": "alert-db-connection-pool",
    "name": "Database Connection Pool High Usage",
    "metric": "database.connection_pool.usage_percent",
    "condition": "gt",
    "threshold": 80,
    "duration": "0m",
    "severity": "critical",
    "channels": ["email", "telegram"]
  },
  {
    "id": "alert-disk-usage",
    "name": "Disk Usage Critical",
    "metric": "database.disk.usage_percent",
    "condition": "gt",
    "threshold": 80,
    "duration": "0m",
    "severity": "critical",
    "channels": ["email", "telegram"]
  }
]
```

---

## Notification Channels

All critical alerts are delivered through **minimum 2 channels** to ensure visibility. Notification must arrive within **1 minute** of threshold breach.

### Channel 1: Email

| Setting            | Value                                      |
| ------------------ | ------------------------------------------ |
| **Provider**       | SendGrid / AWS SES / SMTP                  |
| **Recipients**     | `ops-team@{domain}` (distribution list)    |
| **Subject format** | `[CRITICAL] {alert_name} — {metric_value}` |
| **Delivery SLA**   | < 30 seconds                               |

### Channel 2: Telegram

| Setting            | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Bot**            | `@WeddingSaasAlertBot` (custom Telegram bot)                        |
| **Chat**           | Dedicated ops group chat                                            |
| **Message format** | Structured with alert name, current value, threshold, and timestamp |
| **Delivery SLA**   | < 10 seconds                                                        |

### Alternative Channel 2: Slack (if preferred over Telegram)

| Setting            | Value                                      |
| ------------------ | ------------------------------------------ |
| **Workspace**      | Team Slack workspace                       |
| **Channel**        | `#production-alerts`                       |
| **Integration**    | Slack Incoming Webhook                     |
| **Message format** | Rich attachment with severity color coding |
| **Delivery SLA**   | < 10 seconds                               |

### Notification Message Template

```
🚨 CRITICAL ALERT

Alert: {alert_name}
Metric: {metric} = {current_value} (threshold: {threshold})
Duration: Sustained for {duration}
Time: {timestamp} (WIB)
Service: {service_name}

Action Required: Check runbook at docs/operations/operational-runbook.md
Dashboard: {monitoring_dashboard_url}
```

---

## Escalation Procedures

### Escalation Levels

| Level  | Timeframe | Action                                     | Contact                |
| ------ | --------- | ------------------------------------------ | ---------------------- |
| **L1** | 0–5 min   | Auto-notification via email + Telegram     | On-call engineer       |
| **L2** | 5–15 min  | If not acknowledged, escalate to team lead | Team lead (phone call) |
| **L3** | 15–30 min | If unresolved, escalate to platform admin  | Platform administrator |
| **L4** | 30+ min   | Incident declared, all hands               | Full engineering team  |

### Acknowledgment Requirements

- L1 responder must acknowledge alert within **5 minutes**
- If not acknowledged, automatic escalation to L2
- All escalations logged in incident tracking system

### On-Call Rotation

- Minimum 1 engineer on-call at all times during event days
- On-call schedule managed via PagerDuty / Opsgenie / manual rotation
- Handoff at 09:00 WIB daily

---

## Platform-Specific Configuration

### Option A: Better Uptime (Recommended for current scale)

Better Uptime provides simple uptime monitoring with multi-channel alerting, suitable for the current 1-event scale.

**Setup steps**:

1. **Create monitors**:
   - HTTP monitor for `https://api.{domain}/health` (interval: 30s)
   - Keyword monitor checking response body contains `"status":"healthy"`

2. **Configure alert rules**:
   - Error rate: Use Better Uptime's incident detection (consecutive failures)
   - Response time: Set response time threshold to 2000ms

3. **Configure notification channels**:
   - Add email integration: `ops-team@{domain}`
   - Add Telegram integration via Better Uptime's Telegram bot
   - Set notification delay to 0 (immediate)

4. **Configure escalation**:
   - Create escalation policy with 5-minute intervals
   - Add team members in escalation order

### Option B: Grafana Cloud (Free tier)

Grafana Cloud free tier includes alerting with support for multiple notification channels.

**Setup steps**:

1. **Data source**: Connect to Railway metrics or use Prometheus remote write from the API server

2. **Alert rules** (Grafana Alerting):

   ```yaml
   # grafana-alert-rules.yaml
   apiVersion: 1
   groups:
     - orgId: 1
       name: production-critical
       folder: Production
       interval: 1m
       rules:
         - uid: api-error-rate
           title: API Error Rate > 5%
           condition: C
           data:
             - refId: A
               queryType: range
               datasourceUid: prometheus
               model:
                 expr: |
                   (sum(rate(http_requests_total{status=~"5.."}[5m])) /
                   sum(rate(http_requests_total[5m]))) * 100
             - refId: C
               queryType: threshold
               conditions:
                 - evaluator:
                     type: gt
                     params: [5]
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: 'API error rate is {{ $value }}%'

         - uid: response-time-p95
           title: P95 Response Time > 2s
           condition: C
           data:
             - refId: A
               queryType: range
               datasourceUid: prometheus
               model:
                 expr: |
                   histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
             - refId: C
               queryType: threshold
               conditions:
                 - evaluator:
                     type: gt
                     params: [2]
           for: 5m
           labels:
             severity: critical

         - uid: db-connection-pool
           title: DB Connection Pool > 80%
           condition: C
           data:
             - refId: A
               queryType: range
               datasourceUid: prometheus
               model:
                 expr: |
                   (pg_stat_activity_count / pg_settings_max_connections) * 100
             - refId: C
               queryType: threshold
               conditions:
                 - evaluator:
                     type: gt
                     params: [80]
           for: 0m
           labels:
             severity: critical

         - uid: disk-usage
           title: Disk Usage > 80%
           condition: C
           data:
             - refId: A
               queryType: range
               datasourceUid: prometheus
               model:
                 expr: |
                   (pg_database_size_bytes / pg_tablespace_size_bytes) * 100
             - refId: C
               queryType: threshold
               conditions:
                 - evaluator:
                     type: gt
                     params: [80]
           for: 0m
           labels:
             severity: critical
   ```

3. **Contact points**:
   - Email: Configure SMTP or Grafana Cloud email
   - Telegram: Use Grafana's built-in Telegram integration (Bot Token + Chat ID)

4. **Notification policies**:
   - Route all `severity: critical` alerts to both email and Telegram contact points
   - Set group wait: 30s, group interval: 5m, repeat interval: 4h

### Option C: Railway Metrics + Cloudflare Analytics (Built-in)

Use platform-native monitoring for basic alerting without additional services.

**Railway**:

- Monitor service health via Railway dashboard
- Set up webhook notifications for service crashes/restarts
- Limited custom metric alerting (use for deployment status)

**Cloudflare Analytics** (via Cloudflare Observability MCP):

- Monitor request rates, error rates, and response times at the edge
- Configure Cloudflare Notifications for:
  - Origin error rate spike
  - Traffic anomaly detection
  - SSL certificate expiry

**Limitations**: Platform-native tools have limited custom alerting. Recommended to supplement with Better Uptime or Grafana Cloud for the specific thresholds defined in this document.

---

## Suppression and Maintenance Windows

### Alert Suppression Rules

- **During deployments**: Suppress alerts for 3 minutes post-deployment (health check window)
- **During maintenance**: Create maintenance window in alerting platform before planned work
- **Flapping prevention**: Require threshold breach for full duration before firing (already configured via `duration` field)

### False Positive Prevention

Per requirement 9.5, alerts should only fire for genuine metric threshold violations, not configuration errors or system issues:

- Health check endpoint validates actual dependency connectivity (not just config)
- Alert conditions use sustained duration windows to filter transient spikes
- Connection pool metric measures actual active connections, not configured maximum

---

## Metrics Collection

For these alert rules to function, the following metrics must be collected and exposed:

| Metric                                   | Source                     | Collection Method                   |
| ---------------------------------------- | -------------------------- | ----------------------------------- |
| `api.error_rate`                         | Fastify API server         | Request hook counting 5xx responses |
| `api.response_time.p95`                  | Fastify API server         | Response time histogram             |
| `database.connection_pool.usage_percent` | PgBouncer / Prisma metrics | Pool stats query                    |
| `database.disk.usage_percent`            | Supabase / PostgreSQL      | `pg_database_size()`                |

### Exposing Metrics from Fastify

The API server should expose a `/metrics` endpoint (Prometheus format) or push metrics to the monitoring platform. Key implementation points:

```typescript
// packages/api/src/plugins/metrics.ts (conceptual)
// Track request count by status code for error rate calculation
// Track response time histogram for p95 calculation
// Track active database connections for pool usage
```

---

## Requirements Traceability

| Alert Rule                         | Requirement |
| ---------------------------------- | ----------- |
| API Error Rate > 5% (5 min)        | 9.4         |
| P95 Response Time > 2s (5 min)     | 9.4         |
| Connection Pool > 80%              | 9.4         |
| Disk Usage > 80%                   | 9.4, 4.10   |
| Multi-channel notification < 1 min | 9.5         |

---

## Review Schedule

- **Monthly**: Review alert thresholds based on observed traffic patterns
- **Post-incident**: Adjust thresholds if alerts fired too late or too early
- **Pre-event**: Verify all alert channels are functional (send test alert)
- **Quarterly**: Review escalation contacts and on-call rotation
