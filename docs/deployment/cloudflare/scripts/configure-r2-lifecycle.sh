#!/usr/bin/env bash
# =============================================================================
# Configure R2 Lifecycle Policy via S3-compatible API
# =============================================================================
# Moves files not accessed for 90 days to Infrequent Access storage class
# Also aborts incomplete multipart uploads after 7 days
#
# Requirements covered:
# - 8.4: Lifecycle policy for Infrequent Access storage class transition
#
# Note: The Cloudflare Bindings MCP does not support lifecycle rule configuration.
# This script uses the S3-compatible API (via AWS CLI) to configure lifecycle rules.
#
# Prerequisites:
#   - AWS CLI v2 installed (used for S3-compatible API calls)
#   - R2 API credentials configured
#
# Environment Variables:
#   CLOUDFLARE_ACCOUNT_ID  - Cloudflare Account ID
#   R2_ACCESS_KEY_ID       - R2 S3-compatible API access key
#   R2_SECRET_ACCESS_KEY   - R2 S3-compatible API secret key
#   R2_BUCKET_NAME         - R2 bucket name (default: wedding-digital-media-production)
# =============================================================================

set -euo pipefail

# Configuration
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?Error: CLOUDFLARE_ACCOUNT_ID is required}"
ACCESS_KEY="${R2_ACCESS_KEY_ID:?Error: R2_ACCESS_KEY_ID is required}"
SECRET_KEY="${R2_SECRET_ACCESS_KEY:?Error: R2_SECRET_ACCESS_KEY is required}"
BUCKET_NAME="${R2_BUCKET_NAME:-wedding-digital-media-production}"
R2_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "============================================="
echo "R2 Lifecycle Policy Configuration"
echo "============================================="
echo "Account ID: ${ACCOUNT_ID:0:8}..."
echo "Bucket:     ${BUCKET_NAME}"
echo "Endpoint:   ${R2_ENDPOINT}"
echo ""

# Create lifecycle configuration JSON
LIFECYCLE_CONFIG=$(cat <<'EOF'
{
  "Rules": [
    {
      "ID": "transition-to-infrequent-access-90d",
      "Status": "Enabled",
      "Filter": {},
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        }
      ]
    },
    {
      "ID": "abort-incomplete-multipart-uploads",
      "Status": "Enabled",
      "Filter": {},
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
EOF
)

echo "Applying lifecycle configuration..."
echo ""
echo "Rules:"
echo "  1. Transition to Infrequent Access after 90 days (all objects)"
echo "  2. Abort incomplete multipart uploads after 7 days"
echo ""

# Apply lifecycle configuration using AWS CLI with R2 endpoint
AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${BUCKET_NAME}" \
  --lifecycle-configuration "${LIFECYCLE_CONFIG}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --region auto

echo "✓ Lifecycle configuration applied successfully"
echo ""

# Verify the configuration
echo "Verifying lifecycle configuration..."
echo ""

CURRENT_CONFIG=$(AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
aws s3api get-bucket-lifecycle-configuration \
  --bucket "${BUCKET_NAME}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --region auto 2>&1) || true

if echo "${CURRENT_CONFIG}" | grep -q "transition-to-infrequent-access-90d"; then
  echo "✓ Infrequent Access transition rule (90 days) is active"
else
  echo "⚠ Warning: Could not verify Infrequent Access transition rule"
fi

if echo "${CURRENT_CONFIG}" | grep -q "abort-incomplete-multipart-uploads"; then
  echo "✓ Abort incomplete multipart uploads rule (7 days) is active"
else
  echo "⚠ Warning: Could not verify multipart upload abort rule"
fi

echo ""
echo "============================================="
echo "Configuration Complete"
echo "============================================="
echo ""
echo "Summary:"
echo "  - Objects not accessed for 90 days → Infrequent Access storage"
echo "  - Incomplete multipart uploads aborted after 7 days"
echo ""
echo "Cost Impact:"
echo "  - Infrequent Access storage has lower storage cost"
echo "  - Retrieval fees apply when accessing IA objects"
echo "  - A Class A operation is incurred per object transition"
echo ""
echo "Note: Existing objects may take up to 24 hours to transition"
echo "after the rule takes effect."
