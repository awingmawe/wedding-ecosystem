-- Row-Level Security (RLS) Policies for Multi-Tenant Isolation
-- This migration enables RLS on all tenant-scoped tables and creates policies
-- that enforce tenant isolation at the database level.
--
-- The application MUST set the session variable before executing queries:
--   SET LOCAL app.current_tenant_id = '<tenant-uuid>';
--
-- Tables with direct tenant_id: users, events, guests
-- Tables with indirect scoping via event_id: event_configs, invitation_sections, scanner_devices, messages
-- Tables with indirect scoping via guest_id: qr_codes, rsvps, check_ins

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scanner_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rsvps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "check_ins" ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FORCE RLS FOR TABLE OWNERS (prevents bypassing RLS as table owner)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "event_configs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitation_sections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "scanner_devices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "qr_codes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rsvps" FORCE ROW LEVEL SECURITY;
ALTER TABLE "check_ins" FORCE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- POLICIES FOR TABLES WITH DIRECT tenant_id
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── users ───────────────────────────────────────────────────────────────────

CREATE POLICY "users_tenant_isolation_select" ON "users"
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "users_tenant_isolation_insert" ON "users"
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "users_tenant_isolation_update" ON "users"
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "users_tenant_isolation_delete" ON "users"
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─── events ──────────────────────────────────────────────────────────────────

CREATE POLICY "events_tenant_isolation_select" ON "events"
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "events_tenant_isolation_insert" ON "events"
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "events_tenant_isolation_update" ON "events"
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "events_tenant_isolation_delete" ON "events"
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─── guests ──────────────────────────────────────────────────────────────────

CREATE POLICY "guests_tenant_isolation_select" ON "guests"
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "guests_tenant_isolation_insert" ON "guests"
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "guests_tenant_isolation_update" ON "guests"
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "guests_tenant_isolation_delete" ON "guests"
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- POLICIES FOR TABLES SCOPED VIA event_id → events.tenant_id
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── event_configs ───────────────────────────────────────────────────────────

CREATE POLICY "event_configs_tenant_isolation_select" ON "event_configs"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "event_configs".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "event_configs_tenant_isolation_insert" ON "event_configs"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "event_configs".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "event_configs_tenant_isolation_update" ON "event_configs"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "event_configs".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "event_configs".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "event_configs_tenant_isolation_delete" ON "event_configs"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "event_configs".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── invitation_sections ─────────────────────────────────────────────────────

CREATE POLICY "invitation_sections_tenant_isolation_select" ON "invitation_sections"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "invitation_sections".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "invitation_sections_tenant_isolation_insert" ON "invitation_sections"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "invitation_sections".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "invitation_sections_tenant_isolation_update" ON "invitation_sections"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "invitation_sections".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "invitation_sections".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "invitation_sections_tenant_isolation_delete" ON "invitation_sections"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "invitation_sections".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── scanner_devices ─────────────────────────────────────────────────────────

CREATE POLICY "scanner_devices_tenant_isolation_select" ON "scanner_devices"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "scanner_devices".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "scanner_devices_tenant_isolation_insert" ON "scanner_devices"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "scanner_devices".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "scanner_devices_tenant_isolation_update" ON "scanner_devices"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "scanner_devices".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "scanner_devices".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "scanner_devices_tenant_isolation_delete" ON "scanner_devices"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "scanner_devices".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── messages ────────────────────────────────────────────────────────────────

CREATE POLICY "messages_tenant_isolation_select" ON "messages"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "messages".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "messages_tenant_isolation_insert" ON "messages"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "messages".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "messages_tenant_isolation_update" ON "messages"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "messages".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "messages".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "messages_tenant_isolation_delete" ON "messages"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "events"
      WHERE "events".id = "messages".event_id
        AND "events".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- POLICIES FOR TABLES SCOPED VIA guest_id → guests.tenant_id
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── qr_codes ────────────────────────────────────────────────────────────────

CREATE POLICY "qr_codes_tenant_isolation_select" ON "qr_codes"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "qr_codes".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "qr_codes_tenant_isolation_insert" ON "qr_codes"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "qr_codes".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "qr_codes_tenant_isolation_update" ON "qr_codes"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "qr_codes".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "qr_codes".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "qr_codes_tenant_isolation_delete" ON "qr_codes"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "qr_codes".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── rsvps ───────────────────────────────────────────────────────────────────

CREATE POLICY "rsvps_tenant_isolation_select" ON "rsvps"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "rsvps".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "rsvps_tenant_isolation_insert" ON "rsvps"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "rsvps".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "rsvps_tenant_isolation_update" ON "rsvps"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "rsvps".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "rsvps".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "rsvps_tenant_isolation_delete" ON "rsvps"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "rsvps".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── check_ins ───────────────────────────────────────────────────────────────

CREATE POLICY "check_ins_tenant_isolation_select" ON "check_ins"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "check_ins".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "check_ins_tenant_isolation_insert" ON "check_ins"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "check_ins".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "check_ins_tenant_isolation_update" ON "check_ins"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "check_ins".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "check_ins".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "check_ins_tenant_isolation_delete" ON "check_ins"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "guests"
      WHERE "guests".id = "check_ins".guest_id
        AND "guests".tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );
