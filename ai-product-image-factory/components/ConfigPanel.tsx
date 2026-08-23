'use client';

import { useRef, useState } from 'react';

import { CATEGORIES, RATIOS, SHOTS, STYLES } from '@/lib/specs';
import type { CategoryKey, RatioKey, ShotType, StyleKey } from '@/lib/specs';
import type { MarketingCopy, VisionResult } from '@/lib/types';

interface Props {
  previewUrl: string | null;
  cutoutUrl: string | null;
  vision: VisionResult | null;
  analyzing: boolean;
  productName: string;
  category: CategoryKey;
  style: StyleKey;
  ratios: RatioKey[];
  shots: ShotType[];
  copy: MarketingCopy | null;
  copyLoading: boolean;
  running: boolean;
  onFile: (file: File) => void;
  /** 静态演示里提供一张内置示例图 */
  onLoadSample?: () => void;
  onProductName: (value: string) => void;
  onCategory: (value: CategoryKey) => void;
  onStyle: (value: StyleKey) => void;
  onToggleRatio: (value: RatioKey) => void;
  onToggleShot: (value: ShotType) => void;
  onCopyChange: (patch: Partial<MarketingCopy>) => void;
  onRegenerateCopy: () => void;
  onGenerate: () => void;
}

const MAX_MB = 12;

