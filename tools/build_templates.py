# -*- coding: utf-8 -*-
"""
Dựng 5 template DOCX (Docxtemplater, delimiter {{ }}) từ các file mẫu thật của HAK Group.
Giữ nguyên định dạng mẫu; chỉ thay nội dung động bằng placeholder & biến bảng thành vòng lặp.
Chạy:  python3 build_templates.py <thư_mục_uploads> <thư_mục_ra>
"""
import sys, copy, glob, os, re
import docx
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from docx.table import Table, _Cell

SRC = sys.argv[1]; OUT = sys.argv[2]

def find(pattern):
    m = glob.glob(os.path.join(SRC, pattern))
    assert m, pattern
    return m[0]

# ---------- helpers ----------
def all_paragraphs(doc):
    for p in doc.element.body.iter(qn('w:p')):
        yield Paragraph(p, doc)

def set_par(p, text):
    """Đặt lại text của đoạn, giữ định dạng run đầu tiên."""
    runs = p.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r._r.getparent().remove(r._r)
    else:
        p.add_run(text)

def sub(doc, prefix, new, nth=0, exact=False):
    """Thay toàn bộ text của đoạn thứ nth có text bắt đầu (hoặc bằng) prefix."""
    k = 0
    for p in all_paragraphs(doc):
        t = p.text
        if (t == prefix) if exact else t.startswith(prefix):
            if k == nth:
                set_par(p, new); return
            k += 1
    raise AssertionError('Không tìm thấy đoạn: %r (nth=%d)' % (prefix, nth))

def seq(doc, prefix, news):
    for i, n in enumerate(news):
        sub(doc, prefix, n, nth=i) if False else None
    # thay lần lượt theo thứ tự xuất hiện
    it = iter(news); cnt = 0
    for p in all_paragraphs(doc):
        if p.text.startswith(prefix):
            try: n = next(it)
            except StopIteration: break
            set_par(p, n); cnt += 1
    assert cnt == len(news), (prefix, cnt, len(news))

def tc_set(tc, text):
    p = tc.findall(qn('w:p'))[0]
    P = Paragraph(p, None)
    set_par(P, text)

def add_hdr_repeat(tbl):
    trs = tbl._tbl.findall(qn('w:tr'))
    for i, tr in enumerate(trs):
        trPr = tr.find(qn('w:trPr'))
        if trPr is None:
            trPr = OxmlElement('w:trPr'); tr.insert(0, trPr) if tr.find(qn('w:tblPrEx')) is None else tr.insert(1, trPr)
        if trPr.find(qn('w:cantSplit')) is None:
            trPr.append(OxmlElement('w:cantSplit'))
        if i == 0 and trPr.find(qn('w:tblHeader')) is None:
            trPr.append(OxmlElement('w:tblHeader'))

def loop_table(tbl, loop, fields, data_idx=1, total_texts=None, drop=()):
    """
    Biến bảng thành vòng lặp: giữ hàng tiêu đề (0), hàng dữ liệu data_idx làm hàng lặp,
    hàng cuối là hàng tổng (nếu total_texts != None). Các hàng khác bị xoá.
    """
    trs = tbl._tbl.findall(qn('w:tr'))
    keep = {0, data_idx}
    total_tr = trs[-1] if total_texts is not None else None
    for i, tr in enumerate(trs):
        if tr is total_tr: continue
        if i not in keep: tbl._tbl.remove(tr)
    data_tr = trs[data_idx]
    tcs = data_tr.findall(qn('w:tc'))
    assert len(tcs) == len(fields), (len(tcs), len(fields))
    for i, (tc, f) in enumerate(zip(tcs, fields)):
        txt = '{{%s}}' % f
        if i == 0: txt = '{{#%s}}' % loop + txt
        if i == len(tcs) - 1: txt = txt + '{{/%s}}' % loop
        tc_set(tc, txt)
    if total_tr is not None:
        ttcs = total_tr.findall(qn('w:tc'))
        for tc, t in zip(ttcs, total_texts):
            if t is not None: tc_set(tc, t)
    add_hdr_repeat(tbl)

def cell_text(tbl, r, c):
    return tbl.rows[r].cells[c]

def set_cell(tbl, r, c, text):
    set_par(tbl.rows[r].cells[c].paragraphs[0], text)

def new_par_after(ref_el, text):
    p = OxmlElement('w:p')
    r = OxmlElement('w:r'); t = OxmlElement('w:t'); t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    r.append(t); p.append(r); ref_el.addnext(p); return p

def new_par_before(ref_el, text):
    p = OxmlElement('w:p')
    r = OxmlElement('w:r'); t = OxmlElement('w:t'); t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    r.append(t); p.append(r); ref_el.addprevious(p); return p

