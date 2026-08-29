/* 网页版数据层：把服务端 metrics / alerts / actions 三层搬到浏览器。
   对外暴露与 Flask 版完全相同的 api(path, extra) 契约，因此 views.js 无需改动。 */

const D = QA_DATA;
const MONTHS_ALL = D.months, CH = D.channels, TIER_ORDER = D.tiers;
const DICT = D.dict;

const MER = D.m.map((r, i) => ({
  idx: i, id: r[0], name: r[1],
  industry: DICT.industry[r[2]], region: DICT.region[r[3]],
  source: DICT.source[r[4]], contract: DICT.contract[r[5]],
  lifecycle: DICT.lifecycle[r[6]], strategic: r[7] ? '是' : '否',
  coop: r[8], trendTxt: DICT.trend[r[9]],
  scene: r[10], depth: r[11], activeDays: r[12],
  bScene: r[13], bDepth: r[14], bSend: r[15], bDays: r[16], bMember: r[17],
  bBudget: r[18], bPromo: r[19], bTeam: r[20], bTrend: r[21], bRenew: r[22],
  budget: r[23], baseTier: TIER_ORDER[r[24]], baseScore: r[25], owner: DICT.owner[r[26]],
  baseV: r[27], baseA: r[28], baseP: r[29], baseH: r[30],
  ch: D.c[i] || null                       // [[12 短信],[12 外呼],[12 Push企微]] 或 null
}));

/* 打分卡档界与分层映射，与 app/metrics.py 保持同一份口径 */
const SPEND_BANDS = [0, 24000, 94000, 220000, 530000];
const TIER_CUTS = [['基础长尾', 0], ['腰部', 40], ['KA', 75], ['SKA', 90]];
const STRATEGY = {
  'SKA': '守·共创：卡片短信/AI外呼新场景POC',
  'KA': '扩·深化：AI外呼场景深化+Push/企微补全',
  '腰部': '拉·主攻：主推AI外呼+大促作战包',
  '基础长尾': '激活：企微+Push低成本先跑',
  '新客观察期': '培育：入门包+1v1场景教育',
  '未激活': '唤醒：短信模板+首充补贴'
};

function bandScore(v) {
  let s = 0;
  for (const b of SPEND_BANDS) if (v >= b) s++;
  return Math.min(5, Math.max(1, s));
}
const sum = a => a.reduce((x, y) => x + y, 0);
const pctDelta = (cur, prev) => (prev ? (cur - prev) / prev : null);

