/* 六个模块的渲染逻辑 */

/* ============================ M1 总览看板 ============================ */
async function renderOverview() {
  const box = document.getElementById('view-overview');
  const d = await api('overview');
  const k = d.kpi;

  box.innerHTML = `
    <div class="kpis">
      <div class="kpi hero">
        <div class="label">统计区间通道消耗总额</div>
        <div class="value">${fmtYuan(k.spend)}</div>
        <div class="foot">${deltaHtml(k.spend_delta)}<span>较上一等长周期</span></div>
        ${k.spend_trend.length >= 4 ? '<div class="spark" id="kpiSpark"></div>' : ''}
      </div>
      ${kpiTile('商家总数', fmtInt(k.merchants), '家', `筛选后覆盖商家`)}
      ${kpiTile('活跃商家数', fmtInt(k.active), '家', deltaHtml(k.active_delta))}
      ${kpiTile('户均消耗 ARPU', fmtYuan(k.arpu), '', '消耗总额 ÷ 活跃商家')}
      ${kpiTile('未激活商家', fmtInt(k.dormant), '家', '区间零消耗且合作≥3月')}
      ${kpiTile('SKA+KA 消耗占比', fmtPct(k.head_share), '',
        k.head_share >= 0.6 ? '<span class="delta up">✓ 金字塔健康（>60%）</span>'
                            : '<span class="delta down">▲ 低于健康线 60%</span>')}
      ${kpiTile('平均触达场景数', k.avg_scene.toFixed(2), '个', '层间差距的核心解释变量')}
    </div>

    <div class="card c8"><h3>通道消耗趋势 <span class="sub">按月 · 三通道堆叠</span></h3>
      <div class="chart tall" id="ovTrend"></div></div>

    <div class="card c4"><h3>分层金字塔 <span class="sub">家数 / 消耗贡献</span></h3>
      <div class="chart tall" id="ovPyramid"></div></div>

    <div class="card c5"><h3>消耗集中度 <span class="sub">洛伦兹曲线</span></h3>
      <div class="chart" id="ovLorenz"></div>
      <p class="note">头部 10% 商家贡献 <b>${fmtPct(d.lorenz.top10)}</b> 的通道消耗。曲线离对角线越远，收入越集中在头部。</p></div>

    <div class="card c4"><h3>行业消耗分布 <span class="sub">TOP 8</span></h3>
      <div class="chart" id="ovIndustry"></div></div>

    <div class="card c3"><h3>区域消耗分布</h3>
      <div class="chart" id="ovRegion"></div></div>

    <div class="card c12"><h3>分层结构总表 <span class="sub">家数 · 消耗 · 平均分 · 策略定性</span></h3>
      ${tierTable(d.tiers)}</div>`;

  if (k.spend_trend.length >= 4) chart('kpiSpark', sparkOption(k.spend_trend));
  drawTrend('ovTrend', d.trend, true);
  drawPyramid('ovPyramid', d.tiers);
  drawLorenz('ovLorenz', d.lorenz);
  drawDimBar('ovIndustry', d.industry.slice(0, 8));
  drawDimBar('ovRegion', d.region);
}

const kpiTile = (label, value, unit, foot) => `
  <div class="kpi"><div class="label">${label}</div>
    <div class="value">${value}<span class="unit">${unit}</span></div>
    <div class="foot">${foot}</div></div>`;

function tierTable(tiers) {
  return `<div class="tablewrap"><table>
    <thead><tr><th>层级</th><th class="num">家数</th><th class="num">家数占比</th>
      <th class="num">区间消耗</th><th class="num">消耗占比</th><th class="num">平均综合分</th>
      <th class="num">平均场景数</th><th>策略定性 / 通道动作</th></tr></thead>
    <tbody>${tiers.map(t => `<tr>
      <td>${tierSwatch(t.tier)}</td>
      <td class="num">${fmtInt(t.count)}</td><td class="num">${fmtPct(t.count_share)}</td>
      <td class="num">${fmtYuan(t.spend)}</td><td class="num">${fmtPct(t.spend_share)}</td>
      <td class="num">${t.avg_score.toFixed(1)}</td><td class="num">${t.avg_scene.toFixed(2)}</td>
      <td style="white-space:normal;color:var(--ink-2)">${esc(t.strategy)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function drawTrend(id, t, stacked) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C.baseline } },
      valueFormatter: v => fmtYuan(v) },
    legend: { ...legendBase, data: t.series.map(s => s.name) },
    grid: stacked ? gridBase : { ...gridBase, right: 118 },
    xAxis: catAxis(t.months, { boundaryGap: !!stacked }),
    yAxis: moneyAxis(),
    series: t.series.map(s => ({
      name: s.name, type: stacked ? 'bar' : 'line', stack: stacked ? 'a' : undefined,
      data: s.data, ...(stacked ? BAR : {}),
      smooth: 0.3, symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 2 }, showSymbol: !stacked,
      itemStyle: stacked ? { color: C.channel[s.name], ...STACK_GAP, borderRadius: 0 }
                         : { color: C.channel[s.name], borderColor: C.surface, borderWidth: 2 },
      endLabel: !stacked ? { show: true, color: C.ink2, fontSize: 11, distance: 6,
        formatter: p => `${p.seriesName} ${fmtMoney(p.value)}` } : undefined
    }))
  });
}

