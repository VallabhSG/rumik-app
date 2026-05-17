#!/usr/bin/env node
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const DATABASE_URL = process.env.DATABASE_URL;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const sqlitePath = path.join(DATA_DIR, 'ota.db');
if (!fs.existsSync(sqlitePath)) {
  console.error(`ERROR: SQLite database not found at ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pg = new Pool({ connectionString: DATABASE_URL, max: 5 });

// Columns that are stored as SQLite INTEGER (0/1) but must be PostgreSQL BOOLEAN
const BOOLEAN_COLUMNS = new Set(['is_rollback', 'active', 'enabled']);

// Tables in dependency order (parent tables before child tables)
const TABLES: string[] = [
  'releases',
  'rollbacks',
  'crash_rates',
  'feature_flags',
  'experiments',
  'dynamic_urls',
  'kill_switches',
  'audit_log',
  'experiment_assignments',
  'perf_metrics',
  'update_events',
  'alert_rules',
  'alert_history',
  'error_groups',
  'error_events',
];

async function migrateTable(tableName: string): Promise<void> {
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows (skipped)`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colList = columns.map(c => `"${c}"`).join(', ');
  const sql = `INSERT INTO ${tableName} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const values = columns.map(col => {
      const val = row[col];
      // Convert SQLite integer booleans (0/1) to PostgreSQL native booleans
      if (BOOLEAN_COLUMNS.has(col) && typeof val === 'number') {
        return val === 1;
      }
      return val;
    });

    if (DRY_RUN) {
      inserted++;
    } else {
      const result = await pg.query(sql, values);
      if (result.rowCount !== null && result.rowCount > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  }

  const conflictNote = skipped > 0 ? `, ${skipped} skipped (conflict)` : '';
  const dryNote = DRY_RUN ? ' [DRY RUN]' : '';
  console.log(`  ${tableName}: ${inserted} inserted${conflictNote}${dryNote}`);
}

async function main(): Promise<void> {
  console.log(`\nSQLite -> PostgreSQL migration`);
  console.log(`  Source: ${sqlitePath}`);
  // Mask credentials in the logged URL
  console.log(`  Target: ${DATABASE_URL!.replace(/:\/\/[^@]+@/, '://***@')}`);
  if (DRY_RUN) {
    console.log(`  Mode: DRY RUN (no data will be written)\n`);
  } else {
    console.log('');
  }

  for (const table of TABLES) {
    try {
      await migrateTable(table);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not exist')) {
        console.log(`  ${table}: table does not exist in PostgreSQL (run migrations first)`);
      } else {
        console.error(`  ${table}: ERROR -- ${message}`);
      }
    }
  }

  if (!DRY_RUN) {
    console.log('\nMigration complete!');
    console.log('Run with --dry-run to preview without writing.');
  } else {
    console.log('\nDry run complete. Re-run without --dry-run to write data.');
  }

  sqlite.close();
  await pg.end();
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
