import { WsClient } from "../../../services/config/wsClient";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WsEventHandler = (event?: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: WsEventHandler | null = null;
  onmessage: WsEventHandler | null = null;
  onerror: WsEventHandler | null = null;
  onclose: WsEventHandler | null = null;
  sentMessages: string[] = [];
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.closed = true;
  }

  // Helpers to trigger handlers in tests
  triggerOpen() {
    this.onopen?.();
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  triggerClose(code = 1000) {
    this.onclose?.({ code });
  }
  triggerError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  jest.useFakeTimers();
  (global as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
  jest.useRealTimers();
});

function makeClient(onMessage = jest.fn()) {
  return new WsClient("ws://localhost:4000", "test-token", onMessage);
}

describe("WsClient", () => {
  describe("connect", () => {
    it("creates a WebSocket with the given URL", () => {
      const client = makeClient();
      client.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe("ws://localhost:4000");
    });

    it("sends auth message on open", () => {
      const client = makeClient();
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.triggerOpen();
      expect(ws.sentMessages).toHaveLength(1);
      expect(JSON.parse(ws.sentMessages[0])).toEqual({
        type: "auth",
        token: "Bearer test-token",
      });
    });

    it("resets backoff on authenticated message", () => {
      const client = makeClient();
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.triggerOpen();
      ws.triggerMessage({ type: "authenticated" });
      // After reconnect the backoff should be 1000ms (reset)
      ws.triggerClose(1001);
      jest.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it("responds to ping with pong", () => {
      const client = makeClient();
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.triggerOpen();
      ws.sentMessages = [];
      ws.triggerMessage({ type: "ping" });
      expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: "pong" });
    });

    it("passes non-system messages to onMessage callback", () => {
      const onMessage = jest.fn();
      const client = makeClient(onMessage);
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.triggerOpen();
      ws.triggerMessage({ type: "kill_switch_update", key: "payments" });
      expect(onMessage).toHaveBeenCalledWith({
        type: "kill_switch_update",
        key: "payments",
      });
    });

    it("does not call onMessage for ping or authenticated", () => {
      const onMessage = jest.fn();
      const client = makeClient(onMessage);
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.triggerOpen();
      ws.triggerMessage({ type: "ping" });
      ws.triggerMessage({ type: "authenticated" });
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("ignores invalid JSON messages", () => {
      const onMessage = jest.fn();
      const client = makeClient(onMessage);
      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.onmessage?.({ data: "not-json" });
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe("reconnect", () => {
    it("reconnects after non-4401 close", () => {
      const client = makeClient();
      client.connect();
      MockWebSocket.instances[0].triggerClose(1001);
      jest.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it("does not reconnect on 4401 auth failure", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const client = makeClient();
      client.connect();
      MockWebSocket.instances[0].triggerClose(4401);
      jest.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it("doubles backoff on each reconnect up to MAX_BACKOFF_MS", () => {
      const client = makeClient();
      client.connect();
      MockWebSocket.instances[0].triggerClose(1001);
      jest.advanceTimersByTime(1000);
      // backoff now 2000ms
      MockWebSocket.instances[1].triggerClose(1001);
      jest.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(2);
      jest.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket", () => {
      const client = makeClient();
      client.connect();
      const ws = MockWebSocket.instances[0];
      client.disconnect();
      expect(ws.closed).toBe(true);
    });

    it("prevents reconnection after disconnect", () => {
      const client = makeClient();
      client.connect();
      MockWebSocket.instances[0].triggerClose(1001);
      client.disconnect();
      jest.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("does not create WebSocket when connect called after disconnect", () => {
      const client = makeClient();
      client.disconnect();
      client.connect();
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it("clears pending reconnect timer", () => {
      const client = makeClient();
      client.connect();
      MockWebSocket.instances[0].triggerClose(1001);
      // Timer is pending — disconnect before it fires
      client.disconnect();
      jest.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("schedules reconnect when WebSocket constructor throws", () => {
      (global as unknown as { WebSocket: unknown }).WebSocket = function () {
        throw new Error("connection refused");
      };
      const client = makeClient();
      client.connect();
      // Restore mock for reconnect
      (global as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
      jest.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