function drawPyramid(id, tiers) {
  const rows = tiers.slice().reverse();
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${p.name}<br/>家数 ${fmtInt(p.value)}（${fmtPct(rows[p.dataIndex].count_share)}）<br/>消耗 ${fmtYuan(rows[p.dataIndex].spend)}（${fmtPct(rows[p.dataIndex].spend_share)}）` },
    grid: { ...gridBase, top: 12, right: 132 },
    xAxis: { type: 'value', show: false },
    yAxis: catAxis(rows.map(r => r.tier), { axisLine: { show: false } }),
    series: [{
      type: 'bar', data: rows.map(r => ({ value: r.count, itemStyle: { color: C.tier[r.tier] } })),
      ...BAR_H,
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11,
        formatter: p => `${fmtInt(p.value)} 家 · 消耗 ${fmtPct(rows[p.dataIndex].spend_share, 0)}` }
    }]
  });
}

function drawLorenz(id, lz) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis',
      formatter: p => `前 ${p[0].value[0]}% 商家<br/>累计贡献 ${p[0].value[1]}% 消耗` },
    grid: { ...gridBase, top: 16 },
    xAxis: { type: 'value', max: 100, name: '累计商家占比 %', nameLocation: 'middle', nameGap: 26,
      nameTextStyle: { color: C.ink3, fontSize: 11 }, axisLabel, axisLine: { show: false },
      axisTick: { show: false }, splitLine },
    yAxis: { type: 'value', max: 100, name: '累计消耗占比 %', axisLabel, axisLine: { show: false },
      axisTick: { show: false }, splitLine, nameTextStyle: { color: C.ink3, fontSize: 11 } },
    series: [
      { type: 'line', data: [[0, 0], [100, 100]], symbol: 'none',
        lineStyle: { color: C.baseline, width: 1 }, tooltip: { show: false }, silent: true },
      { type: 'line', data: lz.points, symbol: 'none', smooth: 0.2,
        lineStyle: { width: 2, color: C.tier.KA }, areaStyle: { color: C.tier.KA, opacity: 0.10 } }
    ]
  });
}

function drawDimBar(id, rows) {
  const el = document.getElementById(id);
  if (rows.length < 2) {
    el.style.height = 'auto';
    el.innerHTML = rows.length
      ? `<div style="padding:26px 2px"><div style="font-size:12px;color:var(--ink-3)">${esc(rows[0].name)}</div>
         <div style="font-size:26px;font-weight:650;margin-top:4px">${fmtYuan(rows[0].spend)}</div>
         <div style="font-size:11.5px;color:var(--ink-3);margin-top:4px">${fmtInt(rows[0].count)} 家 · 当前筛选下仅此一个类目</div></div>`
      : '<div class="empty">当前筛选下没有数据</div>';
    return;
  }
  const data = rows.slice().reverse();
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${p.name}<br/>消耗 ${fmtYuan(p.value)}<br/>商家 ${fmtInt(data[p.dataIndex].count)} 家` },
    grid: { ...gridBase, top: 12, right: 66 },
    xAxis: { type: 'value', show: false },
    yAxis: catAxis(data.map(r => r.name), { axisLine: { show: false } }),
    series: [{
      type: 'bar', data: data.map(r => r.spend), ...BAR_H, itemStyle: { color: C.tier.KA, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => fmtYuan(p.value) }
    }]
  });
}

/* ============================ M2 客户分层 ============================ */
async function renderTiering() {
  const box = document.getElementById('view-tiering');
  const d = await api('tiering');
  const q = d.quadrant.counts;

  box.innerHTML = `
    <div class="card c12"><h3>分层结构：家数 vs 消耗贡献 <span class="sub">上条为家数结构、下条为消耗结构，段内直接标注层级</span></h3>
      <div class="chart short" id="tiStruct"></div>
      <div class="legend">${d.tiers.map(t => `<span><i style="background:${C.tier[t.tier]}"></i>${t.tier}</span>`).join('')}</div></div>

    <div class="card c7"><h3>价值 × 潜力 四象限 <span class="sub">气泡大小 = 区间消耗；${q['高潜新签']} 家高潜新签、${q['衰退KA']} 家衰退KA 已单独标注</span></h3>
      <div class="chart tall" id="tiQuad"></div>
      <p class="note">象限口径：价值分 ≥20（40 分制中位）为高价值，潜力分 ≥21（30 分制 70%）为高潜力。右上=核心经营、右下=培育成长、左上=成熟守护、左下=自助长尾。</p></div>

    <div class="card c5"><h3>各层四维能力 <span class="sub">价值 / 活跃 / 潜力 / 健康 平均分</span></h3>
      <div class="chart tall" id="tiRadar"></div></div>

    <div class="card c7"><h3>分层 × 行业 分布 <span class="sub">单位：家</span></h3>
      <div class="chart" id="tiMatrix"></div></div>

    <div class="card c5"><h3>生命周期阶段分布</h3>
      <div class="chart" id="tiLife"></div></div>

    <div class="card c12"><h3>升降级候选 <span class="sub">区间分层 vs 年度基准分层不一致的商家（按打分卡：连续 2 个周期跨档才执行升降级）</span></h3>
      ${migrationTable(d.migration)}</div>`;

  drawTierStruct('tiStruct', d.tiers);
  drawQuadrant('tiQuad', d.quadrant);
  drawRadar('tiRadar', d.radar);
  drawMatrix('tiMatrix', d.matrix);
  drawLifecycle('tiLife', d.lifecycle);
}

function drawTierStruct(id, tiers) {
  const rows = [{ key: '消耗结构', f: t => t.spend_share }, { key: '家数结构', f: t => t.count_share }];
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item', formatter: p => `${p.seriesName}<br/>${p.name} ${p.value.toFixed(1)}%` },
    grid: { ...gridBase, top: 10, left: 8 },
    xAxis: { type: 'value', max: 100, show: false },
    yAxis: catAxis(rows.map(r => r.key), { axisLine: { show: false } }),
    series: tiers.map(t => ({
      name: t.tier, type: 'bar', stack: 's', barMaxWidth: 34,
      data: rows.map(r => +(r.f(t) * 100).toFixed(1)),
      itemStyle: { color: C.tier[t.tier], ...STACK_GAP },
      label: {
        show: true, color: '#0d1016', fontSize: 11, fontWeight: 600,
        // 段太窄放不下就不画标签，绝不裁字
        formatter: p => (p.value >= 9 ? `${t.tier} ${p.value.toFixed(0)}%` : p.value >= 4 ? `${p.value.toFixed(0)}%` : '')
      }
    }))
  });
}

