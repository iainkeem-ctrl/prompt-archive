import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { entries, instruction } = await req.json();

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'no entries' }, { status: 400 });
    }

    const refs = entries.map((e: { prompt: string; negative_prompt?: string; model?: string; comfy_settings?: string }, i: number) => {
      let text = `[레퍼런스 ${i + 1}]\nPrompt: ${e.prompt}`;
      if (e.negative_prompt) text += `\nNegative: ${e.negative_prompt}`;
      if (e.model) text += `\nModel: ${e.model}`;
      if (e.comfy_settings) text += `\nSettings: ${e.comfy_settings}`;
      return text;
    }).join('\n\n');

    const userMsg = instruction
      ? `다음 레퍼런스들을 참고해서 아래 요청에 맞는 새 프롬프트를 작성해줘:\n\n${refs}\n\n요청: ${instruction}`
      : `다음 레퍼런스들의 스타일과 패턴을 분석해서 같은 퀄리티의 새로운 프롬프트를 작성해줘:\n\n${refs}`;

    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: userMsg,
      }],
      system: `당신은 AI 이미지 생성 전문가입니다. 레퍼런스 프롬프트들을 분석해서 같은 스타일과 퀄리티의 새 프롬프트를 생성합니다.
출력 형식:
**Prompt:**
(영어로 작성된 프롬프트)

**Negative Prompt:**
(영어로 작성된 네거티브 프롬프트)

레퍼런스의 구도, 조명, 스타일, 퀄리티 키워드 패턴을 유지하되 새로운 내용을 생성하세요.`,
    });

    const content = msg.content[0];
    const text = content.type === 'text' ? content.text : '';

    const promptMatch = text.match(/\*\*Prompt:\*\*\s*([\s\S]*?)(?=\*\*Negative|\*\*Notes|$)/);
    const negMatch = text.match(/\*\*Negative Prompt:\*\*\s*([\s\S]*?)(?=\*\*Notes|$)/);

    return NextResponse.json({
      prompt: promptMatch?.[1]?.trim() ?? text,
      negative_prompt: negMatch?.[1]?.trim() ?? '',
      raw: text,
    });
  } catch (e) {
    console.error('generate-prompt error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
