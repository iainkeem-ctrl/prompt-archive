import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();
    const byHash = await sql`
      SELECT
        trim(prompt) as key_prompt,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(image_path ORDER BY created_at ASC) as image_paths,
        array_agg(model ORDER BY created_at ASC) as models,
        array_agg(created_at::text ORDER BY created_at ASC) as dates,
        count(*)::int as cnt
      FROM entries
      WHERE file_hash IS NOT NULL
      GROUP BY file_hash
      HAVING count(*) > 1
    `;
    const byMeta = await sql`
      SELECT
        trim(prompt) as key_prompt,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(image_path ORDER BY created_at ASC) as image_paths,
        array_agg(model ORDER BY created_at ASC) as models,
        array_agg(created_at::text ORDER BY created_at ASC) as dates,
        count(*)::int as cnt
      FROM entries
      WHERE file_hash IS NULL
        AND comfy_settings IS NOT NULL
        AND trim(comfy_settings) <> ''
      GROUP BY trim(prompt), trim(model), trim(comfy_settings)
      HAVING count(*) > 1
    `;
    const rows = [...byHash, ...byMeta].sort((a, b) => (b.cnt as number) - (a.cnt as number));
    return NextResponse.json(rows);
  } catch (e) {
    console.error('duplicates error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