def sig_table(doc, idx, giao_role, nhan_role):
    """Bảng ký tên 1x2: 4 đoạn mỗi ô."""
    t = doc.tables[idx]
    tr = t._tbl.findall(qn('w:tr'))[0]
    trPr = tr.find(qn('w:trPr'))
    if trPr is None:
        trPr = OxmlElement('w:trPr'); tr.insert(0, trPr)
    trPr.append(OxmlElement('w:cantSplit'))          # khối chữ ký không bao giờ bị cắt đôi qua 2 trang
    for ci, pre in ((0, 'giao'), (1, 'nhan')):
        ps = t.rows[0].cells[ci].paragraphs
        texts = [ps[0].text, '{{%s_name}}' % pre, '{{%s_rep}}' % pre, '{{%s_position}}' % pre]
        # tìm 4 đoạn có chữ (bỏ đoạn trống ký tên)
        real = [p for p in ps if p.text.strip()]
        assert len(real) == 4, [p.text for p in ps]
        set_par(real[0], real[0].text.replace('ỦY THÁC', 'ỦY THÁC'))  # giữ nguyên tiêu đề
        set_par(real[1], '{{%s_name}}' % pre)
        set_par(real[2], '{{%s_rep}}' % pre)
        set_par(real[3], '{{%s_position}}' % pre)

def party_block(doc, pre, header_prefix, header_new, nth_key):
    pass

def set_widths(tbl, weights):
    """Đặt lại độ rộng cột theo tỉ lệ (giữ nguyên tổng độ rộng bảng), xử lý ô gộp gridSpan."""
    el = tbl._tbl
    grid = el.find(qn('w:tblGrid')); gcs = grid.findall(qn('w:gridCol'))
    total = sum(int(g.get(qn('w:w'))) for g in gcs)
    ws = [int(total * w / sum(weights)) for w in weights]
    assert len(ws) == len(gcs), (len(ws), len(gcs))
    for g, w in zip(gcs, ws): g.set(qn('w:w'), str(w))
    for tr in el.findall(qn('w:tr')):
        ci = 0
        for tc in tr.findall(qn('w:tc')):
            tcPr = tc.find(qn('w:tcPr')); span = 1
            if tcPr is not None and tcPr.find(qn('w:gridSpan')) is not None:
                span = int(tcPr.find(qn('w:gridSpan')).get(qn('w:val')))
            if tcPr is not None and tcPr.find(qn('w:tcW')) is not None:
                w = tcPr.find(qn('w:tcW')); w.set(qn('w:w'), str(sum(ws[ci:ci+span]))); w.set(qn('w:type'), 'dxa')
            ci += span

# ============================================================
# 1) BIÊN BẢN GIAO NHẬN ĐIỀU CHUYỂN  (mẫu T11/2024)
# ============================================================
def build_dieuchuyen():
    d = docx.Document(find('*BienBan_GiaoNhan_DieuChuyen_T11_2024.docx'))
    sub(d, 'ĐỢT TRUNG CHUYỂN:', 'ĐỢT TRUNG CHUYỂN: THÁNG {{periodMonth}}/{{periodYear}}')
    sub(d, '(Thời gian thực hiện:', '(Thời gian thực hiện: {{dateFrom}} đến {{dateTo}})')
    sub(d, '- Quyết định điều chuyển', '- Quyết định điều chuyển hàng hóa số {{qdNo}}, ký ngày {{qdDate}}, của {{issuer_name}} về việc điều chuyển hàng hóa dăm gỗ phục vụ xuất khẩu — Đợt trung chuyển Tháng {{periodMonth}}/{{periodYear}};')
    sub(d, '- Số liệu cân xe thực tế', '- Số liệu cân xe thực tế tại {{giao_name}} ({{giao_khoShort}}), kiểu cân "{{weightType}}", từ ngày {{dateFrom}} đến ngày {{dateTo}} (trích Báo cáo danh sách các lượt xe đã cân).')
    sub(d, 'BÊN GIAO (', 'BÊN GIAO ({{giao_role}}): {{giao_name}}')
    sub(d, 'BÊN NHẬN (', 'BÊN NHẬN ({{nhan_role}}): {{nhan_name}}')
    seq(d, 'Mã số doanh nghiệp:', ['Mã số doanh nghiệp: {{giao_tax}}', 'Mã số doanh nghiệp: {{nhan_tax}}'])
    seq(d, 'Địa chỉ:', ['Địa chỉ: {{giao_address}}', 'Địa chỉ: {{nhan_address}}'])
    seq(d, 'Người đại diện:', ['Người đại diện: {{giao_rep}} — Chức vụ: {{giao_position}}',
                               'Người đại diện: {{nhan_rep}} — Chức vụ: {{nhan_position}}'])
    t0 = d.tables[0]
    vals = {1: 'Tháng {{periodMonth}}/{{periodYear}}', 2: '{{dateFrom}} đến {{dateTo}}', 3: '{{trip}} xe',
            4: '{{weight}} tấn', 5: '{{kho_giao}}', 6: '{{kho_nhan}}', 7: '{{qdNo}}', 8: '{{qdDate}}'}
    set_cell(t0, 3, 0, 'Số lượt xe qua cân ({{giao_khoShort}})')
    set_cell(t0, 4, 0, 'Tổng khối lượng qua cân ({{giao_khoShort}})')
    for r, v in vals.items(): set_cell(t0, r, 1, v)
    sig_table(d, 1, None, None)
    sub(d, 'Kho Quế Sơn — Tháng', '{{giao_khoShort}} — Tháng {{periodMonth}}/{{periodYear}}  —  {{trip}} phiếu cân, {{weight}} tấn')
    t2 = d.tables[2]
    loop_table(t2, 'table', ['stt','ticket','time1','time2','plate','w1','w2','net','driver'], data_idx=1,
               total_texts=['TỔNG CỘNG:  ', '{{weightKg}} kg', None])
    set_widths(t2, [5, 14, 15, 15, 11, 9, 9, 10, 12])   # số phiếu dạng 9672/2026/XK cần cột rộng hơn
    d.save(os.path.join(OUT, 'DieuChuyen.docx'))

