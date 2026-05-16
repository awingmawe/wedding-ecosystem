# Cloudflare Image Optimization for CMS Media

## Overview

This document defines the image optimization configuration for the Wedding Digital SaaS platform. All images uploaded through the CMS (gallery photos, couple photos, event banners) are automatically optimized with WebP conversion and responsive sizing via Cloudflare's image optimization features.

## Architecture

```
CMS Upload → R2 Bucket (original) → Cloudflare Edge
                                         ↓
                              ┌──────────────────────┐
                              │  Polish (zone-wide)   │
                              │  • Lossy compression  │
                              │  • WebP conversion    │
                              │  • Metadata stripping │
                              └──────────────────────┘
                                         ↓
                              ┌──────────────────────┐
                              │  Image Resizer Worker │
                              │  • Responsive sizing  │
                              │  • Format negotiation │
                              │  • Preset dimensions  │
                              └──────────────────────┘
                                         ↓
                              Optimized image → Visitor
```

## Components

### 1. Cloudflare Polish (Automatic WebP Conversion)

Polish is a zone-level setting that automatically optimizes all images passing through Cloudflare's CDN.

| Setting         | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Mode**        | Lossy (maximum compression with minimal quality loss) |
| **WebP**        | Enabled (automatic conversion for supported browsers) |
| **Scope**       | All images served through Cloudflare-proxied domains  |
| **Negotiation** | Via `Accept: image/webp` header from browser          |
| **Fallback**    | Original format (JPEG/PNG) for browsers without WebP  |

#### How Polish Works

1. Browser requests image with `Accept: image/webp` header
2. Cloudflare checks if a WebP version exists in cache
3. If not cached, Polish converts the original to WebP (lossy mode)
4. WebP version is cached at the edge and served to the browser
5. Non-WebP browsers receive the original format (also optimized by Polish)

#### Compression Savings

| Original Format | Polish (Lossy) | Polish + WebP | Total Savings |
| --------------- | -------------- | ------------- | ------------- |
| JPEG (1MB)      | ~15% smaller   | ~30% smaller  | ~30%          |
| PNG (2MB)       | ~20% smaller   | ~50% smaller  | ~50%          |
| GIF (500KB)     | ~10% smaller   | N/A (no WebP) | ~10%          |

### 2. Image Resizer Worker (Responsive Sizing)

A Cloudflare Worker that provides on-the-fly responsive image resizing for CMS media stored in R2.

#### URL Format

```
/media/{path}?w={width}&h={height}&q={quality}&fit={fit}&format={format}
```

#### Parameters

| Parameter | Description            | Default      | Range/Values                         |
| --------- | ---------------------- | ------------ | ------------------------------------ |
| `w`       | Target width (pixels)  | Original     | 1–2560                               |
| `h`       | Target height (pixels) | Original     | 1–2560                               |
| `q`       | Quality (1-100)        | 80           | 1–100                                |
| `fit`     | Resize fit mode        | `scale-down` | cover, contain, scale-down, crop     |
| `format`  | Output format          | `auto`       | auto, webp, avif, jpeg, png          |
| `preset`  | Predefined size preset | —            | thumbnail, card, gallery, hero, full |

#### Responsive Presets

| Preset      | Dimensions | Fit        | Quality | Use Case                        |
| ----------- | ---------- | ---------- | ------- | ------------------------------- |
| `thumbnail` | 150×150    | cover      | 70      | Guest list avatars, small icons |
| `card`      | 400×300    | cover      | 80      | CMS section cards, previews     |
| `gallery`   | 800×600    | contain    | 80      | Gallery section images          |
| `hero`      | 1200×630   | cover      | 85      | Cover photos, hero banners      |
| `full`      | 1920×1080  | scale-down | 85      | Full-screen backgrounds         |

#### Usage Examples

```html
<!-- Invitation App: Gallery section with responsive images -->
<img
  src="/media/gallery/photo1.jpg?preset=gallery"
  srcset="
    /media/gallery/photo1.jpg?w=400   400w,
    /media/gallery/photo1.jpg?w=800   800w,
    /media/gallery/photo1.jpg?w=1200 1200w
  "
  sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
  alt="Wedding gallery photo"
  loading="lazy"
/>

<!-- Dashboard: CMS thumbnail preview -->
<img src="/media/uploads/cover.jpg?preset=thumbnail" alt="Cover preview" />

<!-- Hero banner with specific dimensions -->
<img src="/media/hero/banner.jpg?w=1200&h=630&fit=cover&q=85" alt="Wedding banner" />
```

