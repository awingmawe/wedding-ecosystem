import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  createAuthMiddleware,
  authorizeRoomJoin,
  registerRoomAuthorization,
  type EventAuthRepository,
  type AuthenticatedSocketData,
} from './auth';

// --- Test Constants ---

const TEST_JWT_SECRET = 'test-secret-key-for-websocket-auth';

function createTestToken(
  payload: {
    sub: string;
    tenant_id: string;
    role: string;
    email: string;
  },
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '15m', ...options });
}

// --- Mock Socket Factory ---

function createMockSocket(auth?: Record<string, unknown>) {
  return {
    handshake: {
      auth: auth ?? {},
    },
    data: {} as Record<string, any>,
    join: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
  };
}

// --- Mock Repository ---

function createMockRepository(ownedEvents: Map<string, string[]> = new Map()): EventAuthRepository {
  return {
    isEventOwnedByTenant: vi.fn(async (eventId: string, tenantId: string) => {
      const tenantEvents = ownedEvents.get(tenantId);
      return tenantEvents?.includes(eventId) ?? false;
    }),
  };
}

// --- Tests: Authentication Middleware ---

describe('createAuthMiddleware', () => {
  const config = {
    jwtSecret: TEST_JWT_SECRET,
    eventAuthRepository: createMockRepository(),
  };

  it('should reject connection when no token is provided', () => {
    const middleware = createAuthMiddleware(config);
    const socket = createMockSocket({});
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication required: no token provided',
      })
    );
    expect((next.mock.calls[0][0] as any).data.code).toBe('AUTH_NO_TOKEN');
  });

  it('should reject connection when token is invalid', () => {
    const middleware = createAuthMiddleware(config);
    const socket = createMockSocket({ token: 'invalid-token' });
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication failed: invalid token',
      })
    );
    expect((next.mock.calls[0][0] as any).data.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('should reject connection when token is expired', () => {
    const middleware = createAuthMiddleware(config);
    const expiredToken = jwt.sign(
      { sub: 'user-1', tenant_id: 'tenant-1', role: 'client', email: 'test@test.com' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' }
    );
    const socket = createMockSocket({ token: expiredToken });
    const next = vi.fn();

    // Small delay to ensure token is expired
    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication failed: token expired',
      })
    );
    expect((next.mock.calls[0][0] as any).data.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('should reject connection when token payload is missing required fields', () => {
    const middleware = createAuthMiddleware(config);
    // Token with missing tenant_id
    const badToken = jwt.sign(
      { sub: 'user-1', role: 'client', email: 'test@test.com' },
      TEST_JWT_SECRET,
      { expiresIn: '15m' }
    );
    const socket = createMockSocket({ token: badToken });
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication failed: invalid token payload',
      })
    );
    expect((next.mock.calls[0][0] as any).data.code).toBe('AUTH_INVALID_PAYLOAD');
  });

  it('should accept connection with valid token and attach user data', () => {
    const middleware = createAuthMiddleware(config);
    const token = createTestToken({
      sub: 'user-123',
      tenant_id: 'tenant-456',
      role: 'client',
      email: 'user@example.com',
    });
    const socket = createMockSocket({ token });
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(); // called without error
    expect(socket.data.user).toEqual({
      id: 'user-123',
      tenant_id: 'tenant-456',
      role: 'client',
      email: 'user@example.com',
    });
  });

  it('should accept connection for admin role', () => {
    const middleware = createAuthMiddleware(config);
    const token = createTestToken({
      sub: 'admin-1',
      tenant_id: 'system-tenant',
      role: 'admin',
      email: 'admin@platform.com',
    });
    const socket = createMockSocket({ token });
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user.role).toBe('admin');
  });

  it('should reject connection when token is signed with wrong secret', () => {
    const middleware = createAuthMiddleware(config);
    const token = jwt.sign(
      { sub: 'user-1', tenant_id: 'tenant-1', role: 'client', email: 'test@test.com' },
      'wrong-secret',
      { expiresIn: '15m' }
    );
    const socket = createMockSocket({ token });
    const next = vi.fn();

    middleware(socket as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication failed: invalid token',
      })
    );
  });
});

// --- Tests: Room-Level Authorization ---

