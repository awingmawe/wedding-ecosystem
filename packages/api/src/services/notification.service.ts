import { ErrorCode } from '@wedding/shared';
import { DeliveryStatus } from '@wedding/shared';

// --- Constants ---

/** Maximum guests per batch send (Req 14.3) */
export const MAX_BATCH_SIZE = 500;

// --- Types ---

/** Channel through which the invitation is sent */
export type NotificationChannel = 'whatsapp' | 'email';

/** Result of a single send attempt */
export interface SendResult {
  guest_id: string;
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

/** Delivery log entry for failed sends */
export interface DeliveryLog {
  guest_id: string;
  channel: NotificationChannel;
  error: string;
  timestamp: Date;
}

/** Guest data needed for notification sending */
export interface NotificationGuest {
  id: string;
  event_id: string;
  tenant_id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  invitation_url: string | null;
  delivery_status: DeliveryStatus;
}

/** Input for sending invitation to a single guest */
export interface SendInvitationInput {
  guest_id: string;
  channel: NotificationChannel;
}

/** Input for bulk sending invitations */
export interface BulkSendInput {
  guest_ids: string[];
  channel: NotificationChannel;
}

/** Result of a bulk send operation */
export interface BulkSendResult {
  total: number;
  sent: number;
  failed: number;
  results: SendResult[];
}

/** Contact completeness check result */
export interface ContactCheck {
  can_send: boolean;
  available_channels: NotificationChannel[];
  message?: string;
}

export interface NotificationServiceError {
  code: ErrorCode;
  message: string;
}

// --- Provider interfaces (abstraction for WhatsApp/Email) ---

/** WhatsApp sending provider interface */
export interface WhatsAppProvider {
  send(phone: string, message: string): Promise<{ success: boolean; error?: string }>;
}

/** Email sending provider interface */
export interface EmailProvider {
  send(
    email: string,
    subject: string,
    body: string
  ): Promise<{ success: boolean; error?: string }>;
}

// --- Repository interface (dependency injection) ---

export interface NotificationRepository {
  findGuestById(guestId: string, tenantId: string): Promise<NotificationGuest | null>;

  findGuestsByIds(guestIds: string[], tenantId: string): Promise<NotificationGuest[]>;

  findEventById(
    eventId: string,
    tenantId: string
  ): Promise<{ id: string; slug: string } | null>;

  updateDeliveryStatus(
    guestId: string,
    tenantId: string,
    status: DeliveryStatus
  ): Promise<boolean>;

  logDeliveryFailure(log: DeliveryLog): Promise<void>;
}

// --- Notification Service ---

export class NotificationService {
  private readonly repository: NotificationRepository;
  private readonly whatsappProvider: WhatsAppProvider;
  private readonly emailProvider: EmailProvider;
  private readonly baseUrl: string;

  constructor(config: {
    repository: NotificationRepository;
    whatsappProvider: WhatsAppProvider;
    emailProvider: EmailProvider;
    baseUrl: string;
  }) {
    this.repository = config.repository;
    this.whatsappProvider = config.whatsappProvider;
    this.emailProvider = config.emailProvider;
    this.baseUrl = config.baseUrl;
  }

  // --- Contact Completeness Check ---

  /**
   * Check if a guest has sufficient contact info for sending (Req 14.5)
   * Guest must have at least phone OR email to receive invitations
   */
  checkContactCompleteness(guest: NotificationGuest): ContactCheck {
    const availableChannels: NotificationChannel[] = [];

    if (guest.phone) {
      availableChannels.push('whatsapp');
    }
    if (guest.email) {
      availableChannels.push('email');
    }

    if (availableChannels.length === 0) {
      return {
        can_send: false,
        available_channels: [],
        message: 'Data kontak (phone dan email) harus dilengkapi sebelum undangan dapat dikirim',
      };
    }

    return {
      can_send: true,
      available_channels: availableChannels,
    };
  }

  // --- Send Individual Invitation ---

