'use client';

import { CATEGORY_MAP, RATIO_MAP, STYLE_MAP } from './specs';
import type { CategoryKey, Palette, RatioKey, ShotType, StyleKey } from './specs';
import type { MarketingCopy } from './types';
import { createCanvas } from './vision';

const FONT =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC","Heiti SC",sans-serif';

export interface RenderInput {
  cutout: HTMLCanvasElement;
  shot: ShotType;
  ratio: RatioKey;
  style: StyleKey;
  category: CategoryKey;
  productName: string;
  copy: MarketingCopy;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 固定种子的随机数，保证同一商品每次生成的场景一致 */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ctxOf(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
  return ctx;
}

/** 同时接受 #rgb / #rrggbb / rgb() / rgba() 三种写法，统一改写透明度 */
function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#')) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const nums = color.match(/-?\d*\.?\d+/g);
  if (nums && nums.length >= 3) {
    const [r, g, b] = nums;
    const base = nums.length >= 4 ? Number(nums[3]) : 1;
    return `rgba(${r},${g},${b},${alpha * base})`;
  }
  return color;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ────────────────────────── 文字排版 ────────────────────────── */

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** 中英混排换行：中文逐字断行，英文按单词断行 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  const tokens = text.match(/[A-Za-z0-9@._%+-]+|[^A-Za-z0-9]/g) ?? [];
  for (const token of tokens) {
    const next = line + token;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = token.trim() === '' ? '' : token;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 逐级缩小字号，直到文本在给定宽高内排得下 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  start: number,
  weight: number,
  lineHeight = 1.28,
) {
  let size = start;
  while (size > 10) {
    setFont(ctx, size, weight);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * lineHeight <= maxHeight) return { size, lines };
    size -= Math.max(1, Math.round(size * 0.06));
  }
  setFont(ctx, size, weight);
  return { size, lines: wrapText(ctx, text, maxWidth) };
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight = 1.28,
) {
  let cursor = y;
  for (const line of lines) {
    ctx.fillText(line, x, cursor);
    cursor += size * lineHeight;
  }
  return cursor;
}

