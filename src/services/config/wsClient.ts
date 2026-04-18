import type { WsMessage } from "./types";

const MAX_BACKOFF_MS = 30_000;

/**
 * WebSocket client for receiving live kill switch events.
 *
 * Handles auth handshake, heartbeat pong, and exponential reconnect.
 * Only used on native platforms — web relies on TTL polling.
 */
export class WsClient {
  private url: string;
  private token: string;
  private onMessage: (msg: WsMessage) => void;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1_000;
  private destroyed = false;

  constructor(url: string, token: string, onMessage: (msg: WsMessage) => void) {
    this.url = url;
    this.token = token;
    this.onMessage = onMessage;
  }

  connect(): void {
    if (this.destroyed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({ type: "auth", token: `Bearer ${this.token}` }),
      );
    };

    this.ws.onmessage = (event) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data as string) as WsMessage;
      } catch {
        return;
      }

      if (msg.type === "authenticated") {
        this.backoffMs = 1_000; // reset backoff on successful auth
        return;
      }

      if (msg.type === "ping") {
        this.ws?.send(JSON.stringify({ type: "pong" }));
        return;
      }

      this.onMessage(msg);
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror; reconnect handled there
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (event.code === 4401) {
        // Auth failure — don't reconnect, bad token
        console.warn("[Config WS] auth failed, not reconnecting");
        return;
      }
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this.connect();
    }, this.backoffMs);
  }
}
