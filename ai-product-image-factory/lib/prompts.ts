import { CATEGORY_MAP, RATIO_MAP, SHOT_MAP, STYLE_MAP } from './specs';
import type { CategoryKey, RatioKey, ShotType, StyleKey } from './specs';
import type { MarketingCopy } from './types';

export interface PromptInput {
  shot: ShotType;
  ratio: RatioKey;
  category: CategoryKey;
  style: StyleKey;
  productName: string;
  copy: MarketingCopy;
}

/**
 * 生成交给图像模型的提示词。三类图共用「保持商品主体不变」的约束，
 * 差异在背景、光影与是否叠字。
 */
export function buildImagePrompt(input: PromptInput): string {
  const cat = CATEGORY_MAP[input.category];
  const style = STYLE_MAP[input.style];
  const ratio = RATIO_MAP[input.ratio];
  const shot = SHOT_MAP[input.shot];

  const base = [
    `任务：以上传的商品照片为唯一素材，产出一张「${shot.name}」。`,
    `商品：${input.productName}（${cat.name}）。`,
    `画幅：${input.ratio}，输出 ${ratio.width}×${ratio.height} 像素，主体完整不裁切、不出血。`,
    '硬性约束：商品的外形、颜色、材质、包装文字与标识必须与原图完全一致，不得改写、翻译或重新设计包装上的任何文字；不得增删商品部件。',
  ];

  if (input.shot === 'white') {
    base.push(
      '背景：纯白 #FFFFFF，无渐变、无杂色、无道具。',
      '布光：均匀柔光，商品下方保留一道轻微的接地投影，保持立体感但不压暗白底。',
      '构图：商品居中，四周留白约 10%-14%，符合电商平台主图审核规范。',
      '不要出现任何文字、水印、logo 贴纸或装饰元素。',
    );
  } else if (input.shot === 'scene') {
    base.push(
      `场景：${cat.scene}。`,
      `风格：${style.prompt}。`,
      '布光：环境光与商品光影方向一致，接触面有真实投影与轻微反射，商品与场景色温统一。',
      '构图：商品为绝对视觉中心，占画面 55%-70%，道具只做陪衬且不遮挡商品。',
      '不要叠加任何文案、价格、角标或边框。',
    );
  } else {
    base.push(
      `场景：${cat.scene}，${style.prompt}。`,
      '在场景图基础上叠加中文营销排版，排版必须与商品主体错开，不遮挡商品与包装文字：',
      `· 主标题：「${input.copy.promoTitle}」，最大字号，字重最重；`,
      `· 副标题：「${input.copy.promoSubtitle}」，字号约为主标题的 40%；`,
      `· 卖点（分三行，行首用同一个小圆点符号）：${input.copy.points.map((p) => `「${p}」`).join('、')}；`,
      `· 角标：「${input.copy.badge}」，放在画面一角，使用强调色 ${style.palette.accent}。`,
      '文字必须是规范简体中文，字形完整、无错字、无变形，行距均匀，与背景有足够对比度。',
    );
  }

  return base.join('\n');
}

/** 不同比例给到模型的构图补充说明 */
export function ratioHint(ratio: RatioKey): string {
  switch (ratio) {
    case '1:1':
      return '正方形构图，商品居中，四边留白均衡。';
    case '3:4':
      return '竖构图，商品位于画面中上部，下方留出文案空间。';
    case '4:3':
      return '横构图，商品略偏画面中央偏右，左侧留出文案空间。';
    case '16:9':
      return '宽幅横构图，商品位于右侧三分之一，左侧大面积留白承载文案。';
    default:
      return '';
  }
}
