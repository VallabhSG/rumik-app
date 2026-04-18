// Polyfill import.meta for Jest (Expo 54 winter runtime compatibility)
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = class ImportMetaRegistry {
    registry = new Map();
    get(url) { return this.registry.get(url); }
    set(url, meta) { this.registry.set(url, meta); }
  };
}

// Mock AsyncStorage with an in-memory store so data actually persists across
// get/set calls within a test, matching real AsyncStorage behaviour.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key, value) => { store.set(key, value); return Promise.resolve(); }),
    removeItem: jest.fn((key) => { store.delete(key); return Promise.resolve(); }),
    multiGet: jest.fn((keys) => Promise.resolve(keys.map((k) => [k, store.get(k) ?? null]))),
    multiSet: jest.fn((pairs) => { pairs.forEach(([k, v]) => store.set(k, v)); return Promise.resolve(); }),
    clear: jest.fn(() => { store.clear(); return Promise.resolve(); }),
    _store: store, // exposed for test assertions
  };
});

// Mock global fetch so tests can intercept network calls
global.fetch = jest.fn();

// Mock WebSocket — prevents ConfigClient WS connection attempts in tests
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  readyState: 1, // OPEN
}));
