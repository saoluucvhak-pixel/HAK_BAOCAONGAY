# -*- coding: utf-8 -*-
"""
v2.6.9 — Giảm giãn dòng giữa các phần của PHẦN BIÊN BẢN (section đầu, trước phụ lục) để biên bản gọn 1 trang, GIỮ NGUYÊN nội dung mẫu
(Thủy 29/09/2026: "giãn dòng giữa các phần cao quá, biên bản cân đối vào 1 trang").
  - khoảng cách sau đoạn (w:after) theo bảng MAP; ô bảng: lề trên/dưới 60 → 30.
Dùng: python3 tools/tighten_spacing.py <vào.docx> <ra.docx>
"""
import re, sys, zipfile
MAP = {'350': '120', '300': '100', '250': '100', '150': '60', '120': '40'}
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
x = zin.read('word/document.xml').decode('utf-8')
b = x.index('<w:body>'); e = x.index('<w:sectPr', b)          # section 1 = phần biên bản (sectPr đầu tiên nằm trong đoạn cuối của nó)
sec = x[b:e]
sec = re.sub(r'w:after="(\d+)"', lambda m: 'w:after="%s"' % MAP.get(m.group(1), m.group(1)), sec)
sec = sec.replace('<w:top w:type="dxa" w:w="60"/>', '<w:top w:type="dxa" w:w="30"/>').replace('<w:bottom w:type="dxa" w:w="60"/>', '<w:bottom w:type="dxa" w:w="30"/>')
x2 = x[:b] + sec + x[e:]
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    zout.writestr(it, x2.encode('utf-8') if it.filename == 'word/document.xml' else zin.read(it.filename))
zout.close(); print('OK', dst)
