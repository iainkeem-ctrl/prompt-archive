import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const sql = getDb();

  const fields = ['prompt', 'negative_prompt', 'model', 'category', 'comfy_settings', 'notes'];
  const updates = fields.filter(f => body[f] !== undefined);
  if (updates.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });

  for (const field of updates) {
    if (field === 'prompt') await sql`UPDATE entries SET prompt=${body.prompt} WHERE id=${id}`;
    if (field === 'negative_prompt') await sql`UPDATE entries SET negative_prompt=${body.negative_prompt} WHERE id=${id}`;
    if (field === 'model') await sql`UPDATE entries SET model=${body.model} WHERE id=${id}`;
    if (field === 'category') await sql`UPDATE entries SET category=${body.category} WHERE id=${id}`;
    if (field === 'comfy_settings') await sql`UPDATE entries SET comfy_settings=${body.comfy_settings} WHERE id=${id}`;
    if (field === 'notes') await sql`UPDATE entries SET notes=${body.notes} WHERE id=${id}`;
  }

  const [entry] = await sql`SELECT * FROM entries WHERE id=${id}`;
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getDb();
  await sql`DELETE FROM entries WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
