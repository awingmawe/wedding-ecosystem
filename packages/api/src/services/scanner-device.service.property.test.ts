import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { ErrorCode, ScannerLane } from '@wedding/shared';
import {
  ScannerDeviceService,
  ScannerDeviceRepository,
  ScannerDeviceRecord,
  isScannerDeviceError,
  MAX_SCANNER_DEVICES_PER_EVENT,
} from './scanner-device.service';

// --- Arbitraries ---

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a device name (non-empty string) */
const arbDeviceName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

/** Generates a number of device registration attempts beyond the limit (3 to 8) */
const arbExtraAttempts = fc.integer({ min: 3, max: 8 });

// --- Test Helpers ---

/**
 * Creates an in-memory repository that tracks scanner devices per event.
 * Simulates real behavior: active device tracking, creation, and stale cleanup.
 */
function createInMemoryRepository(): ScannerDeviceRepository & {
  devices: ScannerDeviceRecord[];
} {
  const devices: ScannerDeviceRecord[] = [];
  let idCounter = 0;

  return {
    devices,
    findActiveDevicesByEventId: async (eventId: string) => {
      return devices.filter((d) => d.event_id === eventId && d.is_active);
    },
    findDeviceById: async (deviceId: string) => {
      return devices.find((d) => d.id === deviceId) ?? null;
    },
    createDevice: async (data) => {
      const record: ScannerDeviceRecord = {
        id: data.id,
        event_id: data.event_id,
        device_name: data.device_name,
        lane: data.lane,
        is_active: data.is_active,
        last_active_at: data.last_active_at,
      };
      devices.push(record);
      return record;
    },
    updateDeviceHeartbeat: async (deviceId: string, lastActiveAt: Date) => {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) throw new Error('Device not found');
      device.last_active_at = lastActiveAt;
      return device;
    },
    deactivateDevice: async (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) throw new Error('Device not found');
      device.is_active = false;
      return device;
    },
    deactivateStaleDevices: async (_eventId: string, _threshold: Date) => {
      // In these tests, no devices are stale (all recently created)
      return 0;
    },
  };
}

// --- Property Tests ---

describe('Property 12: Scanner Device Limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirement 7.6**
   *
   * For any event, the system SHALL enforce a maximum of 2 active scanner
   * devices simultaneously. The number of active devices SHALL never exceed
   * MAX_SCANNER_DEVICES_PER_EVENT (2).
   */
  it('active scanner device count never exceeds 2 regardless of registration attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbExtraAttempts,
        fc.array(arbDeviceName, { minLength: 3, maxLength: 8 }),
        async (eventId, _extraAttempts, deviceNames) => {
          const repository = createInMemoryRepository();
          const service = new ScannerDeviceService({ repository });

          // Attempt to register all devices
          for (const name of deviceNames) {
            await service.registerDevice(eventId, name);
          }

          // Property: active device count NEVER exceeds MAX_SCANNER_DEVICES_PER_EVENT
          const activeDevices = repository.devices.filter(
            (d) => d.event_id === eventId && d.is_active
          );
          expect(activeDevices.length).toBeLessThanOrEqual(
            MAX_SCANNER_DEVICES_PER_EVENT
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 7.6**
   *
   * For any event, the first 2 device registrations SHALL succeed,
   * and any subsequent attempt SHALL be rejected with SCANNER_LIMIT_REACHED error.
   */
  it('first 2 registrations succeed and 3rd+ are rejected with SCANNER_LIMIT_REACHED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbDeviceName,
        arbDeviceName,
        arbDeviceName,
        async (eventId, name1, name2, name3) => {
          const repository = createInMemoryRepository();
          const service = new ScannerDeviceService({ repository });

          // Register first device — should succeed
          const result1 = await service.registerDevice(eventId, name1);
          expect(isScannerDeviceError(result1)).toBe(false);

          // Register second device — should succeed
          const result2 = await service.registerDevice(eventId, name2);
          expect(isScannerDeviceError(result2)).toBe(false);

          // Register third device — should be rejected
          const result3 = await service.registerDevice(eventId, name3);
          expect(isScannerDeviceError(result3)).toBe(true);
          if (isScannerDeviceError(result3)) {
            expect(result3.code).toBe(ErrorCode.SCANNER_LIMIT_REACHED);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 7.6**
   *
   * For any event with 2 active devices, deactivating one device and then
   * registering a new one SHALL succeed — the limit is on concurrent active
   * devices, not total registrations.
   */
  it('deactivating a device frees a slot for a new registration', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbDeviceName,
        arbDeviceName,
        arbDeviceName,
        async (eventId, name1, name2, name3) => {
          const repository = createInMemoryRepository();
          const service = new ScannerDeviceService({ repository });

          // Register 2 devices (fill the limit)
          const result1 = await service.registerDevice(eventId, name1);
          const result2 = await service.registerDevice(eventId, name2);
          expect(isScannerDeviceError(result1)).toBe(false);
          expect(isScannerDeviceError(result2)).toBe(false);

          // Deactivate the first device
          if (!isScannerDeviceError(result1)) {
            await service.deactivateDevice(result1.id);
          }

          // Register a 3rd device — should now succeed since only 1 is active
          const result3 = await service.registerDevice(eventId, name3);
          expect(isScannerDeviceError(result3)).toBe(false);

          // Property: active count is still <= 2
          const activeDevices = repository.devices.filter(
            (d) => d.event_id === eventId && d.is_active
          );
          expect(activeDevices.length).toBeLessThanOrEqual(
            MAX_SCANNER_DEVICES_PER_EVENT
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 7.6**
   *
   * For any two different events, the scanner device limit is enforced
   * independently — filling the limit on one event does not affect another.
   */
  it('device limit is enforced independently per event', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbEventId.filter((id2) => id2 !== ''),
        arbDeviceName,
        arbDeviceName,
        arbDeviceName,
        async (eventId1, eventId2, name1, name2, name3) => {
          // Ensure different event IDs
          fc.pre(eventId1 !== eventId2);

          const repository = createInMemoryRepository();
          const service = new ScannerDeviceService({ repository });

          // Fill event 1 to the limit (2 devices)
          await service.registerDevice(eventId1, name1);
          await service.registerDevice(eventId1, name2);

          // Register on event 2 — should succeed (independent limit)
          const result = await service.registerDevice(eventId2, name3);
          expect(isScannerDeviceError(result)).toBe(false);

          // Property: each event's active count is independently <= 2
          const activeEvent1 = repository.devices.filter(
            (d) => d.event_id === eventId1 && d.is_active
          );
          const activeEvent2 = repository.devices.filter(
            (d) => d.event_id === eventId2 && d.is_active
          );
          expect(activeEvent1.length).toBeLessThanOrEqual(
            MAX_SCANNER_DEVICES_PER_EVENT
          );
          expect(activeEvent2.length).toBeLessThanOrEqual(
            MAX_SCANNER_DEVICES_PER_EVENT
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