# ============================================================
# 2) QUYẾT ĐỊNH ĐIỀU CHUYỂN  (mẫu T02/2025)
# ============================================================
def build_quyetdinh():
    d = docx.Document(find('*QuyetDinh_DieuChuyen_T02_2025.docx'))
    t0 = d.tables[0]
    set_cell(t0, 0, 0, '{{issuer_name_upper}}')
    set_cell(t0, 1, 0, 'Số: {{qdNo}}')
    set_cell(t0, 2, 1, '{{place}}, ngày {{date}} tháng {{month}} năm {{year}}')
    sub(d, 'Về việc điều chuyển', 'Về việc điều chuyển hàng hóa dăm gỗ phục vụ xuất khẩu — Đợt trung chuyển Tháng {{periodMonth}}/{{periodYear}}')
    sub(d, 'Xét đề nghị của', 'Xét đề nghị của {{giao_name}};')
    sub(d, '- Điều chuyển từ:', '- Điều chuyển từ: {{kho_giao}}')
    sub(d, '- Đến:', '- Đến: {{kho_nhan}}')
    sub(d, '- Thời gian thực hiện:', '- Thời gian thực hiện: từ ngày {{dateFrom}} đến ngày {{dateTo}}')
    sub(d, '- Số lượt xe qua cân:', '- Số lượt xe qua cân: {{trip}} xe')
    sub(d, '- Khối lượng dự kiến:', '- Khối lượng dự kiến: {{weightRound}} tấn (làm tròn)')
    sub(d, '- Chi nhánh Công ty TNHH Hoàng Anh Khôi có trách nhiệm',
        '- {{giao_name}} có trách nhiệm tổ chức phương tiện, nhân công thực hiện việc điều chuyển hàng hóa nêu tại Điều 1 đúng thời gian, khối lượng quy định;')
    # bảng nơi nhận / chữ ký
    t1 = d.tables[1]
    c0, c1 = t1.rows[0].cells
    for p in c0.paragraphs:
        if p.text.startswith('- Chi nhánh'): set_par(p, '- {{giao_name}};')
    ps = [p for p in c1.paragraphs if p.text.strip()]
    assert len(ps) == 2, [p.text for p in c1.paragraphs]
    set_par(ps[0], ps[0].text)            # "GIÁM ĐỐC"
    set_par(ps[1], '{{issuer_rep}}')
    d.save(os.path.join(OUT, 'QuyetDinh.docx'))

