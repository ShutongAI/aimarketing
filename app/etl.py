# -*- coding: utf-8 -*-
"""数据层：读取商家明细 → 清洗 → 展开月度事实表 → 派生销售归属与预警输入。

原表只有近 12 个月的汇总消耗，没有月度明细。本模块把年度总额确定性地展开成
12 个月，展开权重全部由表内已有字段驱动（趋势、大促次数、签约时间），并用商家ID
做种子，保证每次运行结果完全一致。详见 docs/大屏模块与字段设计.md。
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "data" / "QuickAudience商家分层练习-处理方式(1).xlsx"
SHEET = "商家明细"

# 观察窗口：12 个月，末月对齐数据最晚签约月之后的完整月
WINDOW_END = pd.Period("2026-08", freq="M")
MONTHS = [WINDOW_END - i for i in range(11, -1, -1)]
MONTH_KEYS = [str(m) for m in MONTHS]

CHANNELS = ["短信", "AI外呼", "Push及企微"]
CHANNEL_COL = {
    "短信": "近12月消耗-短信(元)",
    "AI外呼": "近12月消耗-AI外呼(元)",
    "Push及企微": "近12月消耗-Push及企微(元)",
}

TIER_ORDER = ["SKA", "KA", "腰部", "基础长尾", "新客观察期", "未激活"]

# 大促月脉冲：1月年货节 / 6月618 / 11月双11
PROMO_MONTHS = {1: 0.55, 6: 0.85, 11: 1.00}

# 近3月趋势 → 最后 3 个月的相对斜率
TREND_SHAPE = {
    "上升": (1.10, 1.22, 1.36),
    "持平": (1.00, 1.00, 1.00),
    "下降": (0.92, 0.82, 0.70),
    "连续下降": (0.80, 0.62, 0.45),
}

SALES_OWNERS = {
    "华东": ["周琳", "陈嘉禾", "顾昀"],
    "华南": ["黄予彤", "梁少辉"],
    "华北": ["赵沐", "孙冉"],
    "华中": ["彭亦洲", "何思远"],
    "西南": ["蒲一鸣", "唐悦"],
    "西北": ["马程"],
    "东北": ["刘岩", "王澈"],
}


def _seed(*parts: str) -> int:
    """由字符串生成稳定的整数种子（跨进程、跨平台一致）。"""
    h = hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def _month_weights(mid: str, channel: str, trend: str, promo: float, start: pd.Period) -> np.ndarray:
    """为一家商家的一个通道生成 12 个月的分配权重（和为 1）。"""
    w = np.ones(12, dtype=float)

    # 大促脉冲，强度随大促参与次数放大
    boost = min(promo, 10) / 10.0
    for i, m in enumerate(MONTHS):
        if m.month in PROMO_MONTHS:
            w[i] *= 1.0 + PROMO_MONTHS[m.month] * boost

    # 近 3 月趋势形态
    for k, factor in enumerate(TREND_SHAPE.get(trend, TREND_SHAPE["持平"])):
        w[9 + k] *= factor

    # 固定种子的温和扰动
    rng = np.random.default_rng(_seed(mid, channel))
    w *= rng.uniform(0.86, 1.14, size=12)

    # 签约前的月份不可能有消耗
    if pd.notna(start):
        w[np.array([m < start for m in MONTHS])] = 0.0
    if w.sum() <= 0:
        w = np.ones(12)

    return w / w.sum()


def _expand_monthly(df: pd.DataFrame) -> pd.DataFrame:
    """商家 × 通道 × 月 的长表事实。每家每通道 12 个月之和 == 原表年度总额。"""
    records = []
    for row in df.itertuples(index=False):
        mid = row.商家ID
        start = pd.Period(row.签约时间, freq="M") if pd.notna(row.签约时间) else pd.NaT
        for ch in CHANNELS:
            total = float(getattr(row, f"chan_{ch}"))
            if total <= 0:
                continue
            w = _month_weights(mid, ch, row.近3月消耗环比趋势, row.近12月大促参与次数, start)
            amounts = np.rint(total * w).astype(np.int64)
            amounts[-1] += total - amounts.sum()  # 尾差回补，保证总额守恒
            for mk, amt in zip(MONTH_KEYS, amounts):
                if amt:
                    records.append((mid, mk, ch, int(amt)))

    return pd.DataFrame(records, columns=["商家ID", "month", "channel", "amount"])


def _assign_owner(row) -> str:
    pool = SALES_OWNERS.get(row["所在区域"], ["待分配"])
    return pool[_seed(row["商家ID"]) % len(pool)]


@lru_cache(maxsize=1)
def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    """返回 (商家维表 dim, 月度事实表 fact)。结果缓存，进程内只算一次。"""
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        df = pd.read_excel(XLSX, sheet_name=SHEET, engine="openpyxl")

    df = df[df["商家ID"].notna()].copy()  # 末行是合计空行
    df["签约时间"] = pd.to_datetime(df["签约时间"])

    for ch, col in CHANNEL_COL.items():
        df[f"chan_{ch}"] = df[col].fillna(0)
    df["近12月消耗合计(元)"] = sum(df[f"chan_{ch}"] for ch in CHANNELS)

    int_cols = ["合作月数", "触达场景数(个)", "数据接入深度(0-3级)", "月均活跃发送天数(天)",
                "近12月大促参与次数(次)", "续费次数(次)", "营销团队人数(人)", "会员月活跃度(%)"]
    for c in int_cols:
        df[c] = df[c].fillna(0).astype(int)
    df["近12月大促参与次数"] = df["近12月大促参与次数(次)"]

    df["负责销售"] = df.apply(_assign_owner, axis=1)
    df["预警标签"] = df["预警标签"].fillna("")
    df["年度营销预算(元)"] = df["年度营销预算(万元)"].fillna(0) * 10000

    fact = _expand_monthly(df)

    dim = df.drop(columns=[f"chan_{ch}" for ch in CHANNELS] + ["近12月大促参与次数"])
    return dim, fact


def month_options() -> list[str]:
    return MONTH_KEYS
