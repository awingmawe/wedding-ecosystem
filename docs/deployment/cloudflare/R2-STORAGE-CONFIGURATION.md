# Cloudflare R2 Storage Configuration

Production media storage for the Wedding Digital SaaS platform. R2 stores all media files (photos, videos) uploaded through the CMS Dashboard.

## Requirements Covered

| Requirement | Description                                                | Implementation                                                           |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 8.1         | Deploy R2 with production bucket and restricted IAM access | R2 bucket with API token scoped to R2 operations only                    |
| 8.2         | Server-side encryption (SSE) with managed keys             | R2 encrypts all objects at rest by default (always-on)                   |
| 8.3         | Block public access; CDN-only via Origin Access            | No public URL; access only through `cdn.{domain}` custom domain          |
| 8.5         | CORS: upload from Dashboard, download from CDN             | CORS rules configured per domain                                         |
| 8.7         | Protection against accidental deletion                     | Bucket Lock (30-day retention) — R2 does not support S3-style versioning |

## Architecture

```
┌─────────────────┐     Signed URL (PUT)     ┌──────────────────────┐
│   Dashboard     │ ─────────────────────────▶│  R2 Bucket           │
│   (Upload)      │                           │  (wedding-digital-   │
└─────────────────┘                           │   media-production)  │
                                              │                      │
┌─────────────────┐     Custom Domain (GET)   │  • SSE (managed)     │
│   CDN           │ ◀────────────────────────▶│  • Bucket Lock 30d  │
│   cdn.{domain}  │     (Cloudflare proxy)    │  • No public access  │
└─────────────────┘                           └──────────────────────┘
        │
        ▼
┌─────────────────┐
│   End Users     │
│   (Invitation,  │
│    Dashboard)   │
└─────────────────┘
```

## Prerequisites

Before applying this configuration:

1. **Enable R2 on Cloudflare Account**: Navigate to Cloudflare Dashboard → R2 → Enable R2 Storage
2. **API Token**: Create an API token with `R2:Edit` permissions for the account
3. **Domain**: Ensure `cdn.{domain}` DNS record is configured (see DNS configuration)

## Bucket Configuration

### Bucket Details

| Setting       | Value                                               |
| ------------- | --------------------------------------------------- |
| Bucket Name   | `wedding-digital-media-production`                  |
| Location Hint | APAC (Asia-Pacific, closest to Indonesia)           |
| Storage Class | Standard (default)                                  |
| Encryption    | SSE with Cloudflare-managed keys (always-on)        |
| Bucket Lock   | 30-day retention (protect from accidental deletion) |
| Public Access | Blocked                                             |

### Server-Side Encryption (SSE)

Cloudflare R2 encrypts all stored objects at rest by default using Cloudflare-managed encryption keys. This is always-on and requires no additional configuration.

- **Algorithm**: AES-256-GCM
- **Key Management**: Cloudflare-managed (automatic rotation)
- **Scope**: All objects in the bucket

### Bucket Lock (Accidental Deletion Protection)

R2 does not support S3-style object versioning. Instead, **Bucket Lock** is used to protect objects from accidental deletion.

- **Rule**: `protect-media-30d`
- **Condition**: Age-based, 30 days (2,592,000 seconds)
- **Behavior**: Objects cannot be deleted within 30 days of creation
- **Purpose**: Prevents accidental deletion of recently uploaded media

### Access Control

**No public access is configured.** All access to stored media goes through:

1. **CDN Custom Domain** (`cdn.{domain}`): For read access by end users (Invitation App, Dashboard)
2. **Signed URLs**: For upload access from Dashboard (15-minute expiry)
3. **Workers/API**: For programmatic access from backend services

The R2 bucket has no public URL endpoint. The `r2.dev` subdomain is **disabled**.

## CORS Configuration

### Upload Rule (Dashboard → R2)

```json
{
  "allowed_origins": ["https://dashboard.{domain}"],
  "allowed_methods": ["PUT", "POST"],
  "allowed_headers": [
    "Content-Type",
    "Content-Length",
    "Content-MD5",
    "x-amz-content-sha256",
    "x-amz-date",
    "Authorization"
  ],
  "expose_headers": ["ETag", "x-amz-request-id"],
  "max_age_seconds": 3600
}
```

### Download Rule (CDN → End Users)

```json
{
  "allowed_origins": ["https://cdn.{domain}", "https://*.{domain}"],
  "allowed_methods": ["GET", "HEAD"],
  "allowed_headers": ["Content-Type", "Range"],
  "expose_headers": ["Content-Length", "Content-Type", "ETag", "Accept-Ranges"],
  "max_age_seconds": 86400
}
```

## Lifecycle Rules

