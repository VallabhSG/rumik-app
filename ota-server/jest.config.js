/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Map .js extension imports to .ts source files (needed for ts-jest + CommonJS)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/index.ts',
    '!src/db.ts',             // DB initialization — tested implicitly via testApp
    '!src/ws.ts',             // WebSocket server — requires live HTTP server
    '!src/rolloutScheduler.ts', // Scheduler — runs setInterval against live DB
    '!src/services/alertEngine.ts', // Alert engine — sends live Slack webhooks
    '!src/middleware/auth.ts', // Auth middleware
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 70, statements: 80 },
  },
};
