# Cloudflare WAF & DDoS Protection Configuration

## Overview

This document describes the Cloudflare WAF (Web Application Firewall) and DDoS protection configuration for the Wedding Digital SaaS platform production environment.

**Requirements covered:**

- **1.4** — WAF blocking OWASP Top 10 attack patterns (SQL injection, XSS, path traversal)
- **1.5** — WAF logging blocked requests with attack pattern details to security log
- **1.6** — DDoS protection at network and application layers (≥10 Gbps capacity)

---

## Architecture

```
Internet Traffic
       │
       ▼
┌─────────────────────────────┐
│  Cloudflare Edge Network    │
│  ┌───────────────────────┐  │
│  │ DDoS Protection (L3/4)│  │  ← Network-layer: auto-enabled, ≥10 Gbps
│  └───────────┬───────────┘  │
│              ▼              │
│  ┌───────────────────────┐  │
│  │ DDoS Protection (L7)  │  │  ← Application-layer: high sensitivity
│  └───────────┬───────────┘  │
│              ▼              │
│  ┌───────────────────────┐  │
│  │ WAF Managed Rulesets  │  │  ← OWASP Core Rule Set + Cloudflare Managed
│  └───────────┬───────────┘  │
│              ▼              │
│  ┌───────────────────────┐  │
│  │ Custom WAF Rules      │  │  ← Application-specific patterns
│  └───────────┬───────────┘  │
│              ▼              │
│  ┌───────────────────────┐  │
│  │ Rate Limiting         │  │  ← Per-endpoint rate limits
│  └───────────┬───────────┘  │
└──────────────┼──────────────┘
               ▼
        Origin Server (Railway)
```

---

## WAF Configuration

### Managed Rulesets

#### 1. Cloudflare Managed Ruleset

- **Ruleset ID:** `efb7b8c949ac4650a09736fc376e9aee`
- **Action:** Execute (block matching requests)
- **Coverage:** General web attack patterns maintained by Cloudflare security team
- **Updates:** Automatically updated by Cloudflare

#### 2. OWASP Core Rule Set (CRS)

- **Ruleset ID:** `4814384a9e5d4991b9815dcfc25d2f1f`
- **Anomaly Scoring Threshold:** 25 (block when score reaches 25+)
- **Paranoia Level:** 2 (balanced between detection and false positives)
- **Coverage:**
  - SQL Injection (SQLi)
  - Cross-Site Scripting (XSS)
  - Path Traversal / Local File Inclusion (LFI)
  - Remote File Inclusion (RFI)
  - Remote Code Execution (RCE)
  - PHP Injection
  - HTTP Protocol Violations
  - Session Fixation
  - Scanner/Bot Detection

### Custom WAF Rules

| Rule                | Pattern                                                           | Action | Description                                   |
| ------------------- | ----------------------------------------------------------------- | ------ | --------------------------------------------- |
| SQL Injection (API) | `UNION`, `SELECT`, `DROP`, `--`, `/*` in query params on `/api/*` | Block  | Catches SQLi attempts targeting API endpoints |
| XSS (Query Params)  | `<script`, `javascript:`, `onerror=`, `eval(` in query params     | Block  | Catches reflected XSS attempts                |
| Path Traversal      | `../`, `..\\`, `/etc/passwd`, `/proc/self` in URI path            | Block  | Prevents directory traversal attacks          |
| Attack Tools        | User agents: `sqlmap`, `nikto`, `nmap`, `masscan`, `dirbuster`    | Block  | Blocks known penetration testing tools        |
| High-Threat Auth    | Threat score > 14 on `/api/auth/*` endpoints                      | Block  | Extra protection for authentication           |

---

## DDoS Protection

### Network Layer (L3/L4)

- **Capacity:** Cloudflare's global network provides 209+ Tbps of DDoS mitigation capacity
- **Protection:** Automatically enabled for all Cloudflare-proxied domains
- **Attacks mitigated:** SYN floods, UDP floods, ICMP floods, amplification attacks
- **Minimum capacity:** Well exceeds the 10 Gbps requirement

### Application Layer (L7)

- **Sensitivity:** High (detects lower-volume application-layer attacks)
- **HTTP Flood Protection:** Enabled with automatic detection and mitigation
- **Adaptive protection:** Machine learning-based detection of anomalous traffic patterns

### Rate Limiting (DDoS Mitigation Layer)

| Endpoint Pattern | Threshold | Period | Ban Duration | Purpose                              |
| ---------------- | --------- | ------ | ------------ | ------------------------------------ |
| `/api/*`         | 1000 req  | 60s    | 5 minutes    | General API DDoS protection          |
| `/api/auth/*`    | 30 req    | 60s    | 10 minutes   | Auth endpoint brute-force protection |

---

## WAF Logging

### Log Destination

- **Storage:** Cloudflare R2 bucket (`wedding-digital-waf-logs`)
- **Format:** JSON (structured)
- **Delivery:** Near real-time (high frequency)
- **Retention:** 30 days (aligned with observability stack requirement)

### Logged Fields

