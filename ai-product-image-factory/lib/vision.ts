'use client';

import type { VisionResult } from './types';

/** 分析用的工作分辨率，太大没必要、太小会丢边缘 */
const WORK_MAX = 720;
/** 抠图输出的长边上限 */
const CUTOUT_MAX = 1600;

export interface AnalyzeOutput {
  vision: VisionResult;
  /** 已去背、裁到主体的高分辨率画布（带 alpha） */
  cutout: HTMLCanvasElement;
  /** 原图画布，供「复杂背景」兜底时使用 */
  source: HTMLCanvasElement;
}

export function createCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = url;
    });
    return (await createImageBitmap(img)) as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ctxOf(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
  return ctx;
}

function dist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 取四边像素的中位数作为背景色估计，同时返回边缘像素的离散程度 */
function estimateBackground(data: Uint8ClampedArray, w: number, h: number) {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (let x = 0; x < w; x += 2) {
    for (let d = 0; d < band; d += 1) {
      push(x, d);
      push(x, h - 1 - d);
    }
  }
  for (let y = 0; y < h; y += 2) {
    for (let d = 0; d < band; d += 1) {
      push(d, y);
      push(w - 1 - d, y);
    }
  }
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const bg = [median(rs), median(gs), median(bs)] as [number, number, number];
  let spread = 0;
  for (let i = 0; i < rs.length; i += 1) {
    spread += dist(rs[i], gs[i], bs[i], bg[0], bg[1], bg[2]);
  }
  spread /= rs.length || 1;
  return { bg, spread };
}

/** 从四边向内洪水填充，连通的近背景色像素标记为背景 */
function floodBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: [number, number, number],
  tolerance: number,
) {
  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const near = (idx: number) => {
    const i = idx * 4;
    return dist(data[i], data[i + 1], data[i + 2], bg[0], bg[1], bg[2]) < tolerance;
  };
  const seed = (idx: number) => {
    if (!isBg[idx] && near(idx)) {
      isBg[idx] = 1;
      queue[tail++] = idx;
    }
  };
  for (let x = 0; x < w; x += 1) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) seed(idx - 1);
    if (x < w - 1) seed(idx + 1);
    if (y > 0) seed(idx - w);
    if (y < h - 1) seed(idx + w);
  }
  return isBg;
}

/** 对 0/255 的 alpha 做多次盒模糊，得到羽化边缘 */
function featherAlpha(alpha: Float32Array, w: number, h: number, radius: number, passes = 2) {
  let src: Float32Array = alpha;
  let dst: Float32Array = new Float32Array(alpha.length);
  for (let p = 0; p < passes; p += 1) {
    // 横向
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      const row = y * w;
      for (let x = -radius; x <= radius; x += 1) sum += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        dst[row + x] = sum / (radius * 2 + 1);
        const out = row + Math.min(w - 1, Math.max(0, x - radius));
        const inn = row + Math.min(w - 1, Math.max(0, x + radius + 1));
        sum += src[inn] - src[out];
      }
    }
    const t = src;
    src = dst;
    dst = t;
    // 纵向
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        dst[y * w + x] = sum / (radius * 2 + 1);
        const out = Math.min(h - 1, Math.max(0, y - radius)) * w + x;
        const inn = Math.min(h - 1, Math.max(0, y + radius + 1)) * w + x;
        sum += src[inn] - src[out];
      }
    }
    const t2 = src;
    src = dst;
    dst = t2;
  }
  return src;
}

const HUE_NAMES: Array<[number, string]> = [
  [12, '红色'],
  [26, '橙色'],
  [45, '琥珀色'],
  [65, '黄色'],
  [95, '黄绿色'],
  [150, '绿色'],
  [186, '青色'],
  [215, '天蓝色'],
  [255, '蓝色'],
  [285, '紫色'],
  [320, '品红'],
  [345, '粉色'],
  [361, '红色'],
];

function rgbToHsl(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return { h, s, l };
}

export function colorName(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.12) return '黑色';
  if (l > 0.92 && s < 0.12) return '白色';
  if (s < 0.1) return l > 0.62 ? '浅灰' : l > 0.35 ? '灰色' : '深灰';
  if (s < 0.26 && l > 0.6) return '米白色';
  if (h >= 15 && h <= 45 && s < 0.55 && l < 0.5) return '棕色';
  if (h >= 15 && h <= 50 && s < 0.5 && l >= 0.5) return '米色';
  const name = HUE_NAMES.find(([max]) => h < max)?.[1] ?? '中性色';
  if (l < 0.3) return `深${name}`;
  if (l > 0.78) return `浅${name}`;
  return name;
}

