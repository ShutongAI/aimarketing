'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ConfigPanel from './ConfigPanel';
import Gallery from './Gallery';
import Pipeline from './Pipeline';
import { buildLocalCopy } from '@/lib/copy';
import { saveFile } from '@/lib/download';
import { buildPackage, packageFileName } from '@/lib/pack';
import { canvasToBlob, fitToSpec, renderAsset } from '@/lib/render';
import {
  RATIOS,
  RATIO_MAP,
  SHOTS,
  SHOT_MAP,
  assetFileName,
  type CategoryKey,
  type RatioKey,
  type ShotType,
  type StyleKey,
} from '@/lib/specs';
import type { AssetResult, MarketingCopy, PipelineStep, VisionResult } from '@/lib/types';
import { analyzeImage, createCanvas } from '@/lib/vision';

const STEP_DEFS: Array<Pick<PipelineStep, 'key' | 'index' | 'name' | 'hint'>> = [
  { key: 'vision', index: '01', name: '商品视觉识别', hint: '估计背景色、提取主色与商品形态' },
  { key: 'matting', index: '02', name: '商品主体分离', hint: '洪水填充去背并对边缘做羽化' },
  { key: 'white', index: '03', name: '白底商品图', hint: '纯白背景、居中构图、接地投影' },
  { key: 'scene', index: '04', name: '场景光影融合', hint: '按视觉风格搭建场景并统一光影' },
  { key: 'promo', index: '05', name: '中文营销排版', hint: '叠加主副标题、卖点与促销角标' },
  { key: 'export', index: '06', name: '多比例封装导出', hint: '编码到目标像素规格并统计素材清单' },
];

function freshSteps(): PipelineStep[] {
  return STEP_DEFS.map((s) => ({ ...s, state: 'pending', elapsed: 0 }));
}

interface EngineStatus {
  provider: 'local' | 'gemini' | 'openai';
  ready: boolean;
  model?: string;
  reason?: string;
}

const ENGINE_NAME: Record<EngineStatus['provider'], string> = {
  local: '本地合成引擎',
  gemini: 'Gemini 生图模型',
  openai: 'OpenAI 生图模型',
};

interface StaticGlobals {
  __AIPF_STATIC__?: boolean;
  __AIPF_SAMPLE__?: string;
}

/** 静态构建（单文件在线演示）没有后端，直接用内置引擎 */
const staticGlobals = (): StaticGlobals =>
  typeof window === 'undefined' ? {} : (window as unknown as StaticGlobals);

/** 让出一帧，保证流水线状态能实时渲染 */
const yieldFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });

async function dataUrlToBitmap(dataUrl: string) {
  const res = await fetch(dataUrl);
  return createImageBitmap(await res.blob());
}

/** 压到 1280 长边，作为调用生图模型时的输入 */
function toSourceDataUrl(canvas: HTMLCanvasElement) {
  const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
  const out = createCanvas(canvas.width * scale, canvas.height * scale);
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.9);
}

