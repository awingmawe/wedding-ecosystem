# AES-256 Encryption Key Separation Strategy

## Overview

The AES-256 encryption key used for QR payload encryption and PII (Personally Identifiable Information) encryption at rest is stored **separately** from general application secrets. This follows the principle of defense-in-depth: even if application secrets are compromised, the encryption key remains protected.

**Requirement**: 3.8 — Store AES-256 encryption key in Secret_Manager separate from application secrets, with access restricted to API server service account only.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Railway Project                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐ │
│  │  Application Secrets     │    │  Encryption Keys (Separate) │ │
│  │  (Shared Variable Group) │    │  (Dedicated Variable Group)  │ │
│  ├─────────────────────────┤    ├─────────────────────────────┤ │
│  │  DATABASE_URL            │    │  ENCRYPTION_KEY_AES256       │ │
│  │  REDIS_URL               │    │                              │ │
│  │  JWT_SECRET              │    │  (64 hex chars / 32 bytes)   │ │
│  │  R2_ACCESS_KEY_ID        │    │                              │ │
│  │  R2_SECRET_ACCESS_KEY    │    └──────────────┬──────────────┘ │
│  │  CLOUDFLARE_API_TOKEN    │                   │                │
│  │  ...                     │                   │                │
│  └──────────┬──────────────┘                   │                │
│             │                                   │                │
│             ▼                                   ▼                │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │  API Server       │◄─────────────│  API Server Only │         │
│  │  WebSocket Server │              │  (Restricted)    │         │
│  │  (All services)   │              └──────────────────┘         │
│  └──────────────────┘                                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Separation Strategy

### What is Separated

| Secret Category            | Storage Location                    | Access Scope                 |
| -------------------------- | ----------------------------------- | ---------------------------- |
| Database credentials       | Application Secrets group           | API Server, WebSocket Server |
| Redis credentials          | Application Secrets group           | API Server, WebSocket Server |
| JWT signing key            | Application Secrets group           | API Server                   |
| R2/Cloudflare keys         | Application Secrets group           | API Server                   |
| **AES-256 Encryption Key** | **Dedicated Encryption Keys group** | **API Server ONLY**          |

### Why Separate

1. **Blast radius reduction**: If application secrets are leaked (e.g., via CI log exposure), the encryption key remains safe
2. **Least privilege**: Only the API server needs the encryption key — WebSocket server, frontend apps, and CI runners never access it
3. **Audit trail**: Access to the encryption key group can be monitored independently
4. **Rotation independence**: The encryption key has different rotation requirements than application secrets
5. **Compliance**: Separation satisfies data protection requirements for PII encryption keys

## Railway Configuration

### Step 1: Create Dedicated Variable Group

In Railway Dashboard:

1. Navigate to your project → **Settings** → **Variables**
2. Create a new **Service Variable** scoped ONLY to the API server service
3. Name the variable: `ENCRYPTION_KEY_AES256`
4. Set the value: a cryptographically random 64-character hex string (32 bytes)

**Important**: Do NOT add this variable to the shared environment variables that are accessible by all services.

### Step 2: Generate the Key

Generate a cryptographically secure AES-256 key:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

### Step 3: Verify Service Scope

Ensure the variable is scoped correctly:

| Service              | Has ENCRYPTION_KEY_AES256? |
| -------------------- | -------------------------- |
| API Server (Fastify) | ✅ Yes                     |
| WebSocket Server     | ❌ No                      |
| Frontend (Vercel)    | ❌ No                      |
| CI/CD Runner         | ❌ No                      |

### Step 4: Verify in Application

The API server validates the key at startup:

```typescript
import { loadEncryptionKey } from './config/encryption-key';

// Throws if key is missing or invalid — prevents server from starting
// without proper encryption capability
const encryptionConfig = loadEncryptionKey();
```

## Access Control

### Who Can Access

| Actor                 | Can Read Key? | Can Modify Key? | Justification                                     |
| --------------------- | ------------- | --------------- | ------------------------------------------------- |
| API Server (runtime)  | ✅            | ❌              | Needs key for encrypt/decrypt operations          |
| Railway Admin (human) | ✅            | ✅              | Key provisioning and rotation                     |
| WebSocket Server      | ❌            | ❌              | Does not handle PII or QR payloads                |
| Frontend Apps         | ❌            | ❌              | Client-side apps never access encryption keys     |
| CI/CD Pipeline        | ❌            | ❌              | Tests use generated test keys, not production key |
| Other team members    | ❌            | ❌              | Only designated admin provisions the key          |

### Railway Service-Level Isolation

Railway supports service-scoped variables. The `ENCRYPTION_KEY_AES256` variable is configured as a **service-specific variable** on the API server service only, not as a shared/project-level variable.

This means:

- The variable is injected ONLY into the API server container at runtime
- Other services in the same Railway project cannot read it
- The variable does not appear in Railway's shared environment

## Key Usage in Application

The encryption key is used in two places:

### 1. QR Payload Encryption (`GuestService`)

```typescript
// packages/api/src/services/guest.service.ts
// Encrypts: guest_id|event_id|timestamp|nonce → AES-256-CBC ciphertext
```

### 2. PII Encryption at Rest (`PIIEncryption`)

```typescript
// packages/api/src/middleware/encryption.ts
// Encrypts: phone numbers, email addresses before database storage
```

Both consumers receive the key via dependency injection from the config loader:

```typescript
import { loadEncryptionKey } from '../config/encryption-key';

const { key } = loadEncryptionKey();
const piiEncryption = new PIIEncryption({ encryptionKey: key });
const guestService = new GuestService({ repository, encryptionKey: key });
```

## Key Rotation Procedure

When rotating the AES-256 encryption key:

1. **Generate new key**: `openssl rand -hex 32`
2. **Update Railway variable**: Change `ENCRYPTION_KEY_AES256` on the API server service
3. **Re-encrypt existing data**: Run migration script to decrypt with old key and re-encrypt with new key
4. **Verify**: Confirm QR codes and PII fields are accessible with new key
5. **Audit**: Log the rotation event with timestamp and operator

> ⚠️ **Warning**: Unlike JWT keys, there is no grace period for AES encryption keys. All encrypted data must be re-encrypted before the old key is removed. Plan rotation during maintenance windows.

## Monitoring & Alerts

### Startup Validation

The API server validates the encryption key at startup. If the key is missing or invalid:

- Server refuses to start
- Error logged: `[SECURITY] Failed to load AES-256 encryption key`
- Railway health check fails → triggers alert

### Runtime Monitoring

- Log encryption/decryption failures (without exposing key material)
- Alert on repeated decryption failures (may indicate key mismatch after rotation)
- Monitor for the key environment variable being unset (health check includes key validation)

## Testing

- **Unit tests**: Use randomly generated test keys (`crypto.randomBytes(32).toString('hex')`)
- **Integration tests**: Use dedicated test keys, never production keys
- **CI/CD**: Tests generate their own keys — the pipeline never needs access to the production encryption key

## Compliance Notes

- The encryption key is never logged, even in redacted form during normal operations
- The key is never transmitted over the network (injected as environment variable at container start)
- The key is never stored on disk in plaintext (Railway injects at runtime, not via `.env` files)
- The `.env` file in the repository does NOT contain the encryption key
- Pre-commit hooks block any commit containing hex strings that match key patterns
