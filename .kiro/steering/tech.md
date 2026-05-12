---
inclusion: always
---

# Tech Stack & Build System

## Frontend

- **Framework**: Next.js 16.2 (React 19.2)
- **Styling**: TailwindCSS 4.1
- **Component Library**: shadcn/ui (copy-paste, fully customizable)
- **Animation**: Motion 12.17 (formerly Framer Motion) — Invitation App
- **QR Scanning**: html5-qrcode 2.3
- **Real-time**: Socket.io Client 4.8
- **Data Fetching**: @tanstack/react-query 5.89
- **Forms**: React Hook Form 7.62
- **Fonts**: Playfair Display (headings) + Poppins (body)

## Backend

- **Runtime**: Node.js 20+
- **API Framework**: Fastify 5.3
- **Database**: PostgreSQL
- **ORM**: Prisma 7.7
- **Cache/Pub-Sub**: Redis (ioredis 5.6)
- **WebSocket**: Socket.io 4.8
- **QR Generation**: qrcode (npm)
- **Image Processing**: Sharp 0.34
- **File Upload**: Multer + Cloud Storage SDK
- **Auth**: JWT (jsonwebtoken 9.0) + bcrypt 6.0
- **Validation**: Zod 3.25

## Infrastructure

- **Hosting**: Vercel / AWS / GCP
- **Storage**: S3 / GCS (media files)
- **CDN**: CloudFront / Cloudflare
- **Database Hosting**: Managed PostgreSQL
- **Cache**: Redis Cloud / ElastiCache

## Testing

- **Unit/Integration Testing**: Vitest 3.2
- **Property-Based Testing**: fast-check 4.2
- **Coverage Target**: 80% minimum for business logic
- **Key Test Areas**: QR validation, RSVP processing, duplicate detection, tenant isolation

## Pinned Dependency Versions

| Package | Version |
|---------|---------|
| next | 16.2.0 |
| react / react-dom | 19.2.0 |
| tailwindcss | 4.1.7 |
| typescript | 5.9.3 |
| zod | 3.25.3 |
| vitest | 3.2.4 |
| fast-check | 4.2.0 |
| fastify | 5.3.2 |
| socket.io / socket.io-client | 4.8.3 |
| prisma / @prisma/client | 7.7.0 |
| motion | 12.17.0 |
| sharp | 0.34.1 |
| bcrypt | 6.0.0 |
| jsonwebtoken | 9.0.2 |
| react-hook-form | 7.62.0 |
| @tanstack/react-query | 5.89.0 |
| ioredis | 5.6.0 |
| tsx | 4.20.3 |
| turbo | ^2.4.0 |

## Common Commands

```bash
npm install            # Install dependencies
npm run dev            # Run development server
npm run build          # Build for production
npm run test           # Run tests (vitest)
npm run lint           # Run linting
npx prisma migrate dev # Database migrations
npx prisma generate    # Generate Prisma client
```

## Performance Targets

| Metric | Target |
|--------|--------|
| QR scan verification | < 2s |
| Invitation FCP (mobile 3G) | < 3s |
| WebSocket broadcast latency | < 500ms |
| Duplicate detection | < 200ms |
| DB lookup (QR/slug) | < 100ms |
| Guest capacity per event | up to 2000 |
