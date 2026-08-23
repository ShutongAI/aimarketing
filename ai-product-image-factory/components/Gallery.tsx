'use client';

import { useMemo, useState } from 'react';

import { formatBytes } from '@/lib/pack';
import { RATIO_MAP, SHOTS, SHOT_MAP } from '@/lib/specs';
import type { ShotType } from '@/lib/specs';
import type { AssetResult } from '@/lib/types';

interface Props {
  assets: AssetResult[];
  onDownload: (asset: AssetResult) => void;
}

const ENGINE_LABEL: Record<AssetResult['engine'], string> = {
  local: '本地合成引擎',
  gemini: 'Gemini 生图',
  openai: 'OpenAI 生图',
};

export default function Gallery({ assets, onDownload }: Props) {
  const [tab, setTab] = useState<ShotType | 'all'>('all');
  const [preview, setPreview] = useState<AssetResult | null>(null);

  const counts = useMemo(() => {
    const map = new Map<ShotType, number>();
    for (const a of assets) map.set(a.shot, (map.get(a.shot) ?? 0) + 1);
    return map;
  }, [assets]);

  const visible = tab === 'all' ? assets : assets.filter((a) => a.shot === tab);

  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>
          全部 {assets.length}
        </button>
        {SHOTS.filter((s) => counts.get(s.key)).map((s) => (
          <button
            key={s.key}
            className={`tab${tab === s.key ? ' on' : ''}`}
            onClick={() => setTab(s.key)}
          >
            {s.name} {counts.get(s.key)}
          </button>
        ))}
      </div>

      <div className="gallery">
        {visible.map((asset) => (
          <figure className="asset" key={asset.id} style={{ margin: 0 }}>
            <div className="asset-figure" onClick={() => setPreview(asset)}>
              <span className="asset-badge">{SHOT_MAP[asset.shot].name}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={`${SHOT_MAP[asset.shot].name} ${asset.ratio}`} />
            </div>
            <figcaption className="asset-body">
              <div className="asset-meta">
                <span className="chip brand">比例 {asset.ratio}</span>
                <span className="chip">
                  {asset.width} × {asset.height}
                </span>
                <span className="chip">{SHOT_MAP[asset.shot].format.toUpperCase()}</span>
                <span className="chip">{formatBytes(asset.bytes)}</span>
              </div>
              <div className="hint">{RATIO_MAP[asset.ratio].usage}</div>
              <div className="asset-foot">
                <span className="mono">{ENGINE_LABEL[asset.engine]} · {asset.elapsed}ms</span>
                <button className="btn btn-sm" onClick={() => onDownload(asset)}>
                  ↓ 下载
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.fileName} />
            <div className="lightbox-info">
              {SHOT_MAP[preview.shot].name} · {preview.ratio} · {preview.width}×{preview.height} ·{' '}
              {formatBytes(preview.bytes)} · {preview.fileName}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
