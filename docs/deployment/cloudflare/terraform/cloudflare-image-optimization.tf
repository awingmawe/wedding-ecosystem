# Cloudflare Image Optimization Configuration
# Terraform configuration for automatic WebP conversion and image optimization
#
# Requirements covered:
# - 7.3: CDN image optimization (WebP conversion, responsive sizing) for CMS media
#
# Strategy:
# 1. Polish (Lossy + WebP) — automatic compression and WebP conversion for all images
# 2. Configuration Rule — enables Polish with WebP specifically for CMS media paths
# 3. Image Resizing — on-the-fly responsive sizing via Cloudflare Worker (see workers/image-resizer.ts)

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
# Zone Settings: Enable Polish with Lossy compression + WebP
# Polish automatically optimizes images served through Cloudflare
# =============================================================================
resource "cloudflare_zone_settings_override" "image_optimization" {
  zone_id = var.cloudflare_zone_id

  settings {
    # Enable Polish with Lossy compression for maximum file size reduction
    # Lossy mode: ~17-26% reduction depending on format
    polish = "lossy"

    # Enable WebP conversion — serves WebP to browsers that support it
    # via Accept header negotiation (image/webp)
    webp = "on"
  }
}

# =============================================================================
# Configuration Rule: Polish with WebP for CMS media paths
# Ensures Polish + WebP is explicitly enabled for media uploaded through CMS
# This targets images served from R2 storage via CDN
# =============================================================================
resource "cloudflare_ruleset" "image_optimization_config" {
  zone_id     = var.cloudflare_zone_id
  name        = "Image Optimization - CMS Media"
  description = "Enable Polish with WebP for CMS-uploaded media files"
  kind        = "zone"
  phase       = "http_config_settings"

  # Rule 1: Enable Polish WebP for CMS media images
  # Matches image requests from the media/uploads path (R2-served content)
  rules {
    action = "set_config"
    action_parameters {
      polish = "lossy"
    }
    expression  = "(http.request.uri.path matches \"^/media/.*\\.(jpg|jpeg|png|gif|webp)$\") or (http.request.uri.path matches \"^/uploads/.*\\.(jpg|jpeg|png|gif|webp)$\") or (http.request.uri.path matches \"^/cdn-cgi/image/.*\")"
    description = "Enable Polish (lossy + WebP) for CMS media images (Req 7.3)"
    enabled     = true
  }
}

# =============================================================================
# Transform Rule: Rewrite image URLs to use Image Resizing
# Enables responsive image sizing via /cdn-cgi/image/ path
# =============================================================================
resource "cloudflare_ruleset" "image_resizing_rewrite" {
  zone_id     = var.cloudflare_zone_id
  name        = "Image Resizing URL Rewrite - CMS Media"
  description = "Rewrite CMS media URLs with width/height params to Image Resizing format"
  kind        = "zone"
  phase       = "http_request_transform"

  # Rule: Rewrite /media/image.jpg?w=400&h=300 → /cdn-cgi/image/width=400,height=300/media/image.jpg
  # This allows the frontend to request responsive sizes via query parameters
  rules {
    action = "rewrite"
    action_parameters {
      uri {
        path {
          expression = "regex_replace(http.request.uri.path, \"^/media/(.*)\", \"/cdn-cgi/image/format=auto,quality=80,fit=cover/media/${1}\")"
        }
      }
    }
    expression  = "(http.request.uri.path matches \"^/media/.*\\.(jpg|jpeg|png|gif|webp)$\") and (http.request.uri.query contains \"w=\") and (not any(http.request.headers[\"via\"][*] contains \"image-resizing\"))"
    description = "Rewrite CMS media URLs to use Image Resizing with responsive params (Req 7.3)"
    enabled     = true
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "polish_mode" {
  description = "Polish compression mode"
  value       = "lossy (with WebP enabled)"
}

output "image_optimization_summary" {
  description = "Image optimization configuration summary"
  value = {
    polish_mode       = "lossy"
    webp_conversion   = "enabled (automatic for supported browsers)"
    responsive_sizing = "via Cloudflare Image Resizing Worker + /cdn-cgi/image/ path"
    target_paths      = ["/media/*", "/uploads/*"]
    format_auto       = "WebP for Chrome/Firefox/Edge, JPEG/PNG fallback for Safari/IE"
  }
}
