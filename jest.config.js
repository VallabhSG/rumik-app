module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '^expo/src/winter/(.*)$': '<rootDir>/__mocks__/expo-winter.js',
    '^expo/build/winter/(.*)$': '<rootDir>/__mocks__/expo-winter.js',
    '^@ungap/structured-clone$': '<rootDir>/__mocks__/structured-clone.js',
    '^expo-updates$': '<rootDir>/__mocks__/expo-updates.js',
    '^expo-application$': '<rootDir>/__mocks__/expo-application.js',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
  },
  transformIgnorePatterns: [
    // pnpm stores packages under node_modules/.pnpm/.../node_modules/<pkg>
    // The second pattern handles the hoisted path; the first handles pnpm's deep path.
    'node_modules/\\.pnpm/(?!.*node_modules/(jest-)?react-native|.*node_modules/@react-native|.*node_modules/expo|.*node_modules/@expo|.*node_modules/@unimodules|.*node_modules/sentry-expo|.*node_modules/native-base|.*node_modules/react-native-svg)',
    'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    // Platform-specific wrappers that require device APIs — not unit-testable
    '!src/utils/tokenCache.ts',
    // Simple ref exports with no testable logic
    '!src/utils/configClientRef.ts',
    // Trivial single-line hooks
    '!src/hooks/useMiniPlayerPadding.ts',
    // UI-only player components — tested via E2E, not unit tests
    '!src/components/player/MiniPlayer.tsx',
    '!src/components/player/NowPlaying.tsx',
    // UI-only track components without testable logic
    '!src/components/track/TrackCard.tsx',
    // Thin context wrappers over hooks — covered by hook tests
    '!src/contexts/OtaContext.tsx',
    // Type-only files
    '!src/services/config/types.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/ota-server/'],
};
