# R2 Lifecycle Policy Configuration

Configuration for Cloudflare R2 object lifecycle rules that automatically transition media files to Infrequent Access storage after 90 days of inactivity.

## Overview

The Wedding Digital SaaS platform stores media files (photos, videos) uploaded through the CMS in a Cloudflare R2 bucket. Over time, older event media is accessed less frequently. This lifecycle policy reduces storage costs by automatically moving inactive objects to the Infrequent Access (IA) storage class.

**Requirement**: 8.4 — Configure lifecycle policy that moves files not accessed for 90 days to Infrequent Access storage class.

## Lifecycle Rules

| Rule | ID                                    | Action                      | Condition               | Scope        |
| ---- | ------------------------------------- | --------------------------- | ----------------------- | ------------ |
| 1    | `transition-to-infrequent-access-90d` | Transition to `STANDARD_IA` | 90 days since upload    | All objects  |
| 2    | `abort-incomplete-multipart-uploads`  | Abort multipart upload      | 7 days after initiation | All prefixes |

## Storage Classes

| Storage Class     | Use Case                                    | Storage Cost | Retrieval Cost    | Min Duration |
| ----------------- | ------------------------------------------- | ------------ | ----------------- | ------------ |
| Standard          | Active event media, recently uploaded files | Higher       | None              | None         |
| Infrequent Access | Past event media, archived content          | Lower        | Per-retrieval fee | 30 days      |

## MCP Limitation

The Cloudflare Bindings MCP does not support R2 lifecycle rule configuration. The available R2 tools are limited to:

- `r2_buckets_list` — List buckets
- `r2_bucket_create` — Create bucket
- `r2_bucket_get` — Get bucket details
- `r2_bucket_delete` — Delete bucket

Lifecycle rules must be configured via:

1. **Terraform** (recommended for IaC) — `terraform/cloudflare-r2-lifecycle.tf`
2. **Shell script** (S3-compatible API) — `scripts/configure-r2-lifecycle.sh`
3. **Wrangler CLI** — `npx wrangler r2 bucket lifecycle add`

## Configuration Methods

### Method 1: Terraform (Recommended)

```bash
cd docs/deployment/cloudflare/terraform/

terraform init
terraform plan \
  -var="cloudflare_api_token=..." \
  -var="cloudflare_account_id=..." \
  -var="r2_access_key_id=..." \
  -var="r2_secret_access_key=..." \
  -var="r2_bucket_name=wedding-digital-media-production"

terraform apply
```

The Terraform configuration uses the AWS provider with R2's S3-compatible endpoint to manage lifecycle rules declaratively.

### Method 2: Shell Script (S3-compatible API)

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="your-r2-access-key"
export R2_SECRET_ACCESS_KEY="your-r2-secret-key"
export R2_BUCKET_NAME="wedding-digital-media-production"

./scripts/configure-r2-lifecycle.sh
```

Requires AWS CLI v2 installed (used for S3-compatible API calls to R2).

### Method 3: Wrangler CLI

```bash
# Add lifecycle rule for Infrequent Access transition
npx wrangler r2 bucket lifecycle add wedding-digital-media-production \
  "transition-to-infrequent-access-90d" \
  --ia-transition-days 90

# Add rule to abort incomplete multipart uploads
npx wrangler r2 bucket lifecycle add wedding-digital-media-production \
  "abort-incomplete-multipart-uploads" \
  --abort-multipart-days 7
```

### Method 4: Programmatic (Node.js with S3 SDK)

```typescript
import { S3Client, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: 'wedding-digital-media-production',
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'transition-to-infrequent-access-90d',
          Status: 'Enabled',
          Transitions: [{ Days: 90, StorageClass: 'STANDARD_IA' }],
        },
        {
          ID: 'abort-incomplete-multipart-uploads',
          Status: 'Enabled',
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 7,
          },
        },
      ],
    },
  })
);
```

## Verification

After applying the lifecycle configuration, verify it's active:

```bash
# Using AWS CLI
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
aws s3api get-bucket-lifecycle-configuration \
  --bucket wedding-digital-media-production \
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com" \
  --region auto

# Using Wrangler
npx wrangler r2 bucket lifecycle list wedding-digital-media-production
```

Expected output should show both rules with `Enabled` status.

## Behavior Notes

- Objects transition within 24 hours of meeting the 90-day threshold
- Existing objects in the bucket will be evaluated against the new rules (may take up to 24 hours)
- Once transitioned to Infrequent Access, objects cannot be moved back to Standard via lifecycle rules (use `CopyObject` API with `x-amz-storage-class: STANDARD` header)
- Infrequent Access has a 30-day minimum storage duration — objects deleted before 30 days still incur charges for the full 30 days
- A Class A operation is incurred per object transitioned

## Cost Impact

For a typical wedding event with ~200 media files (average 2MB each):

| Scenario     | Standard Storage | After 90-day Transition |
| ------------ | ---------------- | ----------------------- |
| Storage cost | Standard rate    | ~50% lower (IA rate)    |
| Retrieval    | Free             | Per-operation fee       |
| Best for     | Active events    | Past/archived events    |

The lifecycle policy is cost-effective because:

- Wedding events are typically one-time — media is heavily accessed during the event period but rarely after
- Most media access happens within the first 30-60 days after upload
- After 90 days, retrieval is infrequent (occasional downloads by the couple)

## Prerequisites

To configure lifecycle rules, you need R2 S3-compatible API credentials:

1. Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create a token with `Object Read & Write` permissions on the target bucket
3. Note the Access Key ID and Secret Access Key

## Related Files

- `terraform/cloudflare-r2-lifecycle.tf` — Terraform IaC for lifecycle rules
- `scripts/configure-r2-lifecycle.sh` — Shell script for S3-compatible API configuration
