import { NextResponse } from 'next/server';

import { buildLocalCopy, copyPrompt, normalizeCopy, type CopyInput } from '@/lib/copy';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 从模型回复里挖出 JSON，容忍 ```json 包裹 */
function extractJson(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 生成商品标题与 3 条卖点：配置了 ANTHROPIC_API_KEY 时用大模型，否则用内置文案引擎 */
export async function POST(request: Request) {
  let input: CopyInput;
  try {
    input = (await request.json()) as CopyInput;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const fallback = buildLocalCopy(input);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json(fallback);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: copyPrompt(input) }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = json.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? '';
    const parsed = extractJson(text);
    return NextResponse.json(normalizeCopy(parsed, fallback));
  } catch {
    return NextResponse.json(fallback);
  }
}
