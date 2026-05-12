/**
 * Check-in service for QR code verification.
 * Handles online verification via API and offline verification via local cache.
 * Returns color-coded verification results (GREEN, RED, YELLOW).
 */

import { getCachedGuestByQR, updateCachedGuestCheckIn } from './indexed-db';
import { enqueueCheckIn } from './offline-queue';

export type VerificationStatus = 'valid' | 'invalid' | 'duplicate';

export interface VerificationResult {
  status: VerificationStatus;
  guestName?: string;
  guestGroup?: string;
  errorMessage?: string;
  previousCheckInTime?: string;
}

interface CheckInApiResponse {
  status: 'valid' | 'invalid' | 'duplicate';
  guest?: {
    name: string;
    group: string;
  };
  error?: string;
  checkedInAt?: string;
}

/**
 * Verify a scanned QR code payload.
 * When online: sends to API for verification.
 * When offline: verifies against local IndexedDB cache.
 */
export async function verifyQRCode(
  qrPayload: string,
  options: {
    isOnline: boolean;
    apiBaseUrl: string;
    authToken: string;
    eventId: string;
  }
): Promise<VerificationResult> {
  if (options.isOnline) {
    return verifyOnline(qrPayload, options);
  }
  return verifyOffline(qrPayload, options.eventId);
}

/**
 * Online verification: send QR payload to API.
 */
async function verifyOnline(
  qrPayload: string,
  options: {
    apiBaseUrl: string;
    authToken: string;
    eventId: string;
  }
): Promise<VerificationResult> {
  try {
    const response = await fetch(`${options.apiBaseUrl}/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.authToken}`,
      },
      body: JSON.stringify({
        qrPayload,
        eventId: options.eventId,
      }),
    });

    const data: CheckInApiResponse = await response.json();

    if (response.ok && data.status === 'valid') {
      return {
        status: 'valid',
        guestName: data.guest?.name,
        guestGroup: data.guest?.group,
      };
    }

    if (response.status === 409 || data.status === 'duplicate') {
      return {
        status: 'duplicate',
        guestName: data.guest?.name,
        guestGroup: data.guest?.group,
        previousCheckInTime: data.checkedInAt,
      };
    }

    // 404 or other error — invalid QR
    return {
      status: 'invalid',
      errorMessage: data.error || 'QR code tidak valid',
    };
  } catch {
    // Network error — fall back to offline verification
    return verifyOffline(qrPayload, options.eventId);
  }
}

/**
 * Offline verification: check against local IndexedDB cache.
 * Also queues the check-in for later sync.
 */
async function verifyOffline(
  qrPayload: string,
  eventId: string
): Promise<VerificationResult> {
  try {
    const cachedGuest = await getCachedGuestByQR(qrPayload);

    if (!cachedGuest) {
      return {
        status: 'invalid',
        errorMessage: 'QR tidak ditemukan di cache lokal',
      };
    }

    // Check if guest belongs to the current event
    if (cachedGuest.eventId !== eventId) {
      return {
        status: 'invalid',
        errorMessage: 'QR milik event lain',
      };
    }

    // Check for duplicate
    if (cachedGuest.checkedIn) {
      return {
        status: 'duplicate',
        guestName: cachedGuest.name,
        guestGroup: cachedGuest.group,
        previousCheckInTime: cachedGuest.checkedInAt,
      };
    }

    // Valid — queue the check-in locally
    const checkedInAt = new Date().toISOString();
    await enqueueCheckIn({
      guestId: cachedGuest.id,
      qrPayload,
      method: 'qr_scan',
      eventId,
      guestName: cachedGuest.name,
    });

    // Update local cache to reflect check-in
    await updateCachedGuestCheckIn(cachedGuest.id, checkedInAt);

    return {
      status: 'valid',
      guestName: cachedGuest.name,
      guestGroup: cachedGuest.group,
    };
  } catch {
    return {
      status: 'invalid',
      errorMessage: 'Gagal memverifikasi — coba lagi',
    };
  }
}
