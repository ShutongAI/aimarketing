/**
 * 单文件在线演示的入口：没有 Next.js 服务端，所有能力都跑在浏览器里。
 * 由 scripts/build-static.mjs 打包成 dist/index.html。
 */
import { createRoot } from 'react-dom/client';

import Factory from '../components/Factory';

const root = document.getElementById('root');
if (root) createRoot(root).render(<Factory />);
