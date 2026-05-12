import { ErrorCode, ScannerLane } from '@wedding/shared';

// --- Constants ---

/** Maximum scanner devices allowed per event (Req 7.6) */
export const MAX_SCANNER_DEVICES_PER_EVENT = 2;

/** Stale device threshold in milliseconds (5 minutes) */
export const STALE_DEVICE_THRESHOLD_MS = 5 * 60 * 1000;

// --- Types ---

export interface ScannerDeviceRecord {
  id: string;
  event_id: string;
  device_name: string;
  lane: ScannerLane;
  is_active: boolean;
  last_active_at: Date;
}

export interface ScannerDeviceServiceError {
  code: ErrorCode;
  message: string;
}

// --- Repository interface (dependency injection) ---

export interface ScannerDeviceRepository {
  findActiveDevicesByEventId(eventId: string): Promise<ScannerDeviceRecord[]>;

  findDeviceById(deviceId: string): Promise<ScannerDeviceRecord | null>;

  createDevice(data: {
    id: string;
    event_id: string;
    device_name: string;
    lane: ScannerLane;
    is_active: boolean;
    last_active_at: Date;
  }): Promise<ScannerDeviceRecord>;

  updateDeviceHeartbeat(deviceId: string, lastActiveAt: Date): Promise<ScannerDeviceRecord>;

  deactivateDevice(deviceId: string): Promise<ScannerDeviceRecord>;

  deactivateStaleDevices(eventId: string, threshold: Date): Promise<number>;
}

// --- Scanner Device Service ---

export class ScannerDeviceService {
  private readonly repository: ScannerDeviceRepository;

  constructor(config: { repository: ScannerDeviceRepository }) {
    this.repository = config.repository;
  }

  /**
   * Register a new scanner device for an event (Req 7.6, 7.7)
   * - Cleans up stale devices first (inactive > 5 minutes)
   * - Enforces max 2 active scanner devices per event
   * - Auto-assigns lane (lane_1 or lane_2) based on available slots
   * - Rejects 3rd device with error message
   */
  async registerDevice(
    eventId: string,
    deviceName: string
  ): Promise<ScannerDeviceRecord | ScannerDeviceServiceError> {
    // Auto-deactivate stale devices (last_active_at > 5 minutes ago)
    const staleThreshold = new Date(Date.now() - STALE_DEVICE_THRESHOLD_MS);
    await this.repository.deactivateStaleDevices(eventId, staleThreshold);

    // Get current active devices for this event
    const activeDevices = await this.repository.findActiveDevicesByEventId(eventId);

    // Enforce max 2 scanner devices per event (Req 7.6)
    if (activeDevices.length >= MAX_SCANNER_DEVICES_PER_EVENT) {
      return {
        code: ErrorCode.SCANNER_LIMIT_REACHED,
        message: 'Batas maksimal 2 scanner device per event telah tercapai',
      };
    }

    // Auto-assign lane based on what's available
    const lane = this.assignLane(activeDevices);

    // Create the device record
    const { randomUUID } = await import('crypto');
    const device = await this.repository.createDevice({
      id: randomUUID(),
      event_id: eventId,
      device_name: deviceName,
      lane,
      is_active: true,
      last_active_at: new Date(),
    });

    return device;
  }

  /**
   * Update device heartbeat (Req 7.6)
   * Called periodically by scanner client to indicate device is still active
   */
  async heartbeat(
    deviceId: string
  ): Promise<ScannerDeviceRecord | ScannerDeviceServiceError> {
    const device = await this.repository.findDeviceById(deviceId);

    if (!device) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Scanner device tidak ditemukan',
      };
    }

    if (!device.is_active) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Scanner device sudah tidak aktif',
      };
    }

    return this.repository.updateDeviceHeartbeat(deviceId, new Date());
  }

  /**
   * Deactivate a scanner device (disconnect)
   * Sets is_active=false when device disconnects
   */
  async deactivateDevice(
    deviceId: string
  ): Promise<ScannerDeviceRecord | ScannerDeviceServiceError> {
    const device = await this.repository.findDeviceById(deviceId);

    if (!device) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Scanner device tidak ditemukan',
      };
    }

    return this.repository.deactivateDevice(deviceId);
  }

  /**
   * Get active devices for an event
   */
  async getActiveDevices(eventId: string): Promise<ScannerDeviceRecord[]> {
    // Clean up stale devices first
    const staleThreshold = new Date(Date.now() - STALE_DEVICE_THRESHOLD_MS);
    await this.repository.deactivateStaleDevices(eventId, staleThreshold);

    return this.repository.findActiveDevicesByEventId(eventId);
  }

  /**
   * Assign a lane to a new device based on currently active devices
   * Prefers lane_1 first, then lane_2
   */
  private assignLane(activeDevices: ScannerDeviceRecord[]): ScannerLane {
    const usedLanes = new Set(activeDevices.map((d) => d.lane));

    if (!usedLanes.has(ScannerLane.LANE_1)) {
      return ScannerLane.LANE_1;
    }

    return ScannerLane.LANE_2;
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is a ScannerDeviceServiceError
 */
export function isScannerDeviceError(
  result: ScannerDeviceRecord | ScannerDeviceRecord[] | null | ScannerDeviceServiceError
): result is ScannerDeviceServiceError {
  return (
    result !== null &&
    !Array.isArray(result) &&
    typeof result === 'object' &&
    'code' in result &&
    'message' in result &&
    !('id' in result)
  );
}
