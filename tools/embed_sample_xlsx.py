"""Nhúng file Excel mẫu (bảng cân + danh sách xe) vào js/sample-xlsx.js — app tải bằng nút "⬇ Tải file Excel mẫu" (chạy offline).
Dựng lại mẫu: python3 tools/build_sample_xlsx.py tools/Mau_BangCan_XuatHang_va_DS_Xe.xlsx → recalc bằng LibreOffice → chạy file này."""
import base64, os
here = os.path.dirname(os.path.abspath(__file__)); name = 'Mau_BangCan_XuatHang_va_DS_Xe.xlsx'
b64 = base64.b64encode(open(os.path.join(here, name), 'rb').read()).decode()
js = ("/* sample-xlsx.js — TỰ SINH bởi tools/embed_sample_xlsx.py (v2.7.2). File Excel mẫu: sheet BANG CAN + DS XE - TAI XE + MA DVVC + HUONG DAN.\n"
      "   Nạp khi bấm \"⬇ Tải file Excel mẫu\" (Nhập liệu). Không sửa tay. */\n"
      "(function (root) { (root.HAK = root.HAK || {}).SampleXlsx = { name: '%s', b64: '%s' }; })(window);\n" % (name, b64))
open(os.path.join(here, '..', 'js', 'sample-xlsx.js'), 'w').write(js); print('ok', len(js)//1024, 'KB')
