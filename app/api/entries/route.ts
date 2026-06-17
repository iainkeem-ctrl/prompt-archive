import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  const category = searchParams.get('category');
  const sort = searchParams.get('sort') || 'newest';

  const db = getDb();
  let query = 'SELECT * FROM entries WHERE 1=1';
  const params: string[] = [];

  if (model) { query += ' AND model = ?'; params.push(model); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';

  const entries = db.prepare(query).all(...params);
  return NextResponse.json(entries);
}
