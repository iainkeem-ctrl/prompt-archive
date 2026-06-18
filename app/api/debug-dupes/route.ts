import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();

    const stats = await sql`
      SELECT
        count(*) as total,
        count(file_hash) as has_hash,
        count(original_filename) as has_filename,
        count(CASE WHEN comfy_settings IS NOT NULL AND comfy_settings::jsonb ? 'seed' THEN 1 END) as has_seed
      FROM entries
    `;

    // Same filename, regardless of seed
    const byFilenameOnly = await sql`
      SELECT original_filename, count(*)::int as cnt, array_agg(id ORDER BY created_at ASC) as ids
      FROM entries
      WHERE original_filename IS NOT NULL
      GROUP BY original_filename
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 20
    `;

    // Same prompt (first 100 chars)
    const byPrompt = await sql`
      SELECT left(trim(prompt), 100) as prompt_prefix, count(*)::int as cnt
      FROM entries
      GROUP BY left(trim(prompt), 100)
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 20
    `;

    return NextResponse.json({ stats, byFilenameOnly, byPrompt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
