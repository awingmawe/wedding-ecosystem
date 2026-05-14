# =============================================================================
# Cloudflare WAF and DDoS Protection Configuration
# Wedding Digital SaaS Platform - Production Deployment
# =============================================================================
# Requirements: 1.4, 1.5, 1.6
# - WAF with OWASP Top 10 managed ruleset (SQL injection, XSS, path traversal)
# - DDoS protection at network and application layers (≥10 Gbps)
# - WAF logging for blocked requests with attack pattern details
# =============================================================================

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
  }
}

# =============================================================================
# Variables
# =============================================================================

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone and WAF permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the production domain"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "domain" {
  description = "Production domain name (e.g., weddingdigital.id)"
  type        = string
}

variable "notification_email" {
  description = "Email address for WAF/DDoS alert notifications"
  type        = string
}

# =============================================================================
# Provider Configuration
# =============================================================================

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# WAF Managed Rulesets - OWASP Top 10 Protection
# =============================================================================

# Enable Cloudflare Managed Ruleset (includes OWASP Core Rule Set)
resource "cloudflare_ruleset" "waf_managed_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "Wedding Digital WAF - Managed Rules"
  description = "OWASP Top 10 protection for production environment"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  # Cloudflare Managed Ruleset - General protection
  rules {
    action = "execute"
    action_parameters {
      id      = "efb7b8c949ac4650a09736fc376e9aee" # Cloudflare Managed Ruleset
      version = "latest"
    }
    expression  = "true"
    description = "Execute Cloudflare Managed Ruleset"
    enabled     = true
  }

  # OWASP Core Rule Set - Comprehensive OWASP Top 10 protection
  rules {
    action = "execute"
    action_parameters {
      id      = "4814384a9e5d4991b9815dcfc25d2f1f" # Cloudflare OWASP Core Ruleset
      version = "latest"

      # Configure OWASP anomaly scoring threshold
      overrides {
        rules {
          id              = "6179ae15870a4bb7b2d480d4c56f7165" # Anomaly Score threshold
          action          = "block"
          score_threshold = 25 # Block when anomaly score reaches 25+
        }

        # Paranoia Level 1 (default, balanced detection)
        rules {
          id      = "paranoia_level_1"
          enabled = true
        }

        # Paranoia Level 2 (additional rules for higher security)
        rules {
          id      = "paranoia_level_2"
          enabled = true
        }
      }
    }
    expression  = "true"
    description = "Execute OWASP Core Ruleset with anomaly scoring"
    enabled     = true
  }
}

# =============================================================================
# Custom WAF Rules - Application-Specific Protection
# =============================================================================

resource "cloudflare_ruleset" "waf_custom_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "Wedding Digital WAF - Custom Rules"
  description = "Custom WAF rules for application-specific attack patterns"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # Block SQL Injection attempts on API endpoints
  rules {
    action      = "block"
    expression  = "(http.request.uri.path contains \"/api/\") and (http.request.uri.query contains \"UNION\" or http.request.uri.query contains \"SELECT\" or http.request.uri.query contains \"DROP\" or http.request.uri.query contains \"INSERT\" or http.request.uri.query contains \"DELETE\" or http.request.uri.query contains \"UPDATE\" or http.request.uri.query contains \"--\" or http.request.uri.query contains \"/*\")"
    description = "Block SQL injection patterns in API query strings"
    enabled     = true
  }

  # Block XSS attempts in request body and query parameters
  rules {
    action      = "block"
    expression  = "(http.request.uri.query contains \"<script\" or http.request.uri.query contains \"javascript:\" or http.request.uri.query contains \"onerror=\" or http.request.uri.query contains \"onload=\" or http.request.uri.query contains \"eval(\")"
    description = "Block XSS patterns in query parameters"
    enabled     = true
  }

  # Block path traversal attempts
  rules {
    action      = "block"
    expression  = "(http.request.uri.path contains \"../\" or http.request.uri.path contains \"..\\\\\" or http.request.uri.path contains \"/etc/passwd\" or http.request.uri.path contains \"/proc/self\")"
    description = "Block path traversal attempts"
    enabled     = true
  }

  # Block requests with suspicious user agents (common attack tools)
  rules {
    action      = "block"
    expression  = "(http.user_agent contains \"sqlmap\" or http.user_agent contains \"nikto\" or http.user_agent contains \"nmap\" or http.user_agent contains \"masscan\" or http.user_agent contains \"dirbuster\")"
    description = "Block known attack tool user agents"
    enabled     = true
  }

  # Rate limit authentication endpoints (additional layer beyond app-level)
  rules {
    action      = "block"
    expression  = "(http.request.uri.path contains \"/api/auth/login\" or http.request.uri.path contains \"/api/auth/register\") and (cf.threat_score gt 14)"
    description = "Block high-threat-score requests to auth endpoints"
    enabled     = true
  }
}

