import jwt from 'jsonwebtoken';
import type { Socket, ExtendedError } from 'socket.io';

// --- Types ---

/**
 * JWT token payload structure — matches the REST API token format.
 * See: packages/api/src/services/auth.service.ts (TokenPayload)
 */
export interface SocketTokenPayload {
  sub: string; // user id
  tenant_id: string;
  role: string; // 'admin' | 'client' | 'wo' | 'scanner'
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Authenticated socket data attached after successful handshake.
 */
export interface AuthenticatedSocketData {
  user: {
    id: string;
    tenant_id: string;
    role: string;
    email: string;
  };
}

/**
 * Repository interface for checking event-user authorization.
 * Injected to keep the middleware testable without direct DB dependency.
 */
export interface EventAuthRepository {
  /**
   * Check if an event belongs to a specific tenant.
   * Returns true if the event exists and belongs to the given tenant.
   */
  isEventOwnedByTenant(eventId: string, tenantId: string): Promise<boolean>;
}

/**
 * Configuration for the auth middleware.
 */
export interface AuthMiddlewareConfig {
  /** JWT secret key (same as REST API) */
  jwtSecret: string;
  /** Repository for event authorization checks */
  eventAuthRepository: EventAuthRepository;
}

// --- Authentication Middleware (Handshake) ---

/**
 * Socket.io middleware that validates JWT token on WebSocket handshake.
 *
 * The client must pass the token via the `auth` option:
 * ```ts
 * const socket = io('wss://ws.example.com', {
 *   auth: { token: 'eyJhbGciOiJIUzI1NiIs...' }
 * });
 * ```
 *
 * On success, attaches user data to `socket.data.user`.
 * On failure, rejects the connection with an appropriate error.
 *
 * Requirements: 13.6
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { jwtSecret } = config;

  return (socket: Socket, next: (err?: ExtendedError) => void): void => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      const error = new Error('Authentication required: no token provided') as ExtendedError;
      error.data = { code: 'AUTH_NO_TOKEN' };
      return next(error);
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as SocketTokenPayload;

      // Validate required fields in the token payload
      if (!decoded.sub || !decoded.tenant_id || !decoded.role) {
        const error = new Error('Authentication failed: invalid token payload') as ExtendedError;
        error.data = { code: 'AUTH_INVALID_PAYLOAD' };
        return next(error);
      }

      // Attach authenticated user data to socket
      socket.data.user = {
        id: decoded.sub,
        tenant_id: decoded.tenant_id,
        role: decoded.role,
        email: decoded.email,
      };

      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        const error = new Error('Authentication failed: token expired') as ExtendedError;
        error.data = { code: 'AUTH_TOKEN_EXPIRED' };
        return next(error);
      }

      if (err instanceof jwt.JsonWebTokenError) {
        const error = new Error('Authentication failed: invalid token') as ExtendedError;
        error.data = { code: 'AUTH_INVALID_TOKEN' };
        return next(error);
      }

      const error = new Error('Authentication failed') as ExtendedError;
      error.data = { code: 'AUTH_ERROR' };
      return next(error);
    }
  };
}

// --- Room-Level Authorization ---

/**
 * Determines if a user is authorized to join a specific event room.
 *
 * Authorization rules:
 * - Admin: can join any event room (cross-tenant access)
 * - Client: can join rooms for events belonging to their tenant
 * - WO (Wedding Organizer): can join rooms for events belonging to their tenant
 * - Scanner Operator: can join rooms for events belonging to their tenant
 *
 * Note: At current scale (1 event / ≤500 guests), all non-admin users are
 * authorized based on tenant_id match. If explicit user-event assignments
 * are added in the future, this function should be updated to check those.
 *
 * Requirements: 13.7
 */
export async function authorizeRoomJoin(
  user: AuthenticatedSocketData['user'],
  eventId: string,
  repository: EventAuthRepository
): Promise<{ authorized: boolean; reason?: string }> {
  // Validate inputs
  if (!eventId || typeof eventId !== 'string') {
    return { authorized: false, reason: 'Invalid event ID' };
  }

  if (!user || !user.id || !user.tenant_id || !user.role) {
    return { authorized: false, reason: 'Invalid user data' };
  }

  // Admin can join any event room
  if (user.role === 'admin') {
    return { authorized: true };
  }

  // For all other roles, verify the event belongs to the user's tenant
  const isOwned = await repository.isEventOwnedByTenant(eventId, user.tenant_id);

  if (!isOwned) {
    return {
      authorized: false,
      reason: `User does not have access to event ${eventId}`,
    };
  }

  return { authorized: true };
}

/**
 * Creates a Socket.io event handler that enforces room-level authorization
 * on the `join_event` event.
 *
 * This should be registered on each socket after authentication:
 * ```ts
 * io.on('connection', (socket) => {
 *   registerRoomAuthorization(socket, eventAuthRepository);
 * });
 * ```
 *
 * Requirements: 13.7
 */
export function registerRoomAuthorization(socket: Socket, repository: EventAuthRepository): void {
  // Override the default join_event handler with authorization
  socket.on('join_event', async (eventId: string) => {
    if (!eventId || typeof eventId !== 'string') {
      socket.emit('error', { code: 'INVALID_EVENT_ID', message: 'Invalid event_id' });
      return;
    }

    const user = socket.data.user as AuthenticatedSocketData['user'] | undefined;

    if (!user) {
      socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Authentication required' });
      return;
    }

    const result = await authorizeRoomJoin(user, eventId, repository);

    if (!result.authorized) {
      socket.emit('error', {
        code: 'ROOM_ACCESS_DENIED',
        message: result.reason || 'Access denied to this event room',
      });
      return;
    }

    // Authorized — join the event room
    const room = `event:${eventId}`;
    socket.join(room);

    // Store event_id on socket data for cleanup on disconnect
    socket.data.eventId = eventId;

    socket.emit('joined_event', {
      event_id: eventId,
      status: 'connected',
    });
  });
}
