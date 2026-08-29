# QuickAudience 商家分层运营大屏

Flask + ECharts 实现的商家运营大屏 Demo，数据来自 `data/QuickAudience商家分层练习-处理方式(1).xlsx` 的「商家明细」sheet（2000 家模拟商家）。

## 启动

```bash
pip install flask pandas openpyxl
python3 run.py           # → http://127.0.0.1:5000
```

ECharts 已内置在 `app/static/vendor/`，**完全离线可跑**，不依赖任何 CDN。

配置飞书群机器人后，动作提醒可直发到群：

```bash
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx" python3 run.py
```

未配置时推送进入 **Dry-run**：照常生成并展示完整的飞书卡片报文，只是不外发。

## 目录

| 文件 | 职责 |
|---|---|
| `app/etl.py` | 读 xlsx → 清洗 → 把年度消耗确定性展开成 12 个月事实表 → 派生销售归属 |
| `app/metrics.py` | 时间窗筛选、区间分层重算（复刻打分卡口径）、总览/分层/通道各聚合 |
| `app/alerts.py` | 7 条预警规则、等级判定、加权风险敞口 |
| `app/actions.py` | 分层策略 × 命中规则 → 待办动作；飞书 interactive card 构造 |
| `app/feishu.py` | Webhook 推送 + Dry-run + 推送记录 |
| `app/api.py` | Flask 路由与 6 个 JSON 接口 |
| `app/static/js/core.js` | 主题 token、格式化、筛选状态、ECharts 基础配置 |
| `app/static/js/views.js` | 六个模块的渲染 |
| `docs/大屏模块与字段设计.md` | 模块与字段设计说明（含数据前提） |
| `scripts/01_read_merchant_detail.py` | 第一步的字段理解脚本 |

## 接口

| 路由 | 说明 |
|---|---|
| `GET /api/meta` | 筛选项字典、月份列表、预警规则表 |
| `GET /api/overview` | KPI、消耗趋势、分层金字塔、洛伦兹、行业/区域分布 |
| `GET /api/tiering` | 分层结构、四象限、分层×行业、生命周期、四维雷达、升降级候选 |
| `GET /api/channel` | 三通道汇总/趋势/结构、分层×通道、渗透率、场景深度 |
| `GET /api/merchants` | 商家明细（分页、搜索、排序、只看预警） |
| `GET /api/alerts` | 预警汇总、规则命中、预警走势、预警清单 |
| `GET /api/actions` | 待办动作、销售负载、推送记录、飞书卡片预览 |
| `POST /api/notify` | 推送动作到飞书（或 Dry-run） |

所有 GET 接口共享同一组筛选参数：
`start` / `end`（YYYY-MM）· `rescore`（1=区间重算分层，0=年度基准）·
`industry` / `region`（可重复传实现多选）· `source` / `contract` / `tier` / `strategic`

## 两个数据前提

1. **月度数据是推算的**。原表只有近 12 月汇总，ETL 用「趋势字段 + 大促次数 + 签约时间 + 商家ID 哈希」确定性地展开成 12 个月，任一次运行结果一致，且满 12 月窗口的合计严格等于原表总额（已校验：1.907 亿）。
2. **销售负责人是派生的**。原表无此字段，按「区域 + 商家ID 哈希」分配到 14 名虚拟销售，仅用于演示飞书通知的收件路由。

区间分层重算在满 12 个月窗口下与工作簿公式结果完全一致（SKA 26 / KA 121 / 腰部 695 / 基础长尾 528 / 新客观察期 4 / 未激活 626），可作为口径复刻正确性的回归基准。
