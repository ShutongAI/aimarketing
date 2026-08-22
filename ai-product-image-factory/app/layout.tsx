import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI 商品图工厂',
  description: '上传一张普通商品照片，一次产出多规格白底商品图、场景主图、促销图与营销文案。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
