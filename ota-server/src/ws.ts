import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';

const HEARTBEAT_INTERVAL_MS = Number(process.env.WS_HEARTBEAT_INTERVAL_MS ?? 30_000);
const MAX_MISSED_PONGS = 2;

interface AuthedSocket extends WebSocket {
  _authenticated?: boolean;
  _missedPongs?: number;
}

const clients = new Set<AuthedSocket>();

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Returns a broadcast function used by kill switch routes.
 */
export function attachWsServer(httpServer: Server): (msg: object) => void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket: AuthedSocket, _req: IncomingMessage) => {
    socket._authenticated = false;
    socket._missedPongs = 0;

    socket.on('message', (raw: Buffer) => {
      let msg: { type: string; token?: string };
      try {
        msg = JSON.parse(raw.toString()) as { type: string; token?: string };
      } catch {
        socket.close(4400, 'Invalid JSON');
        return;
      }

      if (!socket._authenticated) {
        if (msg.type === 'auth') {
          const apiKey = process.env.OTA_API_KEY;
          const token = (msg.token ?? '').replace(/^Bearer\s+/i, '');
          if (!apiKey || token === apiKey) {
            socket._authenticated = true;
            clients.add(socket);
            socket.send(JSON.stringify({ type: 'authenticated' }));
          } else {
            socket.close(4401, 'Unauthorized');
          }
        } else {
          socket.close(4401, 'Auth required');
        }
        return;
      }

      if (msg.type === 'pong') {
        socket._missedPongs = 0;
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  // Heartbeat — disconnect clients that stop responding
  const heartbeat = setInterval(() => {
    for (const socket of clients) {
      if ((socket._missedPongs ?? 0) >= MAX_MISSED_PONGS) {
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      socket._missedPongs = (socket._missedPongs ?? 0) + 1;
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(heartbeat));

  return broadcast;
}

/**
 * Broadcast a message to all authenticated WebSocket clients.
 */
export function broadcast(msg: object): void {
  const payload = JSON.stringify(msg);
  for (const socket of clients) {
    if (socket._authenticated && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}
