/* 网页版增补：ECharts 字体主题、数据说明弹层、飞书卡片弹层 */

const UI_FONT = "'IBM Plex Sans', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
echarts.registerTheme('qa', { textStyle: { fontFamily: UI_FONT } });
const _echartsInit = echarts.init;
echarts.init = (dom, theme, opts) => _echartsInit(dom, theme || 'qa', opts);

function closeModal() { document.querySelector('.modal')?.remove(); }

function openModal(html) {
  closeModal();
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<div class="box">${html}</div>`;
  d.addEventListener('click', e => { if (e.target === d) closeModal(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(d);
  d.querySelector('.close')?.addEventListener('click', closeModal);
}

/* 网页版点「推送」后展示与线上一致的飞书报文 */
function showCard(card, count, recipients) {
  openModal(`
    <button class="btn ghost close">关闭</button>
    <h2>飞书消息卡片</h2>
    <p class="lead">${count} 条动作 · 收件销售 ${recipients.join('、')}</p>
    <p>网页版没有服务端，无法直接向飞书发起请求，因此这里只生成报文。把下面的 JSON
       贴进飞书机器人调试台即可原样发出；Flask 版配置 <code>FEISHU_WEBHOOK</code> 后是真实推送。</p>
    <pre class="card-json" style="max-height:46vh">${esc(JSON.stringify(card, null, 2))}</pre>`);
}

const ABOUT = `
  <button class="btn ghost close">关闭</button>
  <h2>这份大屏的数据是怎么来的</h2>
  <p class="lead">数据源：QuickAudience 商家分层练习工作簿「商家明细」sheet，2000 家模拟商家、47 个字段。</p>

  <h4>月度数据是推算的</h4>
  <p>原表只有<b>近 12 个月的汇总消耗</b>，没有月度明细，所以「筛选时间段」在原始数据上做不了。
     ETL 把每家每通道的年度总额确定性地展开成 12 个月，权重全部由表内已有字段驱动：</p>
  <ul>
    <li><b>近3月消耗环比趋势</b> 决定尾部三个月的斜率（上升 / 持平 / 下降 / 连续下降）</li>
    <li><b>近12月大促参与次数</b> 决定 1 月年货节、6 月 618、11 月双 11 的脉冲强度</li>
    <li><b>签约时间</b> 之前的月份消耗恒为 0，再在可用月份上归一化</li>
    <li><b>商家ID 哈希</b> 作固定种子，每次运行结果完全一致</li>
  </ul>
  <p>满 12 月窗口的合计严格等于原表总额 ¥190,743,600。</p>

  <h4>销售负责人是派生的</h4>
  <p>原表没有这个字段，按「所在区域 + 商家ID 哈希」分配到 14 名虚拟销售，仅用于演示飞书通知的收件路由。</p>

  <h4>分层口径</h4>
  <p><b>区间重算</b>：把区间消耗年化后套打分卡档界，重算价值 / 活跃 / 潜力 / 健康四维分与综合分，再按
     SKA≥90、KA 75–90、腰部 40–75、基础长尾&lt;40 映射；区间零消耗的按合作月数分流到新客观察期 / 未激活。
     <b>年度基准</b>：直接用工作簿公式列的结果。</p>
  <p>满 12 个月窗口下，区间重算结果与工作簿公式完全一致（SKA 26 / KA 121 / 腰部 695 / 基础长尾 528 /
     新客观察期 4 / 未激活 626），可作为口径复刻正确性的回归基准。</p>

  <h4>网页版与 Flask 版的差别</h4>
  <p>这个页面把服务端的聚合逻辑搬到了浏览器，全部筛选、分层重算、预警和动作生成都在本地跑，
     结果与 Flask 版一致。唯一的差别是飞书推送：网页版只生成报文，不外发。</p>`;

document.addEventListener('click', e => {
  if (e.target.id === 'aboutBtn') openModal(ABOUT);
});