| Field                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `Action`                 | What action was taken (block, challenge, managed_challenge)  |
| `ClientASN`              | Client's Autonomous System Number                            |
| `ClientCountry`          | Client's country code                                        |
| `ClientIP`               | Client's IP address                                          |
| `ClientRequestHost`      | Requested hostname                                           |
| `ClientRequestMethod`    | HTTP method (GET, POST, etc.)                                |
| `ClientRequestPath`      | Request URI path                                             |
| `ClientRequestQuery`     | Query string parameters                                      |
| `ClientRequestUserAgent` | Client's User-Agent header                                   |
| `Datetime`               | Timestamp of the event (RFC 3339)                            |
| `EdgeColoCode`           | Cloudflare edge location that handled the request            |
| `Kind`                   | Type of firewall event                                       |
| `MatchIndex`             | Index of the rule that matched                               |
| `Metadata`               | Additional metadata about the match (attack pattern details) |
| `OriginResponseStatus`   | Origin server response status (if applicable)                |
| `RayID`                  | Unique Cloudflare request identifier                         |
| `RuleID`                 | ID of the rule that triggered                                |
| `RulesetID`              | ID of the ruleset containing the rule                        |
| `Source`                 | Source of the firewall event (waf, rateLimit, l7ddos)        |

### Log Filters

- **WAF Logs:** Only events with action `block`, `challenge`, `managed_challenge`, or `js_challenge`
- **DDoS Logs:** Only events with source `l7ddos`

### Log Path Structure

```
r2://wedding-digital-waf-logs/date=YYYY-MM-DD/{timestamp}.json
r2://wedding-digital-ddos-logs/date=YYYY-MM-DD/{timestamp}.json
```

---

## Alerting

| Alert             | Trigger                     | Channel | Description                                      |
| ----------------- | --------------------------- | ------- | ------------------------------------------------ |
| WAF Block Alert   | WAF blocks exceed threshold | Email   | Notifies when unusual number of attacks blocked  |
| DDoS Attack Alert | L7 DDoS attack detected     | Email   | Immediate notification of application-layer DDoS |

---

## Deployment Instructions

### Prerequisites

1. Cloudflare account with Pro plan or higher (for WAF managed rulesets)
2. Domain added and proxied through Cloudflare (orange cloud enabled)
3. Terraform >= 1.5 installed
4. Cloudflare API token with permissions:
   - Zone > WAF > Edit
   - Zone > Firewall Services > Edit
   - Zone > Zone Settings > Edit
   - Account > Logs > Edit
   - Account > Notifications > Edit

### Steps

```bash
# 1. Navigate to the configuration directory
cd docs/deployment/cloudflare/

# 2. Copy example variables and fill in actual values
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with actual credentials

# 3. Initialize Terraform
terraform init

# 4. Review the plan
terraform plan

# 5. Apply the configuration
terraform apply

# 6. Verify WAF is active
curl -I https://api.weddingdigital.id/health
# Should see cf-ray header indicating Cloudflare is proxying
```

### Verification

After deployment, verify the configuration:

1. **WAF Active:** Send a test SQL injection request and confirm it's blocked:

   ```bash
   curl -v "https://api.weddingdigital.id/api/test?id=1' OR '1'='1"
   # Expected: 403 Forbidden with Cloudflare block page
   ```

2. **XSS Protection:** Send a test XSS payload:

   ```bash
   curl -v "https://api.weddingdigital.id/api/test?q=<script>alert(1)</script>"
   # Expected: 403 Forbidden
   ```

3. **Path Traversal:** Attempt directory traversal:

   ```bash
   curl -v "https://api.weddingdigital.id/../../etc/passwd"
   # Expected: 403 Forbidden
   ```

4. **WAF Logs Flowing:** Check R2 bucket for log entries after test requests:

   ```bash
   # Using Cloudflare API or Dashboard, verify logs appear in R2 bucket
   # Logs should contain the blocked test requests with attack pattern metadata
   ```

5. **DDoS Protection:** Verify DDoS rules are active in Cloudflare Dashboard:
   - Navigate to Security > DDoS
   - Confirm HTTP DDoS Attack Protection is set to "High" sensitivity

---

## Maintenance

### Regular Tasks

- **Weekly:** Review WAF analytics in Cloudflare Dashboard for false positives
- **Monthly:** Review and tune custom WAF rules based on traffic patterns
- **Quarterly:** Review OWASP ruleset updates and adjust paranoia level if needed

### False Positive Handling

If legitimate requests are being blocked:

1. Identify the blocking rule via WAF logs (check `RuleID` field)
2. Create a WAF exception rule for the specific path/pattern
3. Test the exception doesn't weaken overall security posture
4. Document the exception in this file

### Escalation

- WAF blocks spike > 10x normal: Investigate potential attack, check if legitimate traffic affected
- DDoS alert triggered: Monitor Cloudflare Dashboard, verify mitigation is effective
- False positive affecting users: Create immediate exception, investigate root cause

---

## Related Configuration

- SSL/TLS Configuration: See task 1.3 (`docs/deployment/cloudflare/ssl-tls-configuration.tf`)
- CDN Caching Rules: See task 8.1
- DNS Configuration: See task 14.1
- Security Headers (Application Layer): See `packages/api/src/plugins/security-headers.ts`
- Rate Limiting (Application Layer): See `packages/api/src/plugins/rate-limiter.ts`