# ============================================================
# 3) ỦY THÁC XUẤT KHẨU  (mẫu HJ TIANHE V.2610)
# ============================================================
def build_uythac():
    d = docx.Document(find('*BienBan_HJ_TIANHE*'))
    sub(d, 'TÀU:', 'TÀU: {{ship}}')
    sub(d, '(Thời gian xuất hàng:', '(Thời gian xuất hàng: {{dateFrom}} đến {{dateTo}})')
    sub(d, '- Hợp đồng ủy thác xuất khẩu số', '- Hợp đồng ủy thác xuất khẩu số {{contractNo}}, ký ngày {{contractDate}}, giữa {{giao_name}} (Bên ủy thác) và {{nhan_name}} (Bên nhận ủy thác){{contractQtyText}};')
    sub(d, '- Chứng thư giám định', '- Chứng thư giám định khối lượng và phẩm chất tàu {{ship}}, số {{certNo}}, ngày {{certDate}};')
    sub(d, '- Số liệu cân xe thực tế', '- Số liệu cân xe thực tế tại {{factory}} (trích từ Bảng tổng hợp xuất hàng/chi phí vận chuyển tàu {{ship}}).')
    sub(d, 'BÊN ỦY THÁC (', 'BÊN ỦY THÁC (Người ủy thác xuất khẩu — chủ sở hữu hàng hóa): {{giao_name}}')
    sub(d, 'BÊN NHẬN ỦY THÁC (', 'BÊN NHẬN ỦY THÁC (Người xuất khẩu — đứng tên chính thức trên Chứng thư giám định và tờ khai hải quan): {{nhan_name}}')
    seq(d, 'Mã số doanh nghiệp:', ['Mã số doanh nghiệp: {{giao_tax}}', 'Mã số doanh nghiệp: {{nhan_tax}}'])
    seq(d, 'Địa chỉ:', ['Địa chỉ: {{giao_address}}', 'Địa chỉ: {{nhan_address}}'])
    seq(d, 'Người đại diện:', ['Người đại diện: {{giao_rep}} — Chức vụ: {{giao_position}}',
                               'Người đại diện: {{nhan_rep}} — Chức vụ: {{nhan_position}}'])
    t0 = d.tables[0]
    vals = ['{{ship}}', '{{dateFrom}} đến {{dateTo}}', '{{weightScaleTon}} tấn', '{{returnedText}}',
            '{{weightDelivered}} tấn', '{{certWetText}}', '{{certDryText}}', '{{moistureText}}',
            '{{certNo}}', '{{contractNo}}', '{{contractDate}}']
    for i, v in enumerate(vals): set_cell(t0, i + 1, 1, v)
    sig_table(d, 1, None, None)
    sub(d, 'Đại Hiệp — Tàu', '{{giao_short}} — Tàu {{ship}}  —  {{trip}} phiếu cân, {{weightScaleTon}} tấn (theo Tổng hợp xuất hàng)', nth=0)
    # ---- bảng phụ lục 1: bỏ dòng nhóm kho (1) & dòng "Cộng Kho" ----
    t2 = d.tables[2]
    trs = t2._tbl.findall(qn('w:tr'))
    # trs: 0 header, 1 nhóm kho, 2 dữ liệu ..., -2 "Cộng kho", -1 tổng
    total_tr = trs[-1]; cong_tr = trs[-2]
    t2._tbl.remove(trs[1]); t2._tbl.remove(cong_tr)
    trs = t2._tbl.findall(qn('w:tr'))
    for tr in trs[2:-1]: t2._tbl.remove(tr)
    trs = t2._tbl.findall(qn('w:tr'))       # header, data, total
    tcs = trs[1].findall(qn('w:tc'))
    fields = ['stt','ticket','time1','time2','plate','w1','w2','net','wh','carrier']
    for i, (tc, f) in enumerate(zip(tcs, fields)):
        txt = '{{%s}}' % f
        if i == 0: txt = '{{#table}}' + txt
        if i == len(tcs) - 1: txt += '{{/table}}'
        tc_set(tc, txt)
    tc_set(trs[2].findall(qn('w:tc'))[0], 'TỔNG CỘNG:  {{weightScaleKg}} kg  ({{trip}} phiếu)')
    add_hdr_repeat(t2)
    # ---- phần xe trả về: bọc trong {{#hasReturned}} ----
    head = [p for p in d.paragraphs if p.text.startswith('PHỤ LỤC: DANH SÁCH XE TRẢ VỀ')][0]
    sub(d, 'Đại Hiệp — Tàu', '{{giao_short}} — Tàu {{ship}}  —  {{returnedTrip}} xe, {{returnedTon}} tấn', nth=0)  # đoạn thứ 2 (đoạn 1 đã đổi)
    t3 = d.tables[3]
    loop_table(t3, 'returned', ['stt','ticket','time1','time2','plate','w1','w2','net','wh','carrier'], data_idx=1,
               total_texts=['TỔNG CỘNG XE TRẢ VỀ:  {{returnedKg}} kg', None])
    # đoạn mở/đóng vòng lặp có điều kiện
    # tìm đoạn rỗng (có page-break?) ngay trước heading để chèn tag trước đó
    open_p = new_par_before(head._p, '{{#hasReturned}}')
    close_p = new_par_after(t3._tbl, '{{/hasReturned}}')
    new_par_after(close_p, '')            # đoạn cuối cùng cần có sau bảng
    d.save(os.path.join(OUT, 'UyThac.docx'))

