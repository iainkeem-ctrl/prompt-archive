import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { mode, entries, instruction, avatar } = await req.json();
    const sql = getDb();

    // Fetch archive context (top 30 prompts by model usage)
    const archive = await sql`
      SELECT prompt, negative_prompt, model, comfy_settings
      FROM entries
      ORDER BY created_at DESC
      LIMIT 30
    `;

    const archiveContext = (archive as Array<{ prompt: string; negative_prompt?: string; model?: string }>).map(e =>
      `Prompt: ${e.prompt}${e.negative_prompt ? `\nNegative: ${e.negative_prompt}` : ''}`
    ).join('\n---\n');

    let userMsg = '';

    if (mode === 'avatar') {
      const specs = [
        avatar.gender && `성별: ${avatar.gender}`,
        avatar.age && `나이대: ${avatar.age}`,
        avatar.hair_style && `헤어스타일: ${avatar.hair_style}`,
        avatar.hair_color && `헤어컬러: ${avatar.hair_color}`,
        avatar.skin_tone && `피부톤: ${avatar.skin_tone}`,
        avatar.eyes && `눈: ${avatar.eyes}`,
        avatar.nose && `코: ${avatar.nose}`,
        avatar.lips && `입: ${avatar.lips}`,
        avatar.face_shape && `얼굴형: ${avatar.face_shape}`,
        avatar.style && `스타일/분위기: ${avatar.style}`,
        avatar.extra && `추가 요청: ${avatar.extra}`,
      ].filter(Boolean).join('\n');

      userMsg = `아카이브 프롬프트 패턴을 참고해서, 아래 인물 스펙에 맞는 AI 이미지 생성 프롬프트를 작성해줘.\n\n[인물 스펙]\n${specs}`;
    } else {
      const refs = (entries || []).map((e: { prompt: string; negative_prompt?: string; model?: string }, i: number) =>
        `[레퍼런스 ${i + 1}]\nPrompt: ${e.prompt}${e.negative_prompt ? `\nNegative: ${e.negative_prompt}` : ''}${e.model ? `\nModel: ${e.model}` : ''}`
      ).join('\n\n');

      userMsg = refs
        ? `다음 레퍼런스들의 스타일을 참고해서 새 프롬프트를 작성해줘.${instruction ? `\n\n추가 요청: ${instruction}` : ''}\n\n${refs}`
        : `아카이브 프롬프트 패턴을 분석해서 고퀄리티 새 프롬프트를 작성해줘.${instruction ? `\n\n요청: ${instruction}` : ''}`;
    }

    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: `당신은 AI 이미지 생성(ComfyUI, Stable Diffusion) 전문 프롬프트 엔지니어입니다.
아래는 사용자의 프롬프트 아카이브입니다. 이 패턴과 스타일을 학습해서 새 프롬프트를 작성하세요.

[아카이브 패턴]
${archiveContext}

출력 형식 (반드시 이 형식으로):
**Prompt:**
(영어 프롬프트)

**Negative Prompt:**
(영어 네거티브 프롬프트)

아카이브의 퀄리티 키워드, 조명, 스타일 패턴을 유지하세요.`,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    const promptMatch = text.match(/\*\*Prompt:\*\*\s*([\s\S]*?)(?=\*\*Negative Prompt:|$)/);
    const negMatch = text.match(/\*\*Negative Prompt:\*\*\s*([\s\S]*?)$/);

    return NextResponse.json({
      prompt: promptMatch?.[1]?.trim() ?? text,
      negative_prompt: negMatch?.[1]?.trim() ?? '',
    });
  } catch (e) {
    console.error('generate-prompt error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
