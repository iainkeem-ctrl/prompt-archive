import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const sql = getDb();
  const rows = await sql`
    SELECT
      file_hash,
      trim(prompt) as key_prompt,
      array_agg(id ORDER BY created_at ASC) as ids,
      array_agg(image_path ORDER BY created_at ASC) as image_paths,
      array_agg(model ORDER BY created_at ASC) as models,
      array_agg(created_at::text ORDER BY created_at ASC) as dates,
      count(*)::int as cnt
    FROM entries
    WHERE file_hash IS NOT NULL
    GROUP BY file_hash, trim(prompt)
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `;
  return NextResponse.json(rows);
}
