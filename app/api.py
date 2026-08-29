# -*- coding: utf-8 -*-
"""Flask 应用：页面路由 + 各模块 JSON 接口。"""

from __future__ import annotations

import math

from flask import Flask, jsonify, render_template, request

from . import actions as AC
from . import alerts as A
from . import feishu
from . import metrics as M
from .etl import CHANNELS, MONTH_KEYS, TIER_ORDER, load

app = Flask(__name__)
app.json.ensure_ascii = False
app.json.sort_keys = False  # 飞书卡片报文保持字段书写顺序，便于对照文档


def _clean(obj):
    """把 NaN/Inf 换成 None，避免前端 JSON.parse 拿到非法字面量。"""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


def ctx_from_request() -> dict:
    args = request.args
    return M.build(
        start=args.get("start") or None,
        end=args.get("end") or None,
        rescore=args.get("rescore", "1") != "0",
        industry=args.getlist("industry"),
        region=args.getlist("region"),
        source=args.getlist("source"),
        contract=args.getlist("contract"),
        tier=args.getlist("tier"),
        strategic=args.getlist("strategic"),
    )


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/meta")
def meta():
    dim, _ = load()
    return jsonify({
        "months": MONTH_KEYS,
        "channels": CHANNELS,
        "tiers": TIER_ORDER,
        "industries": sorted(dim["所属行业"].dropna().unique().tolist()),
        "regions": sorted(dim["所在区域"].dropna().unique().tolist()),
        "sources": sorted(dim["客户来源"].dropna().unique().tolist()),
        "contracts": sorted(dim["合同类型"].dropna().unique().tolist()),
        "owners": sorted(dim["负责销售"].unique().tolist()),
        "rules": [{"name": n, "level": lv, "desc": d} for n, lv, d in A.RULES],
        "feishu_configured": bool(feishu.webhook()),
    })


@app.get("/api/overview")
def overview():
    ctx = ctx_from_request()
    return jsonify(_clean({
        "kpi": M.kpi(ctx),
        "trend": M.trend_by_channel(ctx),
        "tiers": M.tier_summary(ctx),
        "lorenz": M.lorenz(ctx),
        "industry": M.by_dimension(ctx, "所属行业"),
        "region": M.by_dimension(ctx, "所在区域"),
    }))


@app.get("/api/tiering")
def tiering():
    ctx = ctx_from_request()
    return jsonify(_clean({
        "tiers": M.tier_summary(ctx),
        "quadrant": M.quadrant(ctx),
        "matrix": M.tier_industry_matrix(ctx),
        "lifecycle": M.lifecycle(ctx),
        "radar": M.tier_radar(ctx),
        "migration": M.migration(ctx),
    }))


@app.get("/api/channel")
def channel():
    ctx = ctx_from_request()
    return jsonify(_clean({
        "summary": M.channel_summary(ctx),
        "trend": M.trend_by_channel(ctx),
        "mix": M.tier_channel_mix(ctx),
        "penetration": M.tier_channel_penetration(ctx),
        "scene": M.scene_depth(ctx),
    }))


DETAIL_SORTS = {
    "spend": "区间消耗", "score": "total_score", "headroom": "可拓展预算空间",
    "scene": "触达场景数(个)", "exposure": "risk_exposure",
}


@app.get("/api/merchants")
def merchants():
    ctx = ctx_from_request()
    al = A.evaluate(ctx)

    q = (request.args.get("q") or "").strip()
    if q:
        al = al[al["商家名称"].str.contains(q, na=False)
                | al["商家ID"].str.contains(q, case=False, na=False)]

    only = request.args.get("alert_only") == "1"
    if only:
        al = al[al["level"] != "正常"]

    sort = DETAIL_SORTS.get(request.args.get("sort", "spend"), "区间消耗")
    al = al.sort_values(sort, ascending=False)

    page = max(1, int(request.args.get("page", 1)))
    size = min(200, int(request.args.get("size", 30)))
    total = len(al)
    rows = al.iloc[(page - 1) * size: page * size]

    return jsonify(_clean({
        "total": total, "page": page, "size": size,
        "rows": [{
            "id": r["商家ID"], "name": r["商家名称"], "industry": r["所属行业"],
            "region": r["所在区域"], "source": r["客户来源"], "contract": r["合同类型"],
            "tier": r["tier"], "score": float(r["total_score"]),
            "v": float(r["v_score"]), "a": float(r["a_score"]),
            "p": float(r["p_score"]), "h": float(r["h_score"]),
            "spend": float(r["区间消耗"]),
            "sms": float(r["消耗_短信"]), "voice": float(r["消耗_AI外呼"]),
            "push": float(r["消耗_Push及企微"]),
            "scene": int(r["触达场景数(个)"]), "depth": int(r["数据接入深度(0-3级)"]),
            "trend": r["近3月消耗环比趋势"], "level": r["level"], "rules": r["rules"],
            "headroom": float(r["可拓展预算空间"]), "strategy": r["strategy"],
            "owner": r["负责销售"], "lifecycle": r["生命周期阶段"],
            "months": int(r["合作月数"]), "strategic": r["是否战略客户"],
        } for r in rows.to_dict("records")],
    }))


@app.get("/api/alerts")
def alerts_api():
    ctx = ctx_from_request()
    al = A.evaluate(ctx)
    return jsonify(_clean({
        "summary": A.summary(al),
        "trend": A.alert_trend(ctx, al),
        "list": A.alert_list(al, level=request.args.get("level") or None,
                             rule=request.args.get("rule") or None),
    }))


@app.get("/api/actions")
def actions_api():
    ctx = ctx_from_request()
    al = A.evaluate(ctx)
    acts = AC.build_actions(al, level=request.args.get("level") or None,
                            owner=request.args.get("owner") or None)
    return jsonify(_clean({
        "actions": acts,
        "workload": AC.owner_workload(al),
        "history": feishu.history(),
        "feishu_configured": bool(feishu.webhook()),
        "preview": AC.feishu_card(acts, _window_label(ctx)),
    }))


def _window_label(ctx: dict) -> str:
    ms = ctx["months"]
    return f"{ms[0]} ~ {ms[-1]}"


@app.post("/api/notify")
def notify():
    body = request.get_json(silent=True) or {}
    ids = body.get("merchant_ids") or []

    ctx = M.build(start=body.get("start") or None, end=body.get("end") or None)
    al = A.evaluate(ctx)
    acts = AC.build_actions(al, level=body.get("level") or None,
                            owner=body.get("owner") or None, limit=200)
    if ids:
        acts = [a for a in acts if a["merchant_id"] in ids]
    if not acts:
        return jsonify({"ok": False, "detail": "没有匹配的待办动作"}), 400

    card = AC.feishu_card(acts, _window_label(ctx))
    recipients = sorted({a["owner"] for a in acts})
    result = feishu.send(card, recipients, note=f"{len(acts)} 条动作")
    return jsonify(_clean({"result": result, "card": card, "count": len(acts),
                           "recipients": recipients}))
