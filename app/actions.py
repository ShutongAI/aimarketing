# -*- coding: utf-8 -*-
"""动作层：分层策略 × 命中预警 → 待办动作；生成飞书消息卡片。"""

from __future__ import annotations

import datetime as dt

import pandas as pd

from .alerts import LEVEL_RANK, RULE_DESC

# 规则 → 具体动作建议（与打分卡「分层×通道动作」口径对齐）
RULE_ACTION = {
    "连续下降": "拉取近3月场景级消耗明细做归因，48h 内约客户复盘会，出止跌方案",
    "消耗断崖": "当日电话触达确认是否停投/切竞品，同步预算与排期，必要时上报大区",
    "头部流失预警": "启动头部保级流程：商务+解决方案双人上门，谈续约与年框",
    "活跃衰减": "推送场景模板库，配 1 次运营陪跑，把活跃发送天数拉回 8 天以上",
    "场景收缩": "按分层策略补场景：优先 AI外呼（大促催付/复购召回），目标场景数 +2",
    "预算未消化": "带「可拓展预算空间」数据上门，做大促作战包报价，抢下半年预算",
    "沉默超期": "断约归因回访，给回签政策/首充补贴，不投专属人力",
}

SLA_DAYS = {"高危": 2, "中危": 5, "关注": 10}


def build_actions(alerted: pd.DataFrame, level: str | None = None, owner: str | None = None,
                  limit: int = 120) -> list[dict]:
    """把命中预警的商家展开成销售可执行的待办动作卡片。"""
    hit = alerted[alerted["level"] != "正常"].copy()
    if level:
        hit = hit[hit["level"] == level]
    if owner:
        hit = hit[hit["负责销售"] == owner]

    hit = hit.sort_values(["risk_exposure", "区间消耗"], ascending=False).head(limit)
    today = dt.date.today()

    out = []
    for r in hit.to_dict("records"):
        top_rule = min(r["rules"], key=lambda x: LEVEL_RANK[RULE_LEVEL_OF(x)])
        due = today + dt.timedelta(days=SLA_DAYS[r["level"]])
        out.append({
            "action_id": f"AC-{r['商家ID'][2:]}-{top_rule[:2]}",
            "merchant_id": r["商家ID"],
            "merchant": r["商家名称"],
            "tier": r["tier"],
            "level": r["level"],
            "rules": r["rules"],
            "top_rule": top_rule,
            "reason": RULE_DESC[top_rule],
            "action": RULE_ACTION[top_rule],
            "strategy": r["strategy"],
            "spend": float(r["区间消耗"]),
            "exposure": float(r["risk_exposure"]),
            "headroom": float(r["可拓展预算空间"]),
            "owner": r["负责销售"],
            "region": r["所在区域"],
            "industry": r["所属行业"],
            "due": due.isoformat(),
            "status": "待跟进",
        })
    return out


def RULE_LEVEL_OF(rule: str) -> str:
    from .alerts import RULE_LEVEL
    return RULE_LEVEL[rule]


def owner_workload(alerted: pd.DataFrame) -> list[dict]:
    """按销售汇总待办量与风险敞口，用于派单。"""
    hit = alerted[alerted["level"] != "正常"]
    g = (hit.groupby("负责销售")
         .agg(tasks=("商家ID", "count"), exposure=("risk_exposure", "sum"),
              critical=("level", lambda s: int((s == "高危").sum())))
         .sort_values("exposure", ascending=False))
    return [{"owner": k, "tasks": int(v["tasks"]), "critical": int(v["critical"]),
             "exposure": float(v["exposure"])} for k, v in g.iterrows()]


LEVEL_TEMPLATE = {"高危": "red", "中危": "orange", "关注": "yellow"}


def feishu_card(actions: list[dict], window: str) -> dict:
    """构造飞书交互式消息卡片（interactive card v2）。"""
    if not actions:
        return {}
    top = actions[0]
    lines = []
    for a in actions[:10]:
        lines.append(
            f"**{a['merchant']}**（{a['tier']}·{a['region']}）｜{a['top_rule']}\n"
            f"区间消耗 ¥{a['spend']:,.0f}｜风险敞口 ¥{a['exposure']:,.0f}｜"
            f"可拓展预算 ¥{a['headroom']:,.0f}\n"
            f"建议动作：{a['action']}\n"
            f"负责人：{a['owner']}｜截止 {a['due']}")
    more = f"\n\n> 另有 {len(actions) - 10} 条未展开，点击进入大屏查看完整清单。" if len(actions) > 10 else ""

    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "template": LEVEL_TEMPLATE.get(top["level"], "blue"),
                "title": {"tag": "plain_text",
                          "content": f"【商家运营预警】{len(actions)} 条待跟进 · {window}"},
            },
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": "\n\n---\n\n".join(lines) + more}},
                {"tag": "hr"},
                {"tag": "note", "elements": [{"tag": "plain_text",
                                              "content": "QuickAudience 商家分层大屏自动推送"}]},
                {"tag": "action", "actions": [
                    {"tag": "button", "text": {"tag": "plain_text", "content": "打开大屏"},
                     "type": "primary", "url": "http://localhost:5000/#alert"}]},
            ],
        },
    }