### 3. Configuration Rule (Polish per Path)

A Cloudflare Configuration Rule ensures Polish with WebP is explicitly enabled for CMS media paths, even if zone-wide settings change.

| Setting        | Value                                               |
| -------------- | --------------------------------------------------- |
| **Expression** | Path matches `/media/*` or `/uploads/*` image files |
| **Action**     | Set Polish to `lossy` (includes WebP)               |
| **Priority**   | Applied before cache rules                          |

---

## Implementation Files

| File                                         | Purpose                                   |
| -------------------------------------------- | ----------------------------------------- |
| `terraform/cloudflare-image-optimization.tf` | Terraform: Polish + WebP zone settings    |
| `workers/image-resizer.ts`                   | Worker: Responsive image resizing from R2 |
| `workers/wrangler-image-resizer.toml`        | Worker deployment configuration           |

---

## Deployment Steps

### Step 1: Enable Polish + WebP (Zone Settings)

**Option A: Terraform (recommended)**

```bash
cd docs/deployment/cloudflare/terraform
terraform init
terraform plan -target=cloudflare_zone_settings_override.image_optimization
terraform apply -target=cloudflare_zone_settings_override.image_optimization
```

**Option B: Cloudflare Dashboard (manual)**

1. Navigate to **Speed** → **Optimization** → **Image Optimization**
2. Under **Polish**, select **Lossy** from the dropdown
3. Check the **WebP** checkbox
4. Save changes

**Option C: Cloudflare API**

```bash
# Enable Polish (Lossy mode)
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/polish" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value": "lossy"}'

# Enable WebP
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/webp" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value": "on"}'
```

### Step 2: Deploy Image Resizer Worker

```bash
cd docs/deployment/cloudflare/workers

# Update wrangler-image-resizer.toml with production values:
# - Set routes to actual domain
# - Set R2 bucket binding to production bucket
# - Set ALLOWED_ORIGINS to production domains

npx wrangler deploy --config wrangler-image-resizer.toml
```

### Step 3: Configure Image Resizing (Zone Setting)

Image Resizing must be enabled at the zone level for the Worker to use `cf.image` options:

```bash
# Enable Image Resizing on the zone
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/image_resizing" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value": "on"}'
```

> **Note:** Image Resizing requires a Business or Enterprise plan. On Pro plan, use Polish only (WebP conversion without responsive sizing). The Worker will gracefully fall back to serving the original image from R2 if Image Resizing is unavailable.

### Step 4: Purge Image Cache

After enabling Polish, existing cached images need to be purged to get optimized versions:

```bash
# Purge all cached images (one-time after enabling Polish)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

---

## Plan Requirements

| Feature                | Free | Pro | Business | Enterprise |
| ---------------------- | ---- | --- | -------- | ---------- |
| Polish (Lossy/WebP)    | ❌   | ✅  | ✅       | ✅         |
| Image Resizing         | ❌   | ❌  | ✅       | ✅         |
| Configuration Rules    | ✅   | ✅  | ✅       | ✅         |
| Workers (Image Worker) | ✅   | ✅  | ✅       | ✅         |

**Minimum plan for full feature set:** Business (for Image Resizing)
**Minimum plan for WebP conversion only:** Pro (Polish + WebP)

### Fallback Strategy (Pro Plan)

If on Pro plan (no Image Resizing), the system still provides:

- ✅ Automatic WebP conversion via Polish
- ✅ Lossy compression (15-30% file size reduction)
- ✅ Metadata stripping
- ❌ On-the-fly responsive sizing (use pre-generated sizes at upload time instead)

For Pro plan, implement server-side image resizing at upload time using Sharp in the API server:

```typescript
// packages/api/src/services/storage.ts — resize at upload time
import sharp from 'sharp';

const SIZES = [
  { name: 'thumbnail', width: 150, height: 150 },
  { name: 'card', width: 400, height: 300 },
  { name: 'gallery', width: 800, height: 600 },
  { name: 'hero', width: 1200, height: 630 },
];

