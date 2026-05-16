import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

// Re-export stats service
export { StatsService, type StatsRepository, type StatsBroadcaster } from './stats';

// Re-export auth middleware for WebSocket authentication
export {
  createAuthMiddleware,
  authorizeRoomJoin,
  registerRoomAuthorization,
} from './middleware/auth';
export type {
  SocketTokenPayload,
  AuthenticatedSocketData,
  EventAuthRepository,
  AuthMiddlewareConfig,
} from './middleware/auth';

// --- Event Types ---

/** WebSocket event names emitted by the server */
export enum RealtimeEvent {
  GUEST_CHECKED_IN = 'guest_checked_in',
  RSVP_UPDATED = 'rsvp_updated',
  GO_SHOW_ADDED = 'go_show_added',
  STATS_UPDATED = 'stats_updated',
}

/** Payload for guest_checked_in event */
export interface GuestCheckedInPayload {
  guest_id: string;
  guest_name: string;
  group: string;
  method: string;
  checked_in_at: string;
  event_id: string;
}

/** Payload for rsvp_updated event */
export interface RsvpUpdatedPayload {
  guest_id: string;
  guest_name: string;
  attendance: string;
  guest_count: number;
  submitted_at: string;
  event_id: string;
}

/** Payload for go_show_added event */
export interface GoShowAddedPayload {
  guest_id: string;
  guest_name: string;
  checked_in_at: string;
  event_id: string;
}

/** Payload for stats_updated event */
export interface StatsUpdatedPayload {
  event_id: string;
  total_guests: number;
  total_rsvp: number;
  total_checked_in: number;
  total_go_show: number;
}

/** Connection status for tracking */
export interface ConnectionInfo {
  socket_id: string;
  event_id: string;
  connected_at: Date;
}

// --- Room Utilities ---

/**
 * Get the room name for a specific event.
 * All clients watching the same event join this room.
 */
export function getEventRoom(eventId: string): string {
  return `event:${eventId}`;
}

// --- Server Creation ---

export interface RealtimeServerOptions {
  /** CORS origins to allow. Defaults to all origins in development. */
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  /** Optional HTTP server to attach to */
  httpServer?: HttpServer;
  /** Optional port for standalone mode (when no httpServer provided) */
  port?: number;
}

export interface RealtimeServer {
  /** The underlying Socket.io server instance */
  io: Server;
  /** Map of connected clients per event room */
  connections: Map<string, Set<string>>;
  /** Broadcast a check-in event to all clients in an event room */
  broadcastCheckIn: (eventId: string, payload: GuestCheckedInPayload) => void;
  /** Broadcast an RSVP update to all clients in an event room */
  broadcastRsvpUpdate: (eventId: string, payload: RsvpUpdatedPayload) => void;
  /** Broadcast a Go-Show addition to all clients in an event room */
  broadcastGoShow: (eventId: string, payload: GoShowAddedPayload) => void;
  /** Broadcast updated stats to all clients in an event room */
  broadcastStats: (eventId: string, payload: StatsUpdatedPayload) => void;
  /** Get the number of connected clients in an event room */
  getConnectionCount: (eventId: string) => number;
  /** Shutdown the server */
  close: () => Promise<void>;
}

/**
 * Create a new real-time WebSocket server with room-based connections.
 *
 * Clients join a room identified by event_id. Broadcasts for a specific event
 * are only sent to clients connected to that event's room.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.6, 9.8
 */
export function createRealtimeServer(options: RealtimeServerOptions = {}): RealtimeServer {
  const { cors, httpServer } = options;

  const io = new Server(httpServer, {
    cors: cors ?? {
      origin: '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Track connected clients per event room
  const connections = new Map<string, Set<string>>();

  // Handle new connections
  io.on('connection', (socket: Socket) => {
    // Client joins an event room
    socket.on('join_event', (eventId: string) => {
      if (!eventId || typeof eventId !== 'string') {
        socket.emit('error', { message: 'Invalid event_id' });
        return;
      }

      const room = getEventRoom(eventId);
      socket.join(room);

      // Track connection
      if (!connections.has(eventId)) {
        connections.set(eventId, new Set());
      }
      connections.get(eventId)!.add(socket.id);

      // Store event_id on socket data for cleanup on disconnect
      socket.data.eventId = eventId;

      // Notify client of successful join with connection status
      socket.emit('joined_event', {
        event_id: eventId,
        status: 'connected',
        connected_clients: connections.get(eventId)!.size,
      });
    });

    // Client leaves an event room
    socket.on('leave_event', (eventId: string) => {
      if (!eventId || typeof eventId !== 'string') {
        return;
      }

      const room = getEventRoom(eventId);
      socket.leave(room);

      // Remove from tracking
      const eventConnections = connections.get(eventId);
      if (eventConnections) {
        eventConnections.delete(socket.id);
        if (eventConnections.size === 0) {
          connections.delete(eventId);
        }
      }

      socket.data.eventId = undefined;

      socket.emit('left_event', {
        event_id: eventId,
        status: 'disconnected',
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const eventId = socket.data.eventId as string | undefined;
      if (eventId) {
        const eventConnections = connections.get(eventId);
        if (eventConnections) {
          eventConnections.delete(socket.id);
          if (eventConnections.size === 0) {
            connections.delete(eventId);
          }
        }
      }
    });

    // Emit connection status to the client
    socket.emit('connection_status', { status: 'connected' });
  });

  // --- Broadcast Functions ---

  function broadcastCheckIn(eventId: string, payload: GuestCheckedInPayload): void {
    const room = getEventRoom(eventId);
    io.to(room).emit(RealtimeEvent.GUEST_CHECKED_IN, payload);
  }

  function broadcastRsvpUpdate(eventId: string, payload: RsvpUpdatedPayload): void {
    const room = getEventRoom(eventId);
    io.to(room).emit(RealtimeEvent.RSVP_UPDATED, payload);
  }

  function broadcastGoShow(eventId: string, payload: GoShowAddedPayload): void {
    const room = getEventRoom(eventId);
    io.to(room).emit(RealtimeEvent.GO_SHOW_ADDED, payload);
  }

  function broadcastStats(eventId: string, payload: StatsUpdatedPayload): void {
    const room = getEventRoom(eventId);
    io.to(room).emit(RealtimeEvent.STATS_UPDATED, payload);
  }

  function getConnectionCount(eventId: string): number {
    return connections.get(eventId)?.size ?? 0;
  }

  async function close(): Promise<void> {
    connections.clear();
    return new Promise((resolve) => {
      io.close(() => resolve());
    });
  }

  return {
    io,
    connections,
    broadcastCheckIn,
    broadcastRsvpUpdate,
    broadcastGoShow,
    broadcastStats,
    getConnectionCount,
    close,
  };
}
