import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();

    // Most reliable: exact same file bytes
    const byHash = await sql`
      SELECT
        min(trim(prompt)) as key_prompt,
        min(original_filename) as filename,
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

    // Strict: same filename AND same seed — both must match
    const byFilenameAndSeed = await sql`
      SELECT
        min(trim(prompt)) as key_prompt,
        original_filename as filename,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(image_path ORDER BY created_at ASC) as image_paths,
        array_agg(model ORDER BY created_at ASC) as models,
        array_agg(created_at::text ORDER BY created_at ASC) as dates,
        count(*)::int as cnt
      FROM entries
      WHERE original_filename IS NOT NULL
        AND comfy_settings IS NOT NULL
        AND comfy_settings::jsonb ? 'seed'
      GROUP BY original_filename, (comfy_settings::jsonb->>'seed')
      HAVING count(*) > 1
    `;

    // Dedup: if a group's IDs are already covered by byHash, skip
    const hashCoveredIds = new Set((byHash as Array<{ ids: string[] }>).flatMap(r => r.ids));
    const filtered = (byFilenameAndSeed as Array<{ ids: string[] }>).filter(
      r => !r.ids.every(id => hashCoveredIds.has(id))
    );
    const rows = ([...byHash, ...filtered] as Array<{ cnt: number }>)
      .sort((a, b) => b.cnt - a.cnt);

    return NextResponse.json(rows);
  } catch (e) {
    console.error('duplicates error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
