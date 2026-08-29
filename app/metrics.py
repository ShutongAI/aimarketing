# -*- coding: utf-8 -*-
"""指标层：筛选、区间重算分层、各模块聚合。"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .etl import CHANNELS, MONTH_KEYS, TIER_ORDER, load

# 打分卡档界（元）：近12月消耗合计，锚定有消耗商家的 P25/P50/P75/P90
SPEND_BANDS = [0, 24000, 94000, 220000, 530000]
# 分层映射：综合分下界，由低到高依次覆盖
TIER_CUTS = [("基础长尾", 0), ("腰部", 40), ("KA", 75), ("SKA", 90)]

STRATEGY = {
    "SKA": "守·共创：卡片短信/AI外呼新场景POC",
    "KA": "扩·深化：AI外呼场景深化+Push/企微补全",
    "腰部": "拉·主攻：主推AI外呼+大促作战包",
    "基础长尾": "激活：企微+Push低成本先跑",
    "新客观察期": "培育：入门包+1v1场景教育",
    "未激活": "唤醒：短信模板+首充补贴",
}

FILTER_FIELDS = {
    "industry": "所属行业",
    "region": "所在区域",
    "source": "客户来源",
    "contract": "合同类型",
    "tier": "tier",
    "strategic": "是否战略客户",
}


def _band_score(s: pd.Series, bands: list[int]) -> pd.Series:
    """值落在第几档（1-5）。"""
    return pd.Series(np.searchsorted(bands, s.to_numpy(), side="right"),
                     index=s.index).clip(1, 5)


def _pct(cur: float, prev: float):
    if not prev:
        return None
    return (cur - prev) / prev


def window_months(start: str | None, end: str | None) -> list[str]:
    ms = MONTH_KEYS
    if start:
        ms = [m for m in ms if m >= start]
    if end:
        ms = [m for m in ms if m <= end]
    return ms or MONTH_KEYS


def build(start: str | None = None, end: str | None = None, rescore: bool = True,
          **filters) -> dict:
    """按时间窗口生成商家宽表（含区间消耗、区间分层），再套用维度筛选。

    返回 dict：merchants(宽表)、fact(区间月度事实)、prev(上一等长窗口宽表)、months。
    """
    dim, fact = load()
    months = window_months(start, end)
    n = len(months)

    idx = MONTH_KEYS.index(months[0])
    prev_months = MONTH_KEYS[max(0, idx - n): idx]

    def wide(mlist: list[str]) -> pd.DataFrame:
        sub = fact[fact["month"].isin(mlist)]
        piv = (sub.pivot_table(index="商家ID", columns="channel", values="amount",
                               aggfunc="sum", fill_value=0)
                  .reindex(columns=CHANNELS, fill_value=0))
        piv.columns = [f"消耗_{c}" for c in CHANNELS]
        out = dim.set_index("商家ID").join(piv)
        for c in CHANNELS:
            out[f"消耗_{c}"] = out[f"消耗_{c}"].fillna(0)
        out["区间消耗"] = sum(out[f"消耗_{c}"] for c in CHANNELS)
        return out.reset_index()

    m = wide(months)
    prev = wide(prev_months) if prev_months else None

    # ---- 区间分层重算：把区间消耗年化后套打分卡档界 ----
    annualized = m["区间消耗"] * (12.0 / n)

    if rescore:
        spend_band = _band_score(annualized, SPEND_BANDS)
        value = (25 * spend_band + 8 * m["场景档位分"] + 7 * m["深度档位分"]) / 5
        active = (10 * m["发送量档位分"] + 10 * m["天数档位分"]) / 5
        potential = (12 * m["会员档位分"] + 8 * m["预算档位分"]
                     + 6 * m["大促档位分"] + 4 * m["团队档位分"]) / 5
        health = (6 * m["趋势档位分"] + 4 * m["续费档位分"]) / 5
        # 新客修正：合作 <3 个月看潜力不看消耗
        value = value.where(m["合作月数"] >= 3, potential / 30 * 40)
        total = (value + active + potential + health).round(1)

        tier = pd.Series("基础长尾", index=m.index)
        for name, cut in TIER_CUTS:
            tier = tier.mask(total >= cut, name)
        # 一票否决：区间无消耗不参与评分，按合作月数分流
        zero = m["区间消耗"] <= 0
        tier = tier.mask(zero & (m["合作月数"] < 3), "新客观察期")
        tier = tier.mask(zero & (m["合作月数"] >= 3), "未激活")

        m["v_score"], m["a_score"] = value.round(1), active.round(1)
        m["p_score"], m["h_score"] = potential.round(1), health.round(1)
        m["total_score"], m["tier"] = total, tier
    else:
        m["v_score"] = m["价值分(0-40)"]
        m["a_score"] = m["活跃分(0-20)"]
        m["p_score"] = m["潜力分(0-30)"]
        m["h_score"] = m["健康分(0-10)"]
        m["total_score"] = m["综合分"]
        m["tier"] = m["分层结果"]

    m["strategy"] = m["tier"].map(STRATEGY)
    m["可拓展预算空间"] = (m["年度营销预算(元)"] - annualized).clip(lower=0)

    # ---- 维度筛选 ----
    mask = pd.Series(True, index=m.index)
    for key, col in FILTER_FIELDS.items():
        vals = filters.get(key)
        if vals:
            mask &= m[col].isin(vals)
    m = m[mask]

    if prev is not None:
        prev = prev[prev["商家ID"].isin(m["商家ID"])]

    fw = fact[fact["month"].isin(months) & fact["商家ID"].isin(m["商家ID"])]
    return {"merchants": m, "fact": fw, "prev": prev, "months": months,
            "prev_months": prev_months}


# ---------------------------------------------------------------- M1 总览

def kpi(ctx: dict) -> dict:
    m, prev = ctx["merchants"], ctx["prev"]
    spend = float(m["区间消耗"].sum())
    active = int((m["区间消耗"] > 0).sum())
    head = float(m[m["tier"].isin(["SKA", "KA"])]["区间消耗"].sum())

    has_prev = prev is not None and len(prev)
    prev_spend = float(prev["区间消耗"].sum()) if has_prev else 0.0
    prev_active = int((prev["区间消耗"] > 0).sum()) if has_prev else 0

    trend = (ctx["fact"].groupby("month")["amount"].sum()
             .reindex(ctx["months"], fill_value=0).astype(float).tolist())

    return {
        "merchants": int(len(m)),
        "active": active,
        "active_delta": _pct(active, prev_active),
        "spend": spend,
        "spend_delta": _pct(spend, prev_spend),
        "spend_trend": trend,
        "arpu": spend / active if active else 0,
        "dormant": int(((m["区间消耗"] <= 0) & (m["合作月数"] >= 3)).sum()),
        "head_share": head / spend if spend else 0,
        "avg_scene": float(m["触达场景数(个)"].mean()) if len(m) else 0,
        "months": ctx["months"],
    }


def trend_by_channel(ctx: dict) -> dict:
    piv = (ctx["fact"].pivot_table(index="month", columns="channel", values="amount",
                                   aggfunc="sum", fill_value=0)
           .reindex(index=ctx["months"], columns=CHANNELS, fill_value=0))
    return {"months": ctx["months"],
            "series": [{"name": c, "data": piv[c].astype(float).tolist()} for c in CHANNELS]}


def tier_summary(ctx: dict) -> list[dict]:
    m = ctx["merchants"]
    total_spend = float(m["区间消耗"].sum())
    rows = []
    for t in TIER_ORDER:
        sub = m[m["tier"] == t]
        spend = float(sub["区间消耗"].sum())
        rows.append({
            "tier": t,
            "count": int(len(sub)),
            "count_share": len(sub) / len(m) if len(m) else 0,
            "spend": spend,
            "spend_share": spend / total_spend if total_spend else 0,
            "avg_score": float(sub["total_score"].mean()) if len(sub) else 0,
            "avg_scene": float(sub["触达场景数(个)"].mean()) if len(sub) else 0,
            "strategy": STRATEGY[t],
        })
    return rows


def lorenz(ctx: dict) -> dict:
    """消耗集中度曲线：按消耗降序，累计商家占比 × 累计消耗占比。"""
    s = ctx["merchants"]["区间消耗"].sort_values(ascending=False).to_numpy()
    if not len(s) or s.sum() <= 0:
        return {"points": [], "top10": 0}
    cum = np.cumsum(s) / s.sum()
    n = len(s)
    step = max(1, n // 120)
    pts = [[round((i + 1) / n * 100, 2), round(float(cum[i]) * 100, 2)]
           for i in range(0, n, step)]
    if pts[-1][0] < 100:
        pts.append([100.0, 100.0])
    return {"points": pts, "top10": float(cum[max(0, int(n * 0.1) - 1)])}


def by_dimension(ctx: dict, col: str, top: int | None = None) -> list[dict]:
    g = (ctx["merchants"].groupby(col)
         .agg(spend=("区间消耗", "sum"), count=("商家ID", "count"))
         .sort_values("spend", ascending=False))
    if top:
        g = g.head(top)
    return [{"name": k, "spend": float(v["spend"]), "count": int(v["count"])}
            for k, v in g.iterrows()]


# ---------------------------------------------------------------- M2 分层

def tier_industry_matrix(ctx: dict) -> dict:
    m = ctx["merchants"]
    inds = sorted(m["所属行业"].dropna().unique().tolist())
    piv = (m.pivot_table(index="tier", columns="所属行业", values="商家ID", aggfunc="count",
                         fill_value=0)
           .reindex(index=TIER_ORDER, columns=inds, fill_value=0))
    data = [[j, i, int(piv.iat[i, j])] for i in range(len(TIER_ORDER)) for j in range(len(inds))]
    return {"industries": inds, "tiers": TIER_ORDER, "data": data,
            "max": int(piv.to_numpy().max()) if piv.size else 0}


def quadrant(ctx: dict, limit: int = 800) -> dict:
    """价值-潜力四象限。emphasis 三类：常规 / 高潜新签 / 衰退KA，均带文字标签。"""
    m = ctx["merchants"]
    m = m[m["tier"] != "未激活"]
    med = float(m["区间消耗"].median()) if len(m) else 0.0

    new_hi = (m["合作月数"] < 6) & (m["区间消耗"] <= med) & (m["p_score"] >= 24)
    decay = m["tier"].isin(["SKA", "KA"]) & (m["近3月消耗环比趋势"] == "连续下降")

    groups = {"常规": m[~new_hi & ~decay], "高潜新签": m[new_hi & ~decay], "衰退KA": m[decay]}
    out, counts = {}, {}
    for name, sub in groups.items():
        counts[name] = int(len(sub))
        if name == "常规" and len(sub) > limit:
            sub = sub.nlargest(limit, "区间消耗")
        out[name] = [[float(r.p_score), float(r.v_score), float(r.区间消耗),
                      r.商家名称, r.tier]
                     for r in sub.itertuples(index=False)]
    return {"groups": out, "counts": counts}


def lifecycle(ctx: dict) -> list[dict]:
    order = ["潜客试用", "首次订购客户", "增购客户", "续订客户", "流失预警", "已流失"]
    g = ctx["merchants"].groupby("生命周期阶段").agg(count=("商家ID", "count"),
                                                    spend=("区间消耗", "sum"))
    return [{"name": k, "count": int(g.at[k, "count"]), "spend": float(g.at[k, "spend"])}
            for k in order if k in g.index]


def tier_radar(ctx: dict) -> list[dict]:
    m = ctx["merchants"]
    rows = []
    for t in TIER_ORDER[:4]:
        sub = m[m["tier"] == t]
        if not len(sub):
            continue
        rows.append({"tier": t, "value": [round(float(sub["v_score"].mean()), 1),
                                          round(float(sub["a_score"].mean()), 1),
                                          round(float(sub["p_score"].mean()), 1),
                                          round(float(sub["h_score"].mean()), 1)]})
    return rows


def migration(ctx: dict, limit: int = 60) -> list[dict]:
    """区间分层 vs 年度基准分层，标出升降级候选。"""
    m = ctx["merchants"]
    rank = {t: i for i, t in enumerate(TIER_ORDER)}
    mv = m[m["tier"] != m["分层结果"]].copy()
    if not len(mv):
        return []
    mv["direction"] = np.where(mv["tier"].map(rank) < mv["分层结果"].map(rank), "升级", "降级")
    mv = mv.sort_values("区间消耗", ascending=False).head(limit)
    return [{"id": r.商家ID, "name": r.商家名称, "from": r.分层结果, "to": r.tier,
             "direction": r.direction, "score": float(r.total_score),
             "base_score": float(r.综合分), "spend": float(r.区间消耗), "owner": r.负责销售}
            for r in mv.itertuples(index=False)]


# ---------------------------------------------------------------- M3 通道

def channel_summary(ctx: dict) -> list[dict]:
    m, prev = ctx["merchants"], ctx["prev"]
    total = float(sum(m[f"消耗_{c}"].sum() for c in CHANNELS))
    has_prev = prev is not None and len(prev)
    rows = []
    for c in CHANNELS:
        cur = float(m[f"消耗_{c}"].sum())
        users = int((m[f"消耗_{c}"] > 0).sum())
        p = float(prev[f"消耗_{c}"].sum()) if has_prev else 0.0
        series = (ctx["fact"][ctx["fact"]["channel"] == c].groupby("month")["amount"].sum()
                  .reindex(ctx["months"], fill_value=0).astype(float).tolist())
        rows.append({"channel": c, "spend": cur, "share": cur / total if total else 0,
                     "users": users, "penetration": users / len(m) if len(m) else 0,
                     "arpu": cur / users if users else 0, "delta": _pct(cur, p),
                     "trend": series})
    return rows


def tier_channel_mix(ctx: dict) -> dict:
    m = ctx["merchants"]
    g = (m.groupby("tier")[[f"消耗_{c}" for c in CHANNELS]].sum()
         .reindex(TIER_ORDER, fill_value=0))
    tiers = [t for t in TIER_ORDER if g.loc[t].sum() > 0]
    g = g.loc[tiers]
    tot = g.sum(axis=1).replace(0, np.nan)
    pct = (g.div(tot, axis=0) * 100).fillna(0).round(1)
    return {"tiers": tiers,
            "series": [{"name": c, "data": pct[f"消耗_{c}"].tolist()} for c in CHANNELS]}


def tier_channel_penetration(ctx: dict) -> dict:
    m = ctx["merchants"]
    tiers = [t for t in TIER_ORDER if (m["tier"] == t).any()]
    series = []
    for c in CHANNELS:
        data = []
        for t in tiers:
            sub = m[m["tier"] == t]
            data.append(round(float((sub[f"消耗_{c}"] > 0).mean() * 100), 1) if len(sub) else 0.0)
        series.append({"name": c, "data": data})
    return {"tiers": tiers, "series": series}


def scene_depth(ctx: dict) -> dict:
    m = ctx["merchants"]
    tiers = [t for t in TIER_ORDER if (m["tier"] == t).any()]
    g = m.groupby("tier").agg(scene=("触达场景数(个)", "mean"),
                              depth=("数据接入深度(0-3级)", "mean")).reindex(tiers)
    return {"tiers": tiers, "scene": g["scene"].round(2).tolist(),
            "depth": g["depth"].round(2).tolist()}