/* ---------------------------------------------------------------- 上下文构建 */
function buildCtx(st) {
  const a = MONTHS_ALL.indexOf(st.start || MONTHS_ALL[0]);
  const b = MONTHS_ALL.indexOf(st.end || MONTHS_ALL[MONTHS_ALL.length - 1]);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const n = hi - lo + 1;
  const months = MONTHS_ALL.slice(lo, hi + 1);
  const pLo = Math.max(0, lo - n), pHi = lo - 1;

  const rescore = st.rescore !== '0';
  const rows = [];

  for (const m of MER) {
    const cur = [0, 0, 0], prev = [0, 0, 0];
    const monthly = new Array(n).fill(0);
    if (m.ch) {
      for (let c = 0; c < 3; c++) {
        const arr = m.ch[c];
        for (let i = lo; i <= hi; i++) { cur[c] += arr[i]; monthly[i - lo] += arr[i]; }
        for (let i = pLo; i <= pHi; i++) prev[c] += arr[i];
      }
    }
    const spend = cur[0] + cur[1] + cur[2];
    const annual = spend * (12 / n);

    let v, act, p, h, total, tier;
    if (rescore) {
      const sb = bandScore(annual);
      v = (25 * sb + 8 * m.bScene + 7 * m.bDepth) / 5;
      act = (10 * m.bSend + 10 * m.bDays) / 5;
      p = (12 * m.bMember + 8 * m.bBudget + 6 * m.bPromo + 4 * m.bTeam) / 5;
      h = (6 * m.bTrend + 4 * m.bRenew) / 5;
      if (m.coop < 3) v = p / 30 * 40;                  // 新客修正：看潜力不看消耗
      total = Math.round((v + act + p + h) * 10) / 10;

      tier = '基础长尾';
      for (const [name, cut] of TIER_CUTS) if (total >= cut) tier = name;
      if (spend <= 0) tier = m.coop < 3 ? '新客观察期' : '未激活';   // 一票否决
    } else {
      // 年度基准口径：四维分与分层直接取工作簿公式列，不随窗口变化
      v = m.baseV; act = m.baseA; p = m.baseP; h = m.baseH;
      total = m.baseScore; tier = m.baseTier;
    }

    rows.push({
      m, spend, cur, prev, monthly,
      prevSpend: prev[0] + prev[1] + prev[2],
      v: Math.round(v * 10) / 10, a: Math.round(act * 10) / 10,
      p: Math.round(p * 10) / 10, h: Math.round(h * 10) / 10,
      score: total, tier, strategy: STRATEGY[tier],
      headroom: Math.max(0, m.budget - annual),
      last: n >= 1 ? monthly[n - 1] : 0,
      prev1: n >= 2 ? monthly[n - 2] : 0
    });
  }

  const f = st.filters || {};
  const keep = r =>
    (!f.industry?.length || f.industry.includes(r.m.industry)) &&
    (!f.region?.length || f.region.includes(r.m.region)) &&
    (!f.source || f.source === r.m.source) &&
    (!f.contract || f.contract === r.m.contract) &&
    (!f.tier || f.tier === r.tier) &&
    (!f.strategic || f.strategic === r.m.strategic);

  return { rows: rows.filter(keep), months, n };
}

/* ---------------------------------------------------------------- M1 总览 */
function kpi(ctx) {
  const R = ctx.rows;
  const spend = sum(R.map(r => r.spend));
  const active = R.filter(r => r.spend > 0).length;
  const head = sum(R.filter(r => r.tier === 'SKA' || r.tier === 'KA').map(r => r.spend));
  const prevSpend = sum(R.map(r => r.prevSpend));
  const prevActive = R.filter(r => r.prevSpend > 0).length;
  const trend = ctx.months.map((_, i) => sum(R.map(r => r.monthly[i])));
  return {
    merchants: R.length, active, active_delta: pctDelta(active, prevActive),
    spend, spend_delta: pctDelta(spend, prevSpend), spend_trend: trend,
    arpu: active ? spend / active : 0,
    dormant: R.filter(r => r.spend <= 0 && r.m.coop >= 3).length,
    head_share: spend ? head / spend : 0,
    avg_scene: R.length ? sum(R.map(r => r.m.scene)) / R.length : 0,
    months: ctx.months
  };
}

function trendByChannel(ctx) {
  return {
    months: ctx.months,
    series: CH.map((c, ci) => ({
      name: c,
      data: ctx.months.map((_, i) => {
        const lo = MONTHS_ALL.indexOf(ctx.months[0]);
        return sum(ctx.rows.map(r => (r.m.ch ? r.m.ch[ci][lo + i] : 0)));
      })
    }))
  };
}

function tierSummary(ctx) {
  const R = ctx.rows, total = sum(R.map(r => r.spend));
  return TIER_ORDER.map(t => {
    const s = R.filter(r => r.tier === t);
    const sp = sum(s.map(r => r.spend));
    return {
      tier: t, count: s.length, count_share: R.length ? s.length / R.length : 0,
      spend: sp, spend_share: total ? sp / total : 0,
      avg_score: s.length ? sum(s.map(r => r.score)) / s.length : 0,
      avg_scene: s.length ? sum(s.map(r => r.m.scene)) / s.length : 0,
      strategy: STRATEGY[t]
    };
  });
}

