module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 2,
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        // Category scores — realistic floors for an Expo SPA
        'categories:performance':    ['warn',  { minScore: 0.4 }],
        'categories:accessibility':  ['error', { minScore: 0.7 }],
        'categories:best-practices': ['warn',  { minScore: 0.7 }],
        'categories:seo':            ['warn',  { minScore: 0.6 }],

        // Core Web Vitals
        'first-contentful-paint':    ['warn',  { maxNumericValue: 4000 }],
        'largest-contentful-paint':  ['warn',  { maxNumericValue: 6000 }],
        'total-blocking-time':       ['warn',  { maxNumericValue: 1000 }],
        'cumulative-layout-shift':   ['error', { maxNumericValue: 0.25 }],
        'interactive':               ['warn',  { maxNumericValue: 8000 }],

        // Keep these off — Expo SPA has expected patterns here
        'legacy-javascript':          'off',
        'render-blocking-resources':  'off',
        'unused-javascript':          'off',
        'uses-long-cache-ttl':        'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
