# Release & Rollback Runbook

## Table of Contents
- [Release Process](#release-process)
- [Rollback Procedures](#rollback-procedures)
- [OTA Rollout Management](#ota-rollout-management)
- [Monitoring & Alerts](#monitoring--alerts)
- [Emergency Contacts & Escalation](#emergency-contacts--escalation)

---

## Release Process

### Standard Release (Automated)

1. **Merge to `master`** triggers `build-test` and `staging` workflows automatically.
   - Android: Firebase App Distribution
   - iOS: TestFlight internal
   - Web: Vercel preview URL

2. **Validate on staging** — smoke-test the preview build. Check:
   - App launches without crash
   - OTA update check fires (`[OTA]` logs visible)
   - Admin dashboard at `https://<ota-server>/admin` shows correct release

3. **Tag the release** to promote to production:
   ```bash
   # Bump patch version (auto-detects from conventional commits)
   git tag v1.2.3
   git push origin v1.2.3
   ```
   This triggers:
   - `release-tag` workflow → creates GitHub Release + changelog
   - `production` workflow → EAS submit to App Store / Play Store + Vercel production

4. **Create OTA release record** via admin dashboard or API:
   ```bash
   curl -X POST https://<ota-server>/api/releases \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $OTA_API_KEY" \
     -d '{
       "version": "1.2.3",
       "channel": "production",
       "platform": "all",
       "rollout_percentage": 5,
       "commit_sha": "<git-sha>",
       "release_notes": "Bug fixes and performance improvements"
     }'
   ```

5. **Rollout progresses automatically** via the scheduler (runs every 30 min):
   - 5% → wait 1 hour → 25%
   - 25% → wait 4 hours → 50%
   - 50% → wait 12 hours → 100%
   - Scheduler halts progression if crash rate > 5%

---

### Hotfix Release

For urgent fixes that cannot wait for the standard process:

1. Branch from `master`, apply fix, open PR
2. After merge, tag immediately:
   ```bash
   git tag v1.2.4
   git push origin v1.2.4
   ```
3. Create OTA release with **higher initial rollout** if urgency demands:
   ```bash
   # Skip staged rollout for a critical fix
   -d '{ "version": "1.2.4", "rollout_percentage": 100, ... }'
   ```
4. Monitor crash rate in admin dashboard > Monitoring tab for 30 minutes

---

### Manual Android APK Build

For APK distribution outside the Play Store:
1. Go to **Actions** → `build-android-apk` → **Run workflow**
2. Select branch and download the APK artifact when complete

---

## Rollback Procedures

### Option 1 — Automated Client Rollback (fastest)

The app rolls back automatically when:
- Crash rate exceeds `crashThreshold` (default 5%) within `minLaunchesBeforeRollback` (default 3) sessions
- The client calls `POST /api/rollbacks` and reloads to the previous version

No manual action required. Verify in admin → Monitoring tab that a rollback entry appeared.

---

### Option 2 — OTA Rollback via Admin Dashboard

1. Go to admin dashboard → **Releases** tab
2. Find the current active release, click **Pause** to stop new devices receiving it
3. Find the previous stable release, click the edit icon, set `rollout_percentage` to `100` and `status` to `active`
4. The control plane will now serve the old version to all new OTA checks

---

### Option 3 — OTA Rollback via API

```bash
curl -X POST https://<ota-server>/api/rollbacks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OTA_API_KEY" \
  -d '{
    "target_version": "1.2.2",
    "reason": "P95 startup latency spiked to 3s on 1.2.3",
    "channels": "production",
    "triggered_by": "oncall-engineer"
  }'
```

This will:
- Set all active releases in `channels` to `status: rolled_back`
- Reactivate the `target_version` release
- Record the rollback event in audit log

---

### Option 4 — GitHub Actions Rollback Workflow (with approval gate)

1. Go to **Actions** → `rollback` → **Run workflow**
2. Fill in:
   - `version`: the version to roll back to (e.g. `1.2.2`)
   - `reason`: human-readable reason
   - `channels`: comma-separated (e.g. `production,staging`)
3. The workflow requires environment approval before executing
4. After approval, it calls the rollback API and posts a Slack notification

---

### Option 5 — Kill Switch (instant feature disable)

To disable a specific feature without a full rollback:

```bash
# Create a kill switch
curl -X POST https://<ota-server>/api/kill-switches \
  -H "Authorization: Bearer $OTA_API_KEY" \
  -d '{ "key": "new_checkout_flow", "reason": "crashes on iOS 17" }'

# Activate it (broadcast over WebSocket to all connected clients)
curl -X POST https://<ota-server>/api/kill-switches/<id>/activate \
  -H "Authorization: Bearer $OTA_API_KEY"
```

The app receives the kill switch state via WebSocket and disables the feature immediately without a reload.

---

## OTA Rollout Management

### Pausing a Rollout

```bash
# Pause the rollout (scheduler will not advance it)
curl -X PATCH https://<ota-server>/api/releases/<id> \
  -H "Authorization: Bearer $OTA_API_KEY" \
  -d '{ "status": "paused" }'
```

### Manually Advancing a Rollout

```bash
# Jump to 50% immediately
curl -X PATCH https://<ota-server>/api/releases/<id> \
  -H "Authorization: Bearer $OTA_API_KEY" \
  -d '{ "rollout_percentage": 50 }'
```

### Rollout Stage Timeline

| Stage | Rollout % | Minimum Wait | Automatic? |
|-------|-----------|-------------|------------|
| 1     | 5%        | 1 hour      | ✅ scheduler |
| 2     | 25%       | 4 hours     | ✅ scheduler |
| 3     | 50%       | 12 hours    | ✅ scheduler |
| 4     | 100%      | —           | ✅ scheduler |

The scheduler halts automatically if `crash_rate > OTA_CRASH_THRESHOLD` (default 5%).

---

## Monitoring & Alerts

### Key Dashboards

| Dashboard | URL | What to check |
|-----------|-----|---------------|
| Admin — Monitoring | `/admin` → Monitoring tab | Crash trend, P95 startup/download latency |
| Admin — Adoption | `/admin` → Adoption tab | Eligible → applied funnel, failure rate |
| Admin — Errors | `/admin` → Errors tab | New error groups, spike in error rate |

### Alert Rules

Alert rules are managed in admin → Monitoring → Alert Rules. Default rules to configure:

| Metric | Operator | Threshold | Window | Cooldown |
|--------|----------|-----------|--------|---------|
| `crash_rate` | `gt` | `0.05` | 60 min | 30 min |
| `failure_rate` | `gt` | `0.10` | 60 min | 30 min |
| `p95_startup_ms` | `gt` | `3000` | 60 min | 60 min |
| `adoption_rate` | `lt` | `0.30` | 120 min | 60 min |

### Checking Alert History

```bash
curl https://<ota-server>/api/alerts/history \
  -H "Authorization: Bearer $OTA_API_KEY"
```

### Viewing Error Groups

```bash
# List open errors in production
curl "https://<ota-server>/api/errors/groups?status=open&channel=production" \
  -H "Authorization: Bearer $OTA_API_KEY"
```

---

## Emergency Contacts & Escalation

### Decision Tree

```
App crash rate > 5%?
  ├── YES → Automatic rollback fires within 3 sessions
  │         Monitor admin → Monitoring tab
  │         If no auto-rollback within 5 min → use Option 2 or 3 above
  │
  └── NO → Crash rate 2–5%?
            ├── YES → Pause rollout (Option PATCH /releases)
            │         Investigate admin → Errors tab
            └── NO → Monitor normally, check alert rules
```

### Rollback Decision Criteria

| Signal | Threshold | Action |
|--------|-----------|--------|
| Crash rate | > 5% | Immediate rollback |
| Crash rate | 2–5% | Pause rollout, investigate |
| P95 startup | > 3000ms | Alert, consider rollback |
| Update failure rate | > 10% | Pause rollout |
| Adoption rate (24h) | < 30% | Investigate delivery |

### Verifying Rollback Success

After any rollback:
1. Check admin → Releases: previous version should show `status: active` at 100%
2. Check admin → Monitoring: crash rate trend should start declining within 1–2 hours
3. Check `GET /api/rollbacks` to confirm entry exists with `status: completed`
4. Post incident summary to team channel with: affected version, impact window, root cause, resolution

---

## Backup & Recovery

### SQLite (default / dev)

Litestream provides continuous SQLite replication with 72-hour retention.

**Setup:**
```bash
# Install Litestream
curl -L https://github.com/benbjohnson/litestream/releases/latest/download/litestream-linux-amd64.tar.gz | tar xz
sudo mv litestream /usr/local/bin/

# Run alongside OTA server
litestream replicate -config observability/litestream.yml &
node dist/index.js
```

**Restore from replica:**
```bash
litestream restore -config observability/litestream.yml -o data/ota-restored.db /data/ota.db
```

### PostgreSQL (production)

Use the included backup script or the Docker Compose `pg-backup` service.

**Manual backup:**
```bash
DATABASE_URL=postgres://user:pass@host/rumik \
BACKUP_DIR=./backups \
bash scripts/backup-pg.sh
```

**Docker Compose (automatic daily backup):**
```bash
docker compose --profile postgres up pg-backup -d
```

Backups are stored in `/data/backups/pg/` and pruned after `BACKUP_RETENTION_DAYS` days (default: 7).

**Restore from backup:**
```bash
pg_restore --dbname=$DATABASE_URL --clean /data/backups/pg/ota_YYYYMMDD_HHMMSS.dump
```
