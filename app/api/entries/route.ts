import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  await initDb();
  const sql = getDb();
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  const category = searchParams.get('category');
  const oldest = searchParams.get('sort') === 'oldest';

  let entries;
  if (model && category) {
    entries = oldest
      ? await sql`SELECT * FROM entries WHERE model=${model} AND category=${category} ORDER BY created_at ASC`
      : await sql`SELECT * FROM entries WHERE model=${model} AND category=${category} ORDER BY created_at DESC`;
  } else if (model) {
    entries = oldest
      ? await sql`SELECT * FROM entries WHERE model=${model} ORDER BY created_at ASC`
      : await sql`SELECT * FROM entries WHERE model=${model} ORDER BY created_at DESC`;
  } else if (category) {
    entries = oldest
      ? await sql`SELECT * FROM entries WHERE category=${category} ORDER BY created_at ASC`
      : await sql`SELECT * FROM entries WHERE category=${category} ORDER BY created_at DESC`;
  } else {
    entries = oldest
      ? await sql`SELECT * FROM entries ORDER BY created_at ASC`
      : await sql`SELECT * FROM entries ORDER BY created_at DESC`;
  }

  return NextResponse.json(entries);
}
