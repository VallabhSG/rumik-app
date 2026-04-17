module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 1,
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        'categories:performance': 'off',
        'categories:accessibility': 'off',
        'categories:best-practices': 'off',
        'categories:seo': 'off',
        'legacy-javascript': 'off',
        'max-potential-fid': 'off',
        'render-blocking-resources': 'off',
        'unused-javascript': 'off',
        'color-contrast': 'off',
        'meta-description': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