# ============================================================
# 4) TRAO ĐỔI HÀNG HÓA  (mẫu 01/2026)
# ============================================================
def build_traodoi():
    d = docx.Document(find('*BangChiTietCanHang_TraoDoi*'))
    sub(d, 'THÁNG 01/2026', 'THÁNG {{periodMonth}}/{{periodYear}}')
    sub(d, '(Kèm theo Hợp đồng trao đổi số:', '(Kèm theo Hợp đồng trao đổi số: {{contractNo}} giữa {{giao_name}} và {{nhan_name}})')
    sub(d, 'Đơn vị giao:', 'Đơn vị giao: {{giao_name}} ({{giao_short}})')
    sub(d, 'Bàn cân xuất:', 'Bàn cân xuất: {{kho_giao}}  —  Nơi giao hàng: {{kho_nhan}}')
    t = d.tables[0]
    loop_table(t, 'table', ['stt','ticket','time1','time2','plate','w1','w2','net','carrier','driver'], data_idx=1,
               total_texts=['TỔNG CỘNG THÁNG {{periodMonth}}/{{periodYear}}:  {{trip}} phiếu — {{weightKg}} kg ({{weight}} tấn)', None, None])
    sg = d.tables[1]
    for ci, pre in ((0, 'giao'), (1, 'nhan')):
        ps = [p for p in sg.rows[0].cells[ci].paragraphs if p.text.strip()]
        assert len(ps) == 2, [p.text for p in ps]
        set_par(ps[1], '{{%s_name}}' % pre)
    d.save(os.path.join(OUT, 'TraoDoi.docx'))

# ============================================================
# 5) BIÊN BẢN XÁC NHẬN HÀNG GỬI KHO  (mẫu PDF 03/2025, dựng trên khung docx điều chuyển)
# ============================================================
# Mẫu gốc để tblGrid = 100/100 (giữ chỗ) và độ rộng thật nằm ở tcW → Word/LibreOffice/trình duyệt hiểu khác nhau.
# Đồng bộ tblGrid = tcW; bảng thông tin: cột nhãn hẹp (32%), cột giá trị rộng (68%) vì tên kho dài.
def sync_grid(tbl, widths=None):
    el = tbl._tbl; gcs = el.find(qn('w:tblGrid')).findall(qn('w:gridCol'))
    if widths is None:
        widths = [int(tc.find(qn('w:tcPr')).find(qn('w:tcW')).get(qn('w:w'))) for tc in el.findall(qn('w:tr'))[0].findall(qn('w:tc'))]
    assert len(widths) == len(gcs), (len(widths), len(gcs))
    for g, w in zip(gcs, widths): g.set(qn('w:w'), str(w))
    for tr in el.findall(qn('w:tr')):
        ci = 0
        for tc in tr.findall(qn('w:tc')):
            tcPr = tc.find(qn('w:tcPr')); gs = tcPr.find(qn('w:gridSpan')); span = int(gs.get(qn('w:val'))) if gs is not None else 1
            tcPr.find(qn('w:tcW')).set(qn('w:w'), str(sum(widths[ci:ci + span]))); tcPr.find(qn('w:tcW')).set(qn('w:type'), 'dxa'); ci += span

def build_guikho():
    """Biên bản giao nhận hàng gửi kho — dựng từ mẫu thật "BienBan_GuiKho_Đợt 0406 - 15062026.docx":
    khung + bảng thông tin 2 cột + phụ lục bảng kê TỪNG PHIẾU CÂN (9 cột, có cột ĐVVC)."""
    d = docx.Document(find('*BienBan_GuiKho___t_*'))
    sub(d, 'ĐỢT ', 'ĐỢT {{dateFromShort}} - {{dateTo}}')
    sub(d, '(Thời gian thực hiện:', '(Thời gian thực hiện: {{dateFrom}} đến {{dateTo}})')
    sub(d, 'Căn cứ Hợp đồng ủy thác', 'Căn cứ Hợp đồng ủy thác xuất khẩu được ký giữa {{giao_name}} và {{nhan_name}};')
    sub(d, 'Căn cứ số liệu cân xe thực tế',
        'Căn cứ số liệu cân xe thực tế tại {{kho_giao_full}}, hàng dăm gỗ của Bên gửi được vận chuyển và gửi về {{kho_nhan_full}}. '
        'Hàng vẫn thuộc quyền sở hữu của Bên gửi trong thời gian lưu tại kho.')
    sub(d, 'BÊN GIAO (', 'BÊN GIAO ({{giao_role}}): {{giao_name}}')
    sub(d, 'BÊN NHẬN (', 'BÊN NHẬN ({{nhan_role}}): {{nhan_name}}')
    seq(d, 'Mã số doanh nghiệp:', ['Mã số doanh nghiệp: {{giao_tax}}', 'Mã số doanh nghiệp: {{nhan_tax}}'])
    seq(d, 'Địa chỉ:', ['Địa chỉ: {{giao_address}}', 'Địa chỉ: {{nhan_address}}'])
    seq(d, 'Người đại diện:', ['Người đại diện: {{giao_rep}} — Chức vụ: {{giao_position}}',
                               'Người đại diện: {{nhan_rep}} — Chức vụ: {{nhan_position}}'])
    t0 = d.tables[0]
    rows = [('Đợt gửi kho', 'Đợt {{dateFromShort}} - {{dateTo}}'),
            ('Thời gian thực hiện', '{{dateFrom}} đến {{dateTo}}'),
            ('Kho giao (bàn cân xuất)', '{{kho_giao_full}}'),
            ('Kho nhận', '{{kho_nhan_full}}'),
            ('Số lượt xe qua cân', '{{trip}}'),
            ('Tổng khối lượng giao nhận', '{{weight}} tấn ({{weightKg}} kg)')]
    assert len(t0.rows) == len(rows) + 1
    for i, (a, b) in enumerate(rows):
        set_cell(t0, i + 1, 0, a); set_cell(t0, i + 1, 1, b)
    sig_table(d, 1, None, None)
    sub(d, 'Đợt 04/06', 'Đợt {{dateFromShort}} - {{dateTo}} — {{kho_giao_short}} → {{kho_nhan_short}}')
    sync_grid(d.tables[0], [3200, 6300]); sync_grid(d.tables[1])
    detail = d.tables[2]
    loop_table(detail, 'table', ['stt', 'ticket', 'time1', 'time2', 'plate', 'w1', 'w2', 'net', 'carrier'], data_idx=1,
               total_texts=['TỔNG CỘNG:  {{weightKg}} kg', None])
    sync_grid(detail)
    d.save(os.path.join(OUT, 'GuiKho.docx'))

