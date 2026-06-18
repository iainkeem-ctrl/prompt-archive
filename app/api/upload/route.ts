import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const sql = getDb();
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    const prompt = formData.get('prompt') as string;
    const model = formData.get('model') as string;
    const category = (formData.get('category') as string) || 'etc';
    const negative_prompt = (formData.get('negative_prompt') as string) || '';
    const comfy_settings = (formData.get('comfy_settings') as string) || null;
    const notes = (formData.get('notes') as string) || '';

    if (!file || !prompt || !model) {
      return NextResponse.json({ error: 'image, prompt, model required' }, { status: 400 });
    }

    const file_hash = (formData.get('file_hash') as string) || null;

    if (file_hash) {
      const [existing] = await sql`SELECT id, image_path, prompt, model FROM entries WHERE file_hash=${file_hash} LIMIT 1`;
      if (existing) {
        return NextResponse.json({ duplicate: true, existing }, { status: 409 });
      }
    }

    const id = uuidv4();
    const ext = file.name.split('.').pop() || 'png';
    const blob = await put(`images/${id}.${ext}`, file, { access: 'public' });

    await sql`
      INSERT INTO entries (id, image_path, prompt, negative_prompt, model, category, comfy_settings, notes, file_hash)
      VALUES (${id}, ${blob.url}, ${prompt}, ${negative_prompt}, ${model}, ${category}, ${comfy_settings}, ${notes}, ${file_hash})
    `;

    return NextResponse.json({ id, image_path: blob.url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
