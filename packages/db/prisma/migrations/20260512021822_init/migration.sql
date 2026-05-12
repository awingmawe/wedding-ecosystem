-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'client', 'wo', 'scanner');

-- CreateEnum
CREATE TYPE "GuestGroup" AS ENUM ('family', 'friend', 'colleague', 'vip');

-- CreateEnum
CREATE TYPE "GuestType" AS ENUM ('invited', 'go_show');

-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('akad', 'resepsi', 'both', 'decline');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('qr_scan', 'manual', 'go_show');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('cover', 'bride_groom', 'story', 'verse', 'countdown', 'akad_resepsi', 'rsvp', 'attire', 'gallery', 'video', 'gift', 'messages', 'closing', 'music');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'completed');

-- CreateEnum
CREATE TYPE "ScannerLane" AS ENUM ('lane_1', 'lane_2');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('basic', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('not_sent', 'sent', 'failed');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan_type" "PlanType" NOT NULL DEFAULT 'basic',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "bride_name" TEXT NOT NULL,
    "groom_name" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "venue_name" TEXT NOT NULL,
    "venue_address" TEXT NOT NULL,
    "venue_maps_url" TEXT NOT NULL,
    "akad_start" TEXT NOT NULL,
    "akad_end" TEXT NOT NULL,
    "resepsi_start" TEXT NOT NULL,
    "resepsi_end" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_configs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "theme_config" JSONB NOT NULL,
    "active_sections" JSONB NOT NULL,
    "invitation_music_url" TEXT,
    "calendar_link" TEXT,
    "max_scanner_devices" INTEGER NOT NULL DEFAULT 2,
    "max_guests" INTEGER NOT NULL DEFAULT 2000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "group" "GuestGroup" NOT NULL,
    "type" "GuestType" NOT NULL DEFAULT 'invited',
    "plus_one_count" INTEGER NOT NULL DEFAULT 0,
    "invitation_url" TEXT,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'not_sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "qr_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "attendance" "AttendanceType" NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "scanner_device_id" UUID,
    "method" "CheckInMethod" NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_sections" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "section_type" "SectionType" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_devices" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "device_name" TEXT NOT NULL,
    "lane" "ScannerLane" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "sender_name" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_tenant_id_idx" ON "events"("tenant_id");

-- CreateIndex
CREATE INDEX "events_slug_idx" ON "events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_configs_event_id_key" ON "event_configs"("event_id");

-- CreateIndex
CREATE INDEX "guests_tenant_id_idx" ON "guests"("tenant_id");

-- CreateIndex
CREATE INDEX "guests_slug_idx" ON "guests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "guests_event_id_slug_key" ON "guests"("event_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_qr_payload_key" ON "qr_codes"("qr_payload");

-- CreateIndex
CREATE INDEX "qr_codes_qr_payload_idx" ON "qr_codes"("qr_payload");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_sections_event_id_sort_order_key" ON "invitation_sections"("event_id", "sort_order");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_configs" ADD CONSTRAINT "event_configs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_scanner_device_id_fkey" FOREIGN KEY ("scanner_device_id") REFERENCES "scanner_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_sections" ADD CONSTRAINT "invitation_sections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
