-- CreateIndex: Production performance indexes
-- Requirement 4.7: Indexes on frequently queried columns

-- guests.event_id - for fetching guests by event (single-column index supplements composite unique)
CREATE INDEX "guests_event_id_idx" ON "guests"("event_id");

-- qr_codes.guest_id - for looking up QR codes by guest
CREATE INDEX "qr_codes_guest_id_idx" ON "qr_codes"("guest_id");

-- rsvps.guest_id - for looking up RSVPs by guest
CREATE INDEX "rsvps_guest_id_idx" ON "rsvps"("guest_id");

-- check_ins.guest_id - for looking up check-ins by guest (duplicate detection)
CREATE INDEX "check_ins_guest_id_idx" ON "check_ins"("guest_id");

-- check_ins.checked_in_at - for time-range queries on check-in history
CREATE INDEX "check_ins_checked_in_at_idx" ON "check_ins"("checked_in_at");

-- invitation_sections.event_id - for fetching sections by event
CREATE INDEX "invitation_sections_event_id_idx" ON "invitation_sections"("event_id");

-- scanner_devices.event_id - for fetching scanner devices by event
CREATE INDEX "scanner_devices_event_id_idx" ON "scanner_devices"("event_id");

-- messages.event_id - for fetching messages/wishes by event
CREATE INDEX "messages_event_id_idx" ON "messages"("event_id");
