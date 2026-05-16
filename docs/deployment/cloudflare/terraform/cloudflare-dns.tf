# =============================================================================
# Cloudflare DNS Configuration
# Wedding Digital SaaS Platform - Production Deployment
# =============================================================================
# Requirements: 11.1, 11.2, 11.7
# - DNS records for subdomains: dashboard, scanner, api, ws
# - Wildcard/dynamic routing for {event-slug}.{domain} (Invitation App)
# - TTL 300 seconds initially for go-live flexibility
# - DNSSEC enabled for DNS spoofing prevention
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
  description = "Cloudflare API token with Zone:DNS:Edit and Zone:DNSSEC:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the production domain"
  type        = string
}

variable "domain" {
  description = "Production domain name (e.g., weddingdigital.id)"
  type        = string
}

variable "vercel_cname_target" {
  description = "Vercel CNAME target for frontend apps (e.g., cname.vercel-dns.com)"
  type        = string
  default     = "cname.vercel-dns.com"
}

variable "railway_api_target" {
  description = "Railway API service public hostname or IP"
  type        = string
}

variable "railway_ws_target" {
  description = "Railway WebSocket service public hostname or IP"
  type        = string
}

variable "dns_ttl" {
  description = "DNS record TTL in seconds (300 for go-live, 3600 after stable)"
  type        = number
  default     = 300
}

variable "proxied" {
  description = "Whether DNS records should be proxied through Cloudflare (enables CDN, WAF, DDoS)"
  type        = bool
  default     = true
}

# =============================================================================
# Provider Configuration
# =============================================================================

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# DNS Records - Frontend Applications (Vercel)
# =============================================================================

# Dashboard App: dashboard.{domain} → Vercel
resource "cloudflare_record" "dashboard" {
  zone_id = var.cloudflare_zone_id
  name    = "dashboard"
  content = var.vercel_cname_target
  type    = "CNAME"
  ttl     = var.dns_ttl
  proxied = var.proxied
  comment = "Dashboard App (Next.js) hosted on Vercel"
}

# Scanner App: scanner.{domain} → Vercel
resource "cloudflare_record" "scanner" {
  zone_id = var.cloudflare_zone_id
  name    = "scanner"
  content = var.vercel_cname_target
  type    = "CNAME"
  ttl     = var.dns_ttl
  proxied = var.proxied
  comment = "Scanner PWA (Next.js) hosted on Vercel"
}

# Invitation App (wildcard): *.{domain} → Vercel
# Handles dynamic {event-slug}.{domain} routing
resource "cloudflare_record" "invitation_wildcard" {
  zone_id = var.cloudflare_zone_id
  name    = "*"
  content = var.vercel_cname_target
  type    = "CNAME"
  ttl     = var.dns_ttl
  proxied = var.proxied
  comment = "Invitation App wildcard - handles {event-slug}.{domain} dynamic routing"
}

# =============================================================================
# DNS Records - Backend Services (Railway)
# =============================================================================

# API Server: api.{domain} → Railway
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  content = var.railway_api_target
  type    = "CNAME"
  ttl     = var.dns_ttl
  proxied = var.proxied
  comment = "Fastify API server hosted on Railway"
}

# WebSocket Server: ws.{domain} → Railway
resource "cloudflare_record" "ws" {
  zone_id = var.cloudflare_zone_id
  name    = "ws"
  content = var.railway_ws_target
  type    = "CNAME"
  ttl     = var.dns_ttl
  proxied = var.proxied
  comment = "WebSocket (Socket.io) server hosted on Railway"
}

# =============================================================================
# DNSSEC Configuration
# =============================================================================

# Enable DNSSEC on the zone for DNS spoofing prevention
resource "cloudflare_zone_dnssec" "production" {
  zone_id = var.cloudflare_zone_id
}

# =============================================================================
# Outputs
# =============================================================================

output "dashboard_record_id" {
  description = "DNS record ID for dashboard subdomain"
  value       = cloudflare_record.dashboard.id
}

output "scanner_record_id" {
  description = "DNS record ID for scanner subdomain"
  value       = cloudflare_record.scanner.id
}

output "invitation_wildcard_record_id" {
  description = "DNS record ID for invitation wildcard subdomain"
  value       = cloudflare_record.invitation_wildcard.id
}

output "api_record_id" {
  description = "DNS record ID for API subdomain"
  value       = cloudflare_record.api.id
}

output "ws_record_id" {
  description = "DNS record ID for WebSocket subdomain"
  value       = cloudflare_record.ws.id
}

output "dnssec_status" {
  description = "DNSSEC status for the zone"
  value       = cloudflare_zone_dnssec.production.status
}

output "dnssec_ds_record" {
  description = "DNSSEC DS record to add at domain registrar"
  value       = cloudflare_zone_dnssec.production.ds
}

output "dns_records_summary" {
  description = "Summary of all configured DNS records"
  value = {
    dashboard  = "dashboard.${var.domain} → ${var.vercel_cname_target} (TTL: ${var.dns_ttl}s)"
    scanner    = "scanner.${var.domain} → ${var.vercel_cname_target} (TTL: ${var.dns_ttl}s)"
    invitation = "*.${var.domain} → ${var.vercel_cname_target} (TTL: ${var.dns_ttl}s)"
    api        = "api.${var.domain} → ${var.railway_api_target} (TTL: ${var.dns_ttl}s)"
    ws         = "ws.${var.domain} → ${var.railway_ws_target} (TTL: ${var.dns_ttl}s)"
    dnssec     = "Enabled"
  }
}
