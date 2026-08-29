/* 公共层：主题 token、格式化、筛选状态、ECharts 基础配置 */

const C = {
  ink: '#ffffff', ink2: '#c9ced9', ink3: '#868d9c',
  line: '#232936', baseline: '#2e3547', surface: '#141821',
  channel: { '短信': '#3987e5', 'AI外呼': '#d95926', 'Push及企微': '#199e70' },
  tier: {
    'SKA': '#86b6ef', 'KA': '#3987e5', '腰部': '#256abf',
    '基础长尾': '#184f95', '新客观察期': '#d55181', '未激活': '#898781'
  },
  status: { '高危': '#d03b3b', '中危': '#ec835a', '关注': '#fab219', '正常': '#0ca30c' },
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
};
const LEVEL_ICON = { '高危': '▲', '中危': '◆', '关注': '●', '正常': '✓' };

/* ---------- 格式化 ---------- */
const fmtInt = n => (n == null ? '–' : Math.round(n).toLocaleString('zh-CN'));
function fmtMoney(n) {
  if (n == null) return '–';
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e6 ? 0 : 1) + ' 万';
  return Math.round(n).toLocaleString('zh-CN');
}
const fmtYuan = n => '¥' + fmtMoney(n);
const fmtPct = (n, d = 1) => (n == null ? '–' : (n * 100).toFixed(d) + '%');
function deltaHtml(d, goodUp = true) {
  if (d == null) return '<span class="delta">环比 –</span>';
  const up = d >= 0, good = up === goodUp;
  return `<span class="delta ${good ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(d * 100).toFixed(1)}% 环比</span>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 筛选状态 ---------- */
const state = {
  start: null, end: null, rescore: '1',
  industry: [], region: [], source: '', contract: '', tier: '', strategic: '',
  detailPage: 1, detailSort: 'spend', detailQ: '', detailAlertOnly: false,
  alertLevel: '', alertRule: '', actionLevel: '', actionOwner: ''
};
let META = null;

function query(extra = {}) {
  const p = new URLSearchParams();
  if (state.start) p.set('start', state.start);
  if (state.end) p.set('end', state.end);
  p.set('rescore', state.rescore);
  state.industry.forEach(v => p.append('industry', v));
  state.region.forEach(v => p.append('region', v));
  ['source', 'contract', 'tier', 'strategic'].forEach(k => { if (state[k]) p.append(k, state[k]); });
  Object.entries(extra).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  return p.toString();
}
const api = (path, extra) => fetch(`/api/${path}?${query(extra)}`).then(r => r.json());

/* ---------- ECharts 基础配置 ---------- */
const charts = new Map();
function chart(id, option, height) {
  const el = document.getElementById(id);
  if (!el) return;
  if (height) el.style.height = height;
  let inst = charts.get(id);
  if (!inst || inst.getDom() !== el) { inst && inst.dispose(); inst = echarts.init(el, null, { renderer: 'canvas' }); charts.set(id, inst); }
  inst.setOption(option, true);
  return inst;
}
window.addEventListener('resize', () => charts.forEach(c => c.resize()));

const axisLabel = { color: C.ink3, fontSize: 11 };
const axisLine = { lineStyle: { color: C.baseline } };
const splitLine = { lineStyle: { color: C.line, type: 'solid', width: 1 } };
const tooltipBase = {
  backgroundColor: '#10141c', borderColor: C.baseline, borderWidth: 1,
  textStyle: { color: C.ink2, fontSize: 12 }, padding: [8, 11], confine: true
};
const legendBase = {
  textStyle: { color: C.ink2, fontSize: 11.5 }, itemWidth: 10, itemHeight: 10,
  icon: 'roundRect', top: 0, right: 0
};
const gridBase = { left: 8, right: 16, top: 34, bottom: 6, containLabel: true };

/* 值轴：单位统一为万元，避免坐标轴长数字 */
const moneyAxis = (name = '消耗（万元）') => ({
  type: 'value', name, nameTextStyle: { color: C.ink3, fontSize: 11, align: 'left' },
  axisLabel: { ...axisLabel, formatter: v => (v / 1e4).toLocaleString('zh-CN') },
  axisLine: { show: false }, axisTick: { show: false }, splitLine
});
const catAxis = (data, opt = {}) => ({
  type: 'category', data, axisLabel, axisLine, axisTick: { show: false }, ...opt
});

/* 柱条统一规格：≤24px、数据端 4px 圆角、堆叠间留 2px 面色缝 */
const BAR = { barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } };
const BAR_H = { barMaxWidth: 18, itemStyle: { borderRadius: [0, 4, 4, 0] } };
const STACK_GAP = { borderColor: C.surface, borderWidth: 2 };

function sparkOption(data, color = C.tier.KA) {
  return {
    animation: false, grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i), boundaryGap: false },
    yAxis: { type: 'value', show: false, min: v => v.min * 0.85 },
    series: [{
      type: 'line', data, smooth: 0.35, symbol: 'none',
      lineStyle: { width: 2, color }, areaStyle: { color, opacity: 0.10 }
    }]
  };
}

/* ---------- 小工具 ---------- */
function toast(msg, isErr = false) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const d = document.createElement('div');
  d.className = 'toast' + (isErr ? ' err' : '');
  d.innerHTML = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 5200);
}
const tierSwatch = t => `<span class="swatch" style="background:${C.tier[t] || C.ink3}"></span>${esc(t)}`;
const levelPill = lv => `<span class="pill lv-${lv}">${LEVEL_ICON[lv]} ${lv}</span>`;
