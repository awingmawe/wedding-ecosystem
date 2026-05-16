# Cloudflare Load Balancer Health Checks and Failover Configuration
# Terraform configuration for DNS health monitoring and automatic failover
#
# Requirements covered:
# - 11.3: DNS health check that auto-failover when primary unresponsive for 30 seconds
# - 11.5: Load balancer health check interval 10 seconds, threshold 3 consecutive failures
#
# How failover timing works:
#   interval=10s × consecutive_down=3 = 30 seconds to detect failure
#   This satisfies Requirement 11.3 (failover within 30 seconds of unresponsiveness)

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Variables (shared with other Cloudflare Terraform configs)
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Load Balancing: Monitors and Pools Write permissions"
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
  description = "Production domain (e.g., weddingdigital.id)"
  type        = string
}

variable "primary_origin" {
  description = "Primary API origin address (Railway production endpoint)"
  type        = string
}

variable "secondary_origin" {
  description = "Secondary/failover API origin address (Railway failover endpoint)"
  type        = string
}

variable "notification_email" {
  description = "Email address for health check notifications"
  type        = string
  default     = "ops@weddingdigital.id"
}

# Provider configuration
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# Health Monitor
# Checks the /health endpoint every 10 seconds
# Marks unhealthy after 3 consecutive failures (= 30 seconds)
# =============================================================================
resource "cloudflare_load_balancer_monitor" "api_health_check" {
  account_id = var.cloudflare_account_id

  # Monitor type and endpoint
  type        = "https"
  method      = "GET"
  path        = "/health"
  port        = 443
  description = "Wedding Digital API Health Monitor - /health endpoint"

  # Timing configuration (Req 11.5)
  # interval × consecutive_down = 10s × 3 = 30s failover detection (Req 11.3)
  interval = 10 # Check every 10 seconds
  timeout  = 5  # 5-second timeout per check

  # Failure/recovery thresholds (Req 11.5)
  retries          = 0 # No retries within a single check (rely on consecutive_down)
  consecutive_down = 3 # 3 consecutive failures = mark unhealthy (30s total)
  consecutive_up   = 2 # 2 consecutive successes = mark healthy again

  # Expected response
  expected_codes = "200" # /health returns 200 when all dependencies are up
  expected_body  = ""    # No body check needed; status code is sufficient

  # Request headers
  header {
    header = "Host"
    values = ["api.${var.domain}"]
  }

  header {
    header = "User-Agent"
    values = ["Cloudflare-Health-Monitor/1.0"]
  }

  # TLS configuration
  allow_insecure   = false # Require valid SSL certificate
  follow_redirects = true  # Follow redirects if any
}

# =============================================================================
# Primary Origin Pool
# Contains the primary Railway API endpoint
# =============================================================================
resource "cloudflare_load_balancer_pool" "primary" {
  account_id = var.cloudflare_account_id

  name        = "wedding-api-primary"
  description = "Primary API pool - Railway production endpoint"
  enabled     = true

  # Minimum healthy origins before pool is marked down
  minimum_origins = 1

  # Monitor assignment
  monitor = cloudflare_load_balancer_monitor.api_health_check.id

  # Health check regions (APAC for Indonesia-focused platform)
  check_regions = ["SEAS", "EAF"]

  # Primary origin endpoint
  origins {
    name    = "railway-primary"
    address = var.primary_origin
    enabled = true
    weight  = 1.0

    header {
      header = "Host"
      values = ["api.${var.domain}"]
    }
  }

  # Notification settings
  notification_email = var.notification_email
}

# =============================================================================
# Secondary/Failover Origin Pool
# Contains the secondary Railway API endpoint for failover
# =============================================================================
resource "cloudflare_load_balancer_pool" "secondary" {
  account_id = var.cloudflare_account_id

  name        = "wedding-api-secondary"
  description = "Secondary API pool - Railway failover endpoint"
  enabled     = true

  # Minimum healthy origins before pool is marked down
  minimum_origins = 1

  # Same monitor for consistent health checking
  monitor = cloudflare_load_balancer_monitor.api_health_check.id

  # Health check regions
  check_regions = ["SEAS", "EAF"]

  # Secondary origin endpoint
  origins {
    name    = "railway-secondary"
    address = var.secondary_origin
    enabled = true
    weight  = 1.0

    header {
      header = "Host"
      values = ["api.${var.domain}"]
    }
  }

  # Notification settings
  notification_email = var.notification_email
}

# =============================================================================
# Load Balancer
# Active-passive failover: primary pool → secondary pool
# Traffic steering: Off (failover mode)
# =============================================================================
resource "cloudflare_load_balancer" "api" {
  zone_id = var.cloudflare_zone_id

  name        = "api.${var.domain}"
  description = "Wedding Digital API Load Balancer with failover"
  enabled     = true
  proxied     = true

  # Failover pool order: primary first, secondary as fallback
  default_pool_ids = [
    cloudflare_load_balancer_pool.primary.id,
    cloudflare_load_balancer_pool.secondary.id,
  ]

  # Fallback pool (last resort if all pools are down)
  fallback_pool_id = cloudflare_load_balancer_pool.secondary.id

  # Traffic steering: Off = pure failover (active-passive)
  # Traffic goes to primary until it fails, then switches to secondary
  steering_policy = "off"

  # DNS TTL (seconds) — low for fast failover propagation
  ttl = 30

  # Session affinity for WebSocket compatibility
  session_affinity = "none"

  # Adaptive routing: enable failover across pools for zero-downtime
  adaptive_routing {
    failover_across_pools = true
  }

  # Rules for custom failover behavior (optional)
  # Uncomment to add geo-steering or custom rules
  # rules { ... }
}

# =============================================================================
# Outputs
# =============================================================================
output "monitor_id" {
  description = "Health monitor ID"
  value       = cloudflare_load_balancer_monitor.api_health_check.id
}

output "primary_pool_id" {
  description = "Primary origin pool ID"
  value       = cloudflare_load_balancer_pool.primary.id
}

output "secondary_pool_id" {
  description = "Secondary origin pool ID"
  value       = cloudflare_load_balancer_pool.secondary.id
}

output "load_balancer_id" {
  description = "Load balancer ID"
  value       = cloudflare_load_balancer.api.id
}

output "health_check_summary" {
  description = "Health check configuration summary"
  value = {
    endpoint         = "/health"
    interval         = "10 seconds"
    timeout          = "5 seconds"
    consecutive_down = "3 failures (30s to detect)"
    consecutive_up   = "2 successes to recover"
    expected_code    = "200"
    failover_mode    = "Active-Passive"
    failover_time    = "≤30 seconds (Req 11.3)"
  }
}