function toHex(r: number, g: number, b: number) {
  const s = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${s(r)}${s(g)}${s(b)}`;
}

/** 极简 k-means，抽样统计主体主色 */
function dominantColors(samples: number[][], k = 4, iterations = 8) {
  if (samples.length === 0) return [];
  const centers = Array.from({ length: k }, (_, i) => samples[Math.floor((i * samples.length) / k)].slice());
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < samples.length; i += 1) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = dist(samples[i][0], samples[i][1], samples[i][2], centers[c][0], centers[c][1], centers[c][2]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i += 1) {
      const c = assign[i];
      sums[c][0] += samples[i][0];
      sums[c][1] += samples[i][1];
      sums[c][2] += samples[i][2];
      sums[c][3] += 1;
    }
    for (let c = 0; c < centers.length; c += 1) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < samples.length; i += 1) counts[assign[i]] += 1;
  return centers
    .map((c, i) => ({ hex: toHex(c[0], c[1], c[2]), count: counts[i] }))
    .filter((c) => c.count > samples.length * 0.05)
    .sort((a, b) => b.count - a.count)
    .map((c) => c.hex);
}

function shapeTag(aspect: number) {
  if (aspect > 1.55) return '竖长瓶身 / 立式包装';
  if (aspect > 1.15) return '竖版主体';
  if (aspect < 0.65) return '横向盒体 / 平铺主体';
  return '方正主体';
}

/**
 * 端上的「AI 视觉识别 + 主体分离」：估计背景、洪水填充去背、羽化边缘、
 * 裁到主体包围盒，并抽取主色与形态标签。
 */
export async function analyzeImage(file: File): Promise<AnalyzeOutput> {
  const started = performance.now();
  const bitmap = await loadBitmap(file);

  const source = createCanvas(bitmap.width, bitmap.height);
  ctxOf(source).drawImage(bitmap, 0, 0);

  const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(16, Math.round(bitmap.width * scale));
  const h = Math.max(16, Math.round(bitmap.height * scale));
  const work = createCanvas(w, h);
  const wctx = ctxOf(work);
  wctx.drawImage(bitmap, 0, 0, w, h);
  const image = wctx.getImageData(0, 0, w, h);
  const data = image.data;

  const { bg, spread } = estimateBackground(data, w, h);
  const tolerance = Math.min(96, Math.max(34, 30 + spread * 1.35));
  const isBg = floodBackground(data, w, h, bg, tolerance);

  let subjectCount = 0;
  for (let i = 0; i < isBg.length; i += 1) if (!isBg[i]) subjectCount += 1;
  let coverage = subjectCount / (w * h);

  // 主体过小或几乎占满，说明背景不可分离，退回整图
  const separable = coverage > 0.04 && coverage < 0.96;
  const alphaRaw = new Float32Array(w * h);
  for (let i = 0; i < alphaRaw.length; i += 1) alphaRaw[i] = separable && isBg[i] ? 0 : 255;
  const feather = Math.max(1, Math.round(Math.min(w, h) * 0.006));
  const alpha = separable ? featherAlpha(alphaRaw, w, h, feather, 2) : alphaRaw;

  // 包围盒
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (alpha[y * w + x] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
    coverage = 1;
  }

  // 主色 & 亮度：只统计主体像素
  const samples: number[][] = [];
  let brightSum = 0;
  let brightCount = 0;
  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const idx = y * w + x;
      if (alpha[idx] < 160) continue;
      const i = idx * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
      brightSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      brightCount += 1;
    }
  }
  const colors = dominantColors(samples.filter((_, i) => i % 3 === 0));
  const colorNames = Array.from(new Set(colors.map(colorName))).slice(0, 4);
  const brightness = brightCount ? brightSum / brightCount : 128;

  // 高分辨率抠图：把 alpha 放大后用 destination-in 蒙到原图裁切区域
  const pad = 0.03;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const cx = Math.max(0, minX - bw * pad);
  const cy = Math.max(0, minY - bh * pad);
  const cw = Math.min(w - cx, bw * (1 + pad * 2));
  const ch = Math.min(h - cy, bh * (1 + pad * 2));

  const outScale = Math.min(bitmap.width / w, CUTOUT_MAX / Math.max(cw, ch));
  const outW = Math.max(64, Math.round(cw * outScale));
  const outH = Math.max(64, Math.round(ch * outScale));

  const cutout = createCanvas(outW, outH);
  const cctx = ctxOf(cutout);
  const srcScale = bitmap.width / w;
  cctx.drawImage(
    bitmap,
    cx * srcScale,
    cy * srcScale,
    cw * srcScale,
    ch * srcScale,
    0,
    0,
    outW,
    outH,
  );

  if (separable) {
    const maskCanvas = createCanvas(w, h);
    const mctx = ctxOf(maskCanvas);
    const maskData = mctx.createImageData(w, h);
    for (let i = 0; i < alpha.length; i += 1) {
      maskData.data[i * 4] = 255;
      maskData.data[i * 4 + 1] = 255;
      maskData.data[i * 4 + 2] = 255;
      maskData.data[i * 4 + 3] = Math.max(0, Math.min(255, alpha[i]));
    }
    mctx.putImageData(maskData, 0, 0);
    cctx.globalCompositeOperation = 'destination-in';
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(maskCanvas, cx, cy, cw, ch, 0, 0, outW, outH);
    cctx.globalCompositeOperation = 'source-over';
  }

  const aspect = bh / bw;
  const tags: string[] = [];
  if (colorNames[0]) tags.push(`${colorNames[0]}主体`);
  tags.push(shapeTag(aspect));
  if (colorNames[1]) tags.push(`${colorNames[1]}辅助色`);
  tags.push(separable ? '纯净背景，边缘可直接分离' : '复杂背景，已保留原图环境');
  if (brightness > 175) tags.push('高调亮面，适合白底与浅色场景');
  else if (brightness < 80) tags.push('暗色主体，建议搭配亮场景提升对比');

  const vision: VisionResult = {
    bbox: { x: minX / w, y: minY / h, w: bw / w, h: bh / h },
    coverage: Math.round(coverage * 1000) / 1000,
    colors,
    colorNames,
    background: toHex(bg[0], bg[1], bg[2]),
    cleanBackground: separable && spread < 26,
    brightness: Math.round(brightness),
    tags,
    source: { width: bitmap.width, height: bitmap.height, type: file.type || 'image/*' },
    cutout: { width: outW, height: outH, edge: feather * 2 },
    elapsed: Math.round(performance.now() - started),
  };

  bitmap.close?.();
  return { vision, cutout, source };
}