export default function Factory() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<CategoryKey>('beauty');
  const [style, setStyle] = useState<StyleKey>('fresh');
  const [ratios, setRatios] = useState<RatioKey[]>(['1:1', '3:4', '4:3', '16:9']);
  const [shots, setShots] = useState<ShotType[]>(['white', 'scene', 'promo']);

  const [copy, setCopy] = useState<MarketingCopy | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  /** 用户手动改过文案后就不再自动覆盖 */
  const [copyDirty, setCopyDirty] = useState(false);

  const [steps, setSteps] = useState<PipelineStep[]>(freshSteps);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [assets, setAssets] = useState<AssetResult[]>([]);
  const [packing, setPacking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineStatus>({ provider: 'local', ready: true });

  const cutoutRef = useRef<HTMLCanvasElement | null>(null);
  const sourceDataUrlRef = useRef<string | null>(null);
  const assetsRef = useRef<AssetResult[]>([]);
  const lastCopyNameRef = useRef<string | null>(null);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const [isStatic, setIsStatic] = useState(false);
  const [sample, setSample] = useState<string | null>(null);

  useEffect(() => {
    const globals = staticGlobals();
    setIsStatic(Boolean(globals.__AIPF_STATIC__));
    setSample(globals.__AIPF_SAMPLE__ ?? null);
    if (globals.__AIPF_STATIC__) return;
    fetch('/api/generate')
      .then((r) => r.json())
      .then((data: EngineStatus) => setEngine(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 100);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const patchStep = useCallback((key: string, patch: Partial<PipelineStep>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const requestCopy = useCallback(
    async (override?: { name?: string; category?: CategoryKey; style?: StyleKey; colorNames?: string[] }) => {
      const payload = {
        productName: override?.name ?? productName ?? '',
        category: override?.category ?? category,
        style: override?.style ?? style,
        colorNames: override?.colorNames ?? vision?.colorNames ?? [],
      };
      setCopyLoading(true);
      lastCopyNameRef.current = payload.productName;
      if (staticGlobals().__AIPF_STATIC__) {
        setCopy(buildLocalCopy(payload));
        setCopyLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/copy', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as MarketingCopy;
        setCopy(data);
      } catch {
        setCopy(buildLocalCopy(payload));
      } finally {
        setCopyLoading(false);
      }
    },
    [category, productName, style, vision],
  );

  const requestCopyRef = useRef(requestCopy);
  useEffect(() => {
    requestCopyRef.current = requestCopy;
  });

  useEffect(() => {
    if (!file || copyDirty) return undefined;
    if (lastCopyNameRef.current === productName) return undefined;
    const timer = window.setTimeout(() => void requestCopyRef.current({ name: productName }), 700);
    return () => window.clearTimeout(timer);
  }, [productName, file, copyDirty]);

  const handleFile = useCallback(
    async (picked: File) => {
      setError(null);
      setNotice(null);
      setFile(picked);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(picked);
      });
      setAnalyzing(true);
      try {
        const result = await analyzeImage(picked);
        cutoutRef.current = result.cutout;
        sourceDataUrlRef.current = toSourceDataUrl(result.source);
        setVision(result.vision);
        setCutoutUrl(result.cutout.toDataURL('image/png'));
        const guessName = productName || picked.name.replace(/\.[^.]+$/, '').slice(0, 30);
        if (!productName) setProductName(guessName);
        await requestCopy({ name: guessName, colorNames: result.vision.colorNames });
      } catch (e) {
        setError(e instanceof Error ? e.message : '图片识别失败，请更换一张试试');
      } finally {
        setAnalyzing(false);
      }
    },
    [productName, requestCopy],
  );

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  /** 单张图片：优先走生图模型，失败或未配置时回退本地合成 */
  const produceCanvas = useCallback(
    async (shot: ShotType, ratio: RatioKey, activeCopy: MarketingCopy) => {
      const cutout = cutoutRef.current!;
      const started = performance.now();
      if (engine.ready && engine.provider !== 'local' && sourceDataUrlRef.current) {
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              image: sourceDataUrlRef.current,
              shot,
              ratio,
              category,
              style,
              productName,
              copy: activeCopy,
            }),
          });
          const data = (await res.json()) as { engine?: string; image?: string; reason?: string };
          if (data.image) {
            const bitmap = await dataUrlToBitmap(data.image);
            const canvas = fitToSpec(bitmap, bitmap.width, bitmap.height, ratio);
            bitmap.close?.();
            return {
              canvas,
              engine: (data.engine as AssetResult['engine']) ?? 'local',
              elapsed: Math.round(performance.now() - started),
            };
          }
          if (data.reason) setNotice(`${ENGINE_NAME[engine.provider]}不可用（${data.reason}），已使用本地合成引擎。`);
        } catch {
          setNotice('生图模型请求失败，已使用本地合成引擎。');
        }
      }
      const canvas = renderAsset({
        cutout,
        shot,
        ratio,
        style,
        category,
        productName: productName || '未命名商品',
        copy: activeCopy,
      });
      return { canvas, engine: 'local' as const, elapsed: Math.round(performance.now() - started) };
    },
    [category, engine, productName, style],
  );

  const handleGenerate = useCallback(async () => {
    if (!file) {
      setError('请先上传商品照片');
      return;
    }
    if (ratios.length === 0 || shots.length === 0) {
      setError('请至少勾选一个图片比例和一种图片类型');
      return;
    }

    setError(null);
    setNotice(null);
    setRunning(true);
    setElapsed(0);
    setSteps(freshSteps());
    for (const a of assetsRef.current) URL.revokeObjectURL(a.url);
    setAssets([]);

    try {
      // 01 视觉识别
      patchStep('vision', { state: 'running' });
      await yieldFrame();
      let currentVision = vision;
      if (!currentVision || !cutoutRef.current) {
        const result = await analyzeImage(file);
        cutoutRef.current = result.cutout;
        sourceDataUrlRef.current = toSourceDataUrl(result.source);
        currentVision = result.vision;
        setVision(result.vision);
        setCutoutUrl(result.cutout.toDataURL('image/png'));
      }
      patchStep('vision', {
        state: 'done',
        elapsed: currentVision.elapsed,
        detail: `主色 ${currentVision.colorNames.slice(0, 2).join('/') || '未识别'}`,
      });

      // 02 主体分离
      patchStep('matting', { state: 'running' });
      await yieldFrame();
      const cutout = cutoutRef.current!;
      patchStep('matting', {
        state: 'done',
        elapsed: Math.max(1, Math.round(currentVision.elapsed * 0.45)),
        detail: `${cutout.width}×${cutout.height}`,
      });

      const activeCopy =
        copy ?? buildLocalCopy({ productName, category, style, colorNames: currentVision.colorNames });
      if (!copy) setCopy(activeCopy);

      // 03-05 三类图
      const produced: Array<{ shot: ShotType; ratio: RatioKey; canvas: HTMLCanvasElement; engine: AssetResult['engine']; elapsed: number }> = [];
      for (const shot of SHOTS.map((s) => s.key)) {
        if (!shots.includes(shot)) {
          patchStep(shot, { state: 'done', elapsed: 0, detail: '未勾选，已跳过' });
          continue;
        }
        patchStep(shot, { state: 'running' });
        await yieldFrame();
        const t0 = performance.now();
        for (const ratio of RATIOS.map((r) => r.key)) {
          if (!ratios.includes(ratio)) continue;
          const result = await produceCanvas(shot, ratio, activeCopy);
          produced.push({ shot, ratio, ...result });
          await yieldFrame();
        }
        patchStep(shot, {
          state: 'done',
          elapsed: Math.round(performance.now() - t0),
          detail: `${ratios.length} 个比例`,
        });
      }

      // 06 编码导出
      patchStep('export', { state: 'running' });
      await yieldFrame();
      const t1 = performance.now();
      const output: AssetResult[] = [];
      for (const item of produced) {
        const spec = SHOT_MAP[item.shot];
        const blob = await canvasToBlob(item.canvas, spec.format, 0.92);
        output.push({
          id: `${item.shot}-${item.ratio}`,
          shot: item.shot,
          ratio: item.ratio,
          width: RATIO_MAP[item.ratio].width,
          height: RATIO_MAP[item.ratio].height,
          url: URL.createObjectURL(blob),
          blob,
          fileName: assetFileName(item.shot, item.ratio),
          bytes: blob.size,
          engine: item.engine,
          elapsed: item.elapsed,
        });
      }
      setAssets(output);
      patchStep('export', {
        state: 'done',
        elapsed: Math.round(performance.now() - t1),
        detail: `${output.length} 张`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成失败';
      setError(message);
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.state === 'running');
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], state: 'error', detail: message.slice(0, 24) };
        return next;
      });
    } finally {
      setRunning(false);
    }
  }, [category, copy, file, patchStep, produceCanvas, productName, ratios, shots, style, vision]);

  const handleSave = useCallback(async (blob: Blob, fileName: string) => {
    const outcome = await saveFile(blob, fileName);
    if (outcome.status === 'saved' || outcome.status === 'declined') {
      if (outcome.status === 'declined') setNotice(null);
      return;
    }
    setNotice(outcome.message ?? '保存失败，请重试。');
  }, []);

  const handleLoadSample = useCallback(async () => {
    if (!sample) return;
    const blob = await (await fetch(sample)).blob();
    await handleFile(new File([blob], '示例商品图.jpg', { type: blob.type || 'image/jpeg' }));
  }, [handleFile, sample]);

  const handlePackage = useCallback(async () => {
    if (assets.length === 0) return;
    setPacking(true);
    try {
      const blob = await buildPackage({
        assets,
        config: {
          productName: productName || '未命名商品',
          category,
          style,
          ratios,
          shots,
          copy: copy ?? buildLocalCopy({ productName, category, style }),
        },
        vision,
      });
      await handleSave(blob, packageFileName(productName || '未命名商品'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '打包失败');
    } finally {
      setPacking(false);
    }
  }, [assets, category, copy, handleSave, productName, ratios, shots, style, vision]);

  const totalBytes = useMemo(() => assets.reduce((sum, a) => sum + a.bytes, 0), [assets]);
  const engineLabel = engine.ready && engine.provider !== 'local' ? ENGINE_NAME[engine.provider] : ENGINE_NAME.local;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>AI 商品图工厂</span>
          <span className="tag">BETA</span>
        </div>
        <div className="topbar-right">
          <span>
            <span className={`status-dot${running ? ' idle' : ''}`} />
            {running ? '生产中' : `${engineLabel}已就绪`}
          </span>
          <span className="avatar">AI</span>
        </div>
      </header>

      <div className="main">
        <ConfigPanel
          previewUrl={previewUrl}
          cutoutUrl={cutoutUrl}
          vision={vision}
          analyzing={analyzing}
          productName={productName}
          category={category}
          style={style}
          ratios={ratios}
          shots={shots}
          copy={copy}
          copyLoading={copyLoading}
          running={running}
          onFile={handleFile}
          onLoadSample={sample ? () => void handleLoadSample() : undefined}
          onProductName={setProductName}
          onCategory={(v) => {
            setCategory(v);
            if (!copyDirty) void requestCopy({ category: v });
          }}
          onStyle={(v) => {
            setStyle(v);
            if (!copyDirty) void requestCopy({ style: v });
          }}
          onToggleRatio={(v) => setRatios((prev) => toggle(prev, v))}
          onToggleShot={(v) => setShots((prev) => toggle(prev, v))}
          onCopyChange={(patch) => {
            setCopyDirty(true);
            setCopy((prev) => (prev ? { ...prev, ...patch } : prev));
          }}
          onRegenerateCopy={() => {
            setCopyDirty(false);
            void requestCopy();
          }}
          onGenerate={() => void handleGenerate()}
        />

        <main className="stage">
          <div className="stage-head">
            <div>
              <div className="stage-title">生成工作台</div>
              <div className="hint">
                {assets.length > 0
                  ? `已产出 ${assets.length} 张规格图 · 合计 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`
                  : '等待生成任务'}
              </div>
            </div>
            <button className="btn btn-primary" disabled={assets.length === 0 || packing} onClick={() => void handlePackage()}>
              {packing ? (
                <>
                  <span className="spin" /> 打包中…
                </>
              ) : (
                '⤓ 下载完整素材包'
              )}
            </button>
          </div>

          <Pipeline steps={steps} running={running} elapsed={elapsed} engineLabel={engineLabel} />

          {isStatic && (
            <div className="alert" style={{ marginBottom: 14 }}>
              在线演示：识别、抠图、场景合成、中文排版全部在你的浏览器里完成，图片不会上传到服务器。
              单张图片可直接保存；完整 ZIP 素材包与接入生图模型需要在本地运行本项目。
            </div>
          )}
          {error && (
            <div className="alert error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="alert" style={{ marginBottom: 14 }}>
              {notice}
            </div>
          )}

          {assets.length === 0 ? (
            <div className="empty">
              <div>
                <div className="empty-icon">🖼️</div>
                <h3>生产画布等待任务</h3>
                <p>上传商品并完成左侧设置后，生成结果会在这里完整呈现。</p>
                <div className="empty-chips">
                  {SHOTS.map((s) => (
                    <span className="chip" key={s.key}>
                      ✓ {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Gallery assets={assets} onDownload={(asset) => void handleSave(asset.blob, asset.fileName)} />
          )}
        </main>
      </div>
    </div>
  );
}
