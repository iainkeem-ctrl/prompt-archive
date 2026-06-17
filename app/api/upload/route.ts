import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
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

    const id = uuidv4();
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${id}.${ext}`;
    const savePath = path.join(process.cwd(), 'public', 'images', filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(savePath, buffer);

    const db = getDb();
    db.prepare(`
      INSERT INTO entries (id, image_path, prompt, negative_prompt, model, category, comfy_settings, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, `/images/${filename}`, prompt, negative_prompt, model, category, comfy_settings, notes);

    return NextResponse.json({ id, image_path: `/images/${filename}` }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
