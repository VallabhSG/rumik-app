module.exports = {
  ci: {
    collect: {
      // URL mode: staticDistDir has known NO_FCP false-positives with React SPAs.
      // We start our own server so Lighthouse runs in a full browser context.
      url: ['http://localhost:3000'],
      startServerCommand: 'npx serve ./dist -p 3000 --no-clipboard',
      startServerReadyPattern: 'Accepting connections',
      numberOfRuns: 1,
      settings: {
        maxWaitForFcp: 45000,
        maxWaitForLoad: 60000,
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        // Category scores — realistic floors for an Expo SPA
        'categories:performance':    ['warn',  { minScore: 0.4 }],
        'categories:accessibility':  ['error', { minScore: 0.7 }],
        'categories:best-practices': ['warn',  { minScore: 0.7 }],
        'categories:seo':            ['warn',  { minScore: 0.6 }],

        // Core Web Vitals — off for SPA: FCP/LCP are high for JS-rendered apps
        'first-contentful-paint':    'off',
        'largest-contentful-paint':  ['warn',  { maxNumericValue: 10000 }],
        'total-blocking-time':       ['warn',  { maxNumericValue: 2000 }],
        'cumulative-layout-shift':   ['warn',  { maxNumericValue: 0.25 }],
        'interactive':               ['warn',  { maxNumericValue: 15000 }],

        // Keep these off — Expo SPA has expected patterns here
        'legacy-javascript':          'off',
        'render-blocking-resources':  'off',
        'unused-javascript':          'off',
        'uses-long-cache-ttl':        'off',
        'valid-source-maps':          'off',  // Expo prod bundles omit source maps by design
        'max-potential-fid':          'off',  // Deprecated metric; replaced by INP
        // Dark-theme app — contrast ratios intentional; address in design pass
        'color-contrast':             'off',
        // SPA demo without traditional SEO meta tags
        'meta-description':           'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