function drawQuadrant(id, qd) {
  const style = {
    '常规': { color: C.tier.KA, opacity: 0.5, symbol: 'circle' },
    '高潜新签': { color: C.status.关注, opacity: 0.95, symbol: 'triangle' },
    '衰退KA': { color: C.status.高危, opacity: 0.95, symbol: 'diamond' }
  };
  const maxSpend = Math.max(1, ...Object.values(qd.groups).flat().map(p => p[2]));
  chart(id, {
    tooltip: {
      ...tooltipBase, trigger: 'item',
      formatter: p => `${esc(p.value[3])}（${p.value[4]}）<br/>潜力分 ${p.value[0]}｜价值分 ${p.value[1]}<br/>区间消耗 ${fmtYuan(p.value[2])}<br/><span style="color:#868d9c">${p.seriesName}</span>`
    },
    legend: { ...legendBase, data: Object.keys(qd.groups) },
    grid: { ...gridBase, top: 36, right: 24, bottom: 26 },
    xAxis: { type: 'value', name: '潜力分 (0-30)', min: 0, max: 30, nameLocation: 'middle', nameGap: 28,
      nameTextStyle: { color: C.ink3, fontSize: 11 },
      axisLabel, axisLine: { show: false }, axisTick: { show: false }, splitLine },
    yAxis: { type: 'value', name: '价值分 (0-40)', min: 0, max: 40, nameTextStyle: { color: C.ink3, fontSize: 11 },
      axisLabel, axisLine: { show: false }, axisTick: { show: false }, splitLine },
    series: Object.entries(qd.groups).map(([name, pts], i) => ({
      name, type: 'scatter', data: pts, symbol: style[name].symbol,
      symbolSize: v => 6 + 22 * Math.sqrt(v[2] / maxSpend),
      itemStyle: { color: style[name].color, opacity: style[name].opacity,
        borderColor: C.surface, borderWidth: name === '常规' ? 0 : 2 },
      z: i + 2,
      // 象限分割线直接标注阈值；象限名写在图下说明里，避免文字压在气泡上
      markLine: i === 0 ? {
        silent: true, symbol: 'none',
        lineStyle: { color: C.baseline, width: 1 },
        label: { color: C.ink3, fontSize: 10.5, formatter: p => p.name },
        data: [{ xAxis: 21, name: '高潜力线 21', label: { position: 'insideEndTop' } },
               { yAxis: 20, name: '高价值线 20', label: { position: 'insideStartTop' } }]
      } : undefined
    }))
  });
}

function drawRadar(id, rows) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item' },
    legend: { ...legendBase, data: rows.map(r => r.tier), top: 'auto', bottom: 0, right: 'auto', left: 'center' },
    radar: {
      indicator: [{ name: '价值', max: 40 }, { name: '活跃', max: 20 },
                  { name: '潜力', max: 30 }, { name: '健康', max: 10 }],
      radius: '62%', center: ['50%', '47%'],
      axisName: { color: C.ink2, fontSize: 11.5 },
      splitLine: { lineStyle: { color: C.line } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.012)', 'transparent'] } },
      axisLine: { lineStyle: { color: C.line } }
    },
    series: [{
      type: 'radar', symbolSize: 5,
      data: rows.map(r => ({
        name: r.tier, value: r.value,
        lineStyle: { width: 2, color: C.tier[r.tier] },
        itemStyle: { color: C.tier[r.tier] },
        areaStyle: { color: C.tier[r.tier], opacity: 0.10 }
      }))
    }]
  });
}

function drawMatrix(id, m) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${m.tiers[p.value[1]]} × ${m.industries[p.value[0]]}<br/>${fmtInt(p.value[2])} 家` },
    grid: { ...gridBase, top: 10, bottom: 26, right: 60 },
    xAxis: catAxis(m.industries, { splitArea: { show: false }, axisLabel: { ...axisLabel, interval: 0, rotate: 0 } }),
    yAxis: catAxis(m.tiers.slice().reverse(), { axisLine: { show: false } }),
    visualMap: {
      min: 0, max: m.max, calculable: false, orient: 'vertical', right: 0, top: 'middle',
      itemHeight: 110, itemWidth: 10, textStyle: { color: C.ink3, fontSize: 10.5 },
      inRange: { color: C.seq.slice(0, 6) }
    },
    series: [{
      type: 'heatmap',
      data: m.data.map(([x, y, v]) => [x, m.tiers.length - 1 - y, v]),
      label: { show: true, color: '#0b1016', fontSize: 10.5, fontWeight: 600,
        formatter: p => (p.value[2] ? p.value[2] : '') },
      itemStyle: { borderColor: C.surface, borderWidth: 2, borderRadius: 3 }
    }]
  });
}

function drawLifecycle(id, rows) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${p.name}<br/>${fmtInt(p.value)} 家<br/>消耗 ${fmtYuan(rows[p.dataIndex].spend)}` },
    grid: { ...gridBase, top: 12, right: 60 },
    xAxis: { type: 'value', show: false },
    yAxis: catAxis(rows.map(r => r.name).reverse(), { axisLine: { show: false } }),
    series: [{
      type: 'bar', data: rows.map(r => r.count).reverse(), ...BAR_H,
      itemStyle: { color: C.tier.腰部, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => `${fmtInt(p.value)} 家` }
    }]
  });
}

