import { CATEGORY_MAP, STYLE_MAP, type CategoryKey, type StyleKey } from './specs';
import type { MarketingCopy } from './types';

export interface CopyInput {
  productName: string;
  category: CategoryKey;
  style: StyleKey;
  /** 视觉识别得到的主色名称，用于文案里的材质/色彩描述 */
  colorNames?: string[];
}

const STYLE_TONE: Record<StyleKey, { title: string; sub: string; badge: string; point: string }> = {
  fresh: { title: '清透上新', sub: '自然配方 · 日常也能安心用', badge: '新品尝鲜', point: '清爽自然' },
  premium: { title: '质感臻选', sub: '克制用料 · 一次到位的高级感', badge: '臻享礼遇', point: '质感在线' },
  bright: { title: '焕新上市', sub: '干净利落 · 看得见的真实细节', badge: '限时上新', point: '干净利落' },
  warm: { title: '暖意生活', sub: '把好状态带回家的日常好物', badge: '暖冬特惠', point: '温柔耐用' },
  pop: { title: '潮流开箱', sub: '一眼心动 · 撞色也能很日常', badge: '爆款直降', point: '抢眼吸睛' },
  minimal: { title: '简单好用', sub: '去掉多余 · 留下真正需要的', badge: '会员专享', point: '极简好用' },
  oriental: { title: '东方本味', sub: '古法配比 · 熟悉的踏实味道', badge: '国潮首发', point: '东方审美' },
  tech: { title: '性能进阶', sub: '硬件拉满 · 日常也能长续航', badge: '首发尝鲜', point: '性能强悍' },
};

/** 取商品名里的品牌前缀（第一个空格前的英文/短词），用于标题拼装 */
function splitName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  const parts = clean.split(' ');
  if (parts.length > 1 && parts[0].length <= 8) {
    return { brand: parts[0], core: parts.slice(1).join(' ') };
  }
  return { brand: '', core: clean };
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** 用商品名做一个稳定的哈希，保证同样输入产出同样文案 */
function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/** 内置文案引擎：无需任何 API Key，按类目 + 风格拼装标题与卖点 */
export function buildLocalCopy(input: CopyInput): MarketingCopy {
  const name = input.productName.trim() || '未命名商品';
  const cat = CATEGORY_MAP[input.category];
  const style = STYLE_MAP[input.style];
  const tone = STYLE_TONE[input.style];
  const seed = hash(`${name}|${cat.key}|${style.key}`);
  const { brand, core } = splitName(name);

  const attr = pick(cat.attrs, seed);
  const audience = pick(cat.audience, seed >> 3);
  const colorWord = input.colorNames?.[0];

  const titleParts = [brand, core, attr, audience].filter(Boolean);
  let title = titleParts.join(' ');
  if (title.length > 30) title = title.slice(0, 30);

  const points = [...cat.points];
  points[0] = `${tone.point}｜${points[0]}`;
  if (colorWord) {
    points[2] = `${points[2]}，${colorWord}外观耐看不挑场景`;
  }

  // 品名够短就直接当促销主标题，否则用风格化短语，避免把名字截断成半个词
  const hasCJK = /[\u4e00-\u9fa5]/.test(core);
  const promoTitle = core && (hasCJK ? core.length <= 8 : core.length <= 6) ? core : tone.title;

  return {
    title,
    points: points.slice(0, 3),
    promoTitle,
    promoSubtitle: tone.sub,
    badge: tone.badge,
    source: 'local',
  };
}

/** 让大模型返回的文案落到统一的数据结构上，字段缺失时用本地引擎补齐 */
export function normalizeCopy(raw: unknown, fallback: MarketingCopy): MarketingCopy {
  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as Record<string, unknown>;
  const points = Array.isArray(data.points)
    ? data.points.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 3)
    : [];
  while (points.length < 3) points.push(fallback.points[points.length]);
  const str = (v: unknown, fb: string, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fb;
  return {
    title: str(data.title, fallback.title, 30),
    points: points.map((p) => p.slice(0, 40)),
    promoTitle: str(data.promoTitle, fallback.promoTitle, 8),
    promoSubtitle: str(data.promoSubtitle, fallback.promoSubtitle, 20),
    badge: str(data.badge, fallback.badge, 10),
    source: 'llm',
  };
}

/** 交给大模型的提示词 */
export function copyPrompt(input: CopyInput) {
  const cat = CATEGORY_MAP[input.category];
  const style = STYLE_MAP[input.style];
  return `你是资深电商营销文案。为下面这件商品写一套投放文案。

商品名称：${input.productName}
商品类目：${cat.name}
视觉风格：${style.name}（${style.prompt}）
识别到的主色：${input.colorNames?.join('、') || '未识别'}

要求：
1. title：电商商品标题，20-30 个字，包含「品牌 + 品名 + 核心属性 + 适用人群/场景」，不要堆砌符号。
2. points：正好 3 条卖点，每条 12-24 个字，一条讲功效/性能，一条讲体验/材质，一条讲信任背书或使用场景。
3. promoTitle：促销主标题，4-8 个字，要有冲击力。
4. promoSubtitle：促销副标题，8-16 个字，补充主标题。
5. badge：促销角标，4-6 个字，例如「限时 5 折」。
6. 不要出现「最」「第一」「国家级」等违反广告法的绝对化用语，不要编造具体数字认证。

只输出 JSON，不要任何解释：
{"title":"","points":["","",""],"promoTitle":"","promoSubtitle":"","badge":""}`;
}
