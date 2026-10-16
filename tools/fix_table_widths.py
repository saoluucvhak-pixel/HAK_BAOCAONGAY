# -*- coding: utf-8 -*-
"""
v2.6.9 — Cân chỉnh KHUNG bảng trong mẫu Word, GIỮ NGUYÊN nội dung mẫu (Thủy chốt 29/09/2026: "để mẫu như cũ, chỉ cân chỉnh lại khung").
  - Chỉ sửa bảng được chỉ định (--table N, đếm từ 0): gridCol (đang 100 — sai) đặt theo độ rộng ô, thêm tblLayout fixed để Word / trình xem giữ đúng độ rộng.
  - --ratio (vd bảng số liệu 2 cột "Nội dung | Giá trị"): đặt lại độ rộng các cột theo tỉ lệ, tổng giữ nguyên.
Dùng: python3 tools/fix_table_widths.py <vào.docx> <ra.docx> [--table N --ratio 63,37 [--right-col K]]
"""
import re, sys, zipfile, shutil, argparse

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--table', type=int, action='append', default=[])
ap.add_argument('--ratio', action='append', default=[])
a = ap.parse_args()
plan = {t: [float(x) for x in r.split(',')] for t, r in zip(a.table, a.ratio)}

zin = zipfile.ZipFile(a.src)
x = zin.read('word/document.xml').decode('utf-8')


def fix(m, idx=[0]):
    t = m.group(0); i = idx[0]; idx[0] += 1
    if i not in plan: return t                                     # chỉ sửa bảng được chỉ định — các bảng khác giữ nguyên như mẫu
    rows = re.findall(r'<w:tr[ >].*?</w:tr>', t, re.S)
    first = rows[0]
    ws = [int(v) for v in re.findall(r'<w:tcW w:type="dxa" w:w="(\d+)"/>', first)]
    ncols = len(re.findall(r'<w:gridCol ', t))
    if i in plan and len(ws) == len(plan[i]) == ncols:
        total = sum(ws); r = plan[i]; new = [int(round(total * v / sum(r))) for v in r]; new[-1] = total - sum(new[:-1])
        def row_fix(rm):
            cells = re.findall(r'<w:tcW w:type="dxa" w:w="\d+"/>', rm.group(0))
            if len(cells) != len(new): return rm.group(0)
            it = iter(new)
            return re.sub(r'<w:tcW w:type="dxa" w:w="\d+"/>', lambda _: '<w:tcW w:type="dxa" w:w="%d"/>' % next(it), rm.group(0))
        t = re.sub(r'<w:tr[ >].*?</w:tr>', row_fix, t, flags=re.S)
        ws = new
        print('bảng', i, 'cột ->', new)
    if len(ws) == ncols:
        it = iter(ws)
        t = re.sub(r'<w:gridCol w:w="\d+"/>', lambda _: '<w:gridCol w:w="%d"/>' % next(it), t)
    if '<w:tblLayout' not in t:
        t = re.sub(r'(<w:tblW [^>]*/>)', r'\1<w:tblLayout w:type="fixed"/>', t, count=1)
    return t


x2 = re.sub(r'<w:tbl>.*?</w:tbl>', fix, x, flags=re.S)
zout = zipfile.ZipFile(a.dst, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    zout.writestr(it, x2.encode('utf-8') if it.filename == 'word/document.xml' else zin.read(it.filename))
zout.close()
print('OK', a.dst)