| Rule                       | Condition                              | Action                         |
| -------------------------- | -------------------------------------- | ------------------------------ |
| Infrequent Access          | Object not accessed for 90 days        | Transition to IA storage class |
| Cleanup Incomplete Uploads | Multipart upload incomplete for 7 days | Abort and delete parts         |

## CDN Integration

Media is served through a Cloudflare custom domain (`cdn.{domain}`) which:

1. Proxies requests through Cloudflare's CDN network
2. Applies cache rules (immutable images cached for 1 year)
3. Enables image optimization (WebP conversion, responsive sizing via Image Resizer Worker)
4. Provides DDoS protection and WAF coverage

### Cache-Control Headers for Media

| Content Type                 | Cache-Control                         |
| ---------------------------- | ------------------------------------- |
| Images (jpg, png, webp, gif) | `public, max-age=31536000, immutable` |
| Videos (mp4, webm)           | `public, max-age=86400`               |
| Other files                  | `public, max-age=3600`                |

## Deployment

### Option 1: Terraform (Recommended)

```bash
cd docs/deployment/cloudflare/terraform/

terraform init
terraform plan \
  -var="cloudflare_api_token=$CLOUDFLARE_API_TOKEN" \
  -var="cloudflare_account_id=$CLOUDFLARE_ACCOUNT_ID" \
  -var="cloudflare_zone_id=$CLOUDFLARE_ZONE_ID" \
  -var="domain=example.com"

terraform apply
```

### Option 2: Cloudflare API Script

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="example.com"

./scripts/configure-r2-storage.sh
```

### Option 3: Cloudflare Dashboard (Manual)

1. Go to Cloudflare Dashboard → R2 → Create Bucket
2. Name: `wedding-digital-media-production`
3. Location: Asia-Pacific (APAC)
4. After creation:
   - Settings → Bucket Lock is configured via API (already applied)
   - Settings → CORS → Add rules (see CORS section above)
   - Settings → Custom Domains → Add `cdn.{domain}`
   - Ensure "Public Access" / `r2.dev` subdomain is **disabled**

## Verification

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="example.com"

./scripts/verify-r2-storage.sh
```

### Manual Verification Checklist

- [ ] Bucket exists with name `wedding-digital-media-production`
- [ ] Location is APAC
- [ ] Bucket Lock rule `protect-media-30d` is active (30-day retention)
- [ ] `r2.dev` public access is disabled
- [ ] Custom domain `cdn.{domain}` is connected and active
- [ ] CORS allows PUT/POST from `dashboard.{domain}`
- [ ] CORS allows GET/HEAD from `cdn.{domain}` and `*.{domain}`
- [ ] Upload via signed URL works from Dashboard
- [ ] Download via `cdn.{domain}` works for stored objects
- [ ] Direct access to R2 bucket URL returns 403/404

## Signed URL Upload Flow

```
1. Dashboard → API: POST /upload/signed-url { filename, contentType, size }
2. API: Check tenant quota (< 5GB)
3. API: Generate presigned PUT URL (15-min expiry) using R2 S3-compatible API
4. API → Dashboard: { uploadUrl, publicUrl }
5. Dashboard → R2: PUT {uploadUrl} with file body
6. R2 → Dashboard: 200 OK + ETag
7. Dashboard → API: POST /upload/confirm { key, etag }
```

## Environment Variables

| Variable               | Service    | Description                                     |
| ---------------------- | ---------- | ----------------------------------------------- |
| `R2_ACCOUNT_ID`        | API Server | Cloudflare Account ID                           |
| `R2_ACCESS_KEY_ID`     | API Server | R2 API token (access key)                       |
| `R2_SECRET_ACCESS_KEY` | API Server | R2 API token (secret key)                       |
| `R2_BUCKET_NAME`       | API Server | `wedding-digital-media-production`              |
| `R2_ENDPOINT`          | API Server | `https://{account_id}.r2.cloudflarestorage.com` |
| `CDN_DOMAIN`           | API Server | `cdn.{domain}`                                  |

## Storage Quota

- **Per-tenant limit**: 5GB
- **Enforcement**: Application layer (API server checks before generating signed URL)
- **Monitoring**: Track per-tenant usage via object key prefix (`{tenant_id}/`)

## Security Considerations

1. **No public bucket access**: All reads go through CDN custom domain (Cloudflare proxy)
2. **Signed URLs for uploads**: Time-limited (15 min), scoped to specific key path
3. **Tenant isolation**: Object keys prefixed with `{tenant_id}/` — enforced at API layer
4. **Encryption at rest**: SSE with Cloudflare-managed keys (always-on)
5. **Encryption in transit**: HTTPS enforced on CDN custom domain
6. **CORS restrictions**: Upload only from Dashboard domain, download only from CDN
