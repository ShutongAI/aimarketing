'use client';

import JSZip from 'jszip';

import { RATIO_MAP, SHOT_MAP, CATEGORY_MAP, STYLE_MAP } from './specs';
import type { AssetResult, GenerationConfig, VisionResult } from './types';

function safeName(name: string) {
  return (name.trim() || '商品').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export { formatBytes };

/** 打包完整素材：三类图分目录 + 文案 + 素材清单 */
export async function buildPackage(options: {
  assets: AssetResult[];
  config: GenerationConfig;
  vision: VisionResult | null;
}) {
  const { assets, config, vision } = options;
  const zip = new JSZip();
  const root = zip.folder(`${safeName(config.productName)}_AI素材包`)!;

  for (const asset of assets) {
    const folder = root.folder(SHOT_MAP[asset.shot].folder)!;
    folder.file(asset.fileName, asset.blob);
  }

  const copyDir = root.folder('04_营销文案')!;
  const copyText = [
    `商品标题：${config.copy.title}`,
    '',
    '核心卖点：',
    ...config.copy.points.map((p, i) => `${i + 1}. ${p}`),
    '',
    `促销主标题：${config.copy.promoTitle}`,
    `促销副标题：${config.copy.promoSubtitle}`,
    `促销角标：${config.copy.badge}`,
    '',
    `文案来源：${config.copy.source === 'llm' ? '大模型生成' : '内置文案引擎'}`,
  ].join('\n');
  copyDir.file('标题与卖点.txt', copyText);
  copyDir.file(
    'copy.json',
    JSON.stringify(
      {
        productName: config.productName,
        category: CATEGORY_MAP[config.category].name,
        style: STYLE_MAP[config.style].name,
        ...config.copy,
      },
      null,
      2,
    ),
  );

  const rows = [
    ['图片类型', '比例', '尺寸(px)', '文件格式', '文件大小', '使用场景', '文件名'].join(','),
    ...assets.map((a) =>
      [
        SHOT_MAP[a.shot].name,
        a.ratio,
        `${a.width}x${a.height}`,
        SHOT_MAP[a.shot].format.toUpperCase(),
        formatBytes(a.bytes),
        RATIO_MAP[a.ratio].usage,
        `${SHOT_MAP[a.shot].folder}/${a.fileName}`,
      ].join(','),
    ),
  ].join('\n');
  // BOM 让 Excel 正确识别 UTF-8
  root.file('素材清单.csv', `﻿${rows}`);

  const readme = [
    `# ${config.productName} · AI 商品图素材包`,
    '',
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    `商品类型：${CATEGORY_MAP[config.category].name}`,
    `视觉风格：${STYLE_MAP[config.style].name}`,
    `图片比例：${config.ratios.join(' / ')}`,
    `图片数量：${assets.length} 张（${config.shots.map((s) => SHOT_MAP[s].name).join(' / ')}）`,
    '',
    '## 目录说明',
    ...Object.values(SHOT_MAP).map((s) => `- ${s.folder}/：${s.desc}`),
    '- 04_营销文案/：商品标题、3 条卖点与促销文案',
    '- 素材清单.csv：每张图的类型、比例、尺寸与使用场景',
    '',
    '## 视觉识别记录',
    vision
      ? [
          `原图尺寸：${vision.source.width}×${vision.source.height}`,
          `主体占比：${Math.round(vision.coverage * 100)}%`,
          `主色：${vision.colorNames.join('、')}`,
          `抠图输出：${vision.cutout.width}×${vision.cutout.height}（边缘羽化 ${vision.cutout.edge}px）`,
        ].join('\n')
      : '无',
  ].join('\n');
  root.file('README.txt', readme);

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function packageFileName(productName: string) {
  return `${safeName(productName)}_AI素材包.zip`;
}
