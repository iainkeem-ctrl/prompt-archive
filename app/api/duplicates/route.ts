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

    // Same prompt + same seed = same generation
    const byPromptAndSeed = await sql`
      SELECT
        min(trim(prompt)) as key_prompt,
        min(original_filename) as filename,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(image_path ORDER BY created_at ASC) as image_paths,
        array_agg(model ORDER BY created_at ASC) as models,
        array_agg(created_at::text ORDER BY created_at ASC) as dates,
        count(*)::int as cnt
      FROM entries
      WHERE comfy_settings IS NOT NULL
        AND comfy_settings::jsonb ? 'seed'
      GROUP BY trim(prompt), (comfy_settings::jsonb->>'seed')
      HAVING count(*) > 1
    `;

    // Dedup: skip groups already covered by byHash
    const hashCoveredIds = new Set((byHash as Array<{ ids: string[] }>).flatMap(r => r.ids));
    const filtered = (byPromptAndSeed as Array<{ ids: string[] }>).filter(
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
