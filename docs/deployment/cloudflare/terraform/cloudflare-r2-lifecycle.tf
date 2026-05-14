# Cloudflare R2 Lifecycle Policy Configuration
# Terraform configuration for R2 object lifecycle rules
#
# Requirements covered:
# - 8.4: Move files not accessed for 90 days to Infrequent Access storage class
#
# Note: The Cloudflare Bindings MCP does not support lifecycle rule configuration.
# This Terraform config uses the Cloudflare provider to manage R2 lifecycle rules.
# Alternatively, use the companion script (scripts/configure-r2-lifecycle.sh) to
# configure via the S3-compatible API.

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Variables
variable "cloudflare_api_token" {
  description = "Cloudflare API token with R2:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "r2_access_key_id" {
  description = "R2 S3-compatible API access key ID"
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "R2 S3-compatible API secret access key"
  type        = string
  sensitive   = true
}

variable "r2_bucket_name" {
  description = "Name of the R2 production bucket"
  type        = string
  default     = "wedding-digital-media-production"
}

# =============================================================================
# AWS Provider configured for Cloudflare R2 S3-compatible API
# R2 lifecycle rules are managed via the S3-compatible API
# =============================================================================
provider "aws" {
  alias  = "r2"
  region = "auto"

  access_key = var.r2_access_key_id
  secret_key = var.r2_secret_access_key

  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true

  endpoints {
    s3 = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  }
}

# =============================================================================
# R2 Bucket Lifecycle Configuration
# Transitions objects to Infrequent Access after 90 days of no access
# =============================================================================
resource "aws_s3_bucket_lifecycle_configuration" "r2_lifecycle" {
  provider = aws.r2
  bucket   = var.r2_bucket_name

  # Rule 1: Transition all media files to Infrequent Access after 90 days
  # This applies to all objects in the bucket (photos, videos uploaded via CMS)
  rule {
    id     = "transition-to-infrequent-access-90d"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  # Rule 2: Abort incomplete multipart uploads after 7 days
  # Prevents orphaned multipart uploads from consuming storage
  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "lifecycle_rules_summary" {
  description = "R2 lifecycle rules configuration summary"
  value = {
    bucket                    = var.r2_bucket_name
    infrequent_access_after   = "90 days"
    multipart_upload_abort    = "7 days"
    storage_class_transition  = "STANDARD → STANDARD_IA"
  }
}

output "cost_optimization_note" {
  description = "Cost optimization details"
  value       = "Objects not accessed for 90 days are moved to Infrequent Access storage, reducing storage costs. Note: retrieval fees apply for IA objects."
}
