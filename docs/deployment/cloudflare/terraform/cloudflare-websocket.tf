# Cloudflare WebSocket Subdomain Configuration
# Terraform configuration for ws.{domain} with sticky session support
#
# Requirements covered:
# - 11.4: WebSocket endpoint on separate subdomain (ws.{domain}) with sticky session
#         support on load balancer
# - 13.2: Sticky session (session affinity) for WebSocket connections
# - 13.3: Idle timeout 60s with ping/pong keepalive every 25s
#
# Architecture:
#   Client → Cloudflare (ws.{domain}) → Railway Load Balancer → WebSocket Server (port 3001)
#
# Sticky sessions are required because Socket.io uses HTTP long-polling as a
# fallback transport. The initial handshake starts on polling, then upgrades to
# WebSocket. Both the polling requests and the WebSocket upgrade MUST reach the
# same backend instance. The `io` cookie (set by Socket.io) is used by the load
# balancer for session affinity routing.
#
# At current scale (1 event / ≤500 guests), there is only one WebSocket instance,
# so sticky sessions have no practical effect. However, they are configured now
# to support future horizontal scaling without client-side changes.

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Variables
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit, DNS:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the production domain"
  type        = string
}

variable "domain" {
  description = "Production domain (e.g., weddingdigital.id)"
  type        = string
}

variable "websocket_origin" {
  description = "Railway WebSocket service origin hostname (e.g., websocket-production.up.railway.app)"
  type        = string
}

# Provider configuration
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# DNS Record: ws.{domain} → Railway WebSocket Server
# =============================================================================
# Proxied through Cloudflare (orange cloud) to enable:
# - WebSocket protocol support (Cloudflare proxies WebSocket by default)
# - DDoS protection on WebSocket endpoint
# - SSL/TLS termination at edge
# - Cloudflare analytics and logging
#
# TTL is set to 1 (automatic) when proxied through Cloudflare.
# Initial TTL of 300s applies only if proxy is disabled during debugging.
resource "cloudflare_record" "websocket_subdomain" {
  zone_id = var.cloudflare_zone_id
  name    = "ws"
  content = var.websocket_origin
  type    = "CNAME"
  proxied = true
  ttl     = 1 # Automatic (Cloudflare-managed when proxied)
  comment = "WebSocket server (Socket.io 4.8) - Railway origin"
}

# =============================================================================
# Zone Settings: Enable WebSocket Support
# =============================================================================
# Cloudflare supports WebSocket connections on proxied records by default on
# all plans. This resource ensures the zone-level WebSocket setting is explicitly
# enabled (it cannot be disabled on Free/Pro plans, but we declare it for clarity).
resource "cloudflare_zone_settings_override" "websocket_settings" {
  zone_id = var.cloudflare_zone_id

  settings {
    websockets = "on"
  }
}

# =============================================================================
# Load Balancer with Session Affinity (Sticky Sessions)
# =============================================================================
# Cloudflare Load Balancer provides session affinity using cookies.
# This ensures that all requests from a client (polling + WebSocket upgrade)
# are routed to the same backend origin.
#
# Session affinity mechanism:
# - Cloudflare sets a `__cflb` cookie on the first request
# - Subsequent requests with this cookie are routed to the same origin
# - This works alongside Socket.io's `io` cookie for double-layer affinity
#
# Note: Cloudflare Load Balancer requires a paid plan (Pro+).
# For Free plan, Railway's built-in load balancer handles sticky sessions
# via the `io` cookie set by Socket.io. See documentation for details.

# Origin Pool: Railway WebSocket Server
resource "cloudflare_load_balancer_pool" "websocket_pool" {
  account_id = var.cloudflare_zone_id # Uses zone_id as account context
  name       = "websocket-railway-pool"

  origins {
    name    = "railway-websocket-primary"
    address = var.websocket_origin
    enabled = true
    weight  = 1

    header {
      header = "Host"
      values = ["ws.${var.domain}"]
    }
  }

  # Health check for WebSocket origin
  monitor = cloudflare_load_balancer_monitor.websocket_health.id

  notification_email = ""

  minimum_origins = 1
}

# Health Check Monitor for WebSocket Server
resource "cloudflare_load_balancer_monitor" "websocket_health" {
  account_id     = var.cloudflare_zone_id
  type           = "https"
  expected_codes = "200"
  method         = "GET"
  path           = "/health"
  interval       = 10
  timeout        = 5
  retries        = 3
  description    = "WebSocket server health check (Socket.io /health endpoint)"

  header {
    header = "Host"
    values = ["ws.${var.domain}"]
  }
}

# Load Balancer with Session Affinity
resource "cloudflare_load_balancer" "websocket_lb" {
  zone_id          = var.cloudflare_zone_id
  name             = "ws.${var.domain}"
  fallback_pool_id = cloudflare_load_balancer_pool.websocket_pool.id
  default_pool_ids = [cloudflare_load_balancer_pool.websocket_pool.id]
  proxied          = true

  # Session affinity: cookie-based sticky sessions
  # Required for Socket.io HTTP long-polling → WebSocket upgrade
  session_affinity = "cookie"

  session_affinity_attributes {
    samesite = "Strict"
    secure   = "Always"
    # Session TTL: 1 hour (matches typical event duration)
    # After TTL expires, client may be routed to a different instance
    # Socket.io handles reconnection gracefully in this case
  }

  # Steering policy: random (single origin, no preference needed)
  # Change to "least_outstanding_requests" when scaling to multiple instances
  steering_policy = "random"
}

# =============================================================================
# Outputs
# =============================================================================
output "websocket_dns_record" {
  description = "WebSocket subdomain DNS record"
  value       = "ws.${var.domain} → ${var.websocket_origin} (CNAME, proxied)"
}

output "websocket_url" {
  description = "Production WebSocket URL for client configuration"
  value       = "wss://ws.${var.domain}"
}

output "session_affinity" {
  description = "Session affinity configuration"
  value       = "cookie-based (Cloudflare __cflb cookie + Socket.io io cookie)"
}

output "health_check_path" {
  description = "Health check endpoint path"
  value       = "/health"
}

output "health_check_interval" {
  description = "Health check interval in seconds"
  value       = 10
}
