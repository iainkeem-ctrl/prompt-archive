import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'archive.db');

function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      image_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      model TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'etc',
      comfy_settings TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model ON entries(model);
    CREATE INDEX IF NOT EXISTS idx_category ON entries(category);
    CREATE INDEX IF NOT EXISTS idx_created ON entries(created_at DESC);
  `);

  return db;
}

export default getDb;
