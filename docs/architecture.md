# System Architecture

## High-Level Overview

```mermaid
graph TB
    subgraph Client["React Native App (Expo)"]
        App["App.tsx\n(OtaProvider)"]
        Banner["UpdateBanner"]
        Hook["useOtaUpdate"]
        Ctx["OtaContext"]
        OtaClient["OtaClient"]
        subgraph Services["OTA Services"]
            PerfTracker["PerfTracker\n(metrics flush every 30s)"]
            EventReporter["EventReporter\n(lifecycle events)"]
            ErrorReporter["ErrorReporter\n(global error handler)"]
            CrashTracker["CrashTracker\n(session watchdog)"]
            Rollout["rollout.ts\n(DJB2 bucketing)"]
            Semver["semver.ts\n(version enforcement)"]
            Storage["storage.ts\n(AsyncStorage)"]
        end
        subgraph RemoteConfig["Remote Config"]
            useRC["useRemoteConfig"]
            ConfigClient["ConfigClient"]
            WSClient["wsClient\n(WebSocket)"]
        end
    end

    subgraph ExpoInfra["Expo Infrastructure"]
        ExpoUpdates["expo-updates\n(JS bundle delivery)"]
    end

    subgraph OTAServer["OTA Control Plane (Node/Express + SQLite)"]
        subgraph Routes["API Routes"]
            ConfigAPI["/api/config"]
            FlagsAPI["/api/flags"]
            ExpAPI["/api/experiments"]
            UrlsAPI["/api/urls"]
            KillAPI["/api/kill-switches"]
            RelAPI["/api/releases"]
            RollAPI["/api/rollbacks"]
            PerfAPI["/api/perf-metrics"]
            EventsAPI["/api/update-events"]
            AlertsAPI["/api/alerts"]
            ErrorsAPI["/api/errors"]
            MetricsAPI["/api/crash-rate"]
            AuditAPI["/api/audit"]
        end
        subgraph Background["Background Services"]
            AlertEngine["Alert Engine\n(every 5 min)"]
            RolloutSched["Rollout Scheduler\n(every 30 min)"]
        end
        subgraph WSServer["WebSocket"]
            WS["/ws\n(live push)"]
        end
        DB[("SQLite DB\n14 tables")]
    end

    subgraph AdminUI["Admin Dashboard"]
        Tabs["10 Tabs:\nFlags · Experiments · URLs\nKill Switches · Releases\nMonitoring · Adoption\nErrors · Metrics · Audit"]
        Charts["Chart.js 4\n(CDN)"]
    end

    subgraph CI["GitHub Actions (7 Workflows)"]
        PR["pr-validation\n(lint + test + coverage)"]
        BuildTest["build-test\n(jest + web export)"]
        Staging["staging\n(Firebase + TestFlight + Vercel)"]
        Prod["production\n(tag-triggered)"]
        RollbackWF["rollback\n(manual dispatch)"]
        TagWF["release-tag\n(semver bump)"]
        APK["build-android-apk\n(manual)"]
    end

    App --> Ctx --> Hook --> OtaClient
    Banner --> Ctx
    OtaClient --> Services
    OtaClient --> ExpoUpdates
    OtaClient --> PerfAPI
    OtaClient --> EventsAPI
    OtaClient --> ErrorsAPI
    OtaClient --> MetricsAPI
    OtaClient --> RelAPI
    RemoteConfig --> ConfigAPI
    WSClient --> WS

    Routes --> DB
    AlertEngine --> DB
    AlertEngine -->|"Slack webhook"| Webhook["Webhook (Slack)"]
    RolloutSched --> DB
    WS --> DB

    AdminUI --> Routes
    Charts --> AdminUI

    CI --> ExpoUpdates
    CI --> OTAServer
```

---

## Data Flow: OTA Update Lifecycle

```mermaid
sequenceDiagram
    participant App as React Native App
    participant OTA as OTA Control Plane
    participant Expo as Expo Updates CDN
    participant Admin as Admin Dashboard

    App->>OTA: GET /api/releases/current?channel=production&platform=ios
    OTA-->>App: { version, rollout_percentage, min_native_version }

    App->>App: Check rollout bucket (DJB2 hash of installId)
    App->>App: Check native version range (semver)

    alt Eligible
        App->>OTA: POST /api/update-events (event_type: eligible)
        App->>Expo: checkForUpdateAsync()
        Expo-->>App: manifest
        App->>OTA: POST /api/update-events (event_type: download_start)
        App->>Expo: fetchUpdateAsync()
        App->>OTA: POST /api/perf-metrics (update_download_ms)
        App->>OTA: POST /api/update-events (event_type: download_complete)
        App->>OTA: POST /api/update-events (event_type: staged)
        Note over App: Reload on next foreground
        App->>OTA: POST /api/update-events (event_type: applied)
    else Not eligible / skipped
        App->>OTA: POST /api/update-events (event_type: skipped)
    end

    Admin->>OTA: GET /api/update-events/funnel?release_id=...
    OTA-->>Admin: { eligible, downloading, applied, failure_rate }
```

---

## Data Flow: Crash Detection & Auto-Rollback