function lorenz(ctx) {
  const s = ctx.rows.map(r => r.spend).sort((a, b) => b - a);
  const tot = sum(s);
  if (!s.length || tot <= 0) return { points: [], top10: 0 };
  const cum = []; let acc = 0;
  for (const v of s) { acc += v; cum.push(acc / tot); }
  const nn = s.length, step = Math.max(1, Math.floor(nn / 120));
  const pts = [];
  for (let i = 0; i < nn; i += step)
    pts.push([+(((i + 1) / nn) * 100).toFixed(2), +(cum[i] * 100).toFixed(2)]);
  if (pts[pts.length - 1][0] < 100) pts.push([100, 100]);
  return { points: pts, top10: cum[Math.max(0, Math.floor(nn * 0.1) - 1)] };
}

function byDimension(ctx, key, top) {
  const g = new Map();
  for (const r of ctx.rows) {
    const k = r.m[key];
    const e = g.get(k) || { name: k, spend: 0, count: 0 };
    e.spend += r.spend; e.count++; g.set(k, e);
  }
  const out = [...g.values()].sort((a, b) => b.spend - a.spend);
  return top ? out.slice(0, top) : out;
}

/* ---------------------------------------------------------------- M2 分层 */
function tierIndustryMatrix(ctx) {
  const inds = [...new Set(ctx.rows.map(r => r.m.industry))].sort();
  const grid = TIER_ORDER.map(() => inds.map(() => 0));
  for (const r of ctx.rows) {
    const ti = TIER_ORDER.indexOf(r.tier), ii = inds.indexOf(r.m.industry);
    if (ti >= 0 && ii >= 0) grid[ti][ii]++;
  }
  const data = [];
  let mx = 0;
  for (let i = 0; i < TIER_ORDER.length; i++)
    for (let j = 0; j < inds.length; j++) { data.push([j, i, grid[i][j]]); mx = Math.max(mx, grid[i][j]); }
  return { industries: inds, tiers: TIER_ORDER, data, max: mx };
}

function quadrant(ctx, limit = 800) {
  const R = ctx.rows.filter(r => r.tier !== '未激活');
  const sorted = R.map(r => r.spend).sort((a, b) => a - b);
  const med = sorted.length
    ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
       : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;

  const isNew = r => r.m.coop < 6 && r.spend <= med && r.p >= 24;
  const isDecay = r => (r.tier === 'SKA' || r.tier === 'KA') && r.m.trendTxt === '连续下降';

  const groups = {
    '常规': R.filter(r => !isNew(r) && !isDecay(r)),
    '高潜新签': R.filter(r => isNew(r) && !isDecay(r)),
    '衰退KA': R.filter(isDecay)
  };
  const out = {}, counts = {};
  for (const [name, arr] of Object.entries(groups)) {
    counts[name] = arr.length;
    let a = arr;
    if (name === '常规' && a.length > limit)
      a = [...a].sort((x, y) => y.spend - x.spend).slice(0, limit);
    out[name] = a.map(r => [r.p, r.v, r.spend, r.m.name, r.tier]);
  }
  return { groups: out, counts };
}

function lifecycle(ctx) {
  const order = ['潜客试用', '首次订购客户', '增购客户', '续订客户', '流失预警', '已流失'];
  return order.map(k => {
    const s = ctx.rows.filter(r => r.m.lifecycle === k);
    return s.length ? { name: k, count: s.length, spend: sum(s.map(r => r.spend)) } : null;
  }).filter(Boolean);
}

function tierRadar(ctx) {
  return TIER_ORDER.slice(0, 4).map(t => {
    const s = ctx.rows.filter(r => r.tier === t);
    if (!s.length) return null;
    const avg = k => Math.round(sum(s.map(r => r[k])) / s.length * 10) / 10;
    return { tier: t, value: [avg('v'), avg('a'), avg('p'), avg('h')] };
  }).filter(Boolean);
}