export default function ConfigPanel(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [copyOpen, setCopyOpen] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);

  const accept = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFileError('请上传 JPG / PNG / WebP 格式的商品照片');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFileError(`图片超过 ${MAX_MB}MB，请压缩后再上传`);
      return;
    }
    setFileError(null);
    props.onFile(file);
  };

  const totalAssets = props.ratios.length * props.shots.length;

  return (
    <aside className="side">
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">1 · 上传商品照片</div>
            <div className="card-sub">上传后自动识别主体、抠图并给出配置建议</div>
          </div>
          {props.analyzing && <span className="chip brand">识别中…</span>}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {props.previewUrl ? (
          <div className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.previewUrl} alt="商品原图" />
            <button className="preview-action" onClick={() => inputRef.current?.click()}>
              ⟳ 更换图片
            </button>
          </div>
        ) : (
          <div
            className={`dropzone${over ? ' over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              accept(e.dataTransfer.files?.[0]);
            }}
          >
            <div>
              <div className="dropzone-icon">🖼️</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>点击上传或拖拽商品照片</div>
              <div className="hint" style={{ marginTop: 6 }}>
                支持 JPG / PNG / WebP，建议主体完整、背景干净，单张不超过 {MAX_MB}MB
              </div>
              {props.onLoadSample && (
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onLoadSample?.();
                  }}
                >
                  没有素材？载入示例商品图
                </button>
              )}
            </div>
          </div>
        )}

        {fileError && (
          <div className="alert error" style={{ marginTop: 10 }}>
            {fileError}
          </div>
        )}

        {props.vision && (
          <>
            <div className="section-label" style={{ marginTop: 14 }}>
              <span>AI 识别结果</span>
              <span className="chip">耗时 {props.vision.elapsed}ms</span>
            </div>
            <div className="asset-meta">
              {props.vision.tags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="cutout-row" style={{ marginTop: 12 }}>
              {props.cutoutUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cutout-thumb" src={props.cutoutUrl} alt="抠图结果" />
              )}
              <div>
                <div style={{ fontSize: 12, color: '#6ee7b7' }}>✓ 商品主体分离完成</div>
                <div className="hint">
                  {props.vision.cutout.width} × {props.vision.cutout.height} · 边缘羽化{' '}
                  {props.vision.cutout.edge}px · 主体占比 {Math.round(props.vision.coverage * 100)}%
                </div>
                <div className="hint">
                  原图 {props.vision.source.width}×{props.vision.source.height} · 背景{' '}
                  {props.vision.background}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">2 · 商品设置</div>
            <div className="card-sub">决定文案口径与场景搭建方式</div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">商品名称</span>
          <div className="input-wrap">
            <input
              className="input"
              value={props.productName}
              maxLength={30}
              placeholder="例如：NOVA 植萃净颜露"
              onChange={(e) => props.onProductName(e.target.value)}
            />
            <span className="counter">{props.productName.length}/30</span>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <span className="field-label">商品类型</span>
            <select
              className="select"
              value={props.category}
              onChange={(e) => props.onCategory(e.target.value as CategoryKey)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">视觉风格</span>
            <select
              className="select"
              value={props.style}
              onChange={(e) => props.onStyle(e.target.value as StyleKey)}
            >
              {STYLES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">3 · 输出规格</div>
            <div className="card-sub">勾选比例与图片类型，系统一次生成全部组合</div>
          </div>
          <span className="chip accent">{totalAssets} 张</span>
        </div>

        <div className="section-label">图片比例</div>
        <div className="ratio-grid">
          {RATIOS.map((r) => {
            const on = props.ratios.includes(r.key);
            return (
              <button
                key={r.key}
                className={`option${on ? ' on' : ''}`}
                onClick={() => props.onToggleRatio(r.key)}
              >
                <span className="checkbox">{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="option-title">{r.key}</span>
                  <span className="option-sub">
                    {r.width}×{r.height} · {r.usage}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="section-label" style={{ marginTop: 14 }}>
          图片类型
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {SHOTS.map((s) => {
            const on = props.shots.includes(s.key);
            return (
              <button
                key={s.key}
                className={`option${on ? ' on' : ''}`}
                onClick={() => props.onToggleShot(s.key)}
              >
                <span className="checkbox">{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="option-title">{s.name}</span>
                  <span className="option-sub">{s.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">4 · 营销内容</div>
            <div className="card-sub">
              {props.copy ? `已生成标题与 ${props.copy.points.length} 条卖点` : '上传后自动生成'}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setCopyOpen((v) => !v)}>
            {copyOpen ? '收起' : '展开'}
          </button>
        </div>

        {copyOpen && (
          <div className="copy-block">
            <button
              className="btn btn-sm btn-block"
              onClick={props.onRegenerateCopy}
              disabled={props.copyLoading}
            >
              {props.copyLoading ? <span className="spin" /> : '↻ 重新生成建议文案'}
            </button>

            {props.copy && (
              <>
                <div>
                  <div className="field-label" style={{ marginBottom: 4 }}>
                    商品标题（{props.copy.title.length} 字）
                  </div>
                  <div className="copy-line">{props.copy.title}</div>
                </div>

                <div className="field">
                  <span className="field-label">促销主标题（建议 4-8 个字）</span>
                  <div className="input-wrap">
                    <input
                      className="input"
                      maxLength={12}
                      value={props.copy.promoTitle}
                      onChange={(e) => props.onCopyChange({ promoTitle: e.target.value })}
                    />
                    <span className="counter">{props.copy.promoTitle.length} 字</span>
                  </div>
                </div>

                <div className="field">
                  <span className="field-label">促销副标题</span>
                  <input
                    className="input"
                    maxLength={24}
                    value={props.copy.promoSubtitle}
                    onChange={(e) => props.onCopyChange({ promoSubtitle: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span className="field-label">促销角标</span>
                  <input
                    className="input"
                    maxLength={10}
                    value={props.copy.badge}
                    onChange={(e) => props.onCopyChange({ badge: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span className="field-label">3 条卖点（会印在促销图上）</span>
                  {props.copy.points.map((point, i) => (
                    <input
                      key={i}
                      className="input"
                      maxLength={40}
                      value={point}
                      onChange={(e) => {
                        const points = [...props.copy!.points];
                        points[i] = e.target.value;
                        props.onCopyChange({ points });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <button
        className="btn btn-primary btn-block"
        style={{ padding: '12px 16px', fontSize: 14 }}
        disabled={props.running || !props.previewUrl || totalAssets === 0}
        onClick={props.onGenerate}
      >
        {props.running ? (
          <>
            <span className="spin" /> 正在生成…
          </>
        ) : (
          `⚡ 一键生成 ${totalAssets} 张商品图`
        )}
      </button>
      <div className="hint" style={{ textAlign: 'center', paddingBottom: 8 }}>
        生成过程全部在浏览器本地完成，图片不会上传到第三方（未配置生图模型时）
      </div>
    </aside>
  );
}
