// Polyfill import.meta for Jest (Expo 54 winter runtime compatibility)
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = class ImportMetaRegistry {
    registry = new Map();
    get(url) { return this.registry.get(url); }
    set(url, meta) { this.registry.set(url, meta); }
  };
}