/* ────────────────────────── 场景元素 ────────────────────────── */

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.45, -size * 0.35, size * 0.95, -size * 0.12, size, 0);
  ctx.bezierCurveTo(size * 0.95, size * 0.12, size * 0.45, size * 0.35, 0, 0);
  ctx.fill();
  ctx.strokeStyle = withAlpha('#000000', 0.06);
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.beginPath();
  ctx.moveTo(size * 0.04, 0);
  ctx.lineTo(size * 0.92, 0);
  ctx.stroke();
  ctx.restore();
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y + h);
  g.addColorStop(0, withAlpha('#ffffff', 0.35));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRipple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  for (let i = 0; i < 3; i += 1) {
    ctx.lineWidth = Math.max(1, r * 0.018);
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.4 + i * 0.3), r * (0.12 + i * 0.09), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawFabric(ctx: CanvasRenderingContext2D, w: number, h: number, y: number, color: string, alpha: number, rand: () => number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, y);
  for (let x = 0; x <= w; x += w / 6) {
    ctx.quadraticCurveTo(x + w / 12, y + (rand() - 0.5) * h * 0.09, x + w / 6, y + (rand() - 0.5) * h * 0.05);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, w * 0.0012);
  for (let i = 0; i <= 14; i += 1) {
    const x = (w / 14) * i;
    ctx.beginPath();
    ctx.moveTo(x, horizon);
    ctx.lineTo(w / 2 + (x - w / 2) * 2.6, h);
    ctx.stroke();
  }
  for (let i = 1; i <= 7; i += 1) {
    const t = i / 7;
    const y = horizon + (h - horizon) * t * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpecks(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, rand: () => number, maxR: number) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = 0.25 + rand() * 0.45;
    const r = maxR * (0.35 + rand() * 0.65);
    ctx.beginPath();
    ctx.ellipse(rand() * w, h * (0.6 + rand() * 0.38), r, r * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBubbles(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, rand: () => number) {
  ctx.save();
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i += 1) {
    const r = w * (0.012 + rand() * 0.05);
    ctx.globalAlpha = 0.12 + rand() * 0.2;
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h * 0.85, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

let grainPattern: CanvasPattern | null = null;
function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  if (!grainPattern) {
    const tile = createCanvas(96, 96);
    const tctx = ctxOf(tile);
    const img = tctx.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 90;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(tile, 'repeat');
  }
  if (!grainPattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ────────────────────────── 商品摆放 ────────────────────────── */

function fitInto(cutout: HTMLCanvasElement, box: Box) {
  const scale = Math.min(box.w / cutout.width, box.h / cutout.height);
  const w = cutout.width * scale;
  const h = cutout.height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  strength: number,
) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h * 0.995;
  const rx = rect.w * 0.46;
  const ry = Math.max(6, rect.h * 0.045);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, `rgba(0,0,0,${Math.min(0.75, strength)})`);
  g.addColorStop(0.55, `rgba(0,0,0,${Math.min(0.4, strength * 0.5)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = g;
  ctx.translate(-cx, -cy);
  ctx.beginPath();
  ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReflection(
  ctx: CanvasRenderingContext2D,
  cutout: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  strength: number,
) {
  const rh = rect.h * 0.28;
  const mirror = createCanvas(rect.w, rh);
  const mctx = ctxOf(mirror);
  mctx.save();
  mctx.scale(1, -1);
  mctx.drawImage(cutout, 0, -rect.h, rect.w, rect.h);
  mctx.restore();
  const grad = mctx.createLinearGradient(0, 0, 0, rh);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  mctx.globalCompositeOperation = 'destination-in';
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, rect.w, rh);
  ctx.drawImage(mirror, rect.x, rect.y + rect.h);
}

function placeProduct(
  ctx: CanvasRenderingContext2D,
  cutout: HTMLCanvasElement,
  box: Box,
  opts: { shadow: number; reflection: number },
) {
  const rect = fitInto(cutout, box);
  drawContactShadow(ctx, rect, opts.shadow);
  if (opts.reflection > 0) drawReflection(ctx, cutout, rect, opts.reflection);
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${Math.min(0.5, opts.shadow * 0.7)})`;
  ctx.shadowBlur = rect.w * 0.06;
  ctx.shadowOffsetY = rect.h * 0.015;
  ctx.drawImage(cutout, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return rect;
}

/* ────────────────────────── 布局 ────────────────────────── */

/** 场景图里商品的位置：不同比例给不同构图 */
function sceneProductBox(ratio: RatioKey, w: number, h: number): Box {
  switch (ratio) {
    case '3:4':
      return { x: w * 0.12, y: h * 0.09, w: w * 0.76, h: h * 0.6 };
    case '4:3':
      return { x: w * 0.26, y: h * 0.09, w: w * 0.62, h: h * 0.62 };
    case '16:9':
      return { x: w * 0.42, y: h * 0.08, w: w * 0.5, h: h * 0.64 };
    case '1:1':
    default:
      return { x: w * 0.16, y: h * 0.09, w: w * 0.68, h: h * 0.63 };
  }
}

/** 促销图的文字区与商品区 */
function promoLayout(ratio: RatioKey, w: number, h: number): { text: Box; product: Box; vertical: boolean } {
  switch (ratio) {
    case '3:4':
      return {
        product: { x: w * 0.12, y: h * 0.05, w: w * 0.76, h: h * 0.45 },
        text: { x: w * 0.09, y: h * 0.58, w: w * 0.82, h: h * 0.36 },
        vertical: true,
      };
    case '4:3':
      return {
        product: { x: w * 0.5, y: h * 0.07, w: w * 0.44, h: h * 0.66 },
        text: { x: w * 0.07, y: h * 0.14, w: w * 0.4, h: h * 0.72 },
        vertical: false,
      };
    case '16:9':
      return {
        product: { x: w * 0.56, y: h * 0.07, w: w * 0.38, h: h * 0.68 },
        text: { x: w * 0.06, y: h * 0.15, w: w * 0.45, h: h * 0.7 },
        vertical: false,
      };
    case '1:1':
    default:
      return {
        product: { x: w * 0.46, y: h * 0.08, w: w * 0.48, h: h * 0.7 },
        text: { x: w * 0.07, y: h * 0.14, w: w * 0.37, h: h * 0.72 },
        vertical: false,
      };
  }
}

/* ────────────────────────── 三类图 ────────────────────────── */

function renderSceneBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: Palette,
  props: CategoryKey extends never ? never : string[],
  seed: number,
) {
  const rand = rng(seed);
  const bg = ctx.createLinearGradient(0, 0, w * 0.2, h);
  bg.addColorStop(0, palette.bg[0]);
  bg.addColorStop(1, palette.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 主光源
  drawGlow(ctx, w * 0.24, h * 0.14, Math.max(w, h) * 0.62, palette.light, 0.55);
  drawGlow(ctx, w * 0.86, h * 0.82, Math.max(w, h) * 0.4, palette.accent2, 0.18);

  // 台面
  const horizon = h * 0.68;
  const surface = ctx.createLinearGradient(0, horizon, 0, h);
  surface.addColorStop(0, withAlpha(palette.surface, 0.95));
  surface.addColorStop(1, withAlpha(palette.surface, 0.6));
  ctx.fillStyle = surface;
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = withAlpha('#ffffff', 0.12);
  ctx.fillRect(0, horizon, w, Math.max(2, h * 0.004));

  if (props.includes('grid')) drawGrid(ctx, w, h, horizon, palette.accent, 0.18);
  if (props.includes('fabric')) drawFabric(ctx, w, h, horizon * 0.98, withAlpha(palette.surface, 0.9), 0.85, rand);
  if (props.includes('stone')) {
    drawStone(ctx, w * 0.12, horizon + h * 0.06, w * 0.3, h * 0.09, withAlpha(palette.surface, 0.9), 0.7);
    drawStone(ctx, w * 0.9, horizon + h * 0.11, w * 0.26, h * 0.08, withAlpha(palette.surface, 0.8), 0.55);
  }
  if (props.includes('leaf')) {
    drawLeaf(ctx, w * 0.06, h * 0.2, w * 0.22, 0.5, withAlpha(palette.accent, 0.85), 0.5);
    drawLeaf(ctx, w * 0.95, h * 0.34, w * 0.24, Math.PI * 0.85, withAlpha(palette.accent2, 0.9), 0.45);
    drawLeaf(ctx, w * 0.82, h * 0.08, w * 0.18, Math.PI * 0.62, withAlpha(palette.accent, 0.7), 0.32);
  }
  if (props.includes('water')) {
    drawRipple(ctx, w * 0.3, horizon + h * 0.14, w * 0.28, withAlpha('#ffffff', 0.9), 0.35);
    drawRipple(ctx, w * 0.78, horizon + h * 0.2, w * 0.22, withAlpha('#ffffff', 0.9), 0.25);
  }
  if (props.includes('crumb')) drawSpecks(ctx, w, h, 60, withAlpha(palette.accent, 0.8), rand, w * 0.008);
  if (props.includes('bubble')) drawBubbles(ctx, w, h, 18, withAlpha('#ffffff', 0.9), rand);
  if (props.includes('glow')) drawGlow(ctx, w * 0.7, h * 0.2, Math.max(w, h) * 0.3, palette.light, 0.3);

  return horizon;
}

function renderWhite(input: RenderInput, w: number, h: number) {
  const canvas = createCanvas(w, h);
  const ctx = ctxOf(canvas);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#fdfdfd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 平台主图规范：商品居中、四周约 12% 留白，只保留接地投影不做倒影
  const inset = Math.min(w, h) * 0.12;
  const box: Box = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
  placeProduct(ctx, input.cutout, box, { shadow: 0.24, reflection: 0 });
  return canvas;
}

function renderScene(input: RenderInput, w: number, h: number, boxOverride?: Box) {
  const palette = STYLE_MAP[input.style].palette;
  const cat = CATEGORY_MAP[input.category];
  const canvas = createCanvas(w, h);
  const ctx = ctxOf(canvas);
  const seed = hashString(`${input.productName}|${input.style}|${input.category}|${input.ratio}`);

  renderSceneBackground(ctx, w, h, palette, cat.props as unknown as string[], seed);
  placeProduct(ctx, input.cutout, boxOverride ?? sceneProductBox(input.ratio, w, h), {
    shadow: palette.shadow,
    reflection: palette.shadow * 0.55,
  });

  applyVignette(ctx, w, h, Math.min(0.35, palette.shadow * 0.5));
  applyGrain(ctx, w, h, 0.05);
  return canvas;
}

function renderPromo(input: RenderInput, w: number, h: number) {
  const palette = STYLE_MAP[input.style].palette;
  const layout = promoLayout(input.ratio, w, h);
  const canvas = renderScene(input, w, h, layout.product);
  const ctx = ctxOf(canvas);
  const { copy } = input;
  const unit = Math.min(w, h);

  // 文案区遮罩，保证文字可读
  const t = layout.text;
  const scrimPad = unit * 0.06;
  const grad = layout.vertical
    ? ctx.createLinearGradient(0, t.y - scrimPad * 1.6, 0, h)
    : ctx.createLinearGradient(0, 0, t.x + t.w + scrimPad * 2, 0);
  if (layout.vertical) {
    grad.addColorStop(0, withAlpha(palette.scrim, 0));
    grad.addColorStop(0.35, palette.scrim);
    grad.addColorStop(1, palette.scrim);
  } else {
    grad.addColorStop(0, palette.scrim);
    grad.addColorStop(0.62, palette.scrim);
    grad.addColorStop(1, withAlpha(palette.scrim, 0));
  }
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  if (layout.vertical) ctx.fillRect(0, t.y - scrimPad * 1.8, w, h - (t.y - scrimPad * 1.8));
  else ctx.fillRect(0, 0, t.x + t.w + scrimPad * 2, h);
  ctx.restore();

  ctx.textBaseline = 'top';
  let cursor = t.y;

  // 角标
  const badgeSize = unit * 0.032;
  setFont(ctx, badgeSize, 700);
  const badgeW = ctx.measureText(copy.badge).width + badgeSize * 1.5;
  const badgeH = badgeSize * 2;
  ctx.fillStyle = palette.accent;
  roundRect(ctx, t.x, cursor, badgeW, badgeH, badgeH * 0.28);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(copy.badge, t.x + badgeSize * 0.75, cursor + badgeSize * 0.5);
  cursor += badgeH + unit * 0.035;

  // 主标题
  const titleMaxH = t.h * 0.34;
  const title = fitFontSize(ctx, copy.promoTitle, t.w, titleMaxH, unit * 0.155, 900, 1.12);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = unit * 0.02;
  cursor = drawLines(ctx, title.lines, t.x, cursor, title.size, 1.12);
  ctx.shadowBlur = 0;

  // 强调下划线
  ctx.fillStyle = palette.accent;
  roundRect(ctx, t.x, cursor + unit * 0.012, Math.min(t.w * 0.42, unit * 0.22), unit * 0.011, unit * 0.006);
  ctx.fill();
  cursor += unit * 0.05;

  // 副标题
  const sub = fitFontSize(ctx, copy.promoSubtitle, t.w, t.h * 0.16, unit * 0.045, 500, 1.35);
  ctx.fillStyle = withAlpha('#ffffff', 0.9);
  cursor = drawLines(ctx, sub.lines, t.x, cursor, sub.size, 1.35) + unit * 0.035;

  // 三条卖点
  const pointSize = Math.max(unit * 0.026, Math.min(unit * 0.036, (t.h * 0.34) / 6));
  for (const point of copy.points.slice(0, 3)) {
    setFont(ctx, pointSize, 500);
    const marker = pointSize * 0.34;
    ctx.fillStyle = palette.accent2;
    ctx.beginPath();
    ctx.arc(t.x + marker, cursor + pointSize * 0.55, marker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.94);
    const lines = wrapText(ctx, point, t.w - marker * 3.4).slice(0, 2);
    cursor = drawLines(ctx, lines, t.x + marker * 3.2, cursor, pointSize, 1.32) + pointSize * 0.42;
  }

  // 底部品名
  const footSize = unit * 0.026;
  setFont(ctx, footSize, 500);
  ctx.fillStyle = withAlpha('#ffffff', 0.72);
  const maxFootY = h - footSize * 1.8;
  const footY = Math.min(
    maxFootY,
    Math.max(cursor + footSize * 0.4, layout.vertical ? h - footSize * 2.6 : t.y + t.h - footSize * 1.4),
  );
  if (footY > cursor - footSize) {
    ctx.fillText(wrapText(ctx, input.productName, t.w)[0] ?? input.productName, t.x, footY);
  }

  return canvas;
}

/** 本地合成引擎：不依赖任何外部模型即可产出三类规格图 */
export function renderAsset(input: RenderInput): HTMLCanvasElement {
  const spec = RATIO_MAP[input.ratio];
  const { width: w, height: h } = spec;
  if (input.shot === 'white') return renderWhite(input, w, h);
  if (input.shot === 'scene') return renderScene(input, w, h);
  return renderPromo(input, w, h);
}

/** 模型返回的图片尺寸未必等于目标规格，这里统一裁切到精确像素 */
export function fitToSpec(source: CanvasImageSource, sw: number, sh: number, ratio: RatioKey) {
  const spec = RATIO_MAP[ratio];
  const canvas = createCanvas(spec.width, spec.height);
  const ctx = ctxOf(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, spec.width, spec.height);
  const scale = Math.max(spec.width / sw, spec.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (spec.width - dw) / 2, (spec.height - dh) / 2, dw, dh);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: 'png' | 'jpeg', quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality,
    );
  });
}