  /**
   * Send invitation to a single guest (Req 14.1, 14.2, 14.4)
   * - Validates guest exists and has contact info
   * - Includes personalized invitation_url
   * - Updates delivery status
   * - Logs failures with error details (Req 14.6)
   */
  async sendInvitation(
    input: SendInvitationInput,
    eventId: string,
    tenantId: string
  ): Promise<SendResult | NotificationServiceError> {
    // Find guest
    const guest = await this.repository.findGuestById(input.guest_id, tenantId);
    if (!guest) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    // Verify guest belongs to the event
    if (guest.event_id !== eventId) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Tamu tidak ditemukan dalam event ini',
      };
    }

    // Check contact completeness (Req 14.5)
    const contactCheck = this.checkContactCompleteness(guest);
    if (!contactCheck.can_send) {
      return {
        code: ErrorCode.CONTACT_MISSING,
        message: contactCheck.message!,
      };
    }

    // Validate channel is available for this guest
    if (!contactCheck.available_channels.includes(input.channel)) {
      return {
        code: ErrorCode.CONTACT_MISSING,
        message:
          input.channel === 'whatsapp'
            ? 'Nomor phone tamu belum dilengkapi untuk pengiriman WhatsApp'
            : 'Alamat email tamu belum dilengkapi untuk pengiriman Email',
      };
    }

    // Validate invitation_url exists (Req 14.4)
    if (!guest.invitation_url) {
      return {
        code: ErrorCode.NOTIFICATION_FAILED,
        message: 'Invitation URL belum ter-generate untuk tamu ini',
      };
    }

    // Build the full invitation URL
    const fullInvitationUrl = `${this.baseUrl}${guest.invitation_url}`;

    // Send via the appropriate channel
    const result = await this.sendViaChannel(guest, input.channel, fullInvitationUrl);

    // Update delivery status (Req 14.6, 14.7)
    if (result.success) {
      await this.repository.updateDeliveryStatus(
        guest.id,
        tenantId,
        DeliveryStatus.SENT
      );
    } else {
      await this.repository.updateDeliveryStatus(
        guest.id,
        tenantId,
        DeliveryStatus.FAILED
      );

      // Log failed delivery with error details (Req 14.6)
      await this.repository.logDeliveryFailure({
        guest_id: guest.id,
        channel: input.channel,
        error: result.error || 'Unknown error',
        timestamp: new Date(),
      });
    }

