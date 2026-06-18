import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createHash } from 'crypto';

export async function POST() {
  try {
    const sql = getDb();

    const entries = await sql`
      SELECT id, image_path FROM entries WHERE file_hash IS NULL AND image_path IS NOT NULL
    `;

    let updated = 0;
    let failed = 0;

    for (const entry of entries as Array<{ id: string; image_path: string }>) {
      try {
        const res = await fetch(entry.image_path);
        if (!res.ok) { failed++; continue; }
        const buf = await res.arrayBuffer();
        const hash = createHash('sha256').update(Buffer.from(buf)).digest('hex');

        // Check if another entry already has this hash
        const [existing] = await sql`SELECT id FROM entries WHERE file_hash = ${hash} AND id != ${entry.id} LIMIT 1`;
        if (existing) {
          await sql`UPDATE entries SET file_hash = ${hash + '_dup'} WHERE id = ${entry.id}`;
        } else {
          await sql`UPDATE entries SET file_hash = ${hash} WHERE id = ${entry.id}`;
        }
        updated++;
      } catch {
        failed++;
      }
    }

    // Now find true duplicates by hash
    const dupes = await sql`
      SELECT file_hash, count(*)::int as cnt, array_agg(id) as ids
      FROM entries
      WHERE file_hash IS NOT NULL AND file_hash NOT LIKE '%_dup'
      GROUP BY file_hash
      HAVING count(*) > 1
    `;

    return NextResponse.json({ updated, failed, total: (entries as unknown[]).length, dupes_found: (dupes as unknown[]).length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
