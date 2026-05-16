import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

/**
 * Graceful shutdown handler for WebSocket server instances.
 *
 * Implements the following shutdown sequence:
 * 1. Stop accepting new connections (close HTTP server for new requests)
 * 2. Notify existing clients of impending shutdown ("server_shutting_down" event)
 * 3. Wait for connections to close naturally or timeout after 30s
 * 4. Disconnect Redis adapter clients
 * 5. Close the HTTP server
 *
 * If all connections close before the timeout, the instance terminates immediately
 * without waiting the full 30 seconds.
 *
 * Requirements: 13.5
 */

// --- Types ---

export interface GracefulShutdownOptions {
  /** Socket.io server instance */
  io: SocketIOServer;
  /** HTTP server instance */
  httpServer: HttpServer;
  /** Function to disconnect Redis adapter clients */
  disconnectRedis: () => Promise<void>;
  /** Maximum time to wait for connections to close (ms). Default: 30000 */
  shutdownTimeoutMs?: number;
  /** Interval to check if all connections have closed (ms). Default: 500 */
  pollIntervalMs?: number;
  /** Logger function. Default: console.info */
  logger?: (message: string) => void;
}

export interface ShutdownResult {
  /** Whether shutdown completed within the timeout */
  graceful: boolean;
  /** Number of connections that were still open when shutdown completed */
  remainingConnections: number;
  /** Duration of the shutdown process in milliseconds */
  durationMs: number;
}

// --- Constants ---

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000; // 30 seconds
const DEFAULT_POLL_INTERVAL_MS = 500;

// --- Graceful Shutdown Implementation ---

/**
 * Performs a graceful shutdown of the WebSocket server.
 *
 * Steps:
 * 1. Stops accepting new connections by closing the HTTP server listener
 * 2. Emits "server_shutting_down" to all connected clients
 * 3. Waits for all connections to close naturally or until timeout (30s)
 * 4. Disconnects remaining sockets forcefully if timeout is reached
 * 5. Disconnects Redis adapter clients
 * 6. Closes the HTTP server
 *
 * Returns a ShutdownResult indicating whether shutdown was graceful.
 */
export async function performGracefulShutdown(
  options: GracefulShutdownOptions
): Promise<ShutdownResult> {
  const {
    io,
    httpServer,
    disconnectRedis,
    shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    logger = console.info,
  } = options;

  const startTime = Date.now();

  logger('[GracefulShutdown] Initiating graceful shutdown...');

  // Step 1: Stop accepting new connections
  // Close the HTTP server so no new connections are accepted
  httpServer.close();
  logger('[GracefulShutdown] Stopped accepting new connections.');

  // Step 2: Notify existing clients of impending shutdown
  io.emit('server_shutting_down', {
    reason: 'Server is shutting down for maintenance or deployment',
    timeout: shutdownTimeoutMs,
  });
  logger(
    `[GracefulShutdown] Notified ${io.engine?.clientsCount ?? 0} connected clients of shutdown.`
  );

  // Step 3: Wait for connections to close naturally or timeout
  const allDisconnected = await waitForConnectionsDrain(io, shutdownTimeoutMs, pollIntervalMs);

  const remainingConnections = io.engine?.clientsCount ?? 0;

  if (allDisconnected) {
    logger('[GracefulShutdown] All connections closed naturally.');
  } else {
    logger(
      `[GracefulShutdown] Timeout reached. Forcefully disconnecting ${remainingConnections} remaining connections.`
    );
    // Forcefully disconnect remaining sockets
    io.disconnectSockets(true);
  }

  // Step 4: Disconnect Redis adapter clients
  try {
    await disconnectRedis();
    logger('[GracefulShutdown] Redis adapter clients disconnected.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`[GracefulShutdown] Warning: Redis disconnect error: ${message}`);
  }

  // Step 5: Close the Socket.io server
  await closeSocketIOServer(io);
  logger('[GracefulShutdown] Socket.io server closed.');

  const durationMs = Date.now() - startTime;
  const result: ShutdownResult = {
    graceful: allDisconnected,
    remainingConnections: allDisconnected ? 0 : remainingConnections,
    durationMs,
  };

  logger(
    `[GracefulShutdown] Shutdown complete. Graceful: ${result.graceful}, ` +
      `Duration: ${result.durationMs}ms, Remaining: ${result.remainingConnections}`
  );

  return result;
}

/**
 * Waits for all Socket.io connections to drain (close naturally).
 * Returns true if all connections closed before the timeout, false otherwise.
 */
function waitForConnectionsDrain(
  io: SocketIOServer,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    function checkConnections() {
      const clientCount = io.engine?.clientsCount ?? 0;

      if (clientCount === 0) {
        resolve(true);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }

      setTimeout(checkConnections, pollIntervalMs);
    }

    // Start checking immediately
    checkConnections();
  });
}

/**
 * Closes the Socket.io server and returns a promise.
 */
function closeSocketIOServer(io: SocketIOServer): Promise<void> {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}

// --- Signal Handler Registration ---

export interface RegisterShutdownHandlersOptions extends GracefulShutdownOptions {
  /** Signals to listen for. Default: ['SIGTERM', 'SIGINT'] */
  signals?: NodeJS.Signals[];
  /** Process exit code on graceful shutdown. Default: 0 */
  exitCode?: number;
  /** Callback invoked after shutdown completes (before process exit) */
  onShutdownComplete?: (result: ShutdownResult) => void | Promise<void>;
}

/**
 * Registers process signal handlers (SIGTERM, SIGINT) that trigger graceful shutdown.
 *
 * This is the main entry point for production use. Call this after creating
 * the production server to ensure clean shutdown on deployment or restart.
 *
 * Usage:
 * ```ts
 * const { io, disconnectRedis } = createProductionServer({ httpServer });
 * registerShutdownHandlers({ io, httpServer, disconnectRedis });
 * ```
 *
 * Requirements: 13.5
 */
export function registerShutdownHandlers(options: RegisterShutdownHandlersOptions): () => void {
  const {
    signals = ['SIGTERM', 'SIGINT'],
    exitCode = 0,
    onShutdownComplete,
    logger = console.info,
    ...shutdownOptions
  } = options;

  let isShuttingDown = false;

  async function handleSignal(signal: NodeJS.Signals): Promise<void> {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
      logger(`[GracefulShutdown] Already shutting down. Ignoring ${signal}.`);
      return;
    }

    isShuttingDown = true;
    logger(`[GracefulShutdown] Received ${signal}. Starting graceful shutdown...`);

    try {
      const result = await performGracefulShutdown({ ...shutdownOptions, logger });

      if (onShutdownComplete) {
        await onShutdownComplete(result);
      }

      process.exit(exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`[GracefulShutdown] Error during shutdown: ${message}`);
      process.exit(1);
    }
  }

  // Register signal handlers
  for (const signal of signals) {
    process.on(signal, () => handleSignal(signal));
  }

  logger(`[GracefulShutdown] Registered handlers for signals: ${signals.join(', ')}`);

  // Return a cleanup function to remove handlers (useful for testing)
  return function removeHandlers() {
    for (const signal of signals) {
      process.removeAllListeners(signal);
    }
  };
}