function migrationTable(rows) {
  if (!rows.length) return `<div class="empty">当前窗口下没有与年度基准不一致的分层结果。</div>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>商家</th><th>行业动作</th><th>年度基准层</th><th>区间层</th>
      <th class="num">基准分</th><th class="num">区间分</th><th class="num">区间消耗</th><th>负责销售</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(r.name)} <span class="tag">${r.id}</span></td>
      <td>${r.direction === '升级'
            ? '<span class="pill lv-正常">↑ 升级候选</span>'
            : '<span class="pill lv-高危">↓ 降级预警</span>'}</td>
      <td>${tierSwatch(r.from)}</td><td>${tierSwatch(r.to)}</td>
      <td class="num">${r.base_score.toFixed(1)}</td><td class="num">${r.score.toFixed(1)}</td>
      <td class="num">${fmtYuan(r.spend)}</td><td>${esc(r.owner)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================ M3 产品/通道消耗 ============================ */
async function renderChannel() {
  const box = document.getElementById('view-channel');
  const d = await api('channel');

  box.innerHTML = `
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      ${d.summary.map((c, i) => `
        <div class="kpi"><div class="label"><span class="swatch" style="background:${C.channel[c.channel]}"></span>${c.channel} 消耗</div>
          <div class="value">${fmtYuan(c.spend)}</div>
          <div class="foot">${deltaHtml(c.delta)}<span>占比 ${fmtPct(c.share)}</span>
            <span>ARPU ${fmtYuan(c.arpu)}</span><span>渗透 ${fmtPct(c.penetration)}</span></div>
          ${c.trend.length >= 4 ? `<div class="spark" id="chSpark${i}"></div>` : ''}</div>`).join('')}
    </div>

    <div class="card c8"><h3>三通道月度趋势 <span class="sub">端点直接标值</span></h3>
      <div class="chart tall" id="chTrend"></div></div>

    <div class="card c4"><h3>通道消耗结构</h3>
      <div class="chart tall" id="chDonut"></div></div>

    <div class="card c6"><h3>分层 × 通道消耗结构 <span class="sub">每层内部占比 %</span></h3>
      <div class="chart" id="chMix"></div>
      <p class="note">各层通道结构高度一致（短信≈56%/外呼≈29%/Push企微≈15%）——层间差距不在「用哪个通道」，而在「用了几个场景」。</p></div>

    <div class="card c6"><h3>分层 × 通道渗透率 <span class="sub">该层中使用过该通道的商家占比 %</span></h3>
      <div class="chart" id="chPen"></div>
      <p class="note">有消耗的商家三通道基本全覆盖，渗透率的差异主要出现在「新客观察期 / 未激活」两层——通道不是问题，激活才是。</p></div>

    <div class="card c12"><h3>场景与数据接入渗透 <span class="sub">各层平均触达场景数（0-6）与数据接入深度（0-3）</span></h3>
      <div class="chart short" id="chScene"></div></div>`;

  d.summary.forEach((c, i) => { if (c.trend.length >= 4) chart('chSpark' + i, sparkOption(c.trend, C.channel[c.channel])); });
  drawTrend('chTrend', d.trend, false);
  drawDonut('chDonut', d.summary);
  drawMix('chMix', d.mix);
  drawPenetration('chPen', d.penetration);
  drawScene('chScene', d.scene);
}

function drawDonut(id, rows) {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  chart(id, {
    title: {
      text: fmtYuan(total), subtext: '区间通道消耗合计',
      left: 'center', top: '40%', textAlign: 'center',
      textStyle: { color: C.ink, fontSize: 21, fontWeight: 600 },
      subtextStyle: { color: C.ink3, fontSize: 11 }
    },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: p => `${p.name}<br/>${fmtYuan(p.value)}（${p.percent}%）` },
    legend: { ...legendBase, bottom: 0, top: 'auto', left: 'center', right: 'auto' },
    series: [{
      type: 'pie', radius: ['54%', '76%'], center: ['50%', '46%'], avoidLabelOverlap: true,
      data: rows.map(r => ({ name: r.channel, value: r.spend, itemStyle: { color: C.channel[r.channel] } })),
      itemStyle: { borderColor: C.surface, borderWidth: 2 },
      label: { color: C.ink2, fontSize: 11, formatter: p => `${p.name} ${(+p.percent).toFixed(1)}%` },
      labelLine: { lineStyle: { color: C.baseline }, length: 8, length2: 12 }
    }]
  });
}

function drawMix(id, mix) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: v => v + '%' },
    legend: { ...legendBase, data: mix.series.map(s => s.name) },
    grid: { ...gridBase, top: 34 },
    xAxis: { type: 'value', max: 100, axisLabel: { ...axisLabel, formatter: '{value}%' },
      axisLine: { show: false }, axisTick: { show: false }, splitLine },
    yAxis: catAxis(mix.tiers.slice().reverse(), { axisLine: { show: false } }),
    series: mix.series.map(s => ({
      name: s.name, type: 'bar', stack: 'm', barMaxWidth: 20,
      data: s.data.slice().reverse(),
      itemStyle: { color: C.channel[s.name], ...STACK_GAP },
      label: { show: true, color: '#0d1016', fontSize: 10.5, fontWeight: 600,
        formatter: p => (p.value >= 12 ? p.value.toFixed(0) + '%' : '') }
    }))
  });
}

function drawPenetration(id, pen) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => v + '%' },
    legend: { ...legendBase, data: pen.series.map(s => s.name) },
    grid: gridBase,
    xAxis: catAxis(pen.tiers),
    yAxis: { type: 'value', max: 100, axisLabel: { ...axisLabel, formatter: '{value}%' },
      axisLine: { show: false }, axisTick: { show: false }, splitLine },
    series: pen.series.map(s => ({
      name: s.name, type: 'bar', data: s.data, ...BAR,
      itemStyle: { color: C.channel[s.name], borderRadius: [4, 4, 0, 0] }
    }))
  });
}

function drawScene(id, sc) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { ...legendBase, data: ['平均触达场景数', '平均数据接入深度'] },
    grid: { ...gridBase, top: 34 },
    xAxis: catAxis(sc.tiers),
    yAxis: { type: 'value', axisLabel, axisLine: { show: false }, axisTick: { show: false }, splitLine },
    series: [
      { name: '平均触达场景数', type: 'bar', data: sc.scene, ...BAR,
        itemStyle: { color: C.tier.KA, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: C.ink2, fontSize: 11 } },
      { name: '平均数据接入深度', type: 'bar', data: sc.depth, ...BAR,
        itemStyle: { color: '#c98500', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: C.ink3, fontSize: 11 } }
    ]
  });
}

/* ============================ M4 商家明细 ============================ */
async function renderDetail() {
  const box = document.getElementById('view-detail');
  const d = await api('merchants', {
    page: state.detailPage, size: 30, sort: state.detailSort,
    q: state.detailQ, alert_only: state.detailAlertOnly ? '1' : ''
  });
  const pages = Math.max(1, Math.ceil(d.total / d.size));

  box.innerHTML = `
    <div class="card c12">
      <h3>商家明细与运营动作 <span class="sub">共 ${fmtInt(d.total)} 家 · 第 ${d.page}/${pages} 页</span></h3>
      <div class="chiprow" style="margin:10px 0 2px;flex-wrap:wrap;align-items:center;gap:8px">
        <input type="search" id="dtQ" placeholder="搜索商家名称 / ID" value="${esc(state.detailQ)}" style="min-width:190px">
        <select id="dtSort">
          <option value="spend">按区间消耗排序</option>
          <option value="score">按综合分排序</option>
          <option value="exposure">按风险敞口排序</option>
          <option value="headroom">按可拓展预算排序</option>
          <option value="scene">按触达场景数排序</option>
        </select>
        <button class="chip ${state.detailAlertOnly ? 'on' : ''}" id="dtAlert">只看预警商家</button>
        <span class="spacer"></span>
        <button class="btn ghost" id="dtPrev" ${d.page <= 1 ? 'disabled' : ''}>上一页</button>
        <button class="btn ghost" id="dtNext" ${d.page >= pages ? 'disabled' : ''}>下一页</button>
      </div>
      <div class="tablewrap"><table>
        <thead><tr>
          <th>商家</th><th>行业</th><th>区域</th><th>分层</th><th class="num">综合分</th>
          <th class="num">价值/活跃/潜力/健康</th><th class="num">区间消耗</th>
          <th class="num">短信</th><th class="num">AI外呼</th><th class="num">Push企微</th>
          <th class="num">场景</th><th class="num">接入</th><th>近3月趋势</th><th>预警</th>
          <th class="num">可拓展预算</th><th>推荐运营动作</th><th>负责销售</th><th></th>
        </tr></thead>
        <tbody>${d.rows.map(rowHtml).join('')}</tbody>
      </table></div>
      <p class="note">「可拓展预算空间」= 年度营销预算 − 年化区间消耗，是销售谈增量的报价天花板；「推荐运营动作」由分层策略与命中预警规则合成。</p>
    </div>`;

  document.getElementById('dtSort').value = state.detailSort;
  document.getElementById('dtQ').addEventListener('change', e => {
    state.detailQ = e.target.value.trim(); state.detailPage = 1; renderDetail();
  });
  document.getElementById('dtSort').addEventListener('change', e => {
    state.detailSort = e.target.value; state.detailPage = 1; renderDetail();
  });
  document.getElementById('dtAlert').addEventListener('click', () => {
    state.detailAlertOnly = !state.detailAlertOnly; state.detailPage = 1; renderDetail();
  });
  document.getElementById('dtPrev').addEventListener('click', () => { state.detailPage--; renderDetail(); });
  document.getElementById('dtNext').addEventListener('click', () => { state.detailPage++; renderDetail(); });
  box.querySelectorAll('[data-notify]').forEach(b =>
    b.addEventListener('click', () => notify([b.dataset.notify])));
}

function rowHtml(r) {
  return `<tr>
    <td>${esc(r.name)} <span class="tag">${r.id}</span>${r.strategic === '是' ? '<span class="tag">战略</span>' : ''}</td>
    <td>${esc(r.industry)}</td><td>${esc(r.region)}</td>
    <td>${tierSwatch(r.tier)}</td><td class="num">${r.score.toFixed(1)}</td>
    <td class="num" style="color:var(--ink-3)">${r.v.toFixed(0)}/${r.a.toFixed(0)}/${r.p.toFixed(0)}/${r.h.toFixed(1)}</td>
    <td class="num">${fmtYuan(r.spend)}</td>
    <td class="num">${fmtYuan(r.sms)}</td><td class="num">${fmtYuan(r.voice)}</td><td class="num">${fmtYuan(r.push)}</td>
    <td class="num">${r.scene}</td><td class="num">${r.depth}</td>
    <td>${esc(r.trend)}</td>
    <td>${levelPill(r.level)}${r.rules.slice(0, 2).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</td>
    <td class="num">${fmtYuan(r.headroom)}</td>
    <td style="white-space:normal;max-width:290px;color:var(--ink-2)">${esc(r.strategy)}</td>
    <td>${esc(r.owner)}</td>
    <td><button class="btn" data-notify="${r.id}" ${r.level === '正常' ? 'disabled' : ''}>推送飞书</button></td>
  </tr>`;
}

/* ============================ M5 预警看板 ============================ */
async function renderAlert() {
  const box = document.getElementById('view-alert');
  const d = await api('alerts', { level: state.alertLevel, rule: state.alertRule });
  const s = d.summary;

  box.innerHTML = `
    <div class="kpis">
      ${kpiTile('预警商家总数', fmtInt(s.total), '家', `占筛选商家 ${fmtPct(s.share)}`)}
      ${s.by_level.map(l => kpiTile(
        `<span style="color:${C.status[l.level]}">${LEVEL_ICON[l.level]}</span> ${l.level}商家`,
        fmtInt(l.count), '家', `涉及消耗 ${fmtYuan(l.spend)}`)).join('')}
    </div>

    <div class="card c12" style="border-left:3px solid var(--critical)">
      <h3>加权风险敞口 <span class="sub">高危按 100% / 中危 50% / 关注 20% 折算区间消耗</span></h3>
      <div style="font-size:44px;font-weight:650;letter-spacing:-1px;margin-top:4px">${fmtYuan(s.exposure)}</div>
      <div class="legend" style="margin-top:10px">
        ${s.by_level.map(l => `<span><i style="background:${C.status[l.level]}"></i>${l.level} ${fmtInt(l.count)} 家 · 涉及消耗 ${fmtYuan(l.spend)}</span>`).join('')}
      </div>
      <p class="note">敞口不是已损失金额，而是「若不干预、按当前趋势可能流失」的消耗量级，用于给运营资源排优先级。</p>
    </div>

    <div class="card c5"><h3>预警等级分布</h3>
      <div class="chart" id="alLevel"></div>
      <div class="legend">${s.by_level.map(l => `<span><i style="background:${C.status[l.level]}"></i>${LEVEL_ICON[l.level]} ${l.level}</span>`).join('')}</div></div>

    <div class="card c7"><h3>预警规则命中量 <span class="sub">点击柱条筛选下方清单</span></h3>
      <div class="chart" id="alRule"></div></div>

    <div class="card c12"><h3>预警商家 vs 健康商家 消耗走势 <span class="sub">高危+中危商家合计</span></h3>
      <div class="chart short" id="alTrend"></div></div>

    <div class="card c12">
      <h3>预警清单 <span class="sub">按风险敞口降序，最多 200 条</span></h3>
      <div class="chiprow" style="margin:10px 0 2px;flex-wrap:wrap;align-items:center;gap:8px">
        ${['', '高危', '中危', '关注'].map(l => `<button class="chip ${state.alertLevel === l ? 'on' : ''}" data-lv="${l}">${l || '全部等级'}</button>`).join('')}
        ${state.alertRule ? `<span class="tag">规则：${esc(state.alertRule)} <b style="cursor:pointer" id="clearRule">×</b></span>` : ''}
        <span class="spacer"></span>
        <button class="btn" id="alNotify">批量推送当前清单到飞书</button>
      </div>
      ${alertTable(d.list)}
    </div>`;

  drawAlertLevel('alLevel', s.by_level);
  drawAlertRule('alRule', s.by_rule);
  drawAlertTrend('alTrend', d.trend);

  box.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => {
    state.alertLevel = b.dataset.lv; renderAlert();
  }));
  const cr = document.getElementById('clearRule');
  cr && cr.addEventListener('click', () => { state.alertRule = ''; renderAlert(); });
  document.getElementById('alNotify').addEventListener('click', () => notify(null, state.alertLevel));
  box.querySelectorAll('[data-notify]').forEach(b =>
    b.addEventListener('click', () => notify([b.dataset.notify])));
}

function drawAlertLevel(id, rows) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${LEVEL_ICON[p.name]} ${p.name}<br/>${fmtInt(p.value)} 家（${p.percent}%）<br/>涉及消耗 ${fmtYuan(rows[p.dataIndex].spend)}` },
    series: [{
      type: 'pie', radius: ['48%', '72%'], center: ['50%', '50%'],
      data: rows.map(r => ({ name: r.level, value: r.count, itemStyle: { color: C.status[r.level] } })),
      itemStyle: { borderColor: C.surface, borderWidth: 2 },
      label: { color: C.ink2, fontSize: 11.5, formatter: p => `${LEVEL_ICON[p.name]} ${p.name}\n${fmtInt(p.value)} 家` },
      labelLine: { lineStyle: { color: C.baseline } }
    }]
  });
}