def build_xuatkhogui():
    """BẢNG XÁC NHẬN HÀNG GỬI KHO XUẤT KHẨU (theo từng tàu) — dựng từ mẫu "BangGuiKho_JR_SOPHIA_V.2501_HAKQN_XUẤT KHO GỞI.docx"."""
    d = docx.Document(find('*BangGuiKho_JR_SOPHIA*'))
    sub(d, 'TÀU:', 'TÀU: {{ship}}')
    sub(d, '(Thời gian xuất hàng:', '(Thời gian xuất hàng: {{dateFrom}} đến {{dateTo}})')
    sub(d, 'Căn cứ số liệu cân xe thực tế',
        'Căn cứ số liệu cân xe thực tế, hàng của Bên gửi được vận chuyển và cân tại {{kho_nhan}} để nạp lên tàu xuất khẩu. '
        'Hàng vẫn thuộc quyền sở hữu và đứng tên xuất khẩu của Bên gửi.')
    sub(d, 'BÊN GỬI (', 'BÊN GỬI ({{giao_role}}): {{giao_name}}')
    sub(d, 'BÊN NHẬN —', 'BÊN NHẬN — ĐẠI DIỆN KHO GỬI {{khoGuiCode}} ({{kho_nhan}}): {{nhan_name}}')
    seq(d, 'Mã số doanh nghiệp:', ['Mã số doanh nghiệp: {{giao_tax}}', 'Mã số doanh nghiệp: {{nhan_tax}}'])
    seq(d, 'Địa chỉ:', ['Địa chỉ: {{giao_address}}', 'Địa chỉ: {{nhan_address}}'])
    seq(d, 'Người đại diện:', ['Người đại diện: {{giao_rep}} — Chức vụ: {{giao_position}}',
                               'Người đại diện: {{nhan_rep}} — Chức vụ: {{nhan_position}}'])
    t0 = d.tables[0]
    rows = [('Tàu', '{{ship}}'),
            ('Thời gian xuất hàng', '{{dateFrom}} đến {{dateTo}}'),
            ('Kho xuất (kho gửi)', '{{kho_giao_short}}'),
            ('Kho gởi đến', '{{kho_nhan}}'),
            ('Số xe', '{{trip}}'),
            ('Khối lượng xuống cảng (gross)', '{{weightScaleTon}} tấn'),
            ('Trừ: Xe trả về', '{{returnedText}}'),
            ('= Khối lượng thực gửi/nhận (net)', '{{weightDelivered}} tấn')]
    assert len(t0.rows) == len(rows) + 1, len(t0.rows)
    for i, (a, b) in enumerate(rows):
        set_cell(t0, i + 1, 0, a); set_cell(t0, i + 1, 1, b)
    sig_table(d, 1, None, None)
    # tiêu đề chữ ký bên nhận: "ĐẠI DIỆN KHO GỬI HAKĐN"
    for p in d.tables[1].rows[0].cells[1].paragraphs:
        if p.text.startswith('ĐẠI DIỆN KHO GỬI'): set_par(p, 'ĐẠI DIỆN KHO GỬI {{khoGuiCode}}'); break
    sub(d, 'Kho HAK Quế Cường →', '{{kho_giao_short}} → {{kho_nhan_short}} — Tàu {{ship}}')
    detail = d.tables[2]
    loop_table(detail, 'table', ['stt', 'ticket', 'time1', 'time2', 'plate', 'w1', 'w2', 'net', 'wh'], data_idx=1,
               total_texts=['TỔNG CỘNG:  {{weightKg}} kg', None])
    # số phiếu dạng 7998/2026/XK dài hơn mẫu gốc → nới cột STT / Số phiếu, thu hẹp cột "Kho xuất"
    sync_grid(d.tables[0], [3200, 6300]); sync_grid(d.tables[1]); sync_grid(detail, [700, 1700, 2200, 2200, 1500, 1400, 1400, 1300, 2900])
    d.save(os.path.join(OUT, 'XuatKhoGui.docx'))

