import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server as HttpServer, createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { performGracefulShutdown, registerShutdownHandlers } from './graceful-shutdown';

describe('graceful-shutdown', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  });

  function createClient(): ClientSocket {
    return ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
    });
  }

  async function waitForConnection(client: ClientSocket): Promise<void> {
    return new Promise((resolve) => {
      client.on('connect', () => resolve());
    });
  }

  describe('performGracefulShutdown', () => {
    it('should complete immediately when no connections exist', async () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      const result = await performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 5000,
        pollIntervalMs: 50,
      });

      expect(result.graceful).toBe(true);
      expect(result.remainingConnections).toBe(0);
      expect(result.durationMs).toBeLessThan(1000);
      expect(disconnectRedis).toHaveBeenCalledOnce();
    });

    it('should wait for connections to close naturally before timeout', async () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      // Connect a client
      const client = createClient();
      await waitForConnection(client);

      // Start shutdown in background
      const shutdownPromise = performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 5000,
        pollIntervalMs: 50,
      });

      // Client disconnects after a short delay (simulating natural close)
      await new Promise((resolve) => setTimeout(resolve, 200));
      client.disconnect();

      const result = await shutdownPromise;

      expect(result.graceful).toBe(true);
      expect(result.remainingConnections).toBe(0);
      expect(disconnectRedis).toHaveBeenCalledOnce();
    });

    it('should forcefully disconnect remaining connections after timeout', async () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      // Connect a client that won't disconnect
      const client = createClient();
      await waitForConnection(client);

      const result = await performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 500, // Short timeout for test
        pollIntervalMs: 50,
      });

      expect(result.graceful).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(450);
      expect(disconnectRedis).toHaveBeenCalledOnce();

      // Cleanup
      client.disconnect();
    });

    it('should emit server_shutting_down event to connected clients', async () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      const client = createClient();
      await waitForConnection(client);

      const shutdownEventPromise = new Promise<unknown>((resolve) => {
        client.on('server_shutting_down', (data) => resolve(data));
      });

      // Start shutdown
      const shutdownPromise = performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 2000,
        pollIntervalMs: 50,
      });

      // Verify client received the shutdown notification
      const shutdownData = await shutdownEventPromise;
      expect(shutdownData).toHaveProperty('reason');
      expect(shutdownData).toHaveProperty('timeout', 2000);

      // Disconnect client to allow shutdown to complete
      client.disconnect();
      await shutdownPromise;
    });

    it('should handle Redis disconnect errors gracefully', async () => {
      const disconnectRedis = vi.fn().mockRejectedValue(new Error('Redis connection lost'));
      const logger = vi.fn();

      const result = await performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 1000,
        pollIntervalMs: 50,
      });

      // Shutdown should still complete even if Redis disconnect fails
      expect(result.graceful).toBe(true);
      expect(disconnectRedis).toHaveBeenCalledOnce();

      // Should log the warning
      const warningLog = logger.mock.calls.find((call) =>
        call[0].includes('Redis disconnect error')
      );
      expect(warningLog).toBeDefined();
    });

    it('should terminate immediately when all connections close before timeout', async () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      // Connect multiple clients
      const client1 = createClient();
      const client2 = createClient();
      await Promise.all([waitForConnection(client1), waitForConnection(client2)]);

      // Start shutdown
      const shutdownPromise = performGracefulShutdown({
        io,
        httpServer,
        disconnectRedis,
        logger,
        shutdownTimeoutMs: 30_000, // Full 30s timeout
        pollIntervalMs: 50,
      });

      // Both clients disconnect quickly
      await new Promise((resolve) => setTimeout(resolve, 100));
      client1.disconnect();
      client2.disconnect();

      const result = await shutdownPromise;

      // Should complete well before the 30s timeout
      expect(result.graceful).toBe(true);
      expect(result.remainingConnections).toBe(0);
      expect(result.durationMs).toBeLessThan(5000);
    });
  });

  describe('registerShutdownHandlers', () => {
    it('should return a cleanup function that removes signal handlers', () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      const cleanup = registerShutdownHandlers({
        io,
        httpServer,
        disconnectRedis,
        logger,
        signals: ['SIGTERM'],
      });

      expect(typeof cleanup).toBe('function');
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Registered handlers for signals: SIGTERM')
      );

      // Cleanup to avoid affecting other tests
      cleanup();
    });

    it('should register handlers for both SIGTERM and SIGINT by default', () => {
      const disconnectRedis = vi.fn().mockResolvedValue(undefined);
      const logger = vi.fn();

      const cleanup = registerShutdownHandlers({
        io,
        httpServer,
        disconnectRedis,
        logger,
      });

      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Registered handlers for signals: SIGTERM, SIGINT')
      );

      cleanup();
    });
  });
});