    return result;
  }

  // --- Bulk Send Invitations ---

  /**
   * Send invitations to multiple guests in bulk (Req 14.3)
   * - Maximum 500 guests per batch
   * - Skips guests without contact info
   * - Tracks individual delivery status
   */
  async sendBulkInvitations(
    input: BulkSendInput,
    eventId: string,
    tenantId: string
  ): Promise<BulkSendResult | NotificationServiceError> {
    // Validate batch size (Req 14.3)
    if (input.guest_ids.length > MAX_BATCH_SIZE) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: `Maksimal ${MAX_BATCH_SIZE} tamu per batch pengiriman`,
      };
    }

    if (input.guest_ids.length === 0) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Daftar tamu tidak boleh kosong',
      };
    }

    // Verify event exists
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Fetch all guests
    const guests = await this.repository.findGuestsByIds(input.guest_ids, tenantId);

    // Filter to only guests belonging to this event
    const eventGuests = guests.filter((g) => g.event_id === eventId);

    const results: SendResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const guest of eventGuests) {
      // Check contact completeness
      const contactCheck = this.checkContactCompleteness(guest);
      if (!contactCheck.can_send) {
        results.push({
          guest_id: guest.id,
          channel: input.channel,
          success: false,
          error: 'Data kontak (phone dan email) harus dilengkapi',
        });
        failed++;
        continue;
      }

      // Check if the requested channel is available
      if (!contactCheck.available_channels.includes(input.channel)) {
        results.push({
          guest_id: guest.id,
          channel: input.channel,
          success: false,
          error:
            input.channel === 'whatsapp'
              ? 'Nomor phone belum dilengkapi'
              : 'Alamat email belum dilengkapi',
        });
        failed++;
        continue;
      }

      // Validate invitation_url exists
      if (!guest.invitation_url) {
        results.push({
          guest_id: guest.id,
          channel: input.channel,
          success: false,
          error: 'Invitation URL belum ter-generate',
        });
        failed++;
        continue;
      }

      // Build full URL and send
      const fullInvitationUrl = `${this.baseUrl}${guest.invitation_url}`;
      const sendResult = await this.sendViaChannel(guest, input.channel, fullInvitationUrl);

      // Update delivery status
      if (sendResult.success) {
        await this.repository.updateDeliveryStatus(
          guest.id,
          tenantId,
          DeliveryStatus.SENT
        );
        sent++;
      } else {
        await this.repository.updateDeliveryStatus(
          guest.id,
          tenantId,
          DeliveryStatus.FAILED
        );

        // Log failure (Req 14.6)
        await this.repository.logDeliveryFailure({
          guest_id: guest.id,
          channel: input.channel,
          error: sendResult.error || 'Unknown error',
          timestamp: new Date(),
        });
        failed++;
      }

      results.push(sendResult);
    }

    // Add results for guests not found in event
    const foundGuestIds = new Set(eventGuests.map((g) => g.id));
    for (const guestId of input.guest_ids) {
      if (!foundGuestIds.has(guestId)) {
        results.push({
          guest_id: guestId,
          channel: input.channel,
          success: false,
          error: 'Tamu tidak ditemukan dalam event ini',
        });
        failed++;
      }
    }

    return {
      total: input.guest_ids.length,
      sent,
      failed,
      results,
    };
  }

  // --- Get Delivery Status ---

  /**
   * Get delivery status for a guest (Req 14.7)
   */
  async getDeliveryStatus(
    guestId: string,
    tenantId: string
  ): Promise<{ delivery_status: DeliveryStatus } | NotificationServiceError> {
    const guest = await this.repository.findGuestById(guestId, tenantId);
    if (!guest) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    return { delivery_status: guest.delivery_status };
  }

  // --- Private Helpers ---

  /**
   * Send invitation via the specified channel
   */
  private async sendViaChannel(
    guest: NotificationGuest,
    channel: NotificationChannel,
    invitationUrl: string
  ): Promise<SendResult> {
    try {
      if (channel === 'whatsapp') {
        const message = this.buildWhatsAppMessage(guest.name, invitationUrl);
        const result = await this.whatsappProvider.send(guest.phone!, message);
        return {
          guest_id: guest.id,
          channel: 'whatsapp',
          success: result.success,
          error: result.error,
        };
      } else {
        const subject = 'Undangan Pernikahan';
        const body = this.buildEmailBody(guest.name, invitationUrl);
        const result = await this.emailProvider.send(guest.email!, subject, body);
        return {
          guest_id: guest.id,
          channel: 'email',
          success: result.success,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Terjadi kesalahan saat mengirim undangan';
      return {
        guest_id: guest.id,
        channel,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build WhatsApp message with personalized invitation URL
   */
  private buildWhatsAppMessage(guestName: string, invitationUrl: string): string {
    return `Kepada Yth. ${guestName},\n\nKami mengundang Anda untuk hadir di acara pernikahan kami. Silakan buka undangan digital melalui link berikut:\n\n${invitationUrl}\n\nTerima kasih.`;
  }

  /**
   * Build email body with personalized invitation URL
   */
  private buildEmailBody(guestName: string, invitationUrl: string): string {
    return `Kepada Yth. ${guestName},\n\nKami mengundang Anda untuk hadir di acara pernikahan kami.\n\nSilakan buka undangan digital melalui link berikut:\n${invitationUrl}\n\nTerima kasih atas perhatiannya.`;
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is a NotificationServiceError
 */
export function isNotificationError(
  result:
    | SendResult
    | BulkSendResult
    | { delivery_status: DeliveryStatus }
    | NotificationServiceError
): result is NotificationServiceError {
  return (
    'code' in result &&
    'message' in result &&
    !('guest_id' in result) &&
    !('total' in result) &&
    !('delivery_status' in result)
  );
}
