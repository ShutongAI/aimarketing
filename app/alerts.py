# -*- coding: utf-8 -*-
"""预警层：7 条规则 → 命中标记 + 等级 + 风险敞口。"""

from __future__ import annotations

import pandas as pd

LEVEL_ORDER = ["高危", "中危", "关注"]
LEVEL_RANK = {"高危": 0, "中危": 1, "关注": 2}


def _last_two_months(ctx: dict) -> pd.DataFrame:
    """取窗口内最后一个月与前一个月的消耗，用于识别断崖。"""
    months = ctx["months"]
    fact = ctx["fact"]
    if len(months) < 2:
        return pd.DataFrame({"last": [], "prev1": []})
    last, prev1 = months[-1], months[-2]
    g = (fact[fact["month"].isin([last, prev1])]
         .pivot_table(index="商家ID", columns="month", values="amount",
                      aggfunc="sum", fill_value=0)
         .reindex(columns=[prev1, last], fill_value=0))
    g.columns = ["prev1", "last"]
    return g


RULES = [
    # (规则名, 等级, 说明)
    ("连续下降", "高危", "近3月消耗环比连续下降"),
    ("消耗断崖", "高危", "最近1月低于区间月均 40% 以上"),
    ("头部流失预警", "高危", "SKA/KA 且生命周期=流失预警"),
    ("活跃衰减", "中危", "月均活跃发送天数 <5 天"),
    ("场景收缩", "中危", "触达场景数 ≤1 且分层在腰部及以上"),
    ("预算未消化", "关注", "可拓展预算空间占年度预算 >80%"),
    ("沉默超期", "关注", "区间零消耗且合作 ≥3 个月"),
]
RULE_LEVEL = {name: lv for name, lv, _ in RULES}
RULE_DESC = {name: d for name, _, d in RULES}


def evaluate(ctx: dict) -> pd.DataFrame:
    """给每家商家打上命中的规则列表、最高等级与风险敞口。"""
    m = ctx["merchants"].copy()
    mm = _last_two_months(ctx)
    m = m.merge(mm, left_on="商家ID", right_index=True, how="left")
    m[["prev1", "last"]] = m[["prev1", "last"]].fillna(0)

    # 断崖：最近 1 月跌破区间月均的 60%（比单纯看环比更稳，能滤掉大促月的正常回落）
    avg = m["区间消耗"] / max(len(ctx["months"]), 1)
    drop = (avg > 10000) & (m["last"] < avg * 0.6)

    hits = {
        "连续下降": m["近3月消耗环比趋势"] == "连续下降",
        "消耗断崖": drop,
        "头部流失预警": m["tier"].isin(["SKA", "KA"]) & (m["生命周期阶段"] == "流失预警"),
        "活跃衰减": (m["月均活跃发送天数(天)"] < 5) & (m["区间消耗"] > 0),
        "场景收缩": (m["触达场景数(个)"] <= 1) & m["tier"].isin(["SKA", "KA", "腰部"]),
        "预算未消化": ((m["可拓展预算空间"] > m["年度营销预算(元)"] * 0.8)
                       & (m["年度营销预算(元)"] > 1_000_000)),
        "沉默超期": (m["区间消耗"] <= 0) & (m["合作月数"] >= 3),
    }

    for name, mask in hits.items():
        m[f"rule_{name}"] = mask.fillna(False)

    m["rules"] = [
        [name for name in hits if row[f"rule_{name}"]]
        for _, row in m.iterrows()
    ]
    m["level"] = m["rules"].apply(
        lambda rs: min((RULE_LEVEL[r] for r in rs), key=lambda l: LEVEL_RANK[l]) if rs else "正常")
    # 风险敞口：高危按全额、中危按 50%、关注按 20% 计入
    weight = {"高危": 1.0, "中危": 0.5, "关注": 0.2, "正常": 0.0}
    m["risk_exposure"] = m["区间消耗"] * m["level"].map(weight)
    return m


def summary(alerted: pd.DataFrame) -> dict:
    hit = alerted[alerted["level"] != "正常"]
    by_level = [{"level": lv, "count": int((hit["level"] == lv).sum()),
                 "spend": float(hit[hit["level"] == lv]["区间消耗"].sum())}
                for lv in LEVEL_ORDER]
    by_rule = [{"rule": name, "level": RULE_LEVEL[name], "desc": RULE_DESC[name],
                "count": int(alerted[f"rule_{name}"].sum()),
                "spend": float(alerted.loc[alerted[f"rule_{name}"], "区间消耗"].sum())}
               for name, _, _ in RULES]
    by_rule.sort(key=lambda r: -r["count"])
    return {
        "total": int(len(hit)),
        "share": len(hit) / len(alerted) if len(alerted) else 0,
        "exposure": float(alerted["risk_exposure"].sum()),
        "by_level": by_level,
        "by_rule": by_rule,
    }


def alert_trend(ctx: dict, alerted: pd.DataFrame) -> dict:
    """预警商家 vs 健康商家的月度消耗走势对比。"""
    ids = set(alerted.loc[alerted["level"].isin(["高危", "中危"]), "商家ID"])
    f = ctx["fact"]
    risky = (f[f["商家ID"].isin(ids)].groupby("month")["amount"].sum()
             .reindex(ctx["months"], fill_value=0).astype(float).tolist())
    healthy = (f[~f["商家ID"].isin(ids)].groupby("month")["amount"].sum()
               .reindex(ctx["months"], fill_value=0).astype(float).tolist())
    return {"months": ctx["months"], "risky": risky, "healthy": healthy}


def alert_list(alerted: pd.DataFrame, level: str | None = None, rule: str | None = None,
               limit: int = 200) -> list[dict]:
    hit = alerted[alerted["level"] != "正常"]
    if level:
        hit = hit[hit["level"] == level]
    if rule:
        hit = hit[hit[f"rule_{rule}"]]
    hit = hit.sort_values(["risk_exposure", "区间消耗"], ascending=False).head(limit)
    return [{
        "id": r["商家ID"], "name": r["商家名称"], "industry": r["所属行业"],
        "region": r["所在区域"], "tier": r["tier"], "level": r["level"], "rules": r["rules"],
        "spend": float(r["区间消耗"]), "last": float(r["last"]), "prev1": float(r["prev1"]),
        "trend": r["近3月消耗环比趋势"], "scene": int(r["触达场景数(个)"]),
        "score": float(r["total_score"]), "owner": r["负责销售"],
        "headroom": float(r["可拓展预算空间"]), "exposure": float(r["risk_exposure"]),
        "strategy": r["strategy"],
    } for r in hit.to_dict("records")]