def build_guikho_thang():
    """Biên bản xác nhận hàng gửi kho THEO THÁNG — phụ lục tổng hợp theo biển số (mẫu "BienBan_XacNhan_GuiKho_Thang03_2025.pdf")."""
    d = docx.Document(find('*BienBan_GiaoNhan_DieuChuyen_T11_2024.docx'))
    sub(d, 'BIÊN BẢN GIAO NHẬN', 'BIÊN BẢN XÁC NHẬN HÀNG GỬI KHO')
    sub(d, 'ĐỢT TRUNG CHUYỂN:', 'ĐỢT THÁNG {{periodMonth}}/{{periodYear}}')
    sub(d, '(Thời gian thực hiện:', '(Từ ngày: {{dateFrom}} đến ngày: {{dateTo}})')
    cc = [p for p in d.paragraphs if p.text.strip() == 'Căn cứ:'][0]
    cc._p.getparent().remove(cc._p)
    sub(d, '- Quyết định điều chuyển', 'Căn cứ Hợp đồng ủy thác xuất khẩu được ký giữa {{giao_name}} và {{nhan_name}};')
    sub(d, '- Số liệu cân xe thực tế', 'Căn cứ các Phiếu xuất kho kiêm vận chuyển nội bộ (PXK) do {{giao_name}} lập cho hàng dăm gỗ xuất từ {{kho_giao_full}} gửi về {{kho_nhan}}. Hàng vẫn thuộc quyền sở hữu của Bên gửi trong thời gian lưu tại kho.')
    sub(d, 'BÊN GIAO (', 'BÊN GIAO ({{giao_role}}): {{giao_name}}')
    sub(d, 'BÊN NHẬN (', 'BÊN NHẬN ({{nhan_role}}): {{nhan_name}}')
    seq(d, 'Mã số doanh nghiệp:', ['Mã số doanh nghiệp: {{giao_tax}}', 'Mã số doanh nghiệp: {{nhan_tax}}'])
    seq(d, 'Địa chỉ:', ['Địa chỉ: {{giao_address}}', 'Địa chỉ: {{nhan_address}}'])
    seq(d, 'Người đại diện:', ['Người đại diện: {{giao_rep}} — Chức vụ: {{giao_position}}',
                               'Người đại diện: {{nhan_rep}} — Chức vụ: {{nhan_position}}'])
    sub(d, 'Hai bên cùng xác nhận', 'Hai bên cùng xác nhận việc giao nhận khối lượng hàng hóa gửi kho như sau:')
    sub(d, 'Hai bên thống nhất', 'Hai bên thống nhất khối lượng giao nhận hàng gửi kho nêu trên là chính xác, làm căn cứ theo dõi, hạch toán và đối chiếu khi cần thiết.')
    t0 = d.tables[0]
    rows = [('Đợt gửi kho', 'Đợt Tháng {{periodMonth}}/{{periodYear}}'),
            ('Căn cứ chứng từ', '{{evidence}}'),
            ('Thời gian thực hiện', '{{dateFrom}} đến {{dateTo}}'),
            ('Kho giao (bàn cân xuất)', '{{kho_giao_full}}'),
            ('Kho nhận', '{{kho_nhan}}'),
            ('Số lượt xe vận chuyển', '{{trip}}'),
            ('Số nhóm xe/tài xế', '{{vehicles}}'),
            ('Tổng khối lượng giao nhận', '{{weight}} tấn')]
    for i, (a, b) in enumerate(rows):
        set_cell(t0, i + 1, 0, a); set_cell(t0, i + 1, 1, b)
    sig_table(d, 1, None, None)
    nxt = t0._tbl.getnext()
    if nxt is not None and nxt.tag == qn('w:p') and not ''.join(nxt.itertext()).strip():
        nxt.getparent().remove(nxt)
    sub(d, 'PHỤ LỤC: BẢNG KÊ CHI TIẾT', 'PHỤ LỤC: BẢNG TỔNG HỢP KHỐI LƯỢNG XE VẬN CHUYỂN')
    sub(d, 'Kho Quế Sơn — Tháng', 'Đợt Tháng {{periodMonth}}/{{periodYear}} — {{kho_giao_short}} → {{kho_nhan_short}}')

    detail = d.tables[2]
    summ = copy.deepcopy(detail._tbl)
    S = Table(summ, detail._parent)
    strs = summ.findall(qn('w:tr'))
    for tr in strs[2:-1]: summ.remove(tr)
    strs = summ.findall(qn('w:tr'))
    grid = summ.find(qn('w:tblGrid'))
    gcs = grid.findall(qn('w:gridCol'))
    total_w = sum(int(g.get(qn('w:w'))) for g in gcs)
    weights = [7, 11, 17, 17, 17, 19, 12]
    ws = [int(total_w * w / sum(weights)) for w in weights]
    for g in gcs[7:]: grid.remove(g)
    for g, w in zip(gcs[:7], ws): g.set(qn('w:w'), str(w))
    def trim(tr, keep_n):
        tcs = tr.findall(qn('w:tc'))
        for tc in tcs[keep_n:]: tr.remove(tc)
        for tc, w in zip(tr.findall(qn('w:tc')), ws):
            tcPr = tc.find(qn('w:tcPr'))
            if tcPr is not None:
                tcW = tcPr.find(qn('w:tcW'))
                if tcW is not None: tcW.set(qn('w:w'), str(w)); tcW.set(qn('w:type'), 'dxa')
    trim(strs[0], 7); trim(strs[1], 7)
    heads = ['STT', 'Số chuyến', 'Biển số', 'Từ ngày', 'Đến ngày', 'Khối lượng (tấn)', 'Ghi chú']
    for tc, h in zip(strs[0].findall(qn('w:tc')), heads): tc_set(tc, h)
    fields = ['stt', 'trips', 'plate', 'dFrom', 'dTo', 'tons', 'note']
    for i, (tc, f) in enumerate(zip(strs[1].findall(qn('w:tc')), fields)):
        txt = '{{%s}}' % f
        if i == 0: txt = '{{#appendix}}' + txt
        if i == 6: txt += '{{/appendix}}'
        tc_set(tc, txt)
    ttr = strs[2]
    ttcs = ttr.findall(qn('w:tc'))
    for tc in ttcs:
        tcPr = tc.find(qn('w:tcPr'))
        gs = tcPr.find(qn('w:gridSpan')) if tcPr is not None else None
        if gs is not None and tc is ttcs[0]: gs.set(qn('w:val'), '5')
        tcW = tcPr.find(qn('w:tcW')) if tcPr is not None else None
        if tcW is not None: tcW.set(qn('w:type'), 'dxa')
    ttcs[0].find(qn('w:tcPr')).find(qn('w:tcW')).set(qn('w:w'), str(sum(ws[:5])))
    ttcs[1].find(qn('w:tcPr')).find(qn('w:tcW')).set(qn('w:w'), str(ws[5]))
    ttcs[2].find(qn('w:tcPr')).find(qn('w:tcW')).set(qn('w:w'), str(ws[6]))
    tc_set(ttcs[0], 'TỔNG CỘNG: {{trip}} chuyến')
    tc_set(ttcs[1], '{{weight}} tấn')
    S2 = Table(summ, detail._parent); add_hdr_repeat(S2)
    detail._tbl.addprevious(summ)
    # phụ lục 2 (chi tiết từng phiếu) — chỉ hiện khi người dùng tick {{#showDetail}}
    loop_table(detail, 'table', ['stt','ticket','time1','time2','plate','w1','w2','net','driver'], data_idx=1,
               total_texts=['TỔNG CỘNG:  {{trip}} phiếu', '{{weightKg}} kg', None])
    set_widths(detail, [5, 14, 15, 15, 11, 9, 9, 10, 12])
    heads_p = [p for p in d.paragraphs if p.text.startswith('PHỤ LỤC: BẢNG TỔNG HỢP')][0]
    sub_p = [p for p in d.paragraphs if p.text.startswith('Đợt Tháng')][0]
    h2 = copy.deepcopy(heads_p._p); s2 = copy.deepcopy(sub_p._p)
    open_p = new_par_before(detail._tbl, '{{#showDetail}}')
    detail._tbl.addprevious(h2); detail._tbl.addprevious(s2)
    set_par(Paragraph(h2, d), 'PHỤ LỤC 2: BẢNG KÊ CHI TIẾT PHIẾU CÂN')
    set_par(Paragraph(s2, d), '{{kho_giao_short}} → {{kho_nhan_short}} — Tháng {{periodMonth}}/{{periodYear}}  —  {{trip}} phiếu cân, {{weight}} tấn')
    br = OxmlElement('w:p'); r = OxmlElement('w:r'); b = OxmlElement('w:br'); b.set(qn('w:type'), 'page'); r.append(b); br.append(r)
    open_p.addnext(br)
    close_p = new_par_after(detail._tbl, '{{/showDetail}}')
    new_par_after(close_p, '')
    d.save(os.path.join(OUT, 'GuiKhoThang.docx'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    build_dieuchuyen(); build_quyetdinh(); build_uythac(); build_traodoi(); build_guikho(); build_guikho_thang(); build_xuatkhogui()
    print('OK', os.listdir(OUT))
