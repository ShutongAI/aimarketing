'use client';

/**
 * 保存文件。普通网页环境用 <a download>；在 claude.ai 的 Artifact 沙箱里
 * 浏览器自发的下载会被拦截，改走 downloads 能力（由观看者确认后保存）。
 */
export type SaveStatus = 'saved' | 'declined' | 'unsupported' | 'error';

export interface SaveOutcome {
  status: SaveStatus;
  message?: string;
}

interface DownloadsApi {
  save: (req: { filename: string; data: Blob }) => Promise<{ status: 'saved' }>;
}

let downloadsCache: Promise<DownloadsApi | null> | null = null;

function getDownloads() {
  if (!downloadsCache) {
    const host = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    downloadsCache = host?.use
      ? host.use('downloads').then((api) => (api as DownloadsApi | null) ?? null, () => null)
      : Promise.resolve(null);
  }
  return downloadsCache;
}

function anchorDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveFile(blob: Blob, fileName: string): Promise<SaveOutcome> {
  const downloads = await getDownloads();
  if (!downloads) {
    anchorDownload(blob, fileName);
    return { status: 'saved' };
  }
  try {
    await downloads.save({ filename: fileName, data: blob });
    return { status: 'saved' };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const ext = fileName.split('.').pop()?.toUpperCase() ?? '文件';
    if (code === 'declined') return { status: 'declined' };
    if (code === 'rejected_extension' || code === 'extension_not_enabled') {
      return {
        status: 'unsupported',
        message: `当前环境不允许保存 ${ext} 文件。图片可以逐张保存；完整素材包请在本地运行本项目后导出。`,
      };
    }
    if (code === 'too_large') {
      return { status: 'unsupported', message: '文件超过当前环境的保存上限（16MB），请改为逐张保存。' };
    }
    return {
      status: 'error',
      message: (error as { message?: string })?.message ?? '保存失败，请重试。',
    };
  }
}