function migration(ctx, limit = 60) {
  const rank = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i]));
  return ctx.rows.filter(r => r.tier !== r.m.baseTier)
    .sort((a, b) => b.spend - a.spend).slice(0, limit)
    .map(r => ({
      id: r.m.id, name: r.m.name, from: r.m.baseTier, to: r.tier,
      direction: rank[r.tier] < rank[r.m.baseTier] ? '升级' : '降级',
      score: r.score, base_score: r.m.baseScore, spend: r.spend, owner: r.m.owner
    }));
}

/* ---------------------------------------------------------------- M3 通道 */
function channelSummary(ctx) {
  const R = ctx.rows;
  const total = sum(R.map(r => r.spend));
  const lo = MONTHS_ALL.indexOf(ctx.months[0]);
  return CH.map((c, ci) => {
    const cur = sum(R.map(r => r.cur[ci]));
    const users = R.filter(r => r.cur[ci] > 0).length;
    const prev = sum(R.map(r => r.prev[ci]));
    const trend = ctx.months.map((_, i) => sum(R.map(r => (r.m.ch ? r.m.ch[ci][lo + i] : 0))));
    return {
      channel: c, spend: cur, share: total ? cur / total : 0, users,
      penetration: R.length ? users / R.length : 0,
      arpu: users ? cur / users : 0, delta: pctDelta(cur, prev), trend
    };
  });
}

function tierChannelMix(ctx) {
  const tiers = TIER_ORDER.filter(t => sum(ctx.rows.filter(r => r.tier === t).map(r => r.spend)) > 0);
  return {
    tiers,
    series: CH.map((c, ci) => ({
      name: c,
      data: tiers.map(t => {
        const s = ctx.rows.filter(r => r.tier === t);
        const tot = sum(s.map(r => r.spend));
        return tot ? Math.round(sum(s.map(r => r.cur[ci])) / tot * 1000) / 10 : 0;
      })
    }))
  };
}

function tierChannelPenetration(ctx) {
  const tiers = TIER_ORDER.filter(t => ctx.rows.some(r => r.tier === t));
  return {
    tiers,
    series: CH.map((c, ci) => ({
      name: c,
      data: tiers.map(t => {
        const s = ctx.rows.filter(r => r.tier === t);
        return s.length ? Math.round(s.filter(r => r.cur[ci] > 0).length / s.length * 1000) / 10 : 0;
      })
    }))
  };
}

function sceneDepth(ctx) {
  const tiers = TIER_ORDER.filter(t => ctx.rows.some(r => r.tier === t));
  const avg = (t, k) => {
    const s = ctx.rows.filter(r => r.tier === t);
    return s.length ? Math.round(sum(s.map(r => r.m[k])) / s.length * 100) / 100 : 0;
  };
  return { tiers, scene: tiers.map(t => avg(t, 'scene')), depth: tiers.map(t => avg(t, 'depth')) };
}

/* ---------------------------------------------------------------- M5 预警 */
const RULES = [
  ['连续下降', '高危', '近3月消耗环比连续下降'],
  ['消耗断崖', '高危', '最近1月低于区间月均 40% 以上'],
  ['头部流失预警', '高危', 'SKA/KA 且生命周期=流失预警'],
  ['活跃衰减', '中危', '月均活跃发送天数 <5 天'],
  ['场景收缩', '中危', '触达场景数 ≤1 且分层在腰部及以上'],
  ['预算未消化', '关注', '可拓展预算空间占年度预算 >80%'],
  ['沉默超期', '关注', '区间零消耗且合作 ≥3 个月']
];
const RULE_LEVEL = Object.fromEntries(RULES.map(r => [r[0], r[1]]));
const RULE_DESC = Object.fromEntries(RULES.map(r => [r[0], r[2]]));
const LEVEL_ORDER = ['高危', '中危', '关注'];
const LEVEL_RANK = { '高危': 0, '中危': 1, '关注': 2 };
const RISK_WEIGHT = { '高危': 1, '中危': 0.5, '关注': 0.2, '正常': 0 };

