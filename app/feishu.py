# -*- coding: utf-8 -*-
"""飞书群机器人推送。未配置 Webhook 时进入 Dry-run，只返回将要发送的卡片。"""

from __future__ import annotations

import datetime as dt
import json
import os
import urllib.request

WEBHOOK_ENV = "FEISHU_WEBHOOK"
_history: list[dict] = []


def webhook() -> str:
    return os.environ.get(WEBHOOK_ENV, "").strip()


def send(card: dict, recipients: list[str], note: str = "") -> dict:
    """发送卡片。返回 {ok, mode, detail}，并写入内存推送记录。"""
    url = webhook()
    record = {
        "time": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "recipients": recipients,
        "note": note,
        "mode": "webhook" if url else "dry-run",
        "ok": True,
        "detail": "",
    }

    if not url:
        record["detail"] = f"未配置 {WEBHOOK_ENV}，已生成卡片但未发送"
    else:
        try:
            req = urllib.request.Request(
                url, data=json.dumps(card, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            record["ok"] = body.get("StatusCode", body.get("code", 0)) == 0
            record["detail"] = body.get("StatusMessage") or body.get("msg") or "sent"
        except Exception as exc:  # noqa: BLE001 - demo 里把失败原因原样回显
            record["ok"] = False
            record["detail"] = f"{type(exc).__name__}: {exc}"

    _history.insert(0, record)
    del _history[50:]
    return record


def history() -> list[dict]:
    return _history
