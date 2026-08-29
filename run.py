# -*- coding: utf-8 -*-
"""启动大屏：python3 run.py  → http://127.0.0.1:5000

可选环境变量 FEISHU_WEBHOOK：配置后动作提醒直发飞书群机器人，未配置则 Dry-run 预览卡片。
"""

from app.api import app
from app.etl import load

if __name__ == "__main__":
    load()  # 启动时预热数据，避免首个请求慢
    app.run(host="0.0.0.0", port=5000, debug=False)
