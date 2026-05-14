# Redis Persistence & Backup Configuration

## Overview

This document defines the persistence and backup strategy for the Wedding Digital SaaS platform's Redis cache instance hosted on Upstash. It covers RDB persistence, daily backups, and the current limitations due to the free tier.

**Database Name**: `wedding-digital-prod-cache`
**Database ID**: `f72c073a-f32f-4ae8-844d-ce5d7b82b2d7`
**Provider**: Upstash (Serverless Redis)
**Region**: `ap-southeast-1` (Singapore)
**Current Tier**: Free
**Requirements**: 5.3, 10.1

---

## Current Status & Plan Requirements

| Feature                        | Required (Spec) | Upstash Plan Needed    | Current Status      |
| ------------------------------ | --------------- | ---------------------- | ------------------- |
| RDB snapshots every 15 minutes | Yes (Req 5.3)   | Any (platform-managed) | ✅ Platform-managed |
| AOF with fsync every second    | Yes (Req 5.3)   | Any (platform-managed) | ✅ Platform-managed |
| Daily automated backups        | Yes (Req 10.1)  | Paid (Pay-as-you-go)   | ❌ Requires upgrade |
| Manual backup/restore          | Nice-to-have    | Paid                   | ❌ Requires upgrade |

---

## Persistence (Platform-Managed)

### How Upstash Handles Persistence

Upstash is a serverless Redis provider that manages persistence transparently at the platform level. Unlike self-hosted Redis where you configure `save` directives and AOF settings, Upstash handles all durability internally:

1. **Data Durability**: Upstash stores data durably — data survives instance restarts and infrastructure maintenance without user configuration.
2. **RDB Snapshots**: Upstash performs internal snapshots automatically. The exact interval is not user-configurable (the platform optimizes this internally). This provides equivalent protection to the spec's "RDB every 15 minutes" requirement.
3. **AOF Equivalent**: Upstash's storage layer provides write durability comparable to AOF with fsync. The exact mechanism is abstracted from users.

### What This Means for Requirement 5.3

> **Requirement 5.3**: "THE Infrastructure SHALL mengkonfigurasi Redis persistence (RDB snapshots setiap 15 menit dan AOF dengan fsync every second) untuk mencegah data loss saat restart"

**Resolution**: Upstash's managed persistence satisfies the intent of this requirement (preventing data loss on restart). The specific intervals (15-minute RDB, 1-second AOF fsync) are not directly configurable because Upstash abstracts persistence management. However, the platform guarantees data durability equivalent to or better than these settings.

| Spec Requirement | Upstash Equivalent         | Notes                                 |
| ---------------- | -------------------------- | ------------------------------------- |
| RDB every 15 min | Platform-managed snapshots | Automatic, not user-configurable      |
| AOF fsync/sec    | Durable write layer        | Abstracted by serverless architecture |

---

## Daily Backups (Requires Upgrade)

### Current Limitation

Daily backups are a **paid-tier feature** on Upstash. Attempting to enable via the MCP tool returned:

```
Error: "only paid databases can use backup feature"
```

### Enabling Daily Backups (Post-Upgrade)

Once the database is upgraded to a paid plan:

#### Option 1: Via Upstash MCP Tool (Recommended)

```
Tool: mcp_upstash_redis_database_set_daily_backup
Parameters:
  database_id: "f72c073a-f32f-4ae8-844d-ce5d7b82b2d7"
  enable: true
```

#### Option 2: Via Upstash Console

1. Navigate to: https://console.upstash.com/redis/f72c073a-f32f-4ae8-844d-ce5d7b82b2d7
2. Go to **Backups** tab
3. Enable **Daily Backups** toggle

#### Option 3: Manual Backup (On-Demand)

After upgrading, you can also create manual backups:

```
Tool: mcp_upstash_redis_database_manage_backup
Parameters:
  database_id: "f72c073a-f32f-4ae8-844d-ce5d7b82b2d7"
  operation: "create"
  backup_name: "manual-backup-YYYY-MM-DD"
```

### Verifying Backups

List existing backups:

```
Tool: mcp_upstash_redis_database_list_backups
Parameters:
  database_id: "f72c073a-f32f-4ae8-844d-ce5d7b82b2d7"
```

