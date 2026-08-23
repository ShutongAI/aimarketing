'use client';

import type { PipelineStep } from '@/lib/types';

interface Props {
  steps: PipelineStep[];
  running: boolean;
  elapsed: number;
  engineLabel: string;
}

function stateMark(state: PipelineStep['state']) {
  if (state === 'done') return '✓';
  if (state === 'running') return '●';
  if (state === 'error') return '!';
  return '';
}

function stateText(step: PipelineStep) {
  if (step.state === 'done') return step.detail ? `${step.detail} · ${step.elapsed}ms` : `完成 · ${step.elapsed}ms`;
  if (step.state === 'running') return '运行中…';
  if (step.state === 'error') return step.detail ?? '执行失败';
  return '等待中';
}

export default function Pipeline({ steps, running, elapsed, engineLabel }: Props) {
  const done = steps.filter((s) => s.state === 'done').length;
  const percent = Math.round((done / steps.length) * 100);
  const current = steps.find((s) => s.state === 'running');

  return (
    <div className="pipeline">
      <div className="pipeline-head">
        <span style={{ color: '#cfd8ea', fontWeight: 600 }}>AI Pipeline</span>
        <span>
          {engineLabel} · {percent}%
          {running && ` · 已运行 ${(elapsed / 1000).toFixed(1)}s`}
        </span>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <div className="steps">
        {steps.map((step) => (
          <div key={step.key} className={`step ${step.state}`}>
            <span className="step-mark">{stateMark(step.state)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="step-name">
                <span className="step-index">{step.index} </span>
                {step.name}
              </span>
              <div className="step-meta">{stateText(step)}</div>
            </span>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        {current
          ? `正在执行：${current.name} — ${current.hint}`
          : done === steps.length
            ? '全部任务已完成，可在下方逐张下载或打包导出。'
            : '流水线待命：上传商品照片并完成左侧设置后点击生成。'}
      </div>
    </div>
  );
}
