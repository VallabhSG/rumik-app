import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import logger from './logger';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface DbAdapter {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
  close(): Promise<void>;
}

// ── SQLite adapter ────────────────────────────────────────────────────────────

class SqliteAdapter implements DbAdapter {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    // Convert $1,$2 placeholders to ? for SQLite
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const rows = this.db.prepare(sqliteSql).all(...params) as T[];
    return { rows };
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const row = this.db.prepare(sqliteSql).get(...params) as T | undefined;
    return row ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const result = this.db.prepare(sqliteSql).run(...params);
    return { rowCount: result.changes };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

// ── PostgreSQL adapter ────────────────────────────────────────────────────────

class PgAdapter implements DbAdapter {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query<T & Record<string, unknown>>(sql, params);
    return { rows: result.rows as T[] };
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const result = await this.pool.query<T & Record<string, unknown>>(sql, params);
    return (result.rows[0] as T) ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
    const result = await this.pool.query(sql, params);
    return { rowCount: result.rowCount ?? 0 };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createSqliteAdapter(): SqliteAdapter {
  const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.cwd(), process.env.DATA_DIR)
    : path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(path.join(DATA_DIR, 'ota.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new SqliteAdapter(db);
}

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (_adapter) return _adapter;
  if (process.env.DATABASE_URL) {
    logger.info({ backend: 'postgresql' }, 'Using PostgreSQL database');
    _adapter = new PgAdapter(process.env.DATABASE_URL);
  } else {
    logger.info({ backend: 'sqlite' }, 'Using SQLite database');
    _adapter = createSqliteAdapter();
  }
  return _adapter;
}

export default getDb;
