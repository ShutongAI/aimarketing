import { NextResponse } from 'next/server';

import { buildImagePrompt, ratioHint } from '@/lib/prompts';
import { generateWithGemini, generateWithOpenAI, resolveProvider } from '@/lib/providers';
import type { CategoryKey, RatioKey, ShotType, StyleKey } from '@/lib/specs';
import type { MarketingCopy } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface GenerateBody {
  image: string;
  shot: ShotType;
  ratio: RatioKey;
  category: CategoryKey;
  style: StyleKey;
  productName: string;
  copy: MarketingCopy;
}

/** 前端启动时用它决定引擎标识与提示文案 */
export async function GET() {
  return NextResponse.json(resolveProvider());
}

/**
 * 生图入口。配置了模型 Key 时走真实模型，否则返回 engine: 'local'，
 * 由前端的本地合成引擎接手，保证零配置也能跑通全流程。
 */
export async function POST(request: Request) {
  const status = resolveProvider();
  if (status.provider === 'local' || !status.ready) {
    return NextResponse.json({ engine: 'local', reason: status.reason ?? '未配置生图模型' });
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  if (!body?.image?.startsWith('data:')) {
    return NextResponse.json({ error: '缺少商品图片' }, { status: 400 });
  }

  const prompt = `${buildImagePrompt({
    shot: body.shot,
    ratio: body.ratio,
    category: body.category,
    style: body.style,
    productName: body.productName,
    copy: body.copy,
  })}\n构图补充：${ratioHint(body.ratio)}`;

  try {
    const image =
      status.provider === 'gemini'
        ? await generateWithGemini(body.image, prompt)
        : await generateWithOpenAI(body.image, prompt, body.ratio);
    return NextResponse.json({ engine: status.provider, image, model: status.model });
  } catch (error) {
    // 模型失败不阻断生产，交给本地引擎兜底
    return NextResponse.json({
      engine: 'local',
      reason: error instanceof Error ? error.message : '生图模型调用失败',
    });
  }
}