function drawAlertRule(id, rows) {
  const data = rows.slice().reverse();
  const inst = chart(id, {
    tooltip: { ...tooltipBase, trigger: 'item',
      formatter: p => `${p.name}（${data[p.dataIndex].level}）<br/>${esc(data[p.dataIndex].desc)}<br/>命中 ${fmtInt(p.value)} 家｜涉及消耗 ${fmtYuan(data[p.dataIndex].spend)}` },
    grid: { ...gridBase, top: 10, right: 62 },
    xAxis: { type: 'value', show: false },
    yAxis: catAxis(data.map(r => r.rule), { axisLine: { show: false } }),
    series: [{
      type: 'bar', ...BAR_H,
      data: data.map(r => ({ value: r.count, itemStyle: { color: C.status[r.level], borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => `${fmtInt(p.value)} 家` }
    }]
  });
  inst && inst.on('click', p => { state.alertRule = p.name; state.alertLevel = ''; renderAlert(); });
}

function drawAlertTrend(id, t) {
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: v => fmtYuan(v) },
    legend: { ...legendBase, data: ['预警商家', '健康商家'] },
    grid: { ...gridBase, top: 30, right: 118 },
    xAxis: catAxis(t.months, { boundaryGap: false }),
    yAxis: moneyAxis(),
    series: [
      { name: '预警商家', type: 'line', data: t.risky, smooth: 0.3, symbol: 'circle', symbolSize: 8,
        lineStyle: { width: 2, color: C.status.高危 },
        itemStyle: { color: C.status.高危, borderColor: C.surface, borderWidth: 2 },
        areaStyle: { color: C.status.高危, opacity: 0.10 },
        endLabel: { show: true, color: C.ink2, fontSize: 11, formatter: p => `预警 ${fmtMoney(p.value)}` } },
      { name: '健康商家', type: 'line', data: t.healthy, smooth: 0.3, symbol: 'circle', symbolSize: 8,
        lineStyle: { width: 2, color: C.tier.KA },
        itemStyle: { color: C.tier.KA, borderColor: C.surface, borderWidth: 2 },
        endLabel: { show: true, color: C.ink2, fontSize: 11, formatter: p => `健康 ${fmtMoney(p.value)}` } }
    ]
  });
}

