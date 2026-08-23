import type { CategoryKey, RatioKey, ShotType, StyleKey } from './specs';

/** AI 视觉识别结果 */
export interface VisionResult {
  /** 主体在原图中的包围盒（0-1 归一化） */
  bbox: { x: number; y: number; w: number; h: number };
  /** 主体占画面比例 0-1 */
  coverage: number;
  /** 主色（十六进制），按占比降序 */
  colors: string[];
  /** 主色的中文名称 */
  colorNames: string[];
  /** 背景估计色 */
  background: string;
  /** 背景是否已经接近纯色 */
  cleanBackground: boolean;
  /** 平均亮度 0-255 */
  brightness: number;
  /** 推测的商品形态标签 */
  tags: string[];
  /** 原图尺寸 */
  source: { width: number; height: number; type: string };
  /** 抠图输出尺寸 */
  cutout: { width: number; height: number; edge: number };
  /** 识别耗时（毫秒） */
  elapsed: number;
}

export interface MarketingCopy {
  /** 商品标题（电商标题，含属性与人群） */
  title: string;
  /** 3 条卖点 */
  points: string[];
  /** 促销主标题 4-8 字 */
  promoTitle: string;
  /** 促销副标题 8-16 字 */
  promoSubtitle: string;
  /** 角标，如「限时 5 折」 */
  badge: string;
  /** 文案来源：本地引擎 or 大模型 */
  source: 'local' | 'llm';
}

export interface GenerationConfig {
  productName: string;
  category: CategoryKey;
  style: StyleKey;
  ratios: RatioKey[];
  shots: ShotType[];
  copy: MarketingCopy;
}

export interface AssetResult {
  id: string;
  shot: ShotType;
  ratio: RatioKey;
  width: number;
  height: number;
  /** object URL，用于页面预览 */
  url: string;
  blob: Blob;
  fileName: string;
  bytes: number;
  /** 生成引擎 */
  engine: 'local' | 'gemini' | 'openai';
  elapsed: number;
}

export type StepState = 'pending' | 'running' | 'done' | 'error';

export interface PipelineStep {
  key: string;
  index: string;
  name: string;
  hint: string;
  state: StepState;
  elapsed: number;
  detail?: string;
}
