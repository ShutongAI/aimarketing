import 'server-only';

import { RATIO_MAP, type RatioKey } from './specs';

export type ProviderKey = 'local' | 'gemini' | 'openai';

export interface ProviderStatus {
  provider: ProviderKey;
  /** 是否具备调用真实生图模型的条件 */
  ready: boolean;
  model?: string;
  reason?: string;
}

export function resolveProvider(): ProviderStatus {
  const raw = (process.env.IMAGE_PROVIDER || 'local').toLowerCase();
  if (raw === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    if (!key) return { provider: 'gemini', ready: false, model, reason: '缺少 GEMINI_API_KEY，已回退本地合成引擎' };
    return { provider: 'gemini', ready: true, model };
  }
  if (raw === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    if (!key) return { provider: 'openai', ready: false, model, reason: '缺少 OPENAI_API_KEY，已回退本地合成引擎' };
    return { provider: 'openai', ready: true, model };
  }
  return { provider: 'local', ready: true, reason: '使用内置本地合成引擎' };
}

function splitDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('图片数据格式不正确');
  return { mime: match[1], base64: match[2] };
}

/** OpenAI 的 gpt-image-1 只支持三种画幅，先取最接近的，再由前端裁到精确规格 */
function openaiSize(ratio: RatioKey) {
  const spec = RATIO_MAP[ratio];
  if (spec.width === spec.height) return '1024x1024';
  return spec.width > spec.height ? '1536x1024' : '1024x1536';
}

export async function generateWithGemini(dataUrl: string, prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const { mime, base64 } = splitDataUrl(dataUrl);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini 生图失败：${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData) throw new Error('Gemini 未返回图片内容');
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

export async function generateWithOpenAI(dataUrl: string, prompt: string, ratio: RatioKey): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const { mime, base64 } = splitDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', openaiSize(ratio));
  form.append('image', new Blob([new Uint8Array(bytes)], { type: mime }), 'product.png');

  const res = await fetch(`${baseUrl}/images/edits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI 生图失败：${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) {
    const img = await fetch(item.url);
    const buf = Buffer.from(await img.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  throw new Error('OpenAI 未返回图片内容');
}