function alertTable(rows) {
  if (!rows.length) return `<div class="empty">当前筛选条件下没有预警商家。</div>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>等级</th><th>商家</th><th>分层</th><th>行业/区域</th><th>命中规则</th>
      <th class="num">区间消耗</th><th class="num">最近月</th><th class="num">上月</th>
      <th class="num">场景</th><th class="num">风险敞口</th><th class="num">可拓展预算</th>
      <th>负责销售</th><th></th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${levelPill(r.level)}</td>
      <td>${esc(r.name)} <span class="tag">${r.id}</span></td>
      <td>${tierSwatch(r.tier)}</td>
      <td style="color:var(--ink-3)">${esc(r.industry)} / ${esc(r.region)}</td>
      <td style="white-space:normal;max-width:230px">${r.rules.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</td>
      <td class="num">${fmtYuan(r.spend)}</td>
      <td class="num">${fmtYuan(r.last)}</td><td class="num" style="color:var(--ink-3)">${fmtYuan(r.prev1)}</td>
      <td class="num">${r.scene}</td>
      <td class="num" style="color:${C.status[r.level]}">${fmtYuan(r.exposure)}</td>
      <td class="num">${fmtYuan(r.headroom)}</td>
      <td>${esc(r.owner)}</td>
      <td><button class="btn" data-notify="${r.id}">推送</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ============================ M6 动作提醒 & 飞书 ============================ */
async function renderAction() {
  const box = document.getElementById('view-action');
  const d = await api('actions', { level: state.actionLevel, owner: state.actionOwner });

  box.innerHTML = `
    <div class="card c12">
      <h3>运营动作提醒 <span class="sub">由「分层策略 × 命中预警规则」自动生成，按风险敞口排序</span></h3>
      <div class="chiprow" style="margin:10px 0 2px;flex-wrap:wrap;align-items:center;gap:8px">
        ${['', '高危', '中危', '关注'].map(l => `<button class="chip ${state.actionLevel === l ? 'on' : ''}" data-alv="${l}">${l || '全部等级'}</button>`).join('')}
        <select id="acOwner"><option value="">全部销售</option>
          ${(META.owners || []).map(o => `<option value="${o}" ${state.actionOwner === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <span class="spacer"></span>
        <span class="hint">${d.feishu_configured
          ? '飞书 Webhook 已配置，推送将直发群机器人'
          : '未配置 FEISHU_WEBHOOK，推送进入 Dry-run（只生成卡片不外发）'}</span>
        <button class="btn" id="acNotify">批量推送 ${d.actions.length} 条到飞书</button>
      </div>
      <div class="actions">${d.actions.slice(0, 24).map(actCard).join('') || '<div class="empty">当前筛选下没有待办动作。</div>'}</div>
      ${d.actions.length > 24 ? `<p class="note">另有 ${d.actions.length - 24} 条动作未展开，可用上方筛选缩小范围。</p>` : ''}
    </div>

    <div class="card c5"><h3>销售待办负载 <span class="sub">按加权风险敞口排序</span></h3>
      <div class="chart tall" id="acLoad"></div></div>

    <div class="card c7"><h3>飞书消息卡片预览 <span class="sub">interactive card · 实际推送报文</span></h3>
      <pre class="card-json">${esc(JSON.stringify(d.preview, null, 2)).slice(0, 4000)}</pre></div>

    <div class="card c12"><h3>推送记录 <span class="sub">本次服务运行期间</span></h3>
      ${historyTable(d.history)}</div>`;

  drawWorkload('acLoad', d.workload);
  box.querySelectorAll('[data-alv]').forEach(b => b.addEventListener('click', () => {
    state.actionLevel = b.dataset.alv; renderAction();
  }));
  document.getElementById('acOwner').addEventListener('change', e => {
    state.actionOwner = e.target.value; renderAction();
  });
  document.getElementById('acNotify').addEventListener('click',
    () => notify(null, state.actionLevel, state.actionOwner));
  box.querySelectorAll('[data-notify]').forEach(b =>
    b.addEventListener('click', () => notify([b.dataset.notify])));
}

function actCard(a) {
  return `<div class="act lv-${a.level}">
    <div class="top">${levelPill(a.level)}<span class="name">${esc(a.merchant)}</span>
      <span class="tag">${tierSwatch(a.tier)}</span><span class="spacer"></span>
      <button class="btn" data-notify="${a.merchant_id}">推送</button></div>
    <div class="why">触发：<b style="color:${C.status[a.level]}">${esc(a.top_rule)}</b> · ${esc(a.reason)}</div>
    <div class="do">${esc(a.action)}</div>
    <div class="meta">
      <span>区间消耗 <b>${fmtYuan(a.spend)}</b></span>
      <span>风险敞口 <b>${fmtYuan(a.exposure)}</b></span>
      <span>可拓展预算 <b>${fmtYuan(a.headroom)}</b></span>
      <span>负责销售 <b>${esc(a.owner)}</b></span>
      <span>截止 <b>${a.due}</b></span></div>
  </div>`;
}

function drawWorkload(id, rows) {
  const data = rows.slice(0, 14).reverse();
  chart(id, {
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: p => `${p[0].name}<br/>待办 ${fmtInt(data[p[0].dataIndex].tasks)} 条（高危 ${data[p[0].dataIndex].critical} 条）<br/>风险敞口 ${fmtYuan(data[p[0].dataIndex].exposure)}` },
    grid: { ...gridBase, top: 12, right: 118 },
    xAxis: { type: 'value', show: false },
    yAxis: catAxis(data.map(r => r.owner), { axisLine: { show: false } }),
    series: [{
      type: 'bar', data: data.map(r => r.exposure), ...BAR_H,
      itemStyle: { color: C.tier.KA, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11,
        formatter: p => `${fmtYuan(p.value)} · ${data[p.dataIndex].tasks} 条` }
    }]
  });
}

function historyTable(rows) {
  if (!rows.length) return `<div class="empty">还没有推送记录。点击任意「推送飞书」按钮后会出现在这里。</div>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>时间</th><th>模式</th><th>结果</th><th>收件销售</th><th>内容</th><th>详情</th></tr></thead>
    <tbody>${rows.map(h => `<tr>
      <td>${h.time}</td><td><span class="tag">${h.mode}</span></td>
      <td>${h.ok ? '<span class="pill lv-正常">✓ 成功</span>' : '<span class="pill lv-高危">▲ 失败</span>'}</td>
      <td style="white-space:normal;max-width:280px">${h.recipients.map(r => `<span class="tag">${esc(r)}</span>`).join('')}</td>
      <td>${esc(h.note)}</td><td style="color:var(--ink-3)">${esc(h.detail)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function notify(ids, level, owner) {
  const body = { start: state.start, end: state.end, merchant_ids: ids || [], level: level || '', owner: owner || '' };
  const r = await fetch('/api/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) { toast(`推送失败：${esc(j.detail || '未知错误')}`, true); return; }
  const res = j.result;
  toast(`${res.ok ? '✓' : '▲'} ${res.mode === 'webhook' ? '已发送到飞书群' : '飞书 Dry-run'}：${j.count} 条动作 → ${j.recipients.join('、')}<br>
         <span style="color:var(--ink-3)">${esc(res.detail)}</span>`, !res.ok);
  if (currentView === 'action') renderAction();
}

/* ============================ 视图调度 & 筛选栏 ============================ */
const VIEWS = { overview: renderOverview, tiering: renderTiering, channel: renderChannel,
                detail: renderDetail, alert: renderAlert, action: renderAction };
let currentView = 'overview';

async function render() {
  const box = document.getElementById('view-' + currentView);
  box.classList.add('loading');
  try { await VIEWS[currentView](); }
  catch (e) { box.innerHTML = `<div class="card c12"><div class="empty">加载失败：${esc(e.message)}</div></div>`; }
  box.classList.remove('loading');
  refreshBadge();
}

let badgeCache = null;
async function refreshBadge() {
  const d = await api('alerts');
  document.getElementById('alertBadge').textContent = fmtInt(d.summary.by_level[0].count);
  badgeCache = d;
}

function switchView(v) {
  currentView = v;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + v; });
  location.hash = v;
  render();
}

function setRange(n) {
  const ms = META.months;
  state.start = n >= ms.length ? null : ms[ms.length - n];
  state.end = null;
  document.getElementById('startSel').value = state.start || ms[0];
  document.getElementById('endSel').value = ms[ms.length - 1];
  updateHint();
}

function updateHint() {
  const ms = META.months;
  const s = state.start || ms[0], e = state.end || ms[ms.length - 1];
  const n = ms.filter(m => m >= s && m <= e).length;
  document.getElementById('windowHint').innerHTML =
    `统计窗口 <b>${s} ~ ${e}</b>（${n} 个月）· 分层口径：${state.rescore === '1' ? '按窗口重算' : '年度基准'}`;
}

function fillSelect(el, values, multi) {
  el.innerHTML = (multi ? '' : '<option value="">全部</option>') +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
  if (multi) el.size = Math.min(4, values.length);
}

async function boot() {
  META = await (await fetch('/api/meta')).json();
  const ms = META.months;
  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).innerHTML = ms.map(m => `<option value="${m}">${m}</option>`).join('');
  });
  document.getElementById('startSel').value = ms[0];
  document.getElementById('endSel').value = ms[ms.length - 1];

  fillSelect(document.getElementById('industrySel'), META.industries, true);
  fillSelect(document.getElementById('regionSel'), META.regions, true);
  fillSelect(document.getElementById('sourceSel'), META.sources);
  fillSelect(document.getElementById('contractSel'), META.contracts);
  fillSelect(document.getElementById('tierSel'), META.tiers);

  document.getElementById('rangeChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#rangeChips .chip').forEach(c => c.classList.toggle('on', c === b));
    setRange(+b.dataset.n); render();
  });
  document.getElementById('rescoreChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#rescoreChips .chip').forEach(c => c.classList.toggle('on', c === b));
    state.rescore = b.dataset.v; updateHint(); render();
  });
  const onMonth = () => {
    state.start = document.getElementById('startSel').value;
    state.end = document.getElementById('endSel').value;
    document.querySelectorAll('#rangeChips .chip').forEach(c => c.classList.remove('on'));
    updateHint(); render();
  };
  document.getElementById('startSel').addEventListener('change', onMonth);
  document.getElementById('endSel').addEventListener('change', onMonth);

  const multi = (id, key) => document.getElementById(id).addEventListener('change', e => {
    state[key] = [...e.target.selectedOptions].map(o => o.value); state.detailPage = 1; render();
  });
  multi('industrySel', 'industry'); multi('regionSel', 'region');
  ['sourceSel:source', 'contractSel:contract', 'tierSel:tier', 'strategicSel:strategic'].forEach(pair => {
    const [id, key] = pair.split(':');
    document.getElementById(id).addEventListener('change', e => {
      state[key] = e.target.value; state.detailPage = 1; render();
    });
  });
  document.getElementById('resetBtn').addEventListener('click', () => location.reload());

  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (b) switchView(b.dataset.view);
  });

  updateHint();
  const hash = location.hash.slice(1);
  switchView(VIEWS[hash] ? hash : 'overview');
}

boot();
