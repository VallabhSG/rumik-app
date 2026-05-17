# SQLite to PostgreSQL Migration

## Prerequisites

1. A running PostgreSQL instance reachable from the machine running this script.

2. Run the OTA server once with `DATABASE_URL` set so it creates the schema automatically
   (the server runs all DDL migrations on startup):

   ```bash
   DATABASE_URL=postgres://user:pass@host:5432/rumik node dist/index.js
   ```

3. Stop the server before running the migration to avoid concurrent writes.

## Run the Migration

```bash
# Preview (dry run — no data written)
DATABASE_URL=postgres://user:pass@host:5432/rumik \
DATA_DIR=./data \
npm run migrate:sqlite-to-pg -- --dry-run

# Execute
DATABASE_URL=postgres://user:pass@host:5432/rumik \
DATA_DIR=./data \
npm run migrate:sqlite-to-pg
```

`DATA_DIR` defaults to `./data` (relative to the working directory) if omitted.

## What the Script Does

- Reads every row from all 15 tables in the SQLite database (`data/ota.db`).
- Inserts each row into PostgreSQL using `ON CONFLICT DO NOTHING`, so the script
  is safe to re-run — rows that already exist are silently skipped.
- Converts SQLite integer booleans (`0`/`1`) to PostgreSQL native booleans for
  the `is_rollback`, `active`, and `enabled` columns.
- Processes tables in dependency order so foreign-key constraints are satisfied.
- Masks credentials in all log output.

## After Migration

Restart the server with `DATABASE_URL` set. It will use PostgreSQL going forward.

The SQLite file at `data/ota.db` is left untouched and serves as a point-in-time
backup of the data at the time of migration.

## Rollback

To revert to SQLite, stop the server and restart it without `DATABASE_URL` set.
The SQLite file will be used again unchanged.