# =============================================================================
# DDoS Protection Configuration
# =============================================================================

# Network-layer DDoS protection (L3/L4) - Enabled by default on Cloudflare
# Application-layer DDoS protection (L7) - Custom configuration below

resource "cloudflare_ruleset" "ddos_l7_protection" {
  zone_id     = var.cloudflare_zone_id
  name        = "Wedding Digital DDoS - L7 Protection"
  description = "Application-layer DDoS protection rules"
  kind        = "zone"
  phase       = "ddos_l7"

  # HTTP DDoS Attack Protection - Override sensitivity to high
  rules {
    action = "execute"
    action_parameters {
      id      = "4d21379b4f9f4bb088e0729962c8b3cf" # Cloudflare HTTP DDoS Attack Protection
      version = "latest"

      overrides {
        # Set sensitivity to high for all HTTP DDoS rules
        sensitivity_level = "high"

        rules {
          # HTTP flood protection
          id              = "http_flood"
          action          = "block"
          sensitivity_level = "high"
        }
      }
    }
    expression  = "true"
    description = "HTTP DDoS Attack Protection with high sensitivity"
    enabled     = true
  }
}

# Advanced Rate Limiting for DDoS mitigation at application layer
resource "cloudflare_rate_limit" "api_rate_limit" {
  zone_id   = var.cloudflare_zone_id
  threshold = 1000 # requests per period
  period    = 60   # seconds

  match {
    request {
      url_pattern = "${var.domain}/api/*"
      schemes     = ["HTTPS"]
      methods     = ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }

    response {
      statuses = [200, 201, 204, 301, 400, 401, 403, 404, 429, 500]
    }
  }

  action {
    mode    = "ban"
    timeout = 300 # 5 minutes ban
    response {
      content_type = "application/json"
      body         = "{\"error\":\"Rate limit exceeded. Please try again later.\",\"code\":\"RATE_LIMITED\"}"
    }
  }

  disabled    = false
  description = "API endpoint DDoS rate limiting - 1000 req/min per IP"
}

# Stricter rate limit for authentication endpoints
resource "cloudflare_rate_limit" "auth_rate_limit" {
  zone_id   = var.cloudflare_zone_id
  threshold = 30 # requests per period
  period    = 60 # seconds

  match {
    request {
      url_pattern = "${var.domain}/api/auth/*"
      schemes     = ["HTTPS"]
      methods     = ["POST"]
    }
  }

  action {
    mode    = "ban"
    timeout = 600 # 10 minutes ban
    response {
      content_type = "application/json"
      body         = "{\"error\":\"Too many authentication attempts. Please try again later.\",\"code\":\"AUTH_RATE_LIMITED\"}"
    }
  }

  disabled    = false
  description = "Authentication endpoint rate limiting - 30 req/min per IP"
}

# =============================================================================
# WAF Logging Configuration
# =============================================================================