// Generate responsive variants at upload time
for (const size of SIZES) {
  const resized = await sharp(buffer).resize(size.width, size.height, { fit: 'cover' }).toBuffer();
  await uploadToR2(`${basePath}/${size.name}/${filename}`, resized);
}
```

---

## Verification Checklist

- [ ] Polish is enabled (Lossy mode) on the zone
- [ ] WebP conversion is enabled
- [ ] Images served with `cf-polished` header (confirms Polish is active)
- [ ] WebP images served when `Accept: image/webp` is present
- [ ] Original format served when WebP is not in Accept header
- [ ] Image Resizer Worker deployed and responding on `/media/*` paths
- [ ] Responsive presets return correctly sized images
- [ ] Format negotiation works (AVIF → WebP → original)
- [ ] Cache headers are set correctly (`Cache-Control: public, max-age=31536000, immutable`)
- [ ] CORS headers allow Dashboard origin for CMS uploads

### Verification Commands

```bash
# Check Polish is active (look for cf-polished header)
curl -sI "https://example.com/media/gallery/photo1.jpg" | grep -i "cf-polished\|content-type\|content-length"

# Check WebP conversion (send Accept: image/webp)
curl -sI -H "Accept: image/webp,*/*" "https://example.com/media/gallery/photo1.jpg" | grep -i "content-type"
# Expected: content-type: image/webp

# Check without WebP support (should get original format)
curl -sI -H "Accept: image/jpeg" "https://example.com/media/gallery/photo1.jpg" | grep -i "content-type"
# Expected: content-type: image/jpeg

# Check responsive sizing (thumbnail preset)
curl -sI "https://example.com/media/gallery/photo1.jpg?preset=thumbnail" | grep -i "content-type\|cf-resized"

# Check responsive sizing (custom width)
curl -sI "https://example.com/media/gallery/photo1.jpg?w=400" | grep -i "content-type\|cf-resized"

# Check AVIF support
curl -sI -H "Accept: image/avif,image/webp,*/*" "https://example.com/media/gallery/photo1.jpg?w=800" | grep -i "content-type"
# Expected: content-type: image/avif (if Business+ plan)
```

---

## Performance Impact

| Metric                         | Without Optimization | With Polish + WebP | With Resizing + WebP |
| ------------------------------ | -------------------- | ------------------ | -------------------- |
| Average image size (gallery)   | 800KB                | ~560KB (-30%)      | ~120KB (-85%)        |
| Invitation page load (3G)      | ~5s                  | ~3.5s              | < 2.5s               |
| Total page weight (images)     | 3.2MB                | 2.2MB              | ~600KB               |
| Cache hit ratio (after warmup) | N/A                  | ~95%               | ~95%                 |

---

## Related Requirements

| Requirement | Description                                                 | Status |
| ----------- | ----------------------------------------------------------- | ------ |
| 7.3         | CDN image optimization (WebP conversion, responsive sizing) | ✅     |

---

## Integration with CMS Upload Flow

When images are uploaded through the CMS Dashboard:

1. **Upload**: Dashboard generates signed URL → direct upload to R2 bucket
2. **Storage**: Original image stored in R2 at `/media/{tenant_id}/{section}/{filename}`
3. **Serving**: Invitation App requests image via CDN
4. **Optimization**: Polish applies WebP conversion + lossy compression automatically
5. **Resizing**: If width/height params present, Image Resizer Worker generates responsive variant
6. **Caching**: Optimized image cached at Cloudflare edge (1 year for immutable, varies for responsive)

### Frontend Integration (Invitation App)

```tsx
// apps/invitation/src/components/optimized-image.tsx
interface OptimizedImageProps {
  src: string;
  alt: string;
  preset?: 'thumbnail' | 'card' | 'gallery' | 'hero' | 'full';
  width?: number;
  height?: number;
  className?: string;
}

export function OptimizedImage({
  src,
  alt,
  preset,
  width,
  height,
  className,
}: OptimizedImageProps) {
  const params = new URLSearchParams();
  if (preset) params.set('preset', preset);
  if (width) params.set('w', width.toString());
  if (height) params.set('h', height.toString());

  const optimizedSrc = params.toString() ? `${src}?${params}` : src;

  // Generate srcset for responsive images
  const srcSet = [400, 800, 1200].map((w) => `${src}?w=${w} ${w}w`).join(', ');

  return (
    <img
      src={optimizedSrc}
      srcSet={!preset ? srcSet : undefined}
      sizes={!preset ? '(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px' : undefined}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
```

---

## Cloudflare MCP Note

The Cloudflare Bindings MCP server does not currently expose tools for:

- Zone-level settings (Polish, WebP, Image Resizing)
- Configuration Rules
- Transform Rules

These settings are configured via:

1. **Terraform** (recommended for IaC) — see `terraform/cloudflare-image-optimization.tf`
2. **Cloudflare API** — direct REST API calls as documented above
3. **Cloudflare Dashboard** — manual configuration via web UI

The Cloudflare Bindings MCP **is** used for:

- R2 bucket management (creating the media bucket in task 8.3)
- Workers deployment verification
- KV namespace management (if needed for image metadata caching)
