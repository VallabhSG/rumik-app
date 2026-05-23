import Database from 'better-sqlite3';
import { initDb } from '../../src/db.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initDb(db);
});

afterEach(() => {
  db.close();
});

test('segments table exists with correct columns', () => {
  const cols = db.prepare("PRAGMA table_info(segments)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'key', 'name', 'description', 'rules', 'created_at', 'updated_at']));
});

test('experiment_exposures table exists with unique constraint', () => {
  const cols = db.prepare("PRAGMA table_info(experiment_exposures)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'experiment_id', 'install_id', 'user_id', 'variant_id', 'exposed_at']));
  db.prepare("INSERT INTO experiment_exposures(id, experiment_id, install_id, variant_id, exposed_at) VALUES ('a','exp1','dev1','ctrl',datetime('now'))").run();
  expect(() => {
    db.prepare("INSERT OR IGNORE INTO experiment_exposures(id, experiment_id, install_id, variant_id, exposed_at) VALUES ('b','exp1','dev1','ctrl',datetime('now'))").run();
  }).not.toThrow();
  const rows = db.prepare("SELECT * FROM experiment_exposures WHERE experiment_id='exp1'").all();
  expect(rows).toHaveLength(1);
});

test('experiment_conversions table exists', () => {
  const cols = db.prepare("PRAGMA table_info(experiment_conversions)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'experiment_id', 'install_id', 'user_id', 'variant_id', 'event_name', 'value', 'converted_at']));
});

test('flag_schedules table exists', () => {
  const cols = db.prepare("PRAGMA table_info(flag_schedules)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'entity_type', 'entity_id', 'action', 'payload', 'scheduled_at', 'executed_at', 'created_by', 'created_at']));
});

test('kill_switches has targeting column after migration', () => {
  const cols = db.prepare("PRAGMA table_info(kill_switches)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toContain('targeting');
});