# Logpush job for WAF events - captures blocked requests with attack details
resource "cloudflare_logpush_job" "waf_logs" {
  zone_id          = var.cloudflare_zone_id
  name             = "wedding-digital-waf-logs"
  enabled          = true
  dataset          = "firewall_events"
  frequency        = "high" # Near real-time log delivery
  logpull_options  = "fields=Action,ClientASN,ClientCountry,ClientIP,ClientRequestHost,ClientRequestMethod,ClientRequestPath,ClientRequestQuery,ClientRequestUserAgent,Datetime,EdgeColoCode,Kind,MatchIndex,Metadata,OriginResponseStatus,OwnerID,RayID,RuleID,RulesetID,Source&timestamps=rfc3339"

  # Destination: R2 bucket for log storage (cost-effective, Cloudflare-native)
  destination_conf = "r2://${var.cloudflare_account_id}/wedding-digital-waf-logs/date={DATE}?account-id=${var.cloudflare_account_id}&access-key-id=${var.r2_access_key_id}&secret-access-key=${var.r2_secret_access_key}"

  # Filter to capture only WAF-related events (blocks, challenges, managed challenges)
  filter = "{\"where\":{\"and\":[{\"key\":\"Action\",\"operator\":\"in\",\"value\":[\"block\",\"challenge\",\"managed_challenge\",\"js_challenge\"]}]}}"
}

# Additional variables for log storage
variable "r2_access_key_id" {
  description = "R2 access key ID for WAF log storage bucket"
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "R2 secret access key for WAF log storage bucket"
  type        = string
  sensitive   = true
}

# Logpush job for DDoS events
resource "cloudflare_logpush_job" "ddos_logs" {
  zone_id          = var.cloudflare_zone_id
  name             = "wedding-digital-ddos-logs"
  enabled          = true
  dataset          = "firewall_events"
  frequency        = "high"
  logpull_options  = "fields=Action,ClientASN,ClientCountry,ClientIP,ClientRequestHost,ClientRequestMethod,ClientRequestPath,Datetime,EdgeColoCode,Kind,RayID,RuleID,Source&timestamps=rfc3339"

  destination_conf = "r2://${var.cloudflare_account_id}/wedding-digital-ddos-logs/date={DATE}?account-id=${var.cloudflare_account_id}&access-key-id=${var.r2_access_key_id}&secret-access-key=${var.r2_secret_access_key}"

  filter = "{\"where\":{\"and\":[{\"key\":\"Source\",\"operator\":\"eq\",\"value\":\"l7ddos\"}]}}"
}

# =============================================================================
# Notification Policy for WAF/DDoS Alerts
# =============================================================================

resource "cloudflare_notification_policy" "waf_alert" {
  account_id  = var.cloudflare_account_id
  name        = "WAF Block Alert - Wedding Digital"
  description = "Alert when WAF blocks exceed threshold"
  enabled     = true
  alert_type  = "advanced_http_alert_error"

  filters {
    zones   = [var.cloudflare_zone_id]
    actions = ["block"]
  }

  email_integration {
    id = var.notification_email
  }
}

resource "cloudflare_notification_policy" "ddos_alert" {
  account_id  = var.cloudflare_account_id
  name        = "DDoS Attack Alert - Wedding Digital"
  description = "Alert when DDoS attack is detected and mitigated"
  enabled     = true
  alert_type  = "dos_attack_l7"

  filters {
    zones = [var.cloudflare_zone_id]
  }

  email_integration {
    id = var.notification_email
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "waf_ruleset_id" {
  description = "ID of the WAF managed ruleset"
  value       = cloudflare_ruleset.waf_managed_rules.id
}

output "custom_rules_id" {
  description = "ID of the custom WAF rules"
  value       = cloudflare_ruleset.waf_custom_rules.id
}

output "ddos_ruleset_id" {
  description = "ID of the DDoS L7 protection ruleset"
  value       = cloudflare_ruleset.ddos_l7_protection.id
}

output "waf_logpush_job_id" {
  description = "ID of the WAF logpush job"
  value       = cloudflare_logpush_job.waf_logs.id
}
