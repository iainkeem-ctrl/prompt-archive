import { neon } from '@neondatabase/serverless';

export function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function initDb() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      image_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      model TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'etc',
      comfy_settings TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      file_hash TEXT DEFAULT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS file_hash TEXT DEFAULT NULL`;
  await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS original_filename TEXT DEFAULT NULL`;
}
