# -*- coding: utf-8 -*-
"""Nhúng các template DOCX (thư mục templates/) vào js/templates-data.js dưới dạng base64,
để index.html chạy được khi mở trực tiếp bằng file:// (trình duyệt chặn fetch file cục bộ).
Chạy lại script này mỗi khi sửa file trong templates/."""
import base64, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tdir = os.path.join(root, 'templates')
out = ['/** TỰ SINH bởi tools/embed_templates.py — đừng sửa tay. Template mặc định (base64). */',
       '(function (root) { var HAK = (root.HAK = root.HAK || {}); HAK.TEMPLATES = {']
names = sorted(f for f in os.listdir(tdir) if f.endswith('.docx'))
for i, f in enumerate(names):
    b = base64.b64encode(open(os.path.join(tdir, f), 'rb').read()).decode()
    out.append("  '%s': '%s'%s" % (f[:-5], b, ',' if i < len(names) - 1 else ''))
out.append('}; })(typeof window !== "undefined" ? window : globalThis);')
open(os.path.join(root, 'js', 'templates-data.js'), 'w').write('\n'.join(out) + '\n')
print('OK', names)