function evaluateAlerts(ctx) {
  for (const r of ctx.rows) {
    const avg = r.spend / ctx.n;
    const hit = {
      '连续下降': r.m.trendTxt === '连续下降',
      '消耗断崖': avg > 10000 && r.last < avg * 0.6,
      '头部流失预警': (r.tier === 'SKA' || r.tier === 'KA') && r.m.lifecycle === '流失预警',
      '活跃衰减': r.m.activeDays < 5 && r.spend > 0,
      '场景收缩': r.m.scene <= 1 && ['SKA', 'KA', '腰部'].includes(r.tier),
      '预算未消化': r.headroom > r.m.budget * 0.8 && r.m.budget > 1e6,
      '沉默超期': r.spend <= 0 && r.m.coop >= 3
    };
    r.hit = hit;
    r.rules = RULES.map(x => x[0]).filter(k => hit[k]);
    r.level = r.rules.length
      ? r.rules.map(k => RULE_LEVEL[k]).sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0]
      : '正常';
    r.exposure = r.spend * RISK_WEIGHT[r.level];
  }
  return ctx;
}

function alertSummary(ctx) {
  const R = ctx.rows, hit = R.filter(r => r.level !== '正常');
  return {
    total: hit.length,
    share: R.length ? hit.length / R.length : 0,
    exposure: sum(R.map(r => r.exposure)),
    by_level: LEVEL_ORDER.map(lv => {
      const s = hit.filter(r => r.level === lv);
      return { level: lv, count: s.length, spend: sum(s.map(r => r.spend)) };
    }),
    by_rule: RULES.map(([name, level, desc]) => {
      const s = R.filter(r => r.hit[name]);
      return { rule: name, level, desc, count: s.length, spend: sum(s.map(r => r.spend)) };
    }).sort((a, b) => b.count - a.count)
  };
}

function alertTrend(ctx) {
  const lo = MONTHS_ALL.indexOf(ctx.months[0]);
  const risky = ctx.rows.filter(r => r.level === '高危' || r.level === '中危');
  const healthy = ctx.rows.filter(r => !(r.level === '高危' || r.level === '中危'));
  const series = arr => ctx.months.map((_, i) => sum(arr.map(r => r.monthly[i])));
  return { months: ctx.months, risky: series(risky), healthy: series(healthy) };
}

const alertRow = r => ({
  id: r.m.id, name: r.m.name, industry: r.m.industry, region: r.m.region,
  tier: r.tier, level: r.level, rules: r.rules, spend: r.spend,
  last: r.last, prev1: r.prev1, trend: r.m.trendTxt, scene: r.m.scene,
  score: r.score, owner: r.m.owner, headroom: r.headroom,
  exposure: r.exposure, strategy: r.strategy
});

function alertList(ctx, level, rule, limit = 200) {
  let hit = ctx.rows.filter(r => r.level !== '正常');
  if (level) hit = hit.filter(r => r.level === level);
  if (rule) hit = hit.filter(r => r.hit[rule]);
  return hit.sort((a, b) => (b.exposure - a.exposure) || (b.spend - a.spend))
    .slice(0, limit).map(alertRow);
}

/* ---------------------------------------------------------------- M6 动作 */
const RULE_ACTION = {
  '连续下降': '拉取近3月场景级消耗明细做归因，48h 内约客户复盘会，出止跌方案',
  '消耗断崖': '当日电话触达确认是否停投/切竞品，同步预算与排期，必要时上报大区',
  '头部流失预警': '启动头部保级流程：商务+解决方案双人上门，谈续约与年框',
  '活跃衰减': '推送场景模板库，配 1 次运营陪跑，把活跃发送天数拉回 8 天以上',
  '场景收缩': '按分层策略补场景：优先 AI外呼（大促催付/复购召回），目标场景数 +2',
  '预算未消化': '带「可拓展预算空间」数据上门，做大促作战包报价，抢下半年预算',
  '沉默超期': '断约归因回访，给回签政策/首充补贴，不投专属人力'
};
const SLA_DAYS = { '高危': 2, '中危': 5, '关注': 10 };

