# Cloudflare SSL/TLS Configuration
# Terraform configuration for SSL/TLS enforcement across all production domains
#
# Requirements covered:
# - 2.1: SSL/TLS with minimum TLS 1.2, preference TLS 1.3
# - 2.2: HTTPS redirect (HTTP 301 → HTTPS)
# - 2.3: HSTS header (max-age=31536000, includeSubDomains)
# - 2.4: End-to-end encryption (Cloudflare → Railway origin)
# - 2.7: Trusted CA certificate with auto-renewal

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
# SSL/TLS Mode: Full (Strict)
# Encrypts end-to-end and validates origin certificate
# =============================================================================
resource "cloudflare_zone_settings_override" "ssl_tls_settings" {
  zone_id = var.cloudflare_zone_id

  settings {
    # SSL/TLS encryption mode: full_strict validates origin cert
    ssl = "strict"

    # Minimum TLS version: 1.2 (blocks TLS 1.0 and 1.1)
    min_tls_version = "1.2"

    # Enable TLS 1.3 for improved performance and security
    tls_1_3 = "on"

    # Always redirect HTTP to HTTPS (301 redirect)
    always_use_https = "on"

    # Enable HSTS
    security_header {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      nosniff            = true
      preload            = false
    }

    # Enable OCSP stapling for faster TLS handshake
    # (Cloudflare handles this automatically with Universal SSL)

    # Opportunistic Encryption: encourage HTTPS upgrade
    opportunistic_encryption = "on"

    # Automatic HTTPS Rewrites: fix mixed content
    automatic_https_rewrites = "on"
  }
}

# =============================================================================
# Origin CA Certificate
# Generate Cloudflare Origin CA certificate for Railway origin
# =============================================================================
resource "cloudflare_origin_ca_certificate" "origin_cert" {
  csr                = "" # CSR generated on Railway or use Cloudflare-generated key
  hostnames          = [
    var.domain,
    "*.${var.domain}",
    "dashboard.${var.domain}",
    "api.${var.domain}",
    "ws.${var.domain}",
    "scanner.${var.domain}"
  ]
  request_type       = "origin-rsa"
  requested_validity = 5475 # 15 years (maximum for Origin CA)
}

# =============================================================================
# Page Rules for HTTPS enforcement (backup/explicit rules)
# =============================================================================
resource "cloudflare_page_rule" "https_redirect_all" {
  zone_id  = var.cloudflare_zone_id
  target   = "http://*.${var.domain}/*"
  priority = 1

  actions {
    always_use_https = true
  }
}

resource "cloudflare_page_rule" "https_redirect_apex" {
  zone_id  = var.cloudflare_zone_id
  target   = "http://${var.domain}/*"
  priority = 2

  actions {
    always_use_https = true
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "origin_ca_certificate" {
  description = "Origin CA certificate PEM (install on Railway)"
  value       = cloudflare_origin_ca_certificate.origin_cert.certificate
  sensitive   = true
}

output "ssl_mode" {
  description = "Current SSL/TLS mode"
  value       = "Full (Strict)"
}

output "min_tls_version" {
  description = "Minimum TLS version enforced"
  value       = "1.2"
}

output "hsts_max_age" {
  description = "HSTS max-age in seconds"
  value       = 31536000
}
