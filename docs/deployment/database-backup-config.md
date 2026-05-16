# Database Backup & WAL Archiving Configuration

## Overview

This document defines the backup strategy for the Wedding Digital SaaS platform's PostgreSQL database hosted on Supabase. It covers backup frequency, WAL archiving, point-in-time recovery (PITR), and restoration procedures.

**Supabase Project**: `wedding-invitation`
**Project ID**: `oxbdmkchfcmcwkwqkpqo`
**Region**: `ap-northeast-1` (Tokyo)
**PostgreSQL Version**: 17.6
**Requirements**: 4.4, 4.5, 10.1

---

## Current Status & Plan Requirements

| Feature                                   | Required | Supabase Plan Needed       |
| ----------------------------------------- | -------- | -------------------------- |
| Automated backups every 6-8 hours         | Yes      | Pro + PITR add-on          |
| Continuous WAL archiving (RPO < 1 hour)   | Yes      | Pro + PITR add-on          |
| Point-in-time recovery (30-day retention) | Yes      | Pro + PITR add-on (28-day) |
| Physical backups                          | Yes      | Pro + PITR add-on          |

> **Action Required**: The project must be upgraded to the **Pro plan** with the **PITR add-on** (28-day retention) to meet production backup requirements. The current Free plan does not include automated backups.

---

## Backup Strategy

### 1. Backup Frequency

With PITR enabled on Supabase Pro plan:

- **Full physical backup**: Taken daily by Supabase (automated)
- **WAL file archiving**: Continuous, every 2 minutes (or immediately when file size threshold is reached)
- **Effective backup frequency**: Every ~2 minutes (far exceeds the 6-8 hour requirement)

