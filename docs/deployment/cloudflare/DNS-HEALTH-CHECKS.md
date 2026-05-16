# DNS Health Checks and Failover Configuration

## Overview

This document describes the Cloudflare Load Balancer health check and automatic failover configuration for the Wedding Digital SaaS API. The setup ensures high availability by detecting primary endpoint failures within 30 seconds and automatically routing traffic to a secondary endpoint.

**Requirements covered:**

- **11.3**: DNS health check that auto-failover when primary unresponsive for 30 seconds
- **11.5**: Load balancer health check interval 10 seconds, threshold 3 consecutive failures

## Architecture

```
                    ┌─────────────────────────────────┐
                    │     Cloudflare Load Balancer     │
                    │     api.weddingdigital.id        │
                    │     Steering: Off (Failover)     │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────────┐
                    │                                  │
           ┌────────▼────────┐              ┌─────────▼────────┐
           │  Primary Pool   │              │  Secondary Pool  │
           │  (Active)       │              │  (Passive)       │
           └────────┬────────┘              └─────────┬────────┘
                    │                                  │
           ┌────────▼────────┐              ┌─────────▼────────┐
           │  Railway API    │              │  Railway API     │
           │  (Primary)      │              │  (Failover)      │
           │  GET /health    │              │  GET /health     │
           └─────────────────┘              └──────────────────┘
                    │
           ┌────────▼────────┐
           │  Health Monitor │
           │  Interval: 10s  │
           │  Threshold: 3   │
           │  Timeout: 5s    │
           └─────────────────┘
```

## Health Monitor Configuration

| Parameter        | Value      | Rationale                                  |
| ---------------- | ---------- | ------------------------------------------ |
| Type             | HTTPS      | Secure health check over TLS               |
| Method           | GET        | Standard health check method               |
| Path             | `/health`  | API health endpoint (checks DB, Redis, WS) |
| Port             | 443        | Standard HTTPS port                        |
| Interval         | 10 seconds | Req 11.5: check every 10 seconds           |
| Timeout          | 5 seconds  | Generous timeout for health endpoint       |
| Consecutive Down | 3          | Req 11.5: 3 failures before unhealthy      |
| Consecutive Up   | 2          | 2 successes before marking healthy again   |
| Expected Codes   | 200        | /health returns 200 when all deps are up   |
| Follow Redirects | true       | Handle any redirect chains                 |
| Allow Insecure   | false      | Require valid SSL certificate              |

### Failover Timing Calculation

```
Failover detection time = interval × consecutive_down
                        = 10s × 3
                        = 30 seconds
```

This satisfies **Requirement 11.3**: failover activates when primary is unresponsive for 30 seconds.

## Origin Pool Configuration

### Primary Pool (`wedding-api-primary`)

- **Origin**: Railway production API endpoint
- **Weight**: 1.0 (receives all traffic when healthy)
- **Monitor**: Shared health monitor (10s interval, 3 failures threshold)
- **Check Regions**: SEAS (Southeast Asia), EAF (East Africa)
- **Minimum Origins**: 1

### Secondary Pool (`wedding-api-secondary`)

- **Origin**: Railway failover API endpoint
- **Weight**: 1.0 (receives all traffic during failover)
- **Monitor**: Same health monitor as primary
- **Check Regions**: SEAS, EAF
- **Minimum Origins**: 1

## Load Balancer Configuration

| Parameter        | Value                 | Rationale                                |
| ---------------- | --------------------- | ---------------------------------------- |
| Hostname         | `api.{domain}`        | API subdomain                            |
| Steering Policy  | Off                   | Active-passive failover                  |
| Session Affinity | None                  | Stateless API, no sticky sessions needed |
| TTL              | 30 seconds            | Low TTL for fast failover propagation    |
| Proxied          | true                  | Traffic flows through Cloudflare         |
| Adaptive Routing | Failover across pools | Zero-downtime failover                   |

### Failover Behavior

1. **Normal operation**: All traffic routes to the primary pool
2. **Primary failure detected**: After 3 consecutive health check failures (30s), primary pool marked unhealthy
3. **Automatic failover**: Traffic immediately routes to secondary pool
4. **Recovery**: After 2 consecutive health check successes on primary, traffic returns to primary pool

## MCP Limitation Note

The Cloudflare Bindings MCP does not support Load Balancer, Health Monitor, or Pool management directly. Configuration must be done via:

1. **Terraform** (recommended for IaC): `terraform/cloudflare-health-checks.tf`
2. **Shell script** (for manual/CI setup): `scripts/configure-health-checks.sh`
3. **Cloudflare Dashboard**: Load Balancing section

## Setup Instructions

### Option 1: Terraform (Recommended)

```bash
cd docs/deployment/cloudflare

# Copy and fill in variables
cp terraform.tfvars.example terraform.tfvars
# Add these variables to terraform.tfvars:
#   primary_origin   = "your-primary-railway-app.railway.app"
#   secondary_origin = "your-secondary-railway-app.railway.app"

# Initialize and apply
terraform init
terraform plan -target=module.health_checks
terraform apply -target=module.health_checks
```

### Option 2: Shell Script

```bash
cd docs/deployment/cloudflare/scripts

# Set environment variables
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="weddingdigital.id"
export PRIMARY_ORIGIN="primary-api.railway.app"
export SECONDARY_ORIGIN="secondary-api.railway.app"

# Run configuration
chmod +x configure-health-checks.sh
./configure-health-checks.sh

# Verify
chmod +x verify-health-checks.sh
./verify-health-checks.sh
```

### Required API Token Permissions

The Cloudflare API token needs these permissions:

- `Load Balancing: Monitors and Pools Write`
- `Load Balancers Write`
- `Zone: Read` (to access zone-level load balancers)

## Verification

After setup, verify the configuration:

```bash
./scripts/verify-health-checks.sh
```

The verification script checks:

- Health monitor exists with correct interval (10s) and threshold (3)
- Primary and secondary pools exist and are enabled
- Load balancer exists with failover steering policy
- Adaptive routing (failover across pools) is enabled
- Failover detection time ≤ 30 seconds

## Monitoring and Alerts

Health check state changes trigger email notifications to the configured notification email. Events to watch for:

- **Pool health changed**: Primary pool went unhealthy/healthy
- **Origin health changed**: Individual origin status change
- **Load balancer failover**: Traffic shifted between pools

These events are also visible in:

- Cloudflare Dashboard → Traffic → Load Balancing → Analytics
- Cloudflare API: `GET /accounts/{account_id}/load_balancers/events`

## Railway Secondary Endpoint Setup

For the failover to work, you need a secondary Railway deployment:

1. Create a second Railway service in the same project (or a separate project)
2. Deploy the same API code to the secondary service
3. Ensure the secondary service connects to the same database (read replica or primary)
4. Configure the secondary service with the same environment variables
5. Use the secondary service's public URL as `SECONDARY_ORIGIN`

**Note**: At current scale (1 event, ≤500 guests), the secondary can be a cold standby that shares the same database. For higher scale, consider a read replica setup.

## Terraform Variables Reference

Add these to `terraform.tfvars`:

```hcl
# Health Check & Failover (Task 14.2)
primary_origin     = "wedding-api-primary.railway.app"
secondary_origin   = "wedding-api-secondary.railway.app"
notification_email = "ops@weddingdigital.id"
```