function buildActions(ctx, level, owner, limit = 120) {
  let hit = ctx.rows.filter(r => r.level !== '正常');
  if (level) hit = hit.filter(r => r.level === level);
  if (owner) hit = hit.filter(r => r.m.owner === owner);
  hit = hit.sort((a, b) => (b.exposure - a.exposure) || (b.spend - a.spend)).slice(0, limit);

  const today = new Date();
  return hit.map(r => {
    const top = r.rules.slice().sort((a, b) => LEVEL_RANK[RULE_LEVEL[a]] - LEVEL_RANK[RULE_LEVEL[b]])[0];
    const due = new Date(today.getTime() + SLA_DAYS[r.level] * 864e5);
    return {
      action_id: `AC-${r.m.id.slice(2)}-${top.slice(0, 2)}`,
      merchant_id: r.m.id, merchant: r.m.name, tier: r.tier, level: r.level,
      rules: r.rules, top_rule: top, reason: RULE_DESC[top], action: RULE_ACTION[top],
      strategy: r.strategy, spend: r.spend, exposure: r.exposure, headroom: r.headroom,
      owner: r.m.owner, region: r.m.region, industry: r.m.industry,
      due: due.toISOString().slice(0, 10), status: '待跟进'
    };
  });
}

function ownerWorkload(ctx) {
  const g = new Map();
  for (const r of ctx.rows.filter(x => x.level !== '正常')) {
    const e = g.get(r.m.owner) || { owner: r.m.owner, tasks: 0, critical: 0, exposure: 0 };
    e.tasks++; e.exposure += r.exposure; if (r.level === '高危') e.critical++;
    g.set(r.m.owner, e);
  }
  return [...g.values()].sort((a, b) => b.exposure - a.exposure);
}

const LEVEL_TEMPLATE = { '高危': 'red', '中危': 'orange', '关注': 'yellow' };
const yuan = n => '¥' + Math.round(n).toLocaleString('en-US');

function feishuCard(actions, window) {
  if (!actions.length) return {};
  const lines = actions.slice(0, 10).map(a =>
    `**${a.merchant}**（${a.tier}·${a.region}）｜${a.top_rule}\n` +
    `区间消耗 ${yuan(a.spend)}｜风险敞口 ${yuan(a.exposure)}｜可拓展预算 ${yuan(a.headroom)}\n` +
    `建议动作：${a.action}\n负责人：${a.owner}｜截止 ${a.due}`);
  const more = actions.length > 10
    ? `\n\n> 另有 ${actions.length - 10} 条未展开，点击进入大屏查看完整清单。` : '';
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: LEVEL_TEMPLATE[actions[0].level] || 'blue',
        title: { tag: 'plain_text', content: `【商家运营预警】${actions.length} 条待跟进 · ${window}` }
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n\n---\n\n') + more } },
        { tag: 'hr' },
        { tag: 'note', elements: [{ tag: 'plain_text', content: 'QuickAudience 商家分层大屏自动推送' }] },
        { tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '打开大屏' }, type: 'primary', url: '#alert' }] }
      ]
    }
  };
}

/* ---------------------------------------------------------------- api 契约 */
const DETAIL_SORT = {
  spend: r => r.spend, score: r => r.score, headroom: r => r.headroom,
  scene: r => r.m.scene, exposure: r => r.exposure
};
const PUSH_LOG = [];
const windowLabel = ctx => `${ctx.months[0]} ~ ${ctx.months[ctx.months.length - 1]}`;

