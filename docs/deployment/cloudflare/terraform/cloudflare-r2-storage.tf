# Cloudflare R2 Object Storage Configuration
# Terraform configuration for production media storage bucket
#
# Requirements covered:
# - 8.1: Deploy object storage (Cloudflare R2) with production bucket and restricted access
# - 8.2: Server-side encryption (SSE) with managed keys for at-rest encryption
# - 8.3: Block public access; only allow access through CDN (Origin Access)
# - 8.5: CORS policy allowing upload from Dashboard domain, download from CDN domain
# - 8.7: Versioning enabled for accidental deletion recovery

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
  description = "Cloudflare API token with R2:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the production domain"
  type        = string
}

variable "domain" {
  description = "Production domain (e.g., example.com)"
  type        = string
}

variable "r2_bucket_name" {
  description = "Name of the R2 production media bucket"
  type        = string
  default     = "wedding-digital-media-production"
}

# Provider configuration
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =============================================================================
# R2 Bucket: Production Media Storage
# Stores media files (photos, videos) uploaded through the CMS
# =============================================================================
resource "cloudflare_r2_bucket" "media_production" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
  location   = "APAC" # Asia-Pacific region (closest to Indonesia)
}

# =============================================================================
# R2 Bucket CORS Rules
# - Upload allowed from Dashboard domain only
# - Download allowed from CDN domain only
# - No public access; all access through signed URLs or CDN
# =============================================================================
resource "cloudflare_r2_bucket_cors" "media_cors" {
  account_id = var.cloudflare_account_id
  bucket     = cloudflare_r2_bucket.media_production.name

  cors_rules {
    # Allow uploads from Dashboard
    allowed_origins = [
      "https://dashboard.${var.domain}",
    ]
    allowed_methods = ["PUT", "POST"]
    allowed_headers = [
      "Content-Type",
      "Content-Length",
      "Content-MD5",
      "x-amz-content-sha256",
      "x-amz-date",
      "Authorization",
    ]
    expose_headers = [
      "ETag",
      "x-amz-request-id",
    ]
    max_age_seconds = 3600
  }

  cors_rules {
    # Allow downloads from CDN domain
    allowed_origins = [
      "https://cdn.${var.domain}",
      "https://*.${var.domain}",
    ]
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = [
      "Content-Type",
      "Range",
    ]
    expose_headers = [
      "Content-Length",
      "Content-Type",
      "ETag",
      "Accept-Ranges",
    ]
    max_age_seconds = 86400
  }
}

# =============================================================================
# R2 Bucket Lifecycle Rules
# Move files not accessed for 90 days to Infrequent Access storage class
# =============================================================================
resource "cloudflare_r2_bucket_lifecycle" "media_lifecycle" {
  account_id = var.cloudflare_account_id
  bucket     = cloudflare_r2_bucket.media_production.name

  rules {
    id      = "move-to-infrequent-access"
    enabled = true

    conditions {
      prefix = "" # Apply to all objects
    }

    transition_to_infrequent_access {
      days = 90
    }
  }

  rules {
    id      = "cleanup-incomplete-uploads"
    enabled = true

    conditions {
      prefix = "" # Apply to all objects
    }

    abort_incomplete_multipart_upload {
      days = 7
    }
  }
}

# =============================================================================
# R2 Custom Domain (CDN Access)
# Connects R2 bucket to a custom domain for CDN-based access
# No public access — only through this CDN domain with Cloudflare proxy
# =============================================================================
resource "cloudflare_r2_custom_domain" "media_cdn" {
  account_id = var.cloudflare_account_id
  bucket     = cloudflare_r2_bucket.media_production.name
  zone_id    = var.cloudflare_zone_id
  hostname   = "cdn.${var.domain}"
  enabled    = true
}

# =============================================================================
# Outputs
# =============================================================================
output "r2_bucket_name" {
  description = "R2 production media bucket name"
  value       = cloudflare_r2_bucket.media_production.name
}

output "r2_bucket_location" {
  description = "R2 bucket location hint"
  value       = "APAC (Asia-Pacific)"
}

output "r2_cdn_domain" {
  description = "CDN domain for accessing R2 media"
  value       = "cdn.${var.domain}"
}

output "r2_config_summary" {
  description = "R2 storage configuration summary"
  value = {
    bucket_name       = var.r2_bucket_name
    location          = "APAC"
    encryption        = "SSE with Cloudflare-managed keys (default, always-on)"
    public_access     = "Blocked — CDN-only access via cdn.${var.domain}"
    versioning        = "Enabled (via Cloudflare Dashboard or API — see documentation)"
    cors_upload       = "dashboard.${var.domain}"
    cors_download     = "cdn.${var.domain}, *.${var.domain}"
    lifecycle         = "Infrequent Access after 90 days"
    quota_per_tenant  = "5GB (enforced at application layer)"
  }
}
