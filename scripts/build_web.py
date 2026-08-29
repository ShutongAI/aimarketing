# -*- coding: utf-8 -*-
"""把 Flask 大屏编译成单文件网页版：数据内嵌，聚合在浏览器里跑。

    python3 scripts/build_web.py            # → dist/qa-dashboard.html

服务端逻辑（metrics/alerts/actions）由 web/data-layer.js 复刻，视图代码
(app/static/js/views.js) 原样复用——两版共用同一份 api(path, extra) 契约。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.etl import CHANNELS, MONTH_KEYS, TIER_ORDER, load

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "qa-dashboard.html"

BAND_COLS = ["场景档位分", "深度档位分", "发送量档位分", "天数档位分", "会员档位分",
             "预算档位分", "大促档位分", "团队档位分", "趋势档位分", "续费档位分"]
DICT_COLS = {"industry": "所属行业", "region": "所在区域", "source": "客户来源",
             "contract": "合同类型", "lifecycle": "生命周期阶段",
             "trend": "近3月消耗环比趋势", "owner": "负责销售"}


def build_data() -> dict:
    dim, fact = load()
    dim = dim.reset_index(drop=True)

    dicts = {k: sorted(dim[col].dropna().unique().tolist()) for k, col in DICT_COLS.items()}
    idx = {k: {v: i for i, v in enumerate(vals)} for k, vals in dicts.items()}
    tier_idx = {t: i for i, t in enumerate(TIER_ORDER)}

    rows = []
    for r in dim.to_dict("records"):
        rows.append([
            r["商家ID"], r["商家名称"],
            idx["industry"][r["所属行业"]], idx["region"][r["所在区域"]],
            idx["source"][r["客户来源"]], idx["contract"][r["合同类型"]],
            idx["lifecycle"][r["生命周期阶段"]], 1 if r["是否战略客户"] == "是" else 0,
            int(r["合作月数"]), idx["trend"][r["近3月消耗环比趋势"]],
            int(r["触达场景数(个)"]), int(r["数据接入深度(0-3级)"]),
            int(r["月均活跃发送天数(天)"]),
            *[int(r[c]) for c in BAND_COLS],
            int(r["年度营销预算(元)"]),
            tier_idx[r["分层结果"]], round(float(r["综合分"]), 1),
            idx["owner"][r["负责销售"]],
            round(float(r["价值分(0-40)"]), 1), round(float(r["活跃分(0-20)"]), 1),
            round(float(r["潜力分(0-30)"]), 1), round(float(r["健康分(0-10)"]), 1),
        ])

    # 消耗：商家序号 → [[12 短信],[12 外呼],[12 Push企微]]，零消耗商家整体省略
    pos = {mid: i for i, mid in enumerate(dim["商家ID"])}
    mpos = {m: i for i, m in enumerate(MONTH_KEYS)}
    cpos = {c: i for i, c in enumerate(CHANNELS)}
    cons: dict[int, list[list[int]]] = {}
    for mid, month, ch, amt in fact.itertuples(index=False):
        cell = cons.setdefault(pos[mid], [[0] * 12 for _ in range(3)])
        cell[cpos[ch]][mpos[month]] = int(amt)

    return {
        "months": MONTH_KEYS, "channels": CHANNELS, "tiers": TIER_ORDER,
        "dict": dicts, "m": rows, "c": cons,
        # 与 /api/meta 返回同构，前端 boot() 可原样消费
        "meta": {
            "months": MONTH_KEYS, "channels": CHANNELS, "tiers": TIER_ORDER,
            "industries": dicts["industry"], "regions": dicts["region"],
            "sources": dicts["source"], "contracts": dicts["contract"],
            "owners": dicts["owner"], "feishu_configured": False,
        },
    }


def cut(text: str, start: str, end: str | None = None) -> str:
    """取出 text 中从 start 到 end 之间的片段，找不到就报错而不是静默产出半成品。"""
    i = text.index(start)
    j = text.index(end, i) if end else len(text)
    return text[i:j]


def main() -> None:
    css = (ROOT / "app/static/css/dashboard.css").read_text()
    core = (ROOT / "app/static/js/core.js").read_text()
    views = (ROOT / "app/static/js/views.js").read_text()
    layer = (ROOT / "web/data-layer.js").read_text()
    extra_css = (ROOT / "web/web.css").read_text()
    extra_js = (ROOT / "web/web.js").read_text()

    # core.js 里的服务端取数替换成本地计算：删掉 query/api，其余（token、格式化、图表配置）原样保留
    drop = cut(core, "function query(extra = {}) {", "/* ---------- ECharts 基础配置")
    assert "fetch(`/api/" in drop
    core = core.replace(drop, "")

    # views.js 的 notify() 走网页版实现；boot() 的 meta 改成本地常量
    old_notify = cut(views, "async function notify(ids, level, owner) {",
                     "/* ============================ 视图调度")
    views = views.replace(old_notify, "")
    views = views.replace("  META = await (await fetch('/api/meta')).json();",
                          "  META = QA_DATA.meta;")
    assert "fetch(" not in views, "views.js 仍有服务端调用"

    data = build_data()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    html = (ROOT / "web/index.template.html").read_text()
    html = (html
            .replace("/*__CSS__*/", css + "\n" + extra_css)
            .replace("/*__DATA__*/", f"const QA_DATA = {payload};")
            .replace("/*__CORE__*/", core)
            .replace("/*__LAYER__*/", layer)
            .replace("/*__VIEWS__*/", views)
            .replace("/*__EXTRA__*/", extra_js))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    print(f"{OUT}  {OUT.stat().st_size / 1024:.0f} KB"
          f"  ({len(data['m'])} 家商家 / {len(data['c'])} 家有消耗)")


if __name__ == "__main__":
    main()
