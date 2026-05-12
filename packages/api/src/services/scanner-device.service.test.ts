import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ScannerDeviceService,
  ScannerDeviceRepository,
  ScannerDeviceRecord,
  isScannerDeviceError,
  MAX_SCANNER_DEVICES_PER_EVENT,
  STALE_DEVICE_THRESHOLD_MS,
} from './scanner-device.service';
import { ErrorCode, ScannerLane } from '@wedding/shared';

// --- Test Helpers ---

function createMockRepository(): ScannerDeviceRepository {
  return {
    findActiveDevicesByEventId: vi.fn().mockResolvedValue([]),
    findDeviceById: vi.fn(),
    createDevice: vi.fn(),
    updateDeviceHeartbeat: vi.fn(),
    deactivateDevice: vi.fn(),
    deactivateStaleDevices: vi.fn().mockResolvedValue(0),
  };
}

function createMockDevice(overrides: Partial<ScannerDeviceRecord> = {}): ScannerDeviceRecord {
  return {
    id: 'device-001',
    event_id: 'event-001',
    device_name: 'Scanner A',
    lane: ScannerLane.LANE_1,
    is_active: true,
    last_active_at: new Date(),
    ...overrides,
  };
}

// --- Tests ---

describe('ScannerDeviceService', () => {
  let service: ScannerDeviceService;
  let repository: ScannerDeviceRepository;

  beforeEach(() => {
    repository = createMockRepository();
    service = new ScannerDeviceService({ repository });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerDevice', () => {
    describe('successful registration (Req 7.6)', () => {
      it('should register first device with lane_1', async () => {
        const mockDevice = createMockDevice({ lane: ScannerLane.LANE_1 });
        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);
        vi.mocked(repository.createDevice).mockResolvedValue(mockDevice);

        const result = await service.registerDevice('event-001', 'Scanner A');

        expect(isScannerDeviceError(result)).toBe(false);
        if (!isScannerDeviceError(result)) {
          expect(result.lane).toBe(ScannerLane.LANE_1);
          expect(result.is_active).toBe(true);
        }

        expect(repository.createDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            event_id: 'event-001',
            device_name: 'Scanner A',
            lane: ScannerLane.LANE_1,
            is_active: true,
          })
        );
      });

      it('should register second device with lane_2 when lane_1 is taken', async () => {
        const existingDevice = createMockDevice({ lane: ScannerLane.LANE_1 });
        const newDevice = createMockDevice({
          id: 'device-002',
          device_name: 'Scanner B',
          lane: ScannerLane.LANE_2,
        });

        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([existingDevice]);
        vi.mocked(repository.createDevice).mockResolvedValue(newDevice);

        const result = await service.registerDevice('event-001', 'Scanner B');

        expect(isScannerDeviceError(result)).toBe(false);
        if (!isScannerDeviceError(result)) {
          expect(result.lane).toBe(ScannerLane.LANE_2);
        }

        expect(repository.createDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            lane: ScannerLane.LANE_2,
          })
        );
      });

      it('should assign lane_1 when only lane_2 is active', async () => {
        const existingDevice = createMockDevice({ lane: ScannerLane.LANE_2 });
        const newDevice = createMockDevice({
          id: 'device-003',
          device_name: 'Scanner C',
          lane: ScannerLane.LANE_1,
        });

        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([existingDevice]);
        vi.mocked(repository.createDevice).mockResolvedValue(newDevice);

        const result = await service.registerDevice('event-001', 'Scanner C');

        expect(isScannerDeviceError(result)).toBe(false);
        expect(repository.createDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            lane: ScannerLane.LANE_1,
          })
        );
      });

      it('should set last_active_at to current time', async () => {
        const mockDevice = createMockDevice();
        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);
        vi.mocked(repository.createDevice).mockResolvedValue(mockDevice);

        await service.registerDevice('event-001', 'Scanner A');

        expect(repository.createDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            last_active_at: new Date('2024-06-15T10:00:00Z'),
          })
        );
      });
    });

    describe('reject 3rd device (Req 7.7)', () => {
      it('should reject when 2 active devices already exist', async () => {
        const device1 = createMockDevice({ id: 'device-001', lane: ScannerLane.LANE_1 });
        const device2 = createMockDevice({ id: 'device-002', lane: ScannerLane.LANE_2 });

        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([device1, device2]);

        const result = await service.registerDevice('event-001', 'Scanner C');

        expect(isScannerDeviceError(result)).toBe(true);
        if (isScannerDeviceError(result)) {
          expect(result.code).toBe(ErrorCode.SCANNER_LIMIT_REACHED);
          expect(result.message).toBe(
            'Batas maksimal 2 scanner device per event telah tercapai'
          );
        }
      });

      it('should not call createDevice when limit is reached', async () => {
        const device1 = createMockDevice({ id: 'device-001', lane: ScannerLane.LANE_1 });
        const device2 = createMockDevice({ id: 'device-002', lane: ScannerLane.LANE_2 });

        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([device1, device2]);

        await service.registerDevice('event-001', 'Scanner C');

        expect(repository.createDevice).not.toHaveBeenCalled();
      });
    });

    describe('stale device cleanup', () => {
      it('should deactivate stale devices before checking count', async () => {
        const mockDevice = createMockDevice();
        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);
        vi.mocked(repository.createDevice).mockResolvedValue(mockDevice);

        await service.registerDevice('event-001', 'Scanner A');

        const expectedThreshold = new Date(
          new Date('2024-06-15T10:00:00Z').getTime() - STALE_DEVICE_THRESHOLD_MS
        );
        expect(repository.deactivateStaleDevices).toHaveBeenCalledWith(
          'event-001',
          expectedThreshold
        );
      });

      it('should allow registration after stale devices are cleaned up', async () => {
        // Simulate: 2 devices existed but both were stale and got cleaned up
        const mockDevice = createMockDevice();
        vi.mocked(repository.deactivateStaleDevices).mockResolvedValue(2);
        vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);
        vi.mocked(repository.createDevice).mockResolvedValue(mockDevice);

        const result = await service.registerDevice('event-001', 'Scanner A');

        expect(isScannerDeviceError(result)).toBe(false);
      });
    });
  });

  describe('heartbeat', () => {
    it('should update last_active_at for active device', async () => {
      const mockDevice = createMockDevice();
      const updatedDevice = createMockDevice({
        last_active_at: new Date('2024-06-15T10:00:00Z'),
      });

      vi.mocked(repository.findDeviceById).mockResolvedValue(mockDevice);
      vi.mocked(repository.updateDeviceHeartbeat).mockResolvedValue(updatedDevice);

      const result = await service.heartbeat('device-001');

      expect(isScannerDeviceError(result)).toBe(false);
      expect(repository.updateDeviceHeartbeat).toHaveBeenCalledWith(
        'device-001',
        new Date('2024-06-15T10:00:00Z')
      );
    });

    it('should return error if device not found', async () => {
      vi.mocked(repository.findDeviceById).mockResolvedValue(null);

      const result = await service.heartbeat('nonexistent');

      expect(isScannerDeviceError(result)).toBe(true);
      if (isScannerDeviceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
        expect(result.message).toBe('Scanner device tidak ditemukan');
      }
    });

    it('should return error if device is inactive', async () => {
      const inactiveDevice = createMockDevice({ is_active: false });
      vi.mocked(repository.findDeviceById).mockResolvedValue(inactiveDevice);

      const result = await service.heartbeat('device-001');

      expect(isScannerDeviceError(result)).toBe(true);
      if (isScannerDeviceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
        expect(result.message).toBe('Scanner device sudah tidak aktif');
      }
    });
  });

  describe('deactivateDevice', () => {
    it('should deactivate an active device', async () => {
      const mockDevice = createMockDevice();
      const deactivatedDevice = createMockDevice({ is_active: false });

      vi.mocked(repository.findDeviceById).mockResolvedValue(mockDevice);
      vi.mocked(repository.deactivateDevice).mockResolvedValue(deactivatedDevice);

      const result = await service.deactivateDevice('device-001');

      expect(isScannerDeviceError(result)).toBe(false);
      if (!isScannerDeviceError(result)) {
        expect(result.is_active).toBe(false);
      }
      expect(repository.deactivateDevice).toHaveBeenCalledWith('device-001');
    });

    it('should return error if device not found', async () => {
      vi.mocked(repository.findDeviceById).mockResolvedValue(null);

      const result = await service.deactivateDevice('nonexistent');

      expect(isScannerDeviceError(result)).toBe(true);
      if (isScannerDeviceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
        expect(result.message).toBe('Scanner device tidak ditemukan');
      }
    });
  });

  describe('getActiveDevices', () => {
    it('should return active devices for an event', async () => {
      const devices = [
        createMockDevice({ id: 'device-001', lane: ScannerLane.LANE_1 }),
        createMockDevice({ id: 'device-002', lane: ScannerLane.LANE_2 }),
      ];

      vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue(devices);

      const result = await service.getActiveDevices('event-001');

      expect(result).toHaveLength(2);
      expect(result[0].lane).toBe(ScannerLane.LANE_1);
      expect(result[1].lane).toBe(ScannerLane.LANE_2);
    });

    it('should return empty array when no active devices', async () => {
      vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);

      const result = await service.getActiveDevices('event-001');

      expect(result).toHaveLength(0);
    });

    it('should clean up stale devices before returning', async () => {
      vi.mocked(repository.findActiveDevicesByEventId).mockResolvedValue([]);

      await service.getActiveDevices('event-001');

      expect(repository.deactivateStaleDevices).toHaveBeenCalledWith(
        'event-001',
        expect.any(Date)
      );
    });
  });

  describe('isScannerDeviceError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isScannerDeviceError({ code: ErrorCode.SCANNER_LIMIT_REACHED, message: 'Limit reached' })
      ).toBe(true);
    });

    it('should return false for device records', () => {
      expect(isScannerDeviceError(createMockDevice())).toBe(false);
    });

    it('should return false for null', () => {
      expect(isScannerDeviceError(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isScannerDeviceError([createMockDevice()])).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have MAX_SCANNER_DEVICES_PER_EVENT set to 2', () => {
      expect(MAX_SCANNER_DEVICES_PER_EVENT).toBe(2);
    });

    it('should have STALE_DEVICE_THRESHOLD_MS set to 5 minutes', () => {
      expect(STALE_DEVICE_THRESHOLD_MS).toBe(5 * 60 * 1000);
    });
  });
});
