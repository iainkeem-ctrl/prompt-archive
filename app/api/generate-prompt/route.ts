import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { mode, entries, instruction, avatar, refImageBase64, refMediaType } = await req.json();
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
      const av = (k: string) => {
        const v = avatar[k];
        if (!v) return null;
        if (Array.isArray(v)) return v.length ? v.join(', ') : null;
        return v || null;
      };
      const specs = [
        av('gender') && `성별: ${av('gender')}`,
        av('ethnicity') && `인종: ${av('ethnicity')}`,
        av('age') && `나이: ${av('age')}세`,
        av('face_shape') && `얼굴형: ${av('face_shape')}`,
        av('skin_tone') && `피부톤: ${av('skin_tone')}`,
        av('skin_detail') && `피부 특징: ${av('skin_detail')}`,
        av('eyes_shape') && `눈 모양: ${av('eyes_shape')}`,
        av('eyes_color') && `눈 색: ${av('eyes_color')}`,
        av('nose') && `코: ${av('nose')}`,
        av('lips') && `입술: ${av('lips')}`,
        av('hair_style') && `헤어스타일: ${av('hair_style')}`,
        av('hair_color') && `헤어컬러: ${av('hair_color')}`,
        av('expression') && `표정: ${av('expression')}`,
        av('shot') && `구도: ${av('shot')}`,
        av('pose') && `자세: ${av('pose')}`,
        av('background') && `배경: ${av('background')}`,
        av('lighting') && `조명: ${av('lighting')}`,
        av('style') && `스타일/무드: ${av('style')}`,
        av('extra') && `추가 요청: ${av('extra')}`,
      ].filter(Boolean).join('\n');

      userMsg = `아카이브 프롬프트 패턴을 참고해서, 아래 인물 스펙에 맞는 AI 이미지 생성 프롬프트를 작성해줘.\n\n[인물 스펙]\n${specs}`;
    } else {
      userMsg = `아카이브 프롬프트 패턴을 분석해서 고퀄리티 새 프롬프트를 작성해줘.${instruction ? `\n\n요청: ${instruction}` : ''}`;
    }

    const systemPrompt = `당신은 AI 이미지 생성(ComfyUI, Stable Diffusion) 전문 프롬프트 엔지니어입니다.
아래는 사용자의 프롬프트 아카이브입니다. 이 패턴과 스타일을 학습해서 새 프롬프트를 작성하세요.

[아카이브 패턴]
${archiveContext}

출력 형식 (반드시 이 형식으로):
**Prompt:**
(영어 프롬프트)

**Negative Prompt:**
(영어 네거티브 프롬프트)

아카이브의 퀄리티 키워드, 조명, 스타일 패턴을 유지하세요.`;

    let messageContent: Anthropic.MessageParam['content'];
    if (mode === 'ref_image' && refImageBase64) {
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: refMediaType || 'image/jpeg', data: refImageBase64 },
        },
        {
          type: 'text',
          text: `위 레퍼런스 사진을 분석해서, 이 인물과 최대한 비슷한 인물이 AI 이미지로 생성될 수 있도록 아카이브 프롬프트 노하우를 적용해 프롬프트를 작성해줘.${instruction ? `\n\n추가 요청: ${instruction}` : ''}\n\n인물의 외모 특징(얼굴형, 피부톤, 눈, 코, 입술, 헤어, 표정, 전체 분위기)을 세밀하게 묘사해서 반영해줘.`,
        },
      ];
    } else {
      messageContent = userMsg;
    }

    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
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
