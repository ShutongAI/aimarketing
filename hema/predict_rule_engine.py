# -*- coding: utf-8 -*-
"""盒马门店品牌名(业态)归属预测 —— 规则引擎 v1
X列: 连锁名称，仅4种取值  1.盒马鲜生 2.盒马mini 3.超盒算NB 4.独立（非盒马系列）
Y列: 未直接命中上述3种活体业态时的负向词/黑名单词
"""
import re, sys
import openpyxl

XIANSHENG, MINI, NB, DULI = "盒马鲜生", "盒马mini", "超盒算NB", "独立（非盒马系列）"

def norm(s):
    if not s: return ""
    s = str(s).strip().lower()
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"[\s\-_·、,，]", "", s)
    return s

def has_hema(t):
    return "盒马" in t or "超盒算" in t

def predict(poi_name, cleaned, atag, area, addr):
    """returns (X, Y, reason)"""
    t = norm(poi_name) or norm(cleaned)
    c = norm(cleaned)
    blob = t + "|" + c

    # 0) 完全无盒马字样 -> 独立
    if not has_hema(blob):
        return DULI, "无盒马字样", "店名中不含盒马/超盒算，判为非盒马系列"

    # 1) 折扣业态 超盒算NB（含 盒马NB / NB / 超盒算 / 城市前缀+超盒算NB）
    if "超盒算" in blob or re.search(r"盒马nb", blob) or re.search(r"(?<![a-z])nb(?![a-z])", blob):
        return NB, "", "命中超盒算NB/盒马NB，折扣店业态"

    # 2) 奥莱系 -> 已更名并入 超盒算NB
    if "奥莱" in blob or "奥特莱斯" in blob:
        return NB, "奥莱", "盒马生鲜奥莱业态已淘汰，门店整体更名为超盒算NB"

    # 3) mini
    if "mini" in blob or "迷你" in blob:
        return MINI, "", "命中盒马mini小业态"

    # 4) 会员店 -> 已淘汰，存活门店转为盒马鲜生
    if "会员店" in blob or re.search(r"盒马x", blob):
        return XIANSHENG, "会员店", "盒马X会员店业态已淘汰，存量门店转制为盒马鲜生"

    # 5) 非门店实体（仓储/前置仓/配送）
    if re.search(r"(前置仓|配送仓|仓库|物流|分拨|加工中心|工坊|供应链)", blob):
        w = re.search(r"(前置仓|配送仓|仓库|物流|分拨|加工中心|工坊|供应链)", blob).group(1)
        return DULI, w, "盒马体系内的仓储/加工实体，非零售门店，不计入三大业态"

    # 6) 其它已淘汰/非门店子品牌
    m = re.search(r"(邻里|集市|菜市|小站|来了|f2|云超|智慧餐厅|机器人餐厅)", blob)
    if m:
        return DULI, m.group(1), "盒马已关停/非商超子业态，不属于当前三大业态"

    # 7) 主力标准超市：盒马鲜生 / 盒马生鲜 / 盒马超市 / 光杆"盒马"
    if re.search(r"盒马鲜生|盒马生鲜|盒马超市|盒马旗下", blob) or c in ("盒马",) or re.search(r"^盒马($|\()", t):
        return XIANSHENG, "", "命中盒马鲜生/盒马标准超市业态"

    # 8) 兜底：含盒马但无法归入任一业态
    return XIANSHENG, "", "含盒马字样、无其它业态特征词，按主力业态盒马鲜生兜底"


def main(src, dst, first_row=2, last_row=None):
    wb = openpyxl.load_workbook(src)
    ws = wb["Sheet1"]
    last_row = last_row or ws.max_row
    ws.cell(1, 24).value = "连锁名称预测"      # X
    ws.cell(1, 25).value = "负向词/黑名单"     # Y
    ws.cell(1, 26).value = "判断依据"          # Z
    for r in range(first_row, last_row + 1):
        g = lambda c: ws.cell(r, c).value
        x, y, why = predict(g(3), g(22), g(21), g(16), g(4))
        ws.cell(r, 24).value = x
        ws.cell(r, 25).value = y
        ws.cell(r, 26).value = why
    wb.save(dst)
    print("saved", dst, "rows", first_row, "-", last_row)

if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], int(a[2]) if len(a) > 2 else 2, int(a[3]) if len(a) > 3 else None)