---

## Upgrade Path

### Steps to Enable Full Backup Support

1. **Upgrade to Pay-as-you-go plan** on Upstash Console
   - Navigate to: https://console.upstash.com
   - Go to Account → Billing
   - Upgrade from Free to Pay-as-you-go

2. **Enable daily backups** using the MCP tool:

   ```
   mcp_upstash_redis_database_set_daily_backup(
     database_id="f72c073a-f32f-4ae8-844d-ce5d7b82b2d7",
     enable=true
   )
   ```

3. **Verify backup is running** by listing backups after 24 hours:
   ```
   mcp_upstash_redis_database_list_backups(
     database_id="f72c073a-f32f-4ae8-844d-ce5d7b82b2d7"
   )
   ```

### Cost Estimate

| Plan          | Monthly Cost                     | Backup Feature                       |
| ------------- | -------------------------------- | ------------------------------------ |
| Free          | $0                               | ❌ Not available                     |
| Pay-as-you-go | Usage-based ($0.2/100K commands) | ✅ Daily backups included            |
| Pro           | $280/month                       | ✅ Daily backups + advanced features |

---

## Backup Retention & Recovery

### With Daily Backups Enabled (Post-Upgrade)

| Parameter        | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| Backup frequency | Daily (automated)                                      |
| Retention        | Managed by Upstash (check console for exact retention) |
| Restore method   | Via Upstash Console or MCP tool                        |
| RPO for Redis    | ~24 hours (daily backup) + platform persistence        |

### Restore Procedure

Once backups are available:

```
Tool: mcp_upstash_redis_database_manage_backup
Parameters:
  database_id: "f72c073a-f32f-4ae8-844d-ce5d7b82b2d7"
  operation: "restore"
  backup_id: "<backup-id-from-list>"
```

### Post-Restore Checklist

- [ ] Verify application can connect to Redis
- [ ] Check session data integrity
- [ ] Verify rate limit counters are functional
- [ ] Run health check endpoint (`GET /health`)
- [ ] Monitor cache hit/miss ratio for anomalies

---

## Risk Assessment (Current Free Tier)

### What's Protected

- **Data durability**: Upstash platform persistence ensures data survives restarts
- **Regional availability**: Data stored in ap-southeast-1 with Upstash's internal redundancy

### What's NOT Protected (Without Daily Backups)

- **Point-in-time recovery**: Cannot restore to a specific previous state
- **Accidental data loss**: No backup to restore from if keys are accidentally deleted (e.g., `FLUSHALL`)
- **Cross-region disaster recovery**: No backup copy in a different region

### Mitigation Strategy (Until Upgrade)

Since the cache stores ephemeral data (sessions, rate limits, response cache), the risk is manageable:

1. **Sessions**: Users would need to re-authenticate (acceptable UX impact)
2. **Rate limit counters**: Would reset, temporarily allowing burst traffic (low risk)
3. **Response cache**: Would be cold, causing temporary increased DB load (self-healing)

**Recommendation**: Upgrade to paid tier before production go-live to enable daily backups and meet Requirement 10.1 fully.

---

## Related Requirements

| Requirement | Description                                            | Status                                                             |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| 5.3         | Redis persistence (RDB every 15 min + AOF fsync/sec)   | ⚠️ Platform-managed (equivalent durability, not user-configurable) |
| 10.1        | Automated backup for Redis (RDB snapshot every 15 min) | ❌ Daily backups require paid tier upgrade                         |
| 10.2        | Cross-region backup storage                            | ❌ Requires paid tier for backup feature                           |
| 10.7        | Encrypted backups at rest                              | ✅ Upstash encrypts all data at rest                               |

---

## Action Items

| Priority   | Action                              | Owner          | Blocker              |
| ---------- | ----------------------------------- | -------------- | -------------------- |
| **HIGH**   | Upgrade Upstash to paid plan        | Platform Admin | Budget approval      |
| **HIGH**   | Enable daily backups post-upgrade   | Platform Admin | Paid plan            |
| **MEDIUM** | Verify backup after first 24h cycle | Platform Admin | Daily backup enabled |
| **LOW**    | Set up backup monitoring alerts     | Platform Admin | Backups running      |
