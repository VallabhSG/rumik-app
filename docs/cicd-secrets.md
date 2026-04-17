# CI/CD Secrets Reference

Configure these in **GitHub → Settings → Secrets and Variables → Actions**.

## Required Secrets

### Expo / EAS

| Secret | Description |
|--------|-------------|
| `EXPO_TOKEN` | EAS access token (`eas login` then `eas whoami --token`) |
| `EXPO_APPLE_ID` | Apple ID email for App Store Connect |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (appleid.apple.com) |
| `ASC_APP_ID` | App Store Connect numeric app ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

### Android / Firebase

| Secret | Description |
|--------|-------------|
| `FIREBASE_ANDROID_APP_ID` | Firebase Android App ID (from Firebase console) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON content of Firebase service account key |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON for Play Store submission |

### Vercel (Web)

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Found in Vercel project settings |
| `VERCEL_PROJECT_ID` | Found in Vercel project settings |

### OTA / Config servers

| Secret | Description |
|--------|-------------|
| `OTA_SERVER_URL` | Base URL of your OTA server (e.g. https://ota.rumik.app) |
| `OTA_API_KEY` | API key for OTA server admin endpoints |
| `STAGING_OTA_URL` | Staging OTA server URL |
| `PROD_OTA_URL` | Production OTA server URL |
| `STAGING_CONFIG_URL` | Staging config server URL |
| `PROD_CONFIG_URL` | Production config server URL |
| `STAGING_API_URL` | Staging backend API URL |
| `PROD_API_URL` | Production backend API URL |

### Monitoring

| Secret | Description |
|--------|-------------|
| `MONITORING_URL` | Base URL of monitoring service |
| `MONITORING_API_KEY` | API key for monitoring endpoints |
| `SLACK_WEBHOOK` | Slack incoming webhook for alerts |

### Testing

| Secret | Description |
|--------|-------------|
| `CODECOV_TOKEN` | Codecov upload token |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI GitHub App token |

---

## Workflow → Secrets Matrix

| Workflow | Secrets needed |
|----------|---------------|
| `pr-validation.yml` | _(none — public runners only)_ |
| `build-test.yml` | `EXPO_TOKEN`, `CODECOV_TOKEN`, `LHCI_GITHUB_APP_TOKEN` |
| `staging.yml` | `EXPO_TOKEN`, `FIREBASE_*`, `EXPO_APPLE_*`, `VERCEL_*`, `STAGING_*` |
| `production.yml` | All of the above + `OTA_*`, `MONITORING_*`, `GOOGLE_*` |
| `rollback.yml` | `EXPO_TOKEN`, `OTA_*`, `SLACK_WEBHOOK` |