describe('authorizeRoomJoin', () => {
  it('should allow admin to join any event room', async () => {
    const repository = createMockRepository();
    const user: AuthenticatedSocketData['user'] = {
      id: 'admin-1',
      tenant_id: 'system-tenant',
      role: 'admin',
      email: 'admin@platform.com',
    };

    const result = await authorizeRoomJoin(user, 'any-event-id', repository);

    expect(result.authorized).toBe(true);
    // Admin should not trigger a DB check
    expect(repository.isEventOwnedByTenant).not.toHaveBeenCalled();
  });

  it('should allow client to join event room belonging to their tenant', async () => {
    const ownedEvents = new Map([['tenant-1', ['event-abc']]]);
    const repository = createMockRepository(ownedEvents);
    const user: AuthenticatedSocketData['user'] = {
      id: 'user-1',
      tenant_id: 'tenant-1',
      role: 'client',
      email: 'client@example.com',
    };

    const result = await authorizeRoomJoin(user, 'event-abc', repository);

    expect(result.authorized).toBe(true);
    expect(repository.isEventOwnedByTenant).toHaveBeenCalledWith('event-abc', 'tenant-1');
  });

  it('should deny client access to event room of another tenant', async () => {
    const ownedEvents = new Map([['tenant-2', ['event-xyz']]]);
    const repository = createMockRepository(ownedEvents);
    const user: AuthenticatedSocketData['user'] = {
      id: 'user-1',
      tenant_id: 'tenant-1',
      role: 'client',
      email: 'client@example.com',
    };

    const result = await authorizeRoomJoin(user, 'event-xyz', repository);

    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('does not have access');
  });

  it('should allow WO to join event room belonging to their tenant', async () => {
    const ownedEvents = new Map([['tenant-1', ['event-wedding']]]);
    const repository = createMockRepository(ownedEvents);
    const user: AuthenticatedSocketData['user'] = {
      id: 'wo-1',
      tenant_id: 'tenant-1',
      role: 'wo',
      email: 'wo@example.com',
    };

    const result = await authorizeRoomJoin(user, 'event-wedding', repository);

    expect(result.authorized).toBe(true);
  });

  it('should allow scanner operator to join event room belonging to their tenant', async () => {
    const ownedEvents = new Map([['tenant-1', ['event-wedding']]]);
    const repository = createMockRepository(ownedEvents);
    const user: AuthenticatedSocketData['user'] = {
      id: 'scanner-1',
      tenant_id: 'tenant-1',
      role: 'scanner',
      email: 'scanner@example.com',
    };

    const result = await authorizeRoomJoin(user, 'event-wedding', repository);

    expect(result.authorized).toBe(true);
  });

  it('should deny access when event ID is empty', async () => {
    const repository = createMockRepository();
    const user: AuthenticatedSocketData['user'] = {
      id: 'user-1',
      tenant_id: 'tenant-1',
      role: 'client',
      email: 'client@example.com',
    };

    const result = await authorizeRoomJoin(user, '', repository);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('Invalid event ID');
  });

  it('should deny access when user data is invalid', async () => {
    const repository = createMockRepository();

    const result = await authorizeRoomJoin(null as any, 'event-1', repository);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('Invalid user data');
  });
});

// --- Tests: registerRoomAuthorization ---

describe('registerRoomAuthorization', () => {
  it('should register join_event handler on socket', () => {
    const socket = createMockSocket();
    const repository = createMockRepository();

    registerRoomAuthorization(socket as any, repository);

    expect(socket.on).toHaveBeenCalledWith('join_event', expect.any(Function));
  });

  it('should emit error when event ID is invalid', async () => {
    const socket = createMockSocket();
    const repository = createMockRepository();
    socket.data.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'client', email: 'a@b.com' };

    registerRoomAuthorization(socket as any, repository);

    // Get the registered handler
    const handler = (socket.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'join_event'
    )[1];

    await handler('');

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'INVALID_EVENT_ID',
      })
    );
  });

  it('should emit error when user is not authenticated', async () => {
    const socket = createMockSocket();
    const repository = createMockRepository();
    // No user data on socket

    registerRoomAuthorization(socket as any, repository);

    const handler = (socket.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'join_event'
    )[1];

    await handler('event-1');

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'AUTH_REQUIRED',
      })
    );
  });

  it('should emit error when user is not authorized for the event', async () => {
    const socket = createMockSocket();
    const ownedEvents = new Map([['tenant-2', ['event-1']]]);
    const repository = createMockRepository(ownedEvents);
    socket.data.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'client', email: 'a@b.com' };

    registerRoomAuthorization(socket as any, repository);

    const handler = (socket.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'join_event'
    )[1];

    await handler('event-1');

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'ROOM_ACCESS_DENIED',
      })
    );
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('should join room and emit joined_event when authorized', async () => {
    const socket = createMockSocket();
    const ownedEvents = new Map([['tenant-1', ['event-abc']]]);
    const repository = createMockRepository(ownedEvents);
    socket.data.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'client', email: 'a@b.com' };

    registerRoomAuthorization(socket as any, repository);

    const handler = (socket.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'join_event'
    )[1];

    await handler('event-abc');

    expect(socket.join).toHaveBeenCalledWith('event:event-abc');
    expect(socket.data.eventId).toBe('event-abc');
    expect(socket.emit).toHaveBeenCalledWith('joined_event', {
      event_id: 'event-abc',
      status: 'connected',
    });
  });

  it('should allow admin to join any event room without DB check', async () => {
    const socket = createMockSocket();
    const repository = createMockRepository(); // empty — no events owned
    socket.data.user = { id: 'admin-1', tenant_id: 'system', role: 'admin', email: 'admin@x.com' };

    registerRoomAuthorization(socket as any, repository);

    const handler = (socket.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'join_event'
    )[1];

    await handler('any-event');

    expect(socket.join).toHaveBeenCalledWith('event:any-event');
    expect(repository.isEventOwnedByTenant).not.toHaveBeenCalled();
  });
});
