# =============================================================================
# Terraform Backend Configuration
# =============================================================================
# Store Terraform state remotely to enable team collaboration.
# Uncomment and configure one of the backends below before running terraform init.
# =============================================================================

# Option 1: Cloudflare R2 (S3-compatible) - Recommended for Cloudflare-native stack
# terraform {
#   backend "s3" {
#     bucket                      = "wedding-digital-terraform-state"
#     key                         = "cloudflare/waf-ddos/terraform.tfstate"
#     region                      = "auto"
#     skip_credentials_validation = true
#     skip_metadata_api_check     = true
#     skip_region_validation      = true
#     endpoints = {
#       s3 = "https://<account-id>.r2.cloudflarestorage.com"
#     }
#   }
# }

# Option 2: Local state (for initial setup only, not recommended for production)
# State will be stored in the current directory as terraform.tfstate