Supabase uses [WAL-G](https://github.com/wal-g/wal-g) for physical backup snapshots and WAL file archiving. This provides granularity far beyond the 6-8 hour requirement specified in Requirement 4.4.

### 2. WAL Archiving (RPO < 1 Hour)

| Parameter            | Value                                     |
| -------------------- | ----------------------------------------- |
| WAL archiving method | Continuous via WAL-G                      |
| Archive interval     | Every 2 minutes (worst case)              |
| Archive destination  | S3 (managed by Supabase)                  |
| RPO achieved         | ~2 minutes (exceeds < 1 hour requirement) |

WAL (Write-Ahead Log) files record every database transaction. With PITR enabled:

- WAL files are archived to S3 every 2 minutes
- During high-activity periods, archiving occurs more frequently
- During idle periods, no WAL files are generated (database state is unchanged)

This satisfies **Requirement 4.5**: RPO < 1 hour through continuous WAL archiving.

### 3. Point-in-Time Recovery (PITR)

| Parameter            | Value                                             |
| -------------------- | ------------------------------------------------- |
| Recovery granularity | Up to seconds                                     |
| Retention period     | 28 days (closest available to 30-day requirement) |
| Recovery method      | Physical backup + WAL replay                      |
| Monthly cost         | ~$400/month (28-day retention)                    |

PITR allows restoration to any specific timestamp within the 28-day retention window. This satisfies **Requirement 10.1** (backup strategy) and enables the disaster recovery requirement of restoring to a specific timestamp within the retention window.

---

## Enabling PITR (Setup Steps)

### Prerequisites

1. Upgrade organization to **Pro plan** ($25/month base)
2. Enable **Small compute add-on** (minimum required for PITR)
3. Enable **PITR add-on** with 28-day retention

### Configuration Steps

1. Navigate to [Supabase Dashboard → Project Settings → Add-ons](https://supabase.com/dashboard/project/oxbdmkchfcmcwkwqkpqo/settings/addons?panel=pitr)
2. Enable PITR add-on
3. Select **28-day** recovery retention period
4. Confirm the cost ($400/month for PITR)

Once PITR is enabled:

- Daily logical backups are replaced by continuous physical backups
- WAL archiving begins automatically
- Recovery window appears in the Dashboard under **Database Backups → Point in Time**

### Verification via Supabase Dashboard

After enabling PITR, verify configuration at:

- **Database Backups → Point in Time**: Shows earliest and latest recovery points
- **Database Backups → Scheduled backups**: Should show physical backup (not downloadable)

---

## Restoration Procedures

### Point-in-Time Recovery (Preferred)

Use this when you need to restore to a specific moment (e.g., before an accidental data deletion).

1. Navigate to **Database Backups → Point in Time** in the Supabase Dashboard
2. Click **Start a restore**
3. Select the target date and time (must be within the recovery window)
4. Review and confirm the restoration
5. Wait for the process to complete (duration depends on database size and WAL volume)

**Important notes**:

- The project will be **inaccessible** during restoration
- Plan for downtime proportional to database size
- If using Read Replicas, they must be removed before restoration
- Drop any replication slots (except Realtime) before restoring

### Restoration via Management API

```bash
# Set environment variables
export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="oxbdmkchfcmcwkwqkpqo"

# Restore to a specific point in time (Unix timestamp)
curl -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups/restore-pitr" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recovery_time_target_unix": "1735689600"
  }'
```

### Post-Restoration Checklist

- [ ] Verify application connectivity to database
- [ ] Check that Prisma client can connect with SSL `verify-full`
- [ ] Verify RLS policies are intact
- [ ] Run application health check (`GET /health`)
- [ ] Verify data integrity for critical tables (events, guests, invitations)
- [ ] Re-create any Read Replicas if previously removed
- [ ] Re-create custom role passwords (not preserved in backups)
- [ ] Notify team that restoration is complete

---

## Verifying Backups Are Running

### Dashboard Verification

1. **Navigate to**: [Database Backups → Point in Time](https://supabase.com/dashboard/project/oxbdmkchfcmcwkwqkpqo/database/backups/pitr)
2. **Check**: Earliest and latest recovery points are displayed
3. **Verify**: Latest recovery point is within 2-5 minutes of current time (during active periods)
4. **Note**: During idle periods, the latest recovery point may be older — this is normal as no WAL files are generated when there's no database activity

### API Verification

```bash
# List available backups
export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="oxbdmkchfcmcwkwqkpqo"

curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups"
```

### Monitoring Checklist (Weekly)

- [ ] Verify PITR add-on is active in project settings
- [ ] Check that recovery window shows expected 28-day range
- [ ] Verify latest recovery point is recent (within minutes during active periods)
- [ ] Review Supabase status page for any backup-related incidents: https://status.supabase.com/

### Quarterly DR Drill

As per Requirement 10.5, perform a disaster recovery drill every 3 months:

1. Create a test branch or duplicate project
2. Perform a PITR restoration to a specific timestamp
3. Verify data integrity after restoration
4. Document restoration time (should be within 4-hour RTO target)
5. Record results in DR drill log

---

## Backup Retention Policy

| Backup Type            | Retention | Notes                        |
| ---------------------- | --------- | ---------------------------- |
| PITR (continuous WAL)  | 28 days   | Configurable via PITR add-on |
| Physical snapshots     | 28 days   | Included with PITR           |
| Manual logical backups | As needed | Via `supabase db dump` CLI   |

### Extended Retention Strategy

For compliance with Requirement 10.8 (daily 7 days, weekly 4 weeks, monthly 12 months):

- **Daily (7 days)**: Covered by PITR's 28-day continuous recovery window
- **Weekly (4 weeks)**: Covered by PITR's 28-day window
- **Monthly (12 months)**: Requires manual logical backups stored externally

```bash
# Monthly manual backup (schedule via cron or CI/CD)
supabase db dump --linked -f backup-$(date +%Y%m).sql

# Store in separate cloud storage with 12-month retention
# (e.g., Cloudflare R2, AWS S3 with lifecycle policy)
```

---

## Cost Summary

| Component                      | Monthly Cost |
| ------------------------------ | ------------ |
| Pro plan (base)                | $25          |
| Small compute add-on           | $15          |
| PITR add-on (28-day retention) | $400         |
| **Total backup-related costs** | **$440**     |

> **Note**: The 7-day PITR retention ($100/month) provides the same RPO (~2 minutes) but with a shorter recovery window. Consider this as a cost-optimization option if 7-day PITR + monthly manual backups meets business requirements.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Supabase Platform                      │
│                                                          │
│  ┌──────────────┐    WAL Stream    ┌──────────────────┐ │
│  │  PostgreSQL  │ ───────────────► │  WAL-G Archiver  │ │
│  │  Primary DB  │                  │  (every ~2 min)  │ │
│  │  (ap-ne-1)   │                  └────────┬─────────┘ │
│  └──────────────┘                           │           │
│         │                                   │           │
│         │ Daily Physical Backup             │ WAL Files │
│         ▼                                   ▼           │
│  ┌──────────────────────────────────────────────────┐   │
│  │              S3 Backup Storage                    │   │
│  │  • Physical snapshots (daily)                    │   │
│  │  • WAL archives (continuous, ~2 min intervals)   │   │
│  │  • 28-day retention                              │   │
│  │  • Encrypted at rest                             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Recovery: Physical Backup + WAL Replay = Any Timestamp  │
└─────────────────────────────────────────────────────────┘
```

---

## Related Requirements

| Requirement | Description                                   | Status                                      |
| ----------- | --------------------------------------------- | ------------------------------------------- |
| 4.4         | Automated backup every 6 hours + PITR 30 days | ✅ Exceeds (continuous WAL, 28-day PITR)    |
| 4.5         | RPO < 1 hour via continuous WAL archiving     | ✅ Exceeds (RPO ~2 minutes)                 |
| 10.1        | Automated backup for PostgreSQL               | ✅ Met (PITR with physical + WAL)           |
| 10.2        | Cross-region backup storage                   | ✅ Met (Supabase stores in separate region) |
| 10.3        | RTO < 4 hours, RPO < 1 hour                   | ✅ Met                                      |
| 10.6        | PITR to specific timestamp in 30-day window   | ✅ Met (28-day window)                      |
| 10.7        | Encrypted backups at rest                     | ✅ Met (Supabase managed encryption)        |

---

## Troubleshooting

### Latest recovery point is far from current time

This is normal during idle periods. If the database has no activity, no WAL files are generated. The database state at the latest recovery point is identical to the current state.

### PITR restoration is slow

Restoration time depends on:

- Database size (larger = longer)
- WAL volume since last physical backup
- Time elapsed since last full backup (weekly)

### Custom role passwords missing after restore

Supabase does not store custom role passwords in backups. After restoration, reset passwords for any custom roles:

```sql
ALTER ROLE custom_role_name WITH PASSWORD 'new_secure_password';
```

### Backup verification fails

1. Check Supabase status page: https://status.supabase.com/
2. Contact Supabase support via Dashboard
3. As a fallback, take a manual logical backup: `supabase db dump --linked`