```mermaid
sequenceDiagram
    participant App as React Native App
    participant ErrUtils as ErrorUtils (RN)
    participant OTA as OTA Control Plane
    participant Scheduler as Rollout Scheduler

    App->>ErrUtils: install global handler (ErrorReporter)
    ErrUtils-->>App: previous handler saved

    Note over App: JS error thrown
    ErrUtils->>App: handler(error, isFatal)
    App->>OTA: POST /api/errors (fingerprint dedup)
    App->>OTA: POST /api/crash-rate (session crash rate)

    App->>App: CrashTracker increments launch count
    App->>App: Check crash_rate > threshold (5%)

    alt Crash rate exceeded
        App->>OTA: POST /api/rollbacks { target_version, reason }
        OTA->>OTA: UPDATE releases SET status='rolled_back'
        OTA->>OTA: Reactivate previous version
        App->>App: Reload to previous version
    end

    Scheduler->>OTA: Check crash_rate for active release
    alt crash_rate > 5% or stage time not met
        Scheduler->>OTA: Hold rollout at current %
    else Stage time elapsed + crash rate OK
        Scheduler->>OTA: Advance rollout (5→25→50→100%)
    end
```

---

## Data Flow: Alert Engine

```mermaid
sequenceDiagram
    participant Cron as Alert Engine (every 5 min)
    participant DB as SQLite DB
    participant Slack as Webhook (Slack)

    Cron->>DB: SELECT * FROM alert_rules WHERE enabled = 1
    loop For each rule
        Cron->>DB: Compute metric (crash_rate / adoption_rate / p95_ms)
        Cron->>DB: Check cooldown (last fired within cooldown_mins?)
        alt Threshold breached AND not in cooldown
            Cron->>Slack: POST { metric, value, threshold, rule_name }
            Cron->>DB: INSERT INTO alert_history (status: sent)
        end
    end
```

---

## Database Schema (14 Tables)

```mermaid
erDiagram
    feature_flags {
        TEXT id PK
        TEXT key UK
        INTEGER enabled
        TEXT targeting
        TEXT created_at
        TEXT updated_at
    }
    experiments {
        TEXT id PK
        TEXT key UK
        TEXT status
        TEXT variants
        TEXT targeting
    }
    experiment_assignments {
        TEXT install_id PK
        TEXT experiment_id PK
        TEXT variant_id
    }
    dynamic_urls {
        TEXT id PK
        TEXT key UK
        TEXT value
        TEXT targeting
    }
    kill_switches {
        TEXT id PK
        TEXT key UK
        INTEGER active
        TEXT reason
    }
    releases {
        TEXT id PK
        TEXT version
        TEXT channel
        TEXT platform
        REAL rollout_percentage
        TEXT status
        TEXT min_native_version
        TEXT max_native_version
    }
    rollbacks {
        TEXT id PK
        TEXT target_version
        TEXT from_version
        TEXT reason
        TEXT channels
        TEXT status
    }
    crash_rates {
        TEXT id PK
        REAL crash_rate
        TEXT version
        TEXT channel
        TEXT recorded_at
    }
    perf_metrics {
        TEXT id PK
        TEXT device_id
        TEXT version
        TEXT metric_type
        REAL value
        TEXT recorded_at
    }
    update_events {
        TEXT id PK
        TEXT device_id
        TEXT release_id
        TEXT event_type
        TEXT error_msg
        TEXT recorded_at
    }
    alert_rules {
        TEXT id PK
        TEXT name
        TEXT metric
        TEXT operator
        REAL threshold
        TEXT webhook_url
        INTEGER enabled
    }
    alert_history {
        TEXT id PK
        TEXT rule_id FK
        REAL metric_value
        TEXT status
        TEXT fired_at
    }
    error_groups {
        TEXT id PK
        TEXT fingerprint UK
        TEXT error_type
        INTEGER event_count
        TEXT status
    }
    error_events {
        TEXT id PK
        TEXT group_id FK
        TEXT device_id
        TEXT stack_trace
        TEXT recorded_at
    }
    audit_log {
        TEXT id PK
        TEXT entity_type
        TEXT entity_id
        TEXT action
        TEXT changes
    }

    alert_history }o--|| alert_rules : "rule_id"
    error_events }o--|| error_groups : "group_id"
    experiment_assignments }o--|| experiments : "experiment_id"
```

---

## CI/CD Pipeline Map

```mermaid
graph LR
    PR["Pull Request"] -->|"push"| PRVal["pr-validation\n✓ prettier\n✓ tsc\n✓ jest + coverage\n✓ bundle size\n✓ lighthouse\n✓ playwright"]
    
    Merge["Merge to master"] -->|"push"| BuildTest["build-test\n✓ jest\n✓ web export\n✓ EAS preview"]
    Merge -->|"push"| Staging["staging\n✓ EAS Android\n✓ EAS iOS\n✓ Vercel preview"]

    Tag["git tag vX.Y.Z"] -->|"tag push"| Prod["production\n✓ EAS submit\n✓ Vercel prod"]
    Tag -->|"tag push"| TagWF["release-tag\n✓ GitHub Release\n✓ changelog"]

    Manual["Manual Dispatch"] --> Rollback["rollback\n✓ version pin\n✓ OTA revert\n✓ notify"]
    Manual --> APK["build-android-apk\n✓ APK artifact"]
```
