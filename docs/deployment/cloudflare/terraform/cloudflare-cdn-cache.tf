# Cloudflare CDN Cache Rules, Compression, and Origin Shield Configuration
# Terraform configuration for CDN optimization across all production domains
#
# Requirements covered:
# - 7.2: CDN caching (immutable assets: 1 year, HTML/API: 60s or no-cache)
# - 7.4: Brotli compression with Gzip fallback for text-based assets
# - 7.7: Origin shield (Smart Tiered Cache) to reduce origin load on cache miss

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
  description = "Cloudflare API token with Zone:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the production domain"
  type        = string
}

variable "domain" {
  description = "Production domain (e.g., example.com)"
  type        = string
}

# Provider configuration
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# Cache Rules (Phase: http_request_cache_settings)
# Controls how Cloudflare caches content from origins
# =============================================================================
resource "cloudflare_ruleset" "cache_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "CDN Cache Rules - Wedding Digital SaaS"
  description = "Cache rules for immutable assets, HTML pages, and API responses"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  # Rule 1: Immutable static assets — cache for 1 year
  # Matches Next.js hashed static files and other content-hashed assets
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = 31536000 # 1 year in seconds
      }
      browser_ttl {
        mode    = "override_origin"
        default = 31536000 # 1 year in seconds
      }
    }
    expression  = "(http.request.uri.path matches \"^/_next/static/.*\") or (http.request.uri.path matches \".*\\\\.[0-9a-f]{8,}\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\")"
    description = "Cache immutable hashed assets for 1 year (Req 7.2)"
    enabled     = true
  }

  # Rule 2: HTML pages and dynamic content — short cache (60s)
  # ISR pages benefit from edge caching with short TTL
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = 60 # 60 seconds
      }
      browser_ttl {
        mode    = "override_origin"
        default = 60 # 60 seconds
      }
    }
    expression  = "(not http.request.uri.path matches \"^/_next/static/.*\") and (not http.request.uri.path matches \".*\\\\.[0-9a-f]{8,}\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\") and (http.host ne \"api.${var.domain}\") and (http.host ne \"ws.${var.domain}\") and (not http.request.uri.path starts_with \"/api/\")"
    description = "Cache HTML/dynamic content for 60s (Req 7.2)"
    enabled     = true
  }

  # Rule 3: API responses — bypass cache
  # API caching is handled at application layer (Redis)
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "(http.host eq \"api.${var.domain}\") or (http.request.uri.path starts_with \"/api/\")"
    description = "Bypass CDN cache for API responses (Req 7.2)"
    enabled     = true
  }

  # Rule 4: WebSocket — bypass cache
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "(http.host eq \"ws.${var.domain}\")"
    description = "Bypass CDN cache for WebSocket connections"
    enabled     = true
  }
}

# =============================================================================
# Cache Response Rules (Phase: http_response_cache_settings)
# Sets Cache-Control headers on responses before caching
# =============================================================================
resource "cloudflare_ruleset" "cache_response_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "CDN Cache Response Rules - Wedding Digital SaaS"
  description = "Set Cache-Control headers for immutable assets and HTML pages"
  kind        = "zone"
  phase       = "http_response_cache_settings"

  # Rule 1: Mark hashed assets as immutable
  rules {
    action = "set_cache_control"
    action_parameters {
      max_age = {
        operation = "set"
        value     = 31536000
      }
      immutable = {
        operation = "set"
      }
    }
    expression  = "(http.request.uri.path matches \"^/_next/static/.*\") or (http.request.uri.path matches \".*\\\\.[0-9a-f]{8,}\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\")"
    description = "Set immutable + max-age 1 year for hashed assets (Req 7.2)"
    enabled     = true
  }
}

# =============================================================================
# Compression Rules (Phase: http_response_compression)
# Enables Brotli with Gzip fallback for text-based assets
# =============================================================================
resource "cloudflare_ruleset" "compression_rules" {
  zone_id     = var.cloudflare_zone_id
  name        = "Compression Rules - Wedding Digital SaaS"
  description = "Brotli compression with Gzip fallback for text-based assets"
  kind        = "zone"
  phase       = "http_response_compression"

  # Rule 1: Brotli + Gzip for text-based content
  rules {
    action = "compress_response"
    action_parameters {
      algorithms {
        name = "brotli"
      }
      algorithms {
        name = "gzip"
      }
      algorithms {
        name = "auto"
      }
    }
    expression  = "(http.request.uri.path.extension in {\"html\" \"css\" \"js\" \"json\" \"xml\" \"svg\" \"txt\" \"map\" \"mjs\" \"webmanifest\"})"
    description = "Brotli with Gzip fallback for text assets (Req 7.4)"
    enabled     = true
  }
}

# =============================================================================
# Zone Settings: Brotli and Tiered Cache (Origin Shield)
# =============================================================================
resource "cloudflare_zone_settings_override" "cdn_optimization" {
  zone_id = var.cloudflare_zone_id

  settings {
    # Enable Brotli compression at zone level
    brotli = "on"

    # Enable early hints for faster page loads
    early_hints = "on"
  }
}

# =============================================================================
# Tiered Cache (Origin Shield) — Smart Tiered Cache
# Reduces origin load by routing cache misses through upper-tier data centers
# =============================================================================
resource "cloudflare_tiered_cache" "origin_shield" {
  zone_id    = var.cloudflare_zone_id
  cache_type = "smart" # Smart Tiered Cache auto-selects optimal upper tier
}

# =============================================================================
# Outputs
# =============================================================================
output "cache_rules_id" {
  description = "Cache Rules ruleset ID"
  value       = cloudflare_ruleset.cache_rules.id
}

output "compression_rules_id" {
  description = "Compression Rules ruleset ID"
  value       = cloudflare_ruleset.compression_rules.id
}

output "tiered_cache_type" {
  description = "Tiered Cache topology type"
  value       = "Smart (auto-selects closest upper tier to origin)"
}

output "cdn_config_summary" {
  description = "CDN configuration summary"
  value = {
    immutable_assets_ttl = "31536000s (1 year)"
    html_pages_ttl       = "60s"
    api_responses        = "no-cache (bypass)"
    compression          = "Brotli (primary) + Gzip (fallback)"
    origin_shield        = "Smart Tiered Cache (enabled)"
  }
}
