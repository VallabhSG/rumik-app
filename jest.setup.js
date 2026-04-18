// Polyfill import.meta for Jest (Expo 54 winter runtime compatibility)
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = class ImportMetaRegistry {
    registry = new Map();
    get(url) { return this.registry.get(url); }
    set(url, meta) { this.registry.set(url, meta); }
  };
}

// Mock AsyncStorage — native module unavailable in Jest
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));