function api(path, extra = {}) {
  const ctx = evaluateAlerts(buildCtx({
    start: state.start, end: state.end, rescore: state.rescore,
    filters: {
      industry: state.industry, region: state.region, source: state.source,
      contract: state.contract, tier: state.tier, strategic: state.strategic
    }
  }));

  let out;
  if (path === 'overview') {
    out = { kpi: kpi(ctx), trend: trendByChannel(ctx), tiers: tierSummary(ctx),
            lorenz: lorenz(ctx), industry: byDimension(ctx, 'industry'),
            region: byDimension(ctx, 'region') };
  } else if (path === 'tiering') {
    out = { tiers: tierSummary(ctx), quadrant: quadrant(ctx), matrix: tierIndustryMatrix(ctx),
            lifecycle: lifecycle(ctx), radar: tierRadar(ctx), migration: migration(ctx) };
  } else if (path === 'channel') {
    out = { summary: channelSummary(ctx), trend: trendByChannel(ctx), mix: tierChannelMix(ctx),
            penetration: tierChannelPenetration(ctx), scene: sceneDepth(ctx) };
  } else if (path === 'merchants') {
    let rows = ctx.rows;
    const q = (extra.q || '').trim();
    if (q) rows = rows.filter(r => r.m.name.includes(q) || r.m.id.toLowerCase().includes(q.toLowerCase()));
    if (extra.alert_only === '1') rows = rows.filter(r => r.level !== '正常');
    const key = DETAIL_SORT[extra.sort] || DETAIL_SORT.spend;
    rows = [...rows].sort((a, b) => key(b) - key(a));
    const page = Math.max(1, +extra.page || 1), size = Math.min(200, +extra.size || 30);
    out = {
      total: rows.length, page, size,
      rows: rows.slice((page - 1) * size, page * size).map(r => ({
        id: r.m.id, name: r.m.name, industry: r.m.industry, region: r.m.region,
        source: r.m.source, contract: r.m.contract, tier: r.tier, score: r.score,
        v: r.v, a: r.a, p: r.p, h: r.h, spend: r.spend,
        sms: r.cur[0], voice: r.cur[1], push: r.cur[2],
        scene: r.m.scene, depth: r.m.depth, trend: r.m.trendTxt,
        level: r.level, rules: r.rules, headroom: r.headroom, strategy: r.strategy,
        owner: r.m.owner, lifecycle: r.m.lifecycle, months: r.m.coop, strategic: r.m.strategic
      }))
    };
  } else if (path === 'alerts') {
    out = { summary: alertSummary(ctx), trend: alertTrend(ctx),
            list: alertList(ctx, extra.level, extra.rule) };
  } else if (path === 'actions') {
    const acts = buildActions(ctx, extra.level, extra.owner);
    out = { actions: acts, workload: ownerWorkload(ctx), history: PUSH_LOG,
            feishu_configured: false, preview: feishuCard(acts, windowLabel(ctx)) };
  }
  return Promise.resolve(out);
}

/* 网页版没有服务端，无法真的向飞书发 POST：这里生成与线上完全一致的报文并留痕，
   便于把卡片拷进飞书机器人调试台核对。Flask 版配置 FEISHU_WEBHOOK 后即为真实推送。 */
async function notify(ids, level, owner) {
  const ctx = evaluateAlerts(buildCtx({
    start: state.start, end: state.end, rescore: state.rescore,
    filters: { industry: state.industry, region: state.region, source: state.source,
               contract: state.contract, tier: state.tier, strategic: state.strategic }
  }));
  let acts = buildActions(ctx, level || '', owner || '', 200);
  if (ids && ids.length) acts = acts.filter(a => ids.includes(a.merchant_id));
  if (!acts.length) { toast('没有匹配的待办动作', true); return; }

  const card = feishuCard(acts, windowLabel(ctx));
  const recipients = [...new Set(acts.map(a => a.owner))].sort();
  PUSH_LOG.unshift({
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    recipients, note: `${acts.length} 条动作`, mode: '网页预览', ok: true,
    detail: '网页版无服务端，已生成报文未外发；Flask 版配置 FEISHU_WEBHOOK 后为真实推送'
  });
  PUSH_LOG.splice(50);
  showCard(card, acts.length, recipients);
  if (currentView === 'action') renderAction();
}
