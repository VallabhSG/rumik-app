module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '^expo/src/winter/(.*)$': '<rootDir>/__mocks__/expo-winter.js',
    '^expo/build/winter/(.*)$': '<rootDir>/__mocks__/expo-winter.js',
    '^@ungap/structured-clone$': '<rootDir>/__mocks__/structured-clone.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'App.tsx',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
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
};
