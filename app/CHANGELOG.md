# CHANGELOG.md — Dự án `app/` (modular hoá + tiện ích bổ sung)

> File này ghi lại thay đổi của **cấu trúc mã nguồn** (`app/`, bắt đầu từ phiên làm việc này).
> Lịch sử các bản sửa lỗi/tối ưu trước đó trên bản 1-file gốc (`BaoCaoNgay.html`) — bao gồm
> PERF-01/02/03, BUG-01/02/03, sửa tên công ty — nằm trong `package/CHANGELOG.md`, không lặp
> lại ở đây.

## [Phase 4.12] — 30/10/2026 — Rà soát toàn bộ code app

### Sửa
- **Sao lưu hỏng hẳn khi không đọc được kho khoản vay** (BUG_FIXED.md): nay vẫn tải file sao lưu Danh mục/Cấu
  hình, báo rõ file không có khoản vay. Test mới `test:backup-noidb` (bản trước 0/2, bản sửa 4/4).
- Bản sao web trong app desktop (`desktop-app/app/index.html`) chưa được commit từ Phase 4.7 (bộ cài đã giao
  vẫn đúng vì bước release luôn chép bản mới nhất) — nay commit đồng bộ với `app/dist/index.html`.
- Bỏ 1 biến không dùng trong `excel-export.js` (có từ bản gốc) — ESLint sạch hoàn toàn; file xuất 37/37 không đổi.

### Kết quả rà soát
- 26 bộ test web + test desktop: đạt hết. ESLint 0 cảnh báo; không hàm > 100 dòng, không file > 800 dòng;
  máy quét HAK_CODE_QUALITY_TEST: 0 lỗi, số cảnh báo/vòng phụ thuộc giữ nguyên như trước các phase này.
- Đã đọc lại: tính sổ tiền vay (2 cách lũy kế, số dư nhập tay), kho IndexedDB (nâng cấp v1→v4 không xoá dữ
  liệu, sao lưu/khôi phục mọi phiên bản cũ), nhập Excel trong Worker, xuất Excel/PDF/In, thẻ tổng (mọi chữ
  hiển thị đều qua esc), chọn giao diện — không thấy lỗi khác.

## [Phase 4.11] — 29/10/2026 — Lũy kế tiền vay chi tính trong khoảng thời gian báo cáo

### Đổi (người dùng: "lũy kế tiền vay chi sẽ tính cho khoảng thời gian báo cáo")
- MẶC ĐỊNH nay lũy kế chỉ tính trong Từ ngày – Đến ngày: sổ bắt đầu từ lần giải ngân đầu tiên TRONG KỲ, lũy kế
  dòng đầu = số vay đó (vd tháng 6: 09/06 999.999.929 — đúng mẫu người dùng), không mang số dư trước kỳ sang.
  Số dư đầu kỳ nhập tay chỉ dùng khi ngày nhập nằm trong kỳ (ngoài kỳ ⇒ thẻ ghi "ngoài kỳ — không dùng").
- GIỮ cách cũ: ô chọn "Lũy kế tiền vay chi: Trong khoảng thời gian báo cáo | Từ đầu sổ (mang số dư trước kỳ
  sang)" ở đầu sổ; lựa chọn nhớ trên máy. Không chọn kỳ ⇒ 2 cách cho cùng kết quả.
- Bảng, In/PDF/Excel, thẻ tổng đều theo cách đang chọn (cùng 1 hàm tính `computeSoTienVay(…, mode)`).

### Kiểm chứng
- `test:khoanvay-model` 62 (+8: so với bản cài Power Query độc lập chạy trên riêng dữ liệu trong kỳ; số dư
  nhập trong/ngoài kỳ; không chọn kỳ ⇒ 2 cách giống nhau). Các phép thử "số dư mang sang" cũ chạy ở chế độ
  "Từ đầu sổ", kết quả giữ nguyên.
- `test:khoanvay` 46 (+2), `test:tienvay-opening` 30 (+5: trong kỳ, số dư ngoài kỳ, Excel, nhớ lựa chọn).
- Mọi test khác giữ nguyên kết quả; file xuất 37/37 không đổi.

## [Phase 4.10] — 29/10/2026 — Thẻ số liệu tổng tab Cập nhật khoản vay + Tổng hợp thanh toán; "Lưu ra Excel"

### Rõ việc lưu (người dùng: "cập nhật khoản vay không có chức năng lưu à?")
- Dữ liệu vẫn TỰ LƯU trên máy ngay khi Thêm/Sửa/Xoá/Nhập file (như trước) — nay hiện rõ: "✓ Tự động lưu
  trên máy · Đã lưu: N khoản vay, tổng … · Lần lưu gần nhất: giờ ngày".
- Nút mới **"💾 Lưu ra Excel"**: các khoản đang hiện (theo tìm kiếm/lọc) → file `KhoanVay_TH_VAY_yyyymmdd.xlsx`
  3 cột (ô ngày thật, tiền là số, dòng Tổng cộng), nhập lại được ngay; chưa có khoản ⇒ báo, không tạo file.

### Mới — thẻ số liệu tổng
- **Cập nhật khoản vay**: Tổng tiền vay (số khoản), Giải ngân gần nhất (ngày), Khoản lớn nhất (ngày, bình
  quân/khoản), Thời gian giải ngân (từ – đến, số ngày). Đang lọc ⇒ thẻ tính theo phần lọc, ghi rõ tổng đã lưu.
- **Tổng hợp thanh toán**: Tổng thành tiền (số dòng), Tổng khối lượng (đơn giá bình quân/tấn), Số chủ rừng
  (gộp không phân biệt hoa/thường; chủ rừng nhận nhiều nhất), Số ngày thanh toán (bình quân/ngày). Số lấy từ
  computeTongHopThanhToan — cùng số với bảng/dòng tổng.
- Hàm vẽ thẻ dùng chung `components/stat-cards.js` (thẻ Sổ chi tiết tiền vay chuyển sang dùng, kết quả giữ nguyên).

### Kiểm chứng
- `test:bank-kpi` (19 — mới): thẻ = dữ liệu/dòng tổng, lọc, trạng thái lưu, Lưu ra Excel → nhập lại đúng,
  chủ rừng gộp hoa/thường; chạy trên bản build trước ⇒ hỏng (đối chứng). `test:khoanvay-model` 54 (+6).
- Mọi test khác giữ nguyên kết quả; file xuất 37/37 không đổi.

## [Phase 4.9] — 29/10/2026 — Sổ chi tiết tiền vay: cập nhật số dư đầu kỳ + thẻ số liệu tổng

### Mới — "Cập nhật số dư đầu kỳ" (người dùng: "chỗ cập nhật số dư đầu kỳ … chưa có")
- Khung gập ngay trên sổ: **Ngày bắt đầu sổ** + **Số dư đầu kỳ** (đồng, được âm) → Lưu / Xoá (bấm 2 lần).
- Có số dư nhập: sổ bắt đầu từ ngày đó, dòng đầu "Số dư đầu kỳ" = số nhập, lũy kế tính tiếp; khoản vay/chi
  trước ngày đó coi như đã nằm trong số dư (không tính lại). Chọn "Từ ngày" sau đó ⇒ số dư đầu kỳ = số nhập
  + phát sinh trước kỳ. Chưa nhập (mặc định) ⇒ sổ y như cũ (bắt đầu từ ngày giải ngân đầu tiên).
- Lưu trên máy (IndexedDB v4, kho `meta`), có trong file sao lưu; file sao lưu bản trước (chưa có số dư)
  khôi phục ⇒ giữ nguyên số dư đang có. In/PDF/Excel có dòng "Số dư đầu kỳ".

### Mới — thẻ số liệu tổng phía trên sổ
- 4 thẻ của kỳ đang xem: **Số dư đầu kỳ** (ghi rõ nguồn: nhập tay / lũy kế trước kỳ / giải ngân đầu),
  **Tiền vay giải ngân** (số lần), **Tiền chi thanh toán** (số tấn, số dòng chi), **Số dư cuối kỳ** (âm ⇒
  đỏ, "Chi vượt tiền vay …") + thanh **"Đã chi … % nguồn vốn trong kỳ"** (chi / (đầu kỳ + vay)).
- Số trên thẻ lấy nguyên từ kết quả tính sổ (cùng số với bảng, dòng tổng, file xuất); co chữ vừa thẻ như
  Dashboard (tách hàm co chữ ra `components/card-fit.js`, logic giữ nguyên — `test:dashboard-fit` 12/12).

### Kiểm chứng
- `test:tienvay-opening` (25 — mới): thẻ = bảng (đầu kỳ, vay, chi, cuối kỳ), nhập sai bị báo, nhập đúng ⇒ sổ
  bắt đầu đúng ngày, số âm, Excel có dòng số dư, còn sau tải lại, sao lưu/khôi phục, file sao lưu cũ giữ số
  dư, xoá ⇒ về như cũ. Chạy trên bản build trước ⇒ hỏng (đối chứng).
- `test:khoanvay-model` 48 (+8: số dư nhập tay, lọc kỳ, số âm, đối chứng không nhập ⇒ như cũ).
- Mọi test khác giữ nguyên kết quả; file xuất 37/37 không đổi (mặc định chưa có số dư nhập).

## [Phase 4.8] — 29/10/2026 — "Cập nhật khoản vay" chỉ còn 3 cột như bảng TH_VAY

### Đổi (người dùng: "chỉ nhập 3 cột đó")
- Tab "Cập nhật khoản vay" lưu và hiện đúng 3 cột của bảng TH_VAY: **Ngày hạch toán, Ngày chứng từ, Tổng
  tiền vay** (thay cho sổ phụ ngân hàng 12 cột). Thêm/sửa tay chỉ 3 ô; Tổng tiền vay bắt buộc, > 0; Ngày
  chứng từ được để trống. Bỏ cột/ô lọc "Tiền vay" (mọi dòng đều là khoản vay).
- Nhập Excel nhận 2 dạng: file 3 cột (sheet TH_VAY hoặc bất kỳ sheet có 2 cột Ngày hạch toán + Tổng tiền
  vay — dòng trống/"Tổng cộng"/không có tiền vay bỏ qua), **hoặc** nguyên sổ phụ (sheet VAY) như trước — app
  tự lấy dòng tiền vay đúng query TH_VAY (Diễn giải ∈ cấu hình, Tổng tiền vay = Thu) và chỉ lưu 3 cột.
- File mẫu mới `Mau_TienVay_TH_VAY.xlsx` (3 cột).
- Sổ chi tiết tiền vay KHÔNG đổi kết quả: dữ liệu thật (ChungTuNganHang.xlsx — 14 khoản, 14.399.999.582)
  xuất Excel trước/sau giống nhau 746/746 dòng.

### Dữ liệu cũ — không mất
- Kho IndexedDB lên v3 (kho mới `thvay`); lần mở đầu tiên tự chép các dòng tiền vay của sổ phụ đã lưu sang
  3 cột (giữ ngày, thứ tự, nguồn "Sổ phụ: …"). Sổ phụ cũ GIỮ NGUYÊN trên máy và nằm trong file sao lưu
  (`soPhuCu`); khôi phục được cả file sao lưu của bản trước (MIGRATION §3).

### Kiểm chứng
- `test:khoanvay` 44 (viết lại theo 3 cột: nhập sổ phụ, nhập file 3 cột không nhân đôi với dữ liệu từ sổ
  phụ, thêm/sửa/xoá, tải lại, sao lưu/khôi phục, khôi phục file sao lưu bản cũ, **máy đang có dữ liệu bản
  trước tự chuyển sang 3 cột, sổ phụ cũ còn nguyên**); chạy trên bản build trước ⇒ hỏng (đối chứng).
- `test:khoanvay-model` 40 (tham chiếu Power Query độc lập giữ nguyên), `test:tienvay-import` 19 (thêm 2
  trường hợp file 3 cột có dòng trống/"Tổng cộng").
- File xuất: chỉ file mẫu đổi (đúng dự kiến), 36 mẫu còn lại không đổi; mọi test khác giữ nguyên kết quả.

## [Phase 4.7] — 29/10/2026 — Bảng kê chi tiết tiền vay theo mẫu; tab Tổng hợp thanh toán; chọn phiếu nhập kho để in

### Đổi — "Sổ chi tiết tiền vay" trình bày đúng mẫu người dùng gửi ("BẢNG KÊ CHI TIẾT TIỀN VAY")
- 7 cột: Ngày hạch toán · Ngày chứng từ · Tổng tiền vay · Ngày thanh toán · Số tấn · Tổng tiền chi ·
  Lũy kế tiền vay chi (bỏ cột Ngày chung/Diễn giải khỏi bảng hiển thị — vẫn dùng Ngày chung để sắp xếp).
- Sổ **bắt đầu từ ngày giải ngân đầu tiên** (như mẫu: dòng đầu 09/06/2026, vay 999.999.929, lũy kế
  999.999.929); các khoản chi trước ngày đó không đưa vào sổ. Chọn "Từ ngày" sau ngày đó ⇒ dòng đầu là
  "Số dư đầu kỳ" (in/PDF/Excel đều ghi nhãn này).
- Thứ tự các dòng chi **trong cùng 1 ngày** theo thứ tự sheet DNTT_CT (Power Query sắp xếp không ổn
  định nên file Excel có thể khác thứ tự trong ngày; tổng ngày và lũy kế cuối ngày khớp 146/146 ngày).

### Mới — tab "Tổng hợp thanh toán" (đúng query THTT_NH)
- Lấy từ sheet DNTT_CT (link trong Cấu hình): Họ tên Chủ rừng, Ngày thanh toán, Khối lượng, Thành tiền,
  Ngày chung; lọc theo Ngày thanh toán trong kỳ; có dòng tổng Khối lượng/Thành tiền; In/PDF/Excel; nằm
  trong "Xuất tất cả" (sheet THTT_NH).

### Mới — Phiếu nhập kho: chọn phiếu để in
- Hộp thông tin trước khi xuất PDF có danh sách phiếu (Số CT, ngày, người bán, khối lượng) với ô
  "Chọn tất cả" (mặc định chọn hết = như cũ); PDF chỉ gồm các phiếu được chọn; không chọn phiếu nào ⇒
  báo "Chưa chọn phiếu nhập kho nào để in.".

### Kiểm chứng
- `test:bank-tabs` (12 — mới): cột/số dòng/tổng THTT; chọn 0 phiếu ⇒ báo; chọn 2 ⇒ PDF 2 trang đúng
  Số CT; chọn tất cả ⇒ đủ trang. `test:khoanvay-model` 39/39 (tham chiếu Power Query độc lập, bắt đầu
  từ giải ngân đầu), `test:khoanvay` 33/33.
- File xuất: chỉ 3 mẫu đổi đúng dự kiến (tienvay.xlsx/.pdf — cột mới; nganhang.xlsx — thêm sheet
  THTT_NH), đã cập nhật mẫu; 34 mẫu còn lại không đổi. Mọi test khác giữ nguyên kết quả.

## [Phase 4.6] — 29/10/2026 — Số trên thẻ Dashboard không còn tràn; chọn giao diện 5 chủ đề × sáng/tối

### Sửa — số bị tràn khỏi thẻ Dashboard (ảnh người dùng gửi: "254.203.099.000 đ" bị cắt)
- **Nguyên nhân:** bấm LẬP BÁO CÁO khi đang ở tab khác ⇒ Dashboard đang ẩn (bề rộng 0) ⇒ hàm co chữ
  không đo được, giữ cỡ 24px; mở Dashboard hoặc đổi cửa sổ sau đó không đo lại.
- **Sửa:** `components/dashboard.js` — đo theo bề rộng thật (tìm nhị phân 24→14px) và đo lại mỗi khi thẻ
  đổi kích thước (ResizeObserver, bắt cả lúc từ ẩn sang hiện); quá hẹp thì xuống dòng trước đơn vị,
  số luôn hiện đủ.
- **Kiểm chứng:** `test:dashboard-fit` (số hàng nghìn tỷ, 4 bề rộng 1700/1366/1100/760 + thu hẹp cửa sổ):
  bản trước lỗi ở cả 4 bề rộng; bản sửa 12/12.

### Mới — chọn giao diện (menu trái, mục "Giao diện")
- 5 chủ đề: **Luxe** (navy & vàng — mặc định, token HAK-Enterprise-Design-System), **Classic** (xanh ngọc
  lam — token gốc teal của Design System, cũng là màu cũ của app), **Navy** (xanh hải quân), **Ngọc bích**
  (xanh lục ngọc), **Neutral** (xám); mỗi chủ đề có **Sáng / Tối / Theo máy**.
- Lưu trên máy (1 khoá riêng, không nằm trong file sao lưu dữ liệu); áp ngay trong `<head>` nên không
  chớp màu khi mở app. File Excel/PDF xuất ra giữ màu chuẩn Luxe.
- **Kiểm chứng:** `test:hak-theme` (60 — cả 10 tổ hợp chủ đề × sáng/tối đạt tương phản AA; Classic đúng
  token gốc Design System), `test:theme-picker` (11 — đổi màu đúng, theo máy, lưu khi tải lại, dữ liệu
  hỏng về mặc định). Mọi test cũ giữ nguyên kết quả (file xuất 37/37 không đổi).

## [Phase 4.5] — 29/10/2026 (chiều) — Sổ chi tiết tiền vay dựng ĐÚNG luồng Power Query của người dùng

**Người dùng chỉ ra:** "tiền vay sẽ lấy dữ liệu như file excel trên (ChungTuNganHang.xlsx) — xem lại công
thức… trong Power Query có link lấy dữ liệu DNTT… 2 sheet TH_VAY, THTT_NH được tạo thế nào". Phase 4.4
bắt nhập bảng kê ĐÃ TÍNH SẴN — sai nguồn. Đã trích Power Query (customXml → Formulas/Section1.m):

| Query | Nguồn | Bước |
|---|---|---|
| TH_VAY | bảng **VAY** trong file (sổ phụ TK ngân hàng) | lọc Diễn giải ∈ 3 câu "Chuyển tiền nội bộ … vay keo VNĐ HAK"; Tổng tiền vay = Σ Thu theo Ngày hạch toán; Ngày chung = Ngày hạch toán |
| THTT_NH | **DNTT_CT** — Google Sheet (link CSV, gid=1612289204) | giữ Họ tên Chủ rừng, Ngày thanh toán, Khối lượng, Thành tiền; Ngày chung = Ngày thanh toán; mọi dòng |
| BKCT_TIENVAY | TH_VAY + THTT_NH | xếp theo Ngày chung; trống = 0; Chênh lệch = vay − chi; Lũy kế (công thức Excel) = lũy kế trên + vay − chi |

### Thay đổi
- Tab **Cập nhật khoản vay** = **sổ phụ ngân hàng** (12 cột bảng VAY): nhập Excel (tự tìm sheet "VAY"
  trong file nhiều sheet), nhập tay / sửa / xoá / lưu; cột "Tiền vay" ✓ cho dòng có Diễn giải khớp;
  lọc "Chỉ dòng tiền vay". 3 câu Diễn giải lấy nguyên văn query TH_VAY → `CONFIG.DIEN_GIAI_TIEN_VAY`.
- **Sổ chi tiết tiền vay** = `computeSoTienVay(sổ phụ, STATE.dntt)`: tiền chi lấy TỰ ĐỘNG từ DNTT_CT (link
  đã nhập trong cấu hình), không nhập tay nữa. Lũy kế từ đầu sổ + "Số dư đầu kỳ" khi lọc kỳ (như 4.4).
- Khác Power Query có chủ đích: TH_VAY gom theo ngày rồi BUNG lại ⇒ nếu 1 ngày có 2 lần giải ngân, MỖI
  dòng mang tổng cả ngày (cộng trùng). App tính theo từng bút toán (tổng luôn đúng; dữ liệu hiện tại
  mỗi ngày 1 lần nên giống hệt). Cột Lũy kế trong file Excel bị #VALUE! ở mọi dòng (dòng đầu cộng vào ô
  tiêu đề) — app tự tính nên không bị.
- File mẫu tải về: `Mau_SoPhuNganHang_VAY.xlsx` (đúng cột bảng VAY).
- Kho IndexedDB `baocaongay-khoanvay` v2: kho mới `vay`; kho cũ `loans` GIỮ NGUYÊN (không xoá).
- Sửa thêm: dòng "Tổng cộng" (có khoảng trắng) ở cột đầu của file nhập không bị bỏ qua do lỗi ký tự
  thoát trong mã Worker (test `tienvay-import` bắt được).

### Kiểm chứng
- **Đối chiếu với chính file ChungTuNganHang.xlsx:** nạp sheet VAY qua tab 1 + DNTT_CT dựng từ dữ liệu
  THTT_NH đã lưu trong file → xuất Excel Sổ chi tiết từ app → so với bảng BKCT_TIENVAY: cùng 6.308 dòng
  (cùng tập dòng), tổng vay 14.399.999.582 / tổng chi 147.161.510.000 giống hệt, tổng vay/chi từng ngày
  và **lũy kế cuối mỗi ngày khớp 146/146 ngày**. Chỉ khác thứ tự các dòng TRONG cùng 1 ngày (Table.Sort
  của Power Query không giữ thứ tự gốc; app giữ thứ tự DNTT_CT).
- `test:khoanvay-model` (36): so app với 1 bản cài ĐỘC LẬP các bước M (TH_VAY/THTT_NH/BKCT) trên dữ liệu
  ngẫu nhiên; `test:khoanvay` (31): nhập file nhiều sheet, chỉ dòng giải ngân là tiền vay, chi từ DNTT_CT,
  thêm/sửa/xoá/sao lưu; `test:tienvay-import` (13). Mẫu chuẩn: chỉ `tienvay`, `nganhang`, `mau-tienvay`
  đổi (bảng có thêm dòng chi từ DNTT_CT) — mọi báo cáo khác không đổi.

## [Phase 4.4] — 29/10/2026 — Báo cáo ngân hàng 4 tab + chuẩn định dạng HAK toàn app

**Yêu cầu:** "Báo cáo ngân hàng làm tab: 1. cập nhật khoản vay (nhập thủ công hoặc tải Excel, sửa, xoá,
lưu) 2. Sổ chi tiết tiền vay 3. Bảng kê 02/TNDN 4. Phiếu nhập kho — đồng thời dùng các repo HAK để định
dạng lại ngày, số, bảng cha con…". Người dùng chọn: dữ liệu khoản vay **phẳng** như file Excel; Lũy kế
**từ đầu sổ**; chuẩn định dạng áp **toàn bộ app**.

### Dùng 5 repo HAK
- `HAK_ACCOUNTING_REPORT_STANDARD` (gói `@hak/accounting-report-standard`, commit a5833a9): định dạng số,
  độ chính xác (tiền 0 số lẻ, khối lượng 2 số lẻ), ngày dd/MM/yyyy, căn lề theo kiểu cột — qua
  `src/utils/hak-format.js`.
- `HAK_SMART_FILTER` (`@hak/smart-filter`, 5181681): tìm không dấu, lọc khoảng ngày, đọc ngày gõ tay có
  kiểm tra ngày có thật, mô tả điều kiện lọc — dùng ở tab Cập nhật khoản vay.
- `HAK-Enterprise-Design-System` (`@hak/enterprise-design-system`, 69ac08a): chủ đề màu "luxe" (navy +
  champagne, nền ngà) sáng/tối cho màn hình và file Excel/PDF; `tests/test-hak-theme.mjs` đối chiếu từng mã
  màu với token gốc + tương phản AA.
- `HAK_AI_SKILLS`: theo quy tắc hak-parent-child-data-model / hak-data-integrity / hak-migration-manager
  (khoá ổn định, trống ≠ 0, giao dịch ghi trọn vẹn, chống ghi đè, nhập lại không nhân đôi, có sao lưu).
- `HAK_CODE_QUALITY_TEST`: quét mã nguồn — 0 lỗi; cảnh báo còn lại là các vòng phụ thuộc có chủ đích
  đã có từ trước (module mới không thêm vòng nào).

### Mới — tab "Cập nhật khoản vay"
- Nhập tay (ô ngày dd/MM/yyyy, ô tiền/số tấn có ngăn cách), sửa, xoá từng dòng hoặc nhiều dòng (bấm 2 lần
  để xác nhận), tìm không dấu, lọc khoảng ngày, tổng vay/chi/còn lại theo bộ lọc.
- Nhập Excel: hiện tóm tắt trước khi ghi; "Thêm các dòng mới" (nhập lại đúng file cũ không nhân đôi — so
  theo số lần xuất hiện, các dòng giống hệt nhau trong cùng file vẫn giữ đủ) hoặc "Thay toàn bộ" (bấm 2 lần).
- Lưu trên máy (IndexedDB `baocaongay-khoanvay`), ghi theo giao dịch; lỗi ghi báo "CHƯA lưu" (không giả vờ
  đã lưu). Sao lưu/khôi phục (tab Cấu hình) có kèm khoản vay.
- Sổ chi tiết tiền vay lấy dữ liệu từ tab này (bỏ ô tải file tạm thời mỗi lần mở app).

### Đổi — Sổ chi tiết tiền vay
- Lũy kế tính từ đầu sổ: có bút toán trước "Từ ngày" thì dòng đầu là "Số dư đầu kỳ (lũy kế trước kỳ)";
  tổng vay/chi vẫn chỉ của kỳ. Không có bút toán trước kỳ → như cũ.

### Đổi — chuẩn định dạng toàn app (màn hình, In, Excel, PDF, 02/TNDN, WO, PNK)
- Tiền không kèm "đ"; đầu báo cáo ghi "Đơn vị tiền: đồng" (thẻ Dashboard vẫn ghi "đ" sau số như "tấn", "xe").
- Khối lượng luôn đủ 2 chữ số lẻ (12,50).
- Ngày căn giữa; Excel ghi ô NGÀY THẬT định dạng dd/mm/yyyy (lọc/sắp xếp được) thay vì chữ.
- Màu luxe cho giao diện và tiêu đề/dòng tổng/đường kẻ của file xuất.
- App desktop: ô chọn ngày theo tiếng Việt (dd/mm/yyyy) — `app.commandLine.appendSwitch('lang','vi')`.
- Build target es2018 → es2020 (thư viện chuẩn dùng BigInt; chạy trên Chrome/Edge ≥ 80 và Electron).

### Kiểm chứng
- Mới: `test:khoanvay` (26), `test:khoanvay-model` (30), `test:hak-theme` (42); `test:tienvay-import`
  chuyển sang luồng nhập mới (13); `test:perf-equivalence` đối chiếu định dạng mới = kết quả cũ chỉ khác
  đúng các điểm của chuẩn; desktop `test-template-refresh` (9).
- File xuất: so từng ô/từng chữ giữa bản trước và bản này trên cùng dữ liệu — mọi khác biệt thuộc đúng các
  nhóm: màu luxe, ô ngày thật + căn giữa, bỏ "đ", khối lượng 2 số lẻ, dòng "Đơn vị tiền". 18/18 PDF có nội
  dung chữ/số giống hệt (bỏ qua thứ tự do cột hẹp lại). Sau đó mới ghi lại mẫu chuẩn (`--update`): 37/37.
- Với file thật `ChungTuNganHang_DH.xlsx` (7.437 bút toán): nhập đủ 7.437 dòng; tổng vay 14.399.999.582,
  tổng chi 125.056.138.000; Sổ chi tiết 10/06–30/06/2026 khớp tính độc lập bằng Python (số dư đầu kỳ
  −106.345.564.071, vay 13.399.999.653, chi 15.291.581.000).

## [Phase 4.3] — 29/10/2026 — Sửa lỗi treo khi tải file "Sổ chi tiết tiền vay"

**Bối cảnh:** Rà soát luồng Báo cáo ngân hàng → Sổ chi tiết tiền vay.

### Lỗi [BUG-TV01]
- **Hiện tượng:** tải file Excel có 1 dòng trống (ở giữa hoặc cuối) hoặc dòng "Tổng cộng"/"Total" →
  app đứng mãi ở "Đang đọc file...", bảng không có số liệu, không báo lỗi.
- **Nguyên nhân:** khi chuyển phần đọc file sang Web Worker (`services/excel-import-worker.js`), 2 lệnh
  `continue` (bỏ qua dòng, đọc tiếp) của bản gốc `BaoCaoNgay.html` bị đổi thành `return` — thoát hẳn
  `self.onmessage`, không gửi kết quả về luồng chính.
- **Sửa:** trả lại đúng `continue` (2 dòng). Không đổi công thức Chênh lệch/Lũy kế, cột, giao diện.

### Kiểm chứng
- **[MỚI]** `tests/test-tienvay-import.mjs` (`npm run test:tienvay-import`) — Chromium + Worker thật,
  chọn file như người dùng; 4 kiểu file (liền mạch / dòng trống / "Tổng cộng" / tiêu đề ở dòng 3 + "Total")
  + file sai cấu trúc phải báo lỗi rõ ràng.
- Đối chứng: bản trước khi sửa 4 đạt / **9 lỗi** (treo); bản sửa **13/13**.
- Toàn bộ bộ test cũ chạy lại đều đạt (36 file xuất khớp mẫu chuẩn).

## [Phase 4.2] — Rà soát hoàn thiện + tối ưu: mở app nhanh gấp ~2,6 lần, tách mã nguồn

**Bối cảnh:** Người dùng: "xem app còn gì cần hoàn thiện và tối ưu hiệu suất, đồng thời gởi bản mã nguồn".
Đo với đúng quy mô dữ liệu thật (10.275 phiếu cân / 10.186 đề nghị thanh toán).

### Đo trước khi sửa
- LẬP BÁO CÁO (1 ngày / 1 tháng): ~55–60 ms — đã nhanh, KHÔNG cần tối ưu thêm.
- **Mở app: ~380 ms** (trình duyệt đã sẵn) — chỗ chậm nhất. Thí nghiệm bỏ riêng 3 thư viện xuất file
  (ExcelJS, jsPDF, jspdf-autotable — ~1,35 MB mã) ra khỏi lúc khởi động: còn ~100 ms ⇒ ~280 ms là chi
  phí dịch + chạy thư viện mà phần lớn lần mở app không dùng tới.

### Thay đổi
- **[PERF-06]** `src/services/export-libs.js`: 3 thư viện xuất file vẫn nằm sẵn trong file HTML (vẫn 1
  file, vẫn offline) nhưng ở dạng chuỗi, chỉ nạp khi cần — `runExport()` bảo đảm nạp xong trước khi
  xuất; ngoài ra tự nạp sẵn lúc trình duyệt RẢNH ~3 giây sau khi mở app (bấm xuất không phải chờ thêm).
  Dùng đúng bản dựng trình duyệt của chính các thư viện đó (ExcelJS `browser` = dist/exceljs.min.js;
  jsPDF 2.5.1 UMD; autotable = đúng file trước đây).
- **[HOÀN THIỆN]** Tách `legacy-app.js` (~1.480 dòng) thành module, chỉ DI CHUYỂN nguyên văn: 
  `services/export/{report-meta, print-sheet, excel-export, pdf-export, wo-form, bank-forms}.js`,
  `components/{dm-tables, tau-modal}.js`; `legacy-app.js` còn ~310 dòng (điều phối + gắn sự kiện + khởi
  động). Tách 2 khối của `buildWOWorksheet()` thành hàm phụ (nay < 100 dòng). Không còn file > 800 dòng
  hay hàm > 100 dòng. Bỏ ~40 import không dùng (ESLint `no-undef`: 0 lỗi).
- **[MỚI — kiểm thử]** `tests/test-export-golden.mjs` (+ `export-golden.json`): bấm TẤT CẢ 36 nút xuất
  (Excel/PDF từng báo cáo, tổng hợp tháng/ngày/lâm sản/ngân hàng, WO, 02/TNDN, Phiếu nhập kho, file mẫu
  tiền vay), lấy "dấu vân tay" từng ô Excel (giá trị, định dạng, màu, viền, ô gộp, độ rộng) và từng chữ
  PDF kèm toạ độ — so với mẫu chụp TRƯỚC khi sửa. Đối chứng: nới 1 cột PDF thêm 0,1 mm → bắt đúng 3 file.
- **[SỬA — kiểm thử]** `tests/test-export-libs.mjs` (bộ cũ, lâu chưa chạy): còn dùng nút `#btnExportAll`
  (đã tách thành Tháng/Ngày từ 22/09) và bấm 2 nút xuất liên tiếp nhanh hơn thời gian chống bấm lặp
  (0,3 giây) → sửa lại cho đúng; nay 10/10.

### Kết quả (đo trên Chromium, cùng máy, trước → sau)
| | Trước | Sau |
|---|---|---|
| Mở app — lần đầu | 389 ms | **148 ms** |
| Mở app — các lần sau | 379 ms | **144 ms** |
| LẬP BÁO CÁO 1 tháng (10.275 phiếu) | 60–76 ms | 54–63 ms |
| Kích thước file app | 3,41 MB | **3,10 MB** |
| Xuất file (bấm sau khi mở app vài giây) | như cũ | như cũ |

**Kiểm chứng:** `test:export-golden` 37/37 (36 file xuất GIỐNG HỆT bản trước sửa) + toàn bộ 16 bộ test
khác đạt + test desktop 8/8.

---

## [Phase 4.1.2] — Danh mục: ô số có dấu ngăn cách kiểu Việt Nam

**Bối cảnh:** Người dùng yêu cầu: "những ô nhập tiền có ngăn cách đơn vị, nhập khối lượng có ngăn
cách đơn vị và thập phân 2 số".

- **[MỚI]** `src/components/number-input.js`: ô nhập số kiểu VN, định dạng NGAY KHI GÕ, giữ đúng vị
  trí con trỏ. Tiền (Hoa hồng/tấn, Hỗ trợ/tấn): `1.250.000`, không phần lẻ. Khối lượng (SL Min, SL
  Max): `1.234,56`, tối đa 2 chữ số lẻ; gõ phím "." được hiểu là dấu thập phân ",". Rời ô: chuẩn hoá
  hiển thị. Ô dùng `type="text"` (ô `type="number"` của trình duyệt không hiển thị được dấu ngăn cách).
- **Không đổi:** giá trị lưu trong Danh mục vẫn là SỐ (không lưu chuỗi có dấu chấm) — dữ liệu cũ đọc
  bình thường, cách tính báo cáo giữ nguyên; để trống vẫn như ô số cũ (NaN).

**Kiểm chứng:** `npm run test:number-input` (MỚI, 13 kiểm tra: hàm thuần + 40.000 số khứ hồi hiển
thị↔lưu + GÕ PHÍM THẬT trên trình duyệt: định dạng khi gõ, chèn giữa chuỗi giữ con trỏ, chặn chữ/dấu
phẩy ở ô tiền, "." → "," ở ô khối lượng, chặn chữ số lẻ thứ 3, lưu đúng số, báo cáo tính lại đúng).
Toàn bộ bộ test còn lại đạt (gồm `test:dm-recalc` 8/8).

---

## [Phase 4.1.1] — Danh mục: ô tiền quá nhỏ + sửa đơn giá không tính lại báo cáo

**Bối cảnh:** Người dùng báo: "danh mục cột tiền rất nhỏ, khó điền, thay đổi đơn giá nhưng báo cáo
không tính lại tiền".

- **[BUGFIX — giao diện]** Tab Danh mục xếp 2 bảng (Đại lý, Hỗ trợ) cạnh nhau, mỗi bảng chỉ nửa
  màn hình → ở màn 1366px ô "SL Min/Max" chỉ 16px, "Hoa hồng/tấn" 41px, "Hỗ trợ/tấn" 49px, ô ngày
  88px (số bị cắt: "1(", "100", "12/01/20"). Sửa: 2 bảng xếp trên–dưới, mỗi bảng đủ bề rộng; chia
  lại tỉ lệ cột; ô số canh phải; bảng không co dưới 940px (cửa sổ hẹp thì cuộn ngang). Kết quả ở
  1366px: 107 / 117 / 168 / 148px. Chỉ đổi CSS + `<colgroup>` trong `index.html`.
- **[BUGFIX]** Sửa/thêm/xoá dòng Danh mục chỉ LƯU mà không lập lại báo cáo (chỉ Hoàn tác/Làm lại mới
  tự tính lại) → báo cáo Hỗ trợ/Trợ giá/Hoa hồng vẫn theo đơn giá cũ tới khi tự bấm LẬP BÁO CÁO. Sửa:
  hàm `onDMChanged()` (legacy-app.js) = lưu + lập lại báo cáo, dùng cho cả 10 chỗ sửa Danh mục.

**Kiểm chứng:** `npm run test:dm-recalc` (MỚI, 8 kiểm tra trên trình duyệt thật: bề rộng ô, đổi mã
Nguồn gốc/Đại lý, đổi đơn giá Hỗ trợ 10.000→20.000 ⇒ tiền gấp đôi ngay, đổi Hoa hồng, xoá dòng, Hoàn
tác): bản mới 8/8, bản 4.1 (đối chứng) 2/8. Toàn bộ bộ test còn lại đạt.

---

## [Phase 4.1] — Chạy được khi mất mạng (lưu dữ liệu Google Sheet vào IndexedDB)

**Bối cảnh:** Người dùng gửi bản yêu cầu "HTML Offline Business Platform" và chọn làm giai đoạn
Offline trước, đồng bộ Google Sheet ở mức "chỉ đọc + lưu offline".

### Thay đổi

- **[MỚI]** `src/services/offline-cache.js`: lưu CSV thô của mỗi Sheet (khoá theo URL) vào IndexedDB
  mỗi lần tải thành công; có phiên bản kho + khung migration (`MIGRATION.md`); mọi lỗi IndexedDB bị
  cô lập (không có IndexedDB / bị chặn / bản ghi hỏng / mở quá 3 giây → coi như chưa có bản lưu).
- **[ĐỔI]** `src/services/data-service.js`: tách `fetchCSVText()` (tải chuỗi thô) khỏi bước parse —
  `fetchCSV()` giữ nguyên API cũ. `loadAllData()` tải từng Sheet qua `loadSheet()`: thành công → lưu
  bản mới; thất bại → dùng bản lưu nếu có, trạng thái vàng "ĐANG XEM DỮ LIỆU OFFLINE … <Sheet> lưu lúc
  …", "Cập nhật lần cuối" = giờ của bản lưu + "(dữ liệu offline)". Không có bản lưu → báo lỗi như cũ.
- **Không đổi:** khi có mạng, hành vi y hệt trước (bản lưu chỉ dùng khi tải thất bại); không đổi cấu
  trúc STATE/dữ liệu, không đổi giao diện ngoài dòng trạng thái.

### Kiểm chứng

- `npm run test:offline` (MỚI, 14 kiểm tra, trình duyệt thật, IndexedDB giữ qua các lần mở lại): bản
  mới 14/14; **bản 3.13 (đối chứng) trượt đúng 8 kiểm tra offline**, 6 kiểm tra "không phá hành vi cũ"
  vẫn đạt ở cả 2 bản. Có kiểm tra **13 báo cáo offline khớp tuyệt đối với online** (số dòng + dòng tổng).
- `test:error-handling`: đổi kỳ vọng đúng 1 kiểm tra (làm mới thất bại → nay báo "DỮ LIỆU OFFLINE …
  lưu lúc" thay vì "dữ liệu lần tải trước" — cùng dữ liệu, rõ hơn); vẫn kiểm tra không mất dữ liệu.
- Toàn bộ bộ test còn lại đạt. Tốc độ tải/lập báo cáo/bộ nhớ (10.000 phiếu) như bản 3.13 trong
  mức dao động đo (ghi IndexedDB chạy nền, không chờ).

---

## [Phase 3.13] — Sửa "nguồn gốc D3 không lên báo cáo ngày"

**Bối cảnh:** Người dùng báo: "kiểm tra sao khi lên báo cáo ngày nguồn gốc D3 lại không lên". Link
PHIEUCAN mặc định trong app chỉ có dữ liệu thử tháng 12/2025 (không có mã D3) nên không xem được
dữ liệu thật — rà code tìm mọi chỗ 1 mã Nguồn gốc (NG) có thể biến mất, tìm ra 2 lỗi thật:

- **[BUGFIX]** `computeTongHopNgay()` (sheet TH_NXT "Tổng hợp nhập/thanh toán" — nằm trong cả Báo cáo
  tổng hợp tháng lẫn Báo cáo tổng hợp ngày): danh sách cột "Nhập/Thanh toán - NG xx" và "- ĐL xx" chỉ
  lấy từ phiếu cân NHẬP trong kỳ. Mã chỉ có THANH TOÁN trong kỳ (vd D3 cân cuối tháng trước, thanh
  toán tháng này) → không có cột D3, khối lượng thanh toán của D3 rơi mất (tái hiện: thanh toán 15
  tấn, tổng các cột NG chỉ 10 tấn). Sửa: lấy HỢP mã của phần nhập và phần thanh toán.
- **[BUGFIX]** `computeHoTroOrTroGia()` (BK_TIENHT/BK_TROGIA): mã Nguồn gốc gõ trong Danh mục Hỗ trợ
  dính khoảng trắng ("D3 ") không khớp "D3" trong dữ liệu → mọi dòng D3 bị loại, không báo gì. Sửa:
  cắt khoảng trắng 2 đầu trước khi so khớp.
- **Không đổi quy tắc cũ:** mã NG KHÔNG có trong Danh mục Hỗ trợ (đúng Hình thức, đúng khoảng ngày
  hiệu lực) vẫn không vào báo cáo Hỗ trợ/Trợ giá — đây là quy tắc nghiệp vụ, không phải lỗi.

**Kiểm chứng:** `npm run test:ng-codes` (MỚI) — bản mới 8/8, code trước khi sửa 3/8 (đúng 5 lỗi
trên). Trường hợp thường gặp (mọi mã đều có nhập trong kỳ) giữ nguyên: `test:perf-equivalence` khớp
mã băm 15 báo cáo như cũ. Toàn bộ bộ test còn lại đạt (ui KHỚP, features 22/22, tau 17/17,
error-handling 15/15, config 23/23, 4 test PDF/In).

---

## [Phase 3.12] — Rà soát tốc độ, luồng dữ liệu, xử lý lỗi (theo yêu cầu người dùng)

**Bối cảnh:** Người dùng yêu cầu "kiểm tra và cải tiến tốc độ, hiệu suất, luồng dữ liệu, xử lý
lỗi". Nguyên tắc giữ nguyên: chỉ sửa chỗ ĐO ĐƯỢC là chậm/lỗi, mọi tối ưu phải chứng minh KHÔNG đổi
1 con số nào, không đổi chức năng/giao diện.

### A. Tốc độ (đo trên Chromium, dữ liệu giả lập 2.000 / 10.000 / 30.000 phiếu cân)

| Thao tác | 2.000 phiếu | 10.000 phiếu | 30.000 phiếu |
|---|---|---|---|
| Bấm "LẬP BÁO CÁO" | 119 → **99 ms** | 300 → **177 ms** | 729 → **373 ms** |
| Gõ 1 ký tự vào ô "Tìm trong bảng" | 27 → **5,5 ms** | 134 → **28 ms** | 388 → **76 ms** |
| Sắp xếp theo cột chữ | ≈ không đổi | 29 → **22 ms** | 74 → **59 ms** |
| Bộ nhớ (sau GC) | +1,3 MB | +4 MB | +3,8 MB (bộ đệm, có giới hạn trần) |

- **[PERF-04]** Sắp xếp báo cáo tính khoá (ngày+giờ) **1 lần/dòng** thay vì 2 lần/phép so sánh
  (`sortByNumKey()` trong `report-service.js`) — nguyên nhân chính: riêng "Bảng kê nhập keo" chiếm
  ~35% thời gian lập báo cáo vì parse ngày+giờ ~260.000 lần. Áp dụng cho 8 báo cáo sắp theo ngày.
- **[PERF-04]** Bộ đệm (cache) cho `parseTimeParts()` (giờ) và `parseNum()` (số từ CSV) — giống cách
  đã cache ngày ở PERF-01. `parseDateParts()` tra bộ đệm 1 lần thay vì 2.
- **[PERF-05]** Bộ đệm cho `normalizeSearch()` (bỏ dấu khi tìm kiếm) — gõ tìm kiếm nhanh gấp ~5 lần.
- **[PERF-05]** Dùng lại 1 bộ định dạng số (`Intl.NumberFormat`) và 1 bộ so sánh chữ tiếng Việt
  (`Intl.Collator('vi')`) thay vì tạo lại ở mỗi lần gọi (theo đặc tả ECMA-402, kết quả giống hệt).
- **[PERF-05]** Dashboard: đọc khoảng ngày 1 lần trước vòng lặp (trước đây 2 lần/phiếu cân).
- **Đã cân nhắc nhưng KHÔNG làm** (đo thấy không đáng/rủi ro): viết lại bộ đọc CSV (chỉ 22 ms/10.000
  dòng, lúc tải dữ liệu); vẽ lại biểu đồ không hiệu ứng (sẽ đổi trải nghiệm nhìn); tối ưu bên trong
  jsPDF/ExcelJS (≈93% thời gian xuất PDF nằm trong thư viện — xem mục C).

### B. Xử lý lỗi & luồng dữ liệu (mỗi mục đã tái hiện là lỗi thật trên bản 3.11 trước khi sửa)

- **[BUGFIX]** Google Sheet không phản hồi → app treo mãi "Đang tải dữ liệu...", nút CẬP NHẬT bị
  khoá vĩnh viễn. Nay giới hạn 60 giây/Sheet, báo lỗi rõ, mở lại nút.
- **[BUGFIX]** Lỗi mạng thoáng qua/Google lỗi 5xx → báo lỗi ngay. Nay tự thử lại 1 lần sau 1,5 giây.
- **[BUGFIX]** HD_NCC/HOSOKEO tải lỗi bị bỏ qua im lặng (vẫn chấm xanh, Bảng kê lâm sản trống không rõ
  lý do). Nay vẫn không chặn các báo cáo khác nhưng hiện **cảnh báo vàng** nói rõ Sheet nào lỗi.
- **[MỚI]** Kiểm tra cột: nếu Google Sheet bị đổi tên/xoá cột mà báo cáo cần (vd "Ngày cân 1"), hiện
  cảnh báo vàng nêu đúng Sheet + tên cột thiếu (trước đây: báo cáo 0 dòng, trạng thái vẫn xanh).
- **[BUGFIX]** Thông báo lỗi mạng "Failed to fetch" khó hiểu → "không kết nối được tới Google Sheet —
  kiểm tra kết nối Internet". Làm mới thất bại → nói rõ "vẫn đang hiển thị dữ liệu lần tải trước
  (giờ:phút)" (dữ liệu cũ vốn không bị xoá — nay kiểm chứng tự động).
- **[BUGFIX]** Lỗi khi bấm xuất file/thao tác chỉ nằm trong console, người dùng không thấy gì. Nay mọi
  lỗi chưa xử lý đều hiện đỏ trên thanh trạng thái (bỏ qua 2 cảnh báo vô hại của trình duyệt).
- **[MỚI]** Xuất Excel/PDF: hiện "Đang tạo file…" ngay khi bấm (PDF 10.000 dòng mất ~7 giây, trước
  đây màn hình đứng yên không dấu hiệu), bấm lặp khi đang xuất bị bỏ qua (trước đây bấm 3 lần = 3
  file trùng), xong trả lại trạng thái cũ. Không đổi nội dung file (`services/export-runner.js`).
- **[BUGFIX — NGHIÊM TRỌNG, app desktop]** `main.js` chỉ sinh `report.html` 1 lần lúc cấu hình công ty
  đầu tiên → cài bản mới đè lên vẫn mở báo cáo CŨ, **mọi bản sửa giao sau lần cấu hình đầu KHÔNG có
  tác dụng trên app desktop**. Nay lưu dấu vân tay (SHA-1) của file mẫu; mở app thấy mẫu đổi thì tự
  sinh lại từ mẫu mới + cấu hình đã lưu (cùng đường dẫn → giữ nguyên danh mục, gán Tàu... đã lưu).
- **[BUGFIX — quy trình giao]** `config.html` (công cụ tạo file cấu hình riêng, bản web) nhúng sẵn 1
  bản `dist/index.html` nhưng chưa được nhúng lại từ 22/09 (Phase 3.5) → file tạo ra từ công cụ này
  thiếu mọi bản sửa 3.6–3.11. Đã nhúng lại; thêm bước `npm run build:config` vào quy trình giao.

### Kiểm chứng trước khi giao

- `npm run test:perf-equivalence` (MỚI, 11 kiểm tra): kết quả 15 báo cáo trên 10.000 & 30.000 phiếu
  cân **khớp mã băm SHA-1 với code trước tối ưu** (tới từng dòng, thứ tự, số lẻ); 5 hàm có bộ đệm khớp
  bản sao nguyên văn code cũ trên ~85.000 đầu vào × 2 lượt; `Intl` khớp `toLocaleString`/
  `localeCompare` ngay trên Chromium. Đối chứng: cố ý đổi thứ tự dòng trùng ngày → test báo FAIL.
- `npm run test:error-handling` (MỚI, 15 kiểm tra): bản mới 15/15; **bản 3.11 (đối chứng) chỉ 5/15**
  — 10 lỗi nêu trên đều tái hiện được, 5 hành vi cần giữ (không mất dữ liệu, không cảnh báo giả…) giữ
  nguyên.
- `desktop-app/tests/test-template-refresh.js` (MỚI, 8 kiểm tra): bản mới 8/8; `main.js` trong bộ cài
  3.11 (đối chứng) 6/8 — đúng 2 lỗi "cài bản mới vẫn mở báo cáo cũ".
- Toàn bộ bộ test cũ: `test:ui` KHỚP, `test:features` 22/22, `test:tau` 17/17, `test:pdf-money-wrap`,
  `test:print-blankpage`, `test:print-total-row`, `test:pdf-custom-money-wrap`: đạt, `test:config`
  23/23 (trước khi nhúng lại config.html: 22/23 — chính là lỗi quy trình giao ở trên).

---

## [Phase 3.11] — Sửa "đ" xuống dòng ở PDF "Bảng kê WO" (và 2 mẫu PDF riêng khác)

**Bối cảnh:** Người dùng gửi ảnh chụp PDF "BẢNG KÊ KHAI HÀNG HÓA XUẤT KHẨU ĐẠT TIÊU CHÍ WO"
(xuất từ nút "Xuất mẫu WO"): cột "Đơn giá" và "Tổng trị giá" vẫn bị đơn vị "đ" xuống dòng riêng
— cùng lỗi đã báo và tưởng đã sửa hết ở Phase 3.8, nhưng lần này ở một mẫu PDF khác.

### Nguyên nhân & sửa lỗi

- **[BUGFIX]** Bản sửa ở Phase 3.8 chỉ áp dụng logic ép bề rộng cột tiền vào hàm `exportPDF()`
  — dùng cho nút "📄 PDF" chung của các báo cáo trong bảng. Nhưng ứng dụng còn 3 mẫu PDF RIÊNG,
  mỗi mẫu tự viết code gọi `doc.autoTable()` khác nhau, KHÔNG đi qua `exportPDF()`, nên KHÔNG
  được áp dụng bản sửa đó:
  1. `buildWOPdf()` — "Bảng kê WO" (nút "Xuất mẫu WO"), cột "Đơn giá"/"Tổng trị giá".
  2. `buildTNDNPdf()` — mẫu "02/TNDN" (Báo cáo ngân hàng), cột "Đơn giá"/"Tổng giá thanh toán".
  3. `buildPNKPdf()` — "Phiếu nhập kho" (Báo cáo ngân hàng), cột "Đơn giá"/"Thành tiền".
- Đây chính là lý do lần trước báo "CÁC BÁO CÁO PDF CŨNG BỊ LỖI NHƯ VẬY" tưởng đã hết nhưng vẫn
  còn sót ở các mẫu này — mẫu WO không thuộc nhóm "báo cáo trong bảng" nên chưa được kiểm tra.
- **Đã sửa:** tách logic đo & ép bề rộng cột tiền thành 1 hàm dùng chung
  `forcePdfMoneyColumnWidths()` (đặt ngay sau `ensurePdfFont()` trong `legacy-app.js`), áp dụng
  đồng bộ cho cả `exportPDF()` (giữ nguyên) VÀ 3 hàm `buildWOPdf()`/`buildTNDNPdf()`/
  `buildPNKPdf()` — cùng cơ chế đã kiểm chứng ở Phase 3.8 (đo chiều rộng chuỗi dài nhất của
  chính cột đó bằng đúng font/cỡ chữ dùng trong bảng, ép `cellWidth` đủ chỗ).

### Kiểm chứng trước khi giao

- Test mới `tests/test-pdf-custom-money-wrap.mjs` (`npm run test:pdf-custom-money-wrap`):
  dựng dữ liệu với số tiền lớn (hàng trăm triệu) VÀ các cột chữ khác dài giống đúng dữ liệu
  thật (địa chỉ, CCCD — dữ liệu giả lập mặc định dùng chuỗi quá ngắn nên không tái hiện được
  lỗi dù số tiền dài), xuất PDF cả 3 mẫu (WO, 02/TNDN, Phiếu nhập kho), dùng `pdftotext -bbox`
  kiểm tra có "đ" nào đứng riêng dòng dưới 1 số tiền hay không.
  - **Đối chứng (tạm hoàn tác `forcePdfMoneyColumnWidths()` ở cả 3 hàm):** mẫu WO tái hiện
    đúng lỗi (1 chỗ "đ" bị ngắt dòng) — xác nhận đây là lỗi thật và cách kiểm tra bắt được lỗi.
    Mẫu 02/TNDN và Phiếu nhập kho không tái hiện được với dữ liệu giả lập đã thử (bố cục cột 2
    mẫu này còn dư nhiều chỗ hơn mẫu WO) — 2 mẫu này được sửa CHỦ ĐỘNG bằng đúng cơ chế đã
    chứng minh đúng ở mẫu WO, không phải suy đoán riêng, nhưng chưa tự tái hiện được lỗi riêng
    ở 2 mẫu đó nên ghi rõ ở đây để minh bạch.
  - **Sau khi sửa:** cả 3 mẫu đều 0 chỗ "đ" bị ngắt dòng.
- `npm run test:ui`, `test:features`, `test:tau`, `test:pdf-money-wrap`,
  `test:print-blankpage`, `test:print-total-row`: tất cả vẫn đạt — không ảnh hưởng gì tới các
  tính năng/báo cáo khác.

### Không đổi

- Không đổi số liệu, không đổi bố cục cột khác, không đổi cỡ chữ/font — chỉ ép thêm bề rộng tối
  thiểu cho đúng 2 cột tiền trong 3 mẫu PDF nói trên (giống hệt cách đã làm ở `exportPDF()`).

---

## [Phase 3.10] — Sửa "kẻ khung lở dở" + dòng "Tổng cộng" lặp lại ở mọi trang khi in báo cáo dài

**Bối cảnh:** Người dùng gửi ảnh chụp bản in "BKLS xuất khẩu — Chi tiết"/"Tổng hợp" (400+ dòng,
nhiều trang): dòng "Tổng cộng" xuất hiện lặp lại ở CUỐI MỌI TRANG (không chỉ ở trang cuối cùng),
và đường viền quanh dòng đó bị vẽ ngắt quãng, dở dang ngay tại điểm chia trang.

### Nguyên nhân & sửa lỗi

- **[BUGFIX]** `buildPrintSheet()` (dựng bảng HTML để in, `src/legacy-app.js`) đặt dòng "Tổng
  cộng" trong `<tfoot>` của bảng. Theo đúng chuẩn CSS in ấn, khi 1 bảng `<table>` dài bị ngắt
  sang nhiều trang lúc in, trình duyệt tự lặp lại `<thead>`/`<tfoot>` ở MỖI trang — hữu ích cho
  `<thead>` (lặp lại tiêu đề cột, dễ đọc) nhưng SAI cho `<tfoot>` ở đây, vì dòng "Tổng cộng" là
  tổng DUY NHẤT của toàn bộ báo cáo, không phải tổng riêng của từng trang; viền bảng cũng bị vẽ
  ngắt quãng ngay tại điểm chia trang do dòng này bị lặp/cắt theo từng trang. Đã sửa bằng cách
  đưa dòng "Tổng cộng" thành DÒNG CUỐI CÙNG của `<tbody>` (không còn `<tfoot>`) — chỉ in ra đúng
  1 lần, ngay sau dòng dữ liệu cuối, kèm `page-break-inside:avoid` để dòng này không bị cắt làm
  đôi nếu rơi đúng vào điểm ngắt trang.

### Kiểm chứng trước khi giao

- Viết test mới `tests/test-print-total-row.mjs` (`npm run test:print-total-row`): dựng dữ liệu
  400 dòng BKLS (đủ để dàn ra 11 trang khi in, giống đúng khối lượng dữ liệu thật người dùng
  dùng), mô phỏng đúng lúc trình duyệt đang in rồi lấy PDF, đếm số lần cụm từ "Tổng cộng" xuất
  hiện trong toàn bộ file.
  - **Trước khi sửa** (đối chứng bằng cách tạm hoàn tác code): "Tổng cộng" xuất hiện **12 lần**
    (1 lần/trang, đúng 12 trang) → xác nhận đúng lỗi người dùng báo.
  - **Sau khi sửa**: "Tổng cộng" xuất hiện đúng **1 lần**, ở trang cuối (trang 11/11).
- `npm run test:ui`: KHỚP 100%. `npm run test:features`: 22/22. `npm run test:tau`: 17/17.
  `npm run test:pdf-money-wrap`, `npm run test:print-blankpage`: không lỗi — không ảnh hưởng gì
  tới các tính năng/báo cáo khác (kể cả nút "📄 PDF" — xuất bằng jsPDF, không dùng HTML
  `buildPrintSheet()`, nên không liên quan tới lỗi này).

### Không đổi

- Không đổi số liệu Tổng cộng (vẫn đúng giá trị tổng của toàn bộ báo cáo) — chỉ đổi VỊ TRÍ trong
  cấu trúc HTML để trình duyệt không tự lặp lại nó theo trang khi in.

---

## [Phase 3.9] — Sửa file PDF (từ nút "🖨 In" → "Lưu dưới dạng PDF") có 1 trang trắng ở đầu

**Bối cảnh:** Người dùng báo tiếp: "FILE PDF CÓ TRANG TRẮNG Ở TRANG ĐẦU".

### Điều tra

- Xuất thử PDF từ nút "📄 PDF" (jsPDF, đã sửa ở Phase 3.8) cho toàn bộ 13/15 báo cáo có nút xuất
  chung, với nhiều cỡ dữ liệu khác nhau (tới 500+ dòng, số tiền tới hàng chục tỷ) — dùng
  `pdfinfo`/`pdftotext -bbox` để kiểm tra khách quan số trang và nội dung từng trang: KHÔNG phát
  hiện trang trắng nào ở luồng này.
- Chuyển sang điều tra luồng "🖨 In" (nút này gọi `window.print()` của trình duyệt — người dùng
  chọn "Lưu dưới dạng PDF" trong hộp thoại in của Windows/trình duyệt để có file PDF) — dùng
  Playwright mô phỏng đúng lúc `#printSheet` đang ở trạng thái hiển thị để in, rồi dùng
  `page.pdf()` (cùng engine in ấn Chromium) lấy đúng bản PDF mà người dùng sẽ thấy: **tái hiện
  đúng lỗi** — trang 1 hoàn toàn trắng (0 ký tự), nội dung thật bị đẩy xuống trang 2.

### Nguyên nhân & sửa lỗi

- **[BUGFIX]** `.app{display:flex;min-height:100vh}` (khối bọc ngoài toàn bộ giao diện, ở
  `index.html`) không được reset khi in. Khi bấm "In", CSS `@media print` ẩn `.side` và `.content`
  bên trong `.app` (`display:none`) để chỉ hiện `#printSheet` — nhưng `#printSheet` là phần tử
  SAU `.app` trong DOM, và CHÍNH `.app` vẫn giữ `min-height:100vh` dù cả 2 con của nó đều đã ẩn,
  nên nó vẫn chiếm đủ 1 trang giấy trắng, đẩy toàn bộ `#printSheet` (nội dung cần in) xuống trang
  kế tiếp. Đã sửa bằng 1 dòng `.app{min-height:0}` trong `@media print` — chỉ áp dụng khi in,
  không ảnh hưởng gì khi xem trên màn hình.

### Kiểm chứng trước khi giao

- Viết test mới `tests/test-print-blankpage.mjs` (`npm run test:print-blankpage`): mô phỏng đúng
  trạng thái "đang in" rồi dùng `page.pdf()` lấy PDF, kiểm tra trang 1 có nội dung thật.
  - **Trước khi sửa** (đối chứng bằng cách tạm hoàn tác dòng CSS): test phát hiện đúng lỗi — 2
    trang, trang 1 trắng (0 ký tự), nội dung dồn hết vào trang 2.
  - **Sau khi sửa**: 1 trang, trang 1 có đủ nội dung (6.149 ký tự) — không còn trang trắng.
- `npm run test:ui`: KHỚP 100%. `npm run test:features`: 22/22. `npm run test:tau`: 17/17.
  `npm run test:pdf-money-wrap`: không lỗi — không ảnh hưởng gì tới các tính năng khác.
- **Điều tra thêm (không phải lỗi):** trong lúc kiểm tra kỹ hình ảnh PDF ở độ phân giải thấp
  (100 DPI), có lúc tưởng nhầm chữ "đ" trong PDF hiển thị sai thành "d" — kiểm tra lại ở độ phân
  giải cao hơn (200 DPI) xác nhận "đ" luôn hiển thị ĐÚNG (có gạch ngang), đây chỉ là hạn chế của
  ảnh chụp thử nghiệm ở độ phân giải thấp, không phải lỗi thật trong file PDF.

### Không đổi

- Chỉ đổi 1 thuộc tính CSS, áp dụng riêng trong `@media print` — không ảnh hưởng giao diện màn
  hình, không đổi số liệu hay logic nào khác.

---

## [Phase 3.8] — Sửa đơn vị tiền "đ" bị xuống dòng riêng trong báo cáo xuất PDF (và bản "In")

**Bối cảnh:** Người dùng báo tiếp: "CÁC BÁO CÁO PDF CŨNG BỊ LỖI NHƯ VẬY" — cùng hiện tượng đơn vị
"đ" rớt xuống dòng riêng như ở thẻ KPI Dashboard (Phase 3.7), nhưng lần này ở file PDF xuất ra từ
nút "📄 PDF" của các báo cáo dạng bảng.

### Sửa lỗi

- **[BUGFIX]** Thư viện dựng bảng PDF (`jspdf-autotable`, dùng trong `exportPDF()` ở
  `src/legacy-app.js`) tự động ngắt dòng nội dung ô khi cột quá hẹp — với các báo cáo nhiều cột
  (ví dụ "Thanh toán" có 17 cột) dồn trên 1 trang A4 ngang, cột tiền hẹp lại và bị ngắt dòng ngay
  tại khoảng trắng trước "đ", giống hệt nguyên nhân đã sửa ở Dashboard. Đã sửa bằng 2 lớp, không
  đổi số liệu, chỉ đổi cách trình bày:
  1. Đổi khoảng trắng trước "đ" thành khoảng trắng không ngắt dòng (NBSP) — `autoTable` không
     còn điểm ngắt tại đó nữa.
  2. Đo trước bề rộng cần thiết cho từng cột tiền (bằng đúng font "Roboto" + cỡ chữ dùng trong
     bảng) rồi ép `columnStyles[i].cellWidth` đủ rộng cho chuỗi dài nhất của CHÍNH cột đó — đảm
     bảo không bao giờ cần ngắt dòng nữa, dù báo cáo có bao nhiêu cột hay số tiền dài tới đâu.
- **[Phòng ngừa]** Áp dụng luôn `white-space:nowrap` cho bảng ở màn hình "In" (`#printSheet
  table.psTable`, dùng khi bấm nút "🖨 In" — mở hộp thoại in của trình duyệt) — cùng họ lỗi, dù
  chưa được người dùng báo riêng, phòng khi cột hẹp lại làm "đ" ngắt dòng tương tự trên bản in.

### Kiểm chứng trước khi giao

- Viết test mới `tests/test-pdf-money-wrap.mjs` (`npm run test:pdf-money-wrap`): dựng dữ liệu với
  số tiền lớn (tới hàng chục tỷ đồng) trên báo cáo "Thanh toán" (17 cột — dễ bị hẹp cột nhất),
  bấm nút "📄 PDF" thật, lưu file PDF tải về, dùng `pdftotext -bbox` đọc VỊ TRÍ từng chữ trong PDF
  để phát hiện tự động bất kỳ chữ "đ" nào đứng riêng 1 dòng ngay dưới 1 số tiền (dấu hiệu bị ngắt
  dòng).
  - **Trước khi sửa** (đã thử nghiệm bằng cách tạm hoàn tác code để đối chứng): test phát hiện
    đúng 1 chỗ "đ" bị ngắt dòng (ví dụ số "19.205.808.197" và "đ" tách 2 dòng) → xác nhận đúng
    lỗi người dùng báo, không phải báo nhầm.
  - **Sau khi sửa**: test không còn phát hiện chỗ nào "đ" bị ngắt dòng (0/697 từ trong PDF).
- `npm run test:ui`: KHỚP 100%. `npm run test:features`: 22/22. `npm run test:tau`: 17/17 —
  không ảnh hưởng gì tới các tính năng/báo cáo khác.

### Không đổi

- Không đổi số liệu, công thức, hay nội dung báo cáo nào — chỉ đổi cách autoTable tính bề rộng
  cột tiền và cách ngắt dòng trong ô, để đơn vị "đ" luôn nằm cùng dòng với số tiền.

---

## [Phase 3.7] — Sửa đơn vị tiền "đ" (và "tấn"/"xe") bị xuống dòng riêng ở thẻ KPI Dashboard

**Bối cảnh:** Người dùng chụp ảnh báo các thẻ KPI ở Dashboard (Tổng nhập, Giá trị nhập, Tổng
thanh toán, Công nợ...) khi số tiền dài, đơn vị "đ" bị rớt xuống dòng riêng một mình, nhìn mất
cân đối.

### Sửa lỗi

- **[BUGFIX]** `.card .val` trước đây không có `white-space:nowrap` nên khi độ dài chuỗi (số +
  đơn vị) vượt quá bề rộng thẻ, trình duyệt tự ngắt dòng ngay tại khoảng trắng trước đơn vị
  ("đ"/"tấn"/"xe"), để đơn vị trôi xuống dòng dưới một mình. Đã sửa bằng hàm `fitCardValues()`
  mới trong `src/components/dashboard.js`: cho toàn bộ giá trị KPI **không xuống dòng**
  (`nowrap`), sau đó tự co nhỏ cỡ chữ (24px → tối thiểu 15px) cho từng thẻ riêng cho đến khi vừa
  đúng 1 dòng trong bề rộng thẻ đó — không đổi số liệu/định dạng số, chỉ đổi cỡ chữ hiển thị, tự
  thích ứng theo mọi độ dài số tiền và mọi kích thước màn hình (không phải sửa cứng 1 cỡ chữ cố
  định, tránh vá lỗi lại mỗi khi số liệu thay đổi).

### Kiểm chứng trước khi giao

- Playwright: dựng dashboard với dữ liệu ngẫu nhiên (số tiền tới hàng tỷ đồng), đo `scrollWidth`
  so với `clientWidth` của từng ô `.card .val` sau khi render — toàn bộ 10 thẻ KPI đều vừa đúng 1
  dòng (`scrollWidth <= clientWidth`), không còn hiện tượng đơn vị rớt dòng riêng. Kiểm tra riêng
  cơ chế co chữ trên 1 thẻ hẹp giả lập (120px) xác nhận hàm co đúng từ 24px xuống tới mức sàn
  15px khi cần.
- `npm run test:ui`: KHỚP 100%. `npm run test:features`: 22/22. `npm run test:tau`: 17/17 — không
  ảnh hưởng gì tới các tính năng khác.

### Không đổi

- Không đổi bất kỳ số liệu, công thức, hay logic báo cáo nào — chỉ đổi cách HIỂN THỊ (CSS +
  co cỡ chữ) của riêng các thẻ KPI trên Dashboard.

---

## [Phase 3.6] — Sửa "Khối lượng (KG)", bỏ "Đối chiếu Excel", tách menu, nhóm BKLS theo Tàu/Khách hàng + khoá, báo cáo & Dashboard theo Tàu, mẫu tải "Sổ chi tiết tiền vay"

**Bối cảnh:** Người dùng yêu cầu 1 lượt 7 việc: (1) sửa nhãn "Khối lượng (KG)" nhầm ở báo cáo
Thanh toán (thực chất là tấn); (2) bỏ hẳn tính năng "Đối chiếu Excel"; (3) tách "Danh mục & cấu
hình" thành 2 menu độc lập; (4)+(5) BKLS Chi tiết/Tổng hợp nhóm thêm theo Tàu + Khách hàng, và 1
khi đã gán 1 Số BKLS cho 1 Tàu thì không được gán sang Tàu khác nữa, có màn hình chọn dòng để xuất
theo Tàu; (6) thêm báo cáo "Tổng hợp nguyên liệu xuất theo Tàu" + Dashboard theo dõi nguyên liệu
theo từng Tàu; (7) thêm nút tải file mẫu cho "Sổ chi tiết tiền vay".

### Sửa lỗi / thay đổi

- **[BUGFIX]** `THANHTOAN_COLS`: cột "Khối lượng (KG)" → "Khối lượng (tấn)", đổi kiểu định dạng
  từ số nguyên (`int`) sang 2 số lẻ (`kl`) — đã kiểm chứng dữ liệu thật là tấn (khớp phép tính đơn
  giá), không phải kg.
- **[GỠ TÍNH NĂNG]** Xoá hoàn toàn "Đối chiếu Excel": file `src/components/compare.js`, mục nav,
  section `#sec-doichieu`, CSS liên quan (`.compareTbl`, `.diff-ok`, `.diff-bad`), khoá
  `localStorage` `STORAGE_KEYS.COMPARE`.
- **[TÁCH MENU]** "Danh mục & cấu hình" tách thành 2 mục nav độc lập: "Danh mục" (DM Đại lý/Hộ
  trồng + Hoàn tác/Làm lại) và "Cấu hình" (Sao lưu/Khôi phục + Hướng dẫn sử dụng) — dùng lại đúng
  cơ chế `showSection()` có sẵn, không cần đổi logic JS nào khác.
- **[TÍNH NĂNG MỚI] Nhóm BKLS theo Tàu/Khách hàng + khoá vĩnh viễn theo Tàu đã gán:**
  - Dữ liệu Tàu/Khách hàng **không có trong Google Sheet HOSOKEO** (đã hỏi lại người dùng và xác
    nhận) — thiết kế hoàn toàn ở phía app: gán tay qua màn hình "🚢 Xuất theo Tàu" (module mới
    `src/services/tau-assignment.js`), lưu `localStorage` theo khoá "Số BKLS", `{tau, khachHang,
    ngayGan}`.
  - Quy tắc khoá (theo đúng xác nhận của người dùng): 1 Số BKLS đã gán 1 Tàu thì **không** gán
    được sang Tàu khác; **được** xuất/gán bổ sung lại nhiều lần cho **chính Tàu đó** (không phải
    khoá "chỉ 1 lần"). Chặn ở cả 2 lớp: UI (tick-box tự khoá/mở khoá theo tên Tàu đang gõ) và
    service `assignTau()` (lớp bảo vệ cuối, phòng khi UI có sơ suất).
  - `computeXuatHang01`/`computeXuatHang02` (BKLS Chi tiết/Tổng hợp) nhóm thêm theo cặp
    `Tàu`/`Khách hàng xuất` — 1 người bán có hàng đi 2 tàu khác nhau sẽ tách 2 dòng riêng.
  - Màn hình "Xuất theo Tàu" lấy đúng danh sách dòng đang lọc ở bảng "BKLS Chi tiết" (tôn trọng
    tìm kiếm/sắp xếp hiện tại), cho gõ tên Tàu mới hoặc chọn lại Tàu đã có.
  - **[BUGFIX phát hiện qua test]** gõ TAY đúng tên 1 Tàu đã có (không chọn qua ô "Tàu đã có") thì
    ô Khách hàng bị bỏ trống (do màn hình luôn xoá trắng khi mở) — nếu gán thêm dòng lúc này mà
    quên gõ lại Khách hàng, dòng mới sẽ mang Khách hàng rỗng khác dòng cũ của CHÍNH tàu đó, làm
    báo cáo Tổng hợp theo Tàu tách nhầm 2 dòng cho 1 tàu. Đã sửa: tự động điền lại đúng Khách
    hàng đã lưu khi tên Tàu gõ khớp chính xác 1 Tàu đã từng gán (không đè nếu người dùng tự gõ
    Khách hàng khác).
- **[BÁO CÁO MỚI]** "Tổng hợp nguyên liệu xuất theo Tàu" (`computeTauTongHop`) — gộp theo cặp
  Tàu/Khách hàng, tính trên **toàn bộ** hồ sơ đã gán tàu (không giới hạn theo khoảng ngày đang
  lọc, vì 1 tàu thường nhận hàng dồn từ nhiều kỳ báo cáo khác nhau).
- **[DASHBOARD]** Thêm 2 thẻ KPI ("Số tàu đang theo dõi", "Nguyên liệu đã xuất theo Tàu") + biểu
  đồ cột `#chartTau` (nguyên liệu theo từng Tàu, tấn).
- **[TIỆN ÍCH]** Nút "📥 Tải file mẫu" cho "Sổ chi tiết tiền vay" — sinh file Excel mẫu 8 cột kèm
  1 dòng ví dụ (`downloadTienVayTemplate()`).

### Sửa lỗi trong quá trình tự kiểm tra (chưa từng lộ ra với người dùng)

- **[BUG khôi phục]** Thiếu `unassignTau` trong danh sách import từ `tau-assignment.js` ở
  `legacy-app.js` — sẽ gây `ReferenceError` ngay khi bấm "Gỡ gán các dòng đã chọn". Phát hiện và
  sửa trước khi giao, có test riêng xác nhận không còn lỗi.

### Kiểm chứng trước khi giao

- `npm run test:ui`: KHỚP 100% (không đổi hành vi cũ). `npm run test:features`: 22/22.
- Test mới `npm run test:tau` (`tests/test-tau-assignment.mjs`, 17 kiểm tra riêng cho tính năng
  Tàu): mở modal, đếm đúng số dòng chọn, gán Tàu A/Khách hàng X cho 3 dòng, xác nhận **khoá**
  đúng khi gõ tên Tàu khác, xác nhận **mở khoá + tự tick lại** khi gõ đúng tên Tàu cũ, gán bổ
  sung dòng thứ 4 cho đúng Tàu đó, báo cáo "Tổng hợp theo Tàu" ra đúng 1 dòng với đúng số liệu,
  BKLS Chi tiết hiển thị đúng cột Tàu, Dashboard hiển thị đúng KPI/canvas biểu đồ, gỡ gán không
  còn lỗi `ReferenceError`, gỡ gán xoá đúng dữ liệu khỏi `localStorage` — 17/17 passed, 0 lỗi JS.

### Không đổi

- Không có báo cáo/nghiệp vụ cũ nào bị đổi số liệu — các cột `Tàu`/`Khách hàng xuất` mới đều rỗng
  cho dữ liệu chưa từng gán Tàu (không ảnh hưởng báo cáo hiện có nếu người dùng chưa dùng tính
  năng mới). Toàn bộ 14 báo cáo cũ + cơ chế Sao lưu/Khôi phục/Hoàn tác/Làm lại giữ nguyên 100%.

---

## [Phase 3.5] — Sửa cột "Mã ĐL"/"Tên đại lý" bị co lại không đọc được trong "Danh mục & cấu hình"

**Bối cảnh:** Người dùng chụp ảnh báo 2 cột đầu bảng "DM_DL — Danh mục đại lý" chỉ hiện được 1
ký tự, không thấy chữ để đọc/sửa.

### Sửa lỗi

- Thêm `<colgroup>` cố định tỉ lệ % cột + `table-layout:fixed` cho bảng `#dmDLTable`/`#dmHTTable`
  — trước đây dùng table-layout mặc định khiến input ngày/số (có độ rộng tối thiểu do trình duyệt
  quy định) giành hết chỗ, đẩy 2 cột chữ co lại chỉ còn vài px khi cửa sổ không đủ rộng (đúng tình
  huống ứng dụng desktop Electron). Dữ liệu không hề bị mất, chỉ là ô quá hẹp để nhìn thấy. Chi
  tiết đầy đủ trong `BUG_FIXED.md`.
- Phát hiện thêm: `src/styles/main.css` (tách từ Phase 1) là file mồ côi, không được `import` ở
  đâu — CSS thật sự dùng nằm trong khối `<style>` nhúng thẳng `index.html`. Đã sửa cả 2 nơi đồng
  bộ cho lần này; đã ghi chú vào `TODO.md` để dọn dẹp/gộp lại về sau, tránh nhầm lẫn khi sửa CSS.

### Kiểm chứng trước khi giao

- Đo độ rộng ô nhập thật bằng Playwright trước/sau: cột "Mã ĐL" 18px→30px, "Tên đại lý"
  23px→81px — kèm ảnh chụp màn hình xác nhận đọc được đầy đủ nội dung.
- `npm run test:ui`: KHỚP 100%. `npm run test:features`: 22/22. `npm run test:export-libs`:
  10/10. `npm run build:config` + `npm run test:config`: 23/23 — không có tác dụng phụ.

### Không đổi

- Toàn bộ logic nghiệp vụ, dữ liệu danh mục đã lưu — chỉ đổi cách hiển thị cột, không đổi cấu
  trúc dữ liệu hay hành vi lưu/đọc `localStorage`.

---

## [Phase 3.4] — Sửa lỗi "Nút xuất Excel/PDF/In/Xuất tất cả đều dùng kg được"

**Bối cảnh:** Người dùng báo trực tiếp: "NÚT XUẤT EXCEL, IN, PDF VÀ XUẤT TẤT CẢ ĐỀU DÙNG KG ĐC".
Điều tra tìm ra **2 nguyên nhân độc lập**, cả 2 đều góp phần vào cùng triệu chứng.

### Sửa lỗi

- **[BUG-M4]** (Nghiêm trọng, nguyên nhân chính) `fmtCell` không được `import` vào
  `legacy-app.js` dù được gọi ở 6 chỗ (bên trong logic xuất Excel/PDF/In) — gây
  `ReferenceError` ngay khi bấm bất kỳ nút xuất nào. Lỗi tiềm ẩn có sẵn từ Phase 2, chỉ lộ ra khi
  bấm nút xuất thật (không bị `esbuild`/`vite build`/`ui-baseline.mjs` bắt được). Đã sửa: thêm
  `fmtCell` vào import đã có sẵn từ `components/report-table.js`. Chi tiết đầy đủ trong
  `BUG_FIXED.md`.
- **[Nguyên nhân phụ]** 5 thư viện xuất báo cáo (ExcelJS, jsPDF, jspdf-autotable, Chart.js, xlsx)
  trước đây nạp qua `<script src="cdn...">` — nếu mạng/máy người dùng chặn
  `cdnjs.cloudflare.com`/`cdn.jsdelivr.net` (tường lửa công ty, diệt virus, ISP...) thì các thư
  viện này không tải được, mọi nút xuất + biểu đồ Dashboard đều gãy. Đã sửa: chuyển cả 5 thư viện
  sang `import` qua npm (đã có sẵn trong `package.json` từ Phase 1, chưa từng dùng), Vite đóng
  gói thẳng vào `dist/index.html` — **không còn phụ thuộc mạng để xuất báo cáo nữa** (chỉ còn
  phụ thuộc mạng ở bước tải dữ liệu ban đầu từ Google Sheet). Worker đọc file "Sổ chi tiết tiền
  vay" cũng được sửa tương tự (nhúng thẳng mã nguồn `xlsx` qua Vite `?raw` import thay vì
  `importScripts()` từ CDN trong Worker).

### Kiểm chứng trước khi giao

- `tests/test-export-libs.mjs` (mới, Playwright, trình duyệt thật) — **CHẶN HẲN** 2 domain CDN
  trong lúc test (mô phỏng đúng tình huống người dùng gặp phải) rồi bấm lần lượt Excel/PDF/In/
  "Xuất tất cả" + kiểm tra biểu đồ Dashboard: **10/10 khớp**, bao gồm mở lại file `.xlsx` tải về
  bằng chính package `exceljs` (độc lập với trình duyệt) để xác nhận là file thật, có dữ liệu,
  không rỗng.
- `npm run test:ui`: vẫn **KHỚP 100%** với baseline.
- `npm run test:features`: vẫn **22/22 khớp**.
- `npm run build:config` (nhúng lại `dist/index.html` mới vào `config.html`) +
  `npm run test:config`: vẫn **23/23 khớp**.
- 2 hằng số font PDF tiếng Việt vẫn nguyên vẹn (`addFont("Roboto-Regular.ttf"...)` /
  `addFont("Roboto-Bold.ttf"...)` xuất hiện đúng 1 lần mỗi font trong `dist/index.html` — số lần
  match thô của `addFileToVFS`/`addFont` tăng lên so với trước là vì mã nguồn thư viện `jsPDF`
  giờ nằm thẳng trong `dist/index.html` (bundle qua npm) thay vì tải rời từ CDN như trước, không
  phải dấu hiệu lỗi).

### Không đổi

- Toàn bộ logic tính báo cáo, giao diện, và các tính năng Phase 3/3.1/3.2/3.3 trước đó — chỉ sửa
  đúng nguyên nhân gây lỗi, không đổi hành vi nào khác. Nội dung/định dạng file Excel/PDF xuất ra
  giữ nguyên 100% (chỉ khác cách nạp thư viện, không khác cách dùng thư viện).

---

## [Phase 3.3] — `config.html` bổ sung cấu hình Mã số thuế/SĐT/Địa chỉ (dùng cho biểu mẫu ngân hàng/WO)

**Bối cảnh:** Theo yêu cầu trực tiếp của người dùng ngay sau Phase 3.2 — thấy modal "Thông tin
xuất báo cáo ngân hàng" có các ô Mã số thuế/Số điện thoại/Địa chỉ (trụ sở) phải tự gõ tay, hỏi
sao không cấu hình sẵn luôn trong `config.html` và dùng chung cho các biểu mẫu.

### Thêm mới

- `CONFIG.DEFAULT_BANK_INFO` / `CONFIG.DEFAULT_WO_INFO` (`src/config/config.js`) — giá trị mặc
  định ban đầu (Mã số thuế, Địa chỉ, Số điện thoại, Địa chỉ nơi tổ chức thu mua) cho 2 modal
  "Thông tin xuất báo cáo ngân hàng" (Mẫu 02/TNDN + Phiếu nhập kho) và "Khai báo mẫu WO". Mặc
  định rỗng (`''`) ở bản Đại Hiệp gốc — giữ đúng hành vi cũ (vẫn phải nhập tay lần đầu).
- `config.html` thêm mục "3. Thông tin dùng cho các biểu mẫu xuất báo cáo" (không bắt buộc): Mã
  số thuế, Số điện thoại, Địa chỉ (trụ sở), Địa chỉ nơi tổ chức thu mua — dùng chung cho cả 2
  modal (WO chỉ cần Mã số thuế + Địa chỉ thu mua, ít hơn modal ngân hàng).

### Thay đổi

- `loadBankInfo()`/`loadWOInfo()` (`src/legacy-app.js`): trước đây trả về `{}` nếu chưa từng
  lưu gì; giờ trả về **đúng dữ liệu đã lưu nếu ĐàTỪNG lưu ít nhất 1 lần** (kể cả có ô để trống
  có chủ đích — tôn trọng lựa chọn xoá tay của người dùng, không tự động điền lại), hoặc
  `CONFIG.DEFAULT_BANK_INFO`/`DEFAULT_WO_INFO` nếu **CHƯA TỪNG lưu lần nào**. Phân biệt 2
  trường hợp bằng cách gọi `storageService.get(key, null)` thay vì `storageService.get(key, {})`
  — `null` (chưa có key trong localStorage) khác với `{}` (đã lưu, chỉ là rỗng).

### Kiểm chứng trước khi giao

- Mở rộng `tests/test-config-generator.mjs` từ 18 → **23/23 khớp**, thêm: kiểm tra nội dung
  file (đúng MST/địa chỉ thu mua mới cho cả 2 khối JSON ngân hàng + WO), và quan trọng nhất —
  **mở modal "02/TNDN" thật trên trình duyệt** (sau khi lập báo cáo với dữ liệu giả lập), xác
  nhận ô Mã số thuế/Địa chỉ thu mua tự điền đúng giá trị mới, chưa từng lưu localStorage.
- `npm run test:ui`: vẫn **KHỚP 100%** — bản Đại Hiệp gốc có `DEFAULT_BANK_INFO`/`DEFAULT_WO_INFO`
  toàn rỗng nên `loadBankInfo()`/`loadWOInfo()` trả về y hệt hành vi cũ (rỗng, phải nhập tay).
- `npm run test:features`: vẫn **22/22 khớp**.

### Không đổi

- Hành vi bản Đại Hiệp gốc (`dist/index.html`) — 2 modal vẫn yêu cầu nhập tay lần đầu như trước,
  không có gì tự động điền sẵn (vì `DEFAULT_BANK_INFO`/`DEFAULT_WO_INFO` của Đại Hiệp để rỗng).
- Cơ chế "nhớ lần nhập gần nhất" đã có từ trước — sửa/lưu lại vẫn hoạt động y hệt, kể cả xoá
  trắng 1 ô rồi lưu vẫn giữ đúng ý người dùng (không bị ghi đè lại bằng giá trị mặc định).

---

## [Phase 3.2] — Công cụ `config.html`: tạo file báo cáo cấu hình riêng cho từng đơn vị HAK Group

**Bối cảnh:** Theo yêu cầu trực tiếp của người dùng — tạo 1 công cụ HTML riêng để cấu hình tên
công ty + link Google Sheet cho từng đơn vị (HAK Group có 3+ đơn vị dùng chung cấu trúc báo cáo
này: HAK, CNHAK/Quế Sơn, Đại Hiệp, HAKQN...), thay vì phải sửa trực tiếp mã nguồn `CONFIG` như
trước. Yêu cầu kèm theo: bỏ card "Nguồn dữ liệu (CONFIG)" (chỉ hiển thị, không sửa được) trong
app chính, thay bằng "Hướng dẫn sử dụng".

### Thêm mới

- **`config.html`** — công cụ độc lập (tự chứa toàn bộ `dist/index.html` bên trong dưới dạng
  base64, không phụ thuộc file nào khác lúc chạy): form nhập Tên công ty, Mã HS, Mã nhà máy, và
  4 link Google Sheet (Phiếu cân — bắt buộc, Đề nghị thanh toán — bắt buộc, HD_NCC/Hosokeo —
  tuỳ chọn, chỉ dùng cho báo cáo BKLS xuất khẩu). Bấm "Tạo file báo cáo" → tìm-và-thay-thế đúng
  6 giá trị này trong bản HTML đã nhúng sẵn (mỗi giá trị chỉ xuất hiện đúng 1 lần trong file đã
  build — an toàn để tìm-thay-thế mà không đụng phần code khác) → tải xuống 1 file HTML hoàn
  chỉnh, dùng ngay được, đặt tên theo tên công ty đã nhập.
- **`scripts/build-config-html.mjs`** (`npm run build:config`) — script bảo trì: nhúng lại bản
  `dist/index.html` mới nhất vào `config.html` sau mỗi lần build. **Bắt buộc chạy lại** trước
  khi giao `config.html` nếu vừa sửa code, nếu không công cụ sẽ tạo ra file dựa trên bản build
  cũ.
- **`tests/test-config-generator.mjs`** (`npm run test:config`) — 18 kiểm tra Playwright: điền
  form với tên công ty/link MỚI, bấm tạo, xác nhận file tải về chứa đúng giá trị mới, KHÔNG còn
  giá trị cũ, 2 link để trống (không bắt buộc) vẫn giữ nguyên mặc định, kích thước file gần như
  không đổi (chỉ khác đúng phần đã thay). Quan trọng nhất: **mở thử file vừa tạo ra bằng trình
  duyệt thật**, xác nhận app gọi ĐÚNG 2 link Google Sheet MỚI khi tải dữ liệu (không gọi nhầm
  lại link cũ) và giao diện (sidebar) hiển thị đúng tên công ty mới.

### Thay đổi (trong `src/`, ảnh hưởng cả `dist/index.html` gốc — Đại Hiệp)

- **`index.html`**: card "Nguồn dữ liệu (CONFIG trong file HTML)" (chỉ hiển thị 4 link, không
  sửa được, phải sửa trực tiếp mã nguồn) → thay bằng card **"Hướng dẫn sử dụng"** (6 mục: xem
  báo cáo, tìm kiếm, xuất báo cáo, sửa danh mục + Hoàn tác, sao lưu/khôi phục, và cách dùng
  `config.html` để đổi công ty/link — không cần sửa code). Thêm `id="brandCompanyName"` vào
  `<small>` tên công ty ở sidebar để gán được bằng JS.
- **`legacy-app.js`**: bỏ hàm điền `#cfgList` (không còn dùng); `boot()` giờ gán tên công ty vào
  sidebar (`#brandCompanyName`), tiêu đề trang (`document.title`), và placeholder gợi ý ở modal
  WO (`#bankNhapTaiKho`) từ `CONFIG.TEN_CONG_TY` — **trước đây 3 chỗ này là chữ cứng trong HTML**
  ("Công ty TNHH SXTMDV Đại Hiệp"), nghĩa là nếu chỉ đổi `CONFIG.TEN_CONG_TY` (như `config.html`
  làm) thì sidebar/tiêu đề trang vẫn hiện sai tên cũ dù báo cáo Excel/PDF đã in đúng tên mới. Đây
  là điều kiện bắt buộc để `config.html` hoạt động đúng — không phải thay đổi ngoài phạm vi yêu
  cầu (không đổi hành vi bản Đại Hiệp gốc: `CONFIG.TEN_CONG_TY` của Đại Hiệp không đổi, nên kết
  quả hiển thị vẫn y hệt như cũ).

### Kiểm chứng trước khi giao

- `npm run test:config`: **18/18 khớp** — bao gồm việc mở file vừa tạo bằng trình duyệt thật và
  xác nhận gọi đúng link mới.
- `npm run test:ui`: vẫn **KHỚP 100%** với baseline (đổi cách hiển thị tên công ty từ chữ cứng
  sang gán bằng JS không ảnh hưởng vì giá trị `CONFIG.TEN_CONG_TY` của Đại Hiệp không đổi).
- `npm run test:features`: vẫn **22/22 khớp**.
- `npx vite build`: thành công, `dist/index.html` = 574,39 kB.

### Không đổi

- Giao diện/hành vi bản `dist/index.html` gốc (Đại Hiệp) — tên công ty hiển thị y hệt như trước,
  chỉ khác cơ chế (gán bằng JS từ `CONFIG` thay vì chữ cứng trong HTML), không có gì đổi trên
  màn hình.
- Toàn bộ logic tính báo cáo, các tiện ích Phase 3/3.1 trước đó.

---

## [Phase 3.1] — Hoàn thiện StorageService (nối UI sao lưu/khôi phục) + sửa `window.app.logger`

**Bối cảnh:** Theo yêu cầu trực tiếp của người dùng ("StorageService, Logger HOÀN THIỆN NỘI
DUNG NÀY ĐI BẠN") — hoàn tất 2 mục còn dang dở từ Phase 1 (`TODO.md` Phase 3 + Phase 4):
`StorageService.exportAll()/importAll()` đã có lõi nhưng chưa nối UI, và `window.app` chưa từng
được gán dù JSDoc của `logger.js` đã mô tả từ đầu.

### Thêm mới

- **`services/backup-restore.js`** — `backupData()` (xuất toàn bộ dữ liệu người dùng tự nhập ra
  1 file JSON, đặt tên theo ngày, tải xuống ngay) và `restoreData(file)` (đọc lại file JSON đó,
  ghi đè dữ liệu đã lưu, nạp lại `STATE` + vẽ lại UI liên quan). Gọi `pushUndoSnapshot()` TRƯỚC
  khi ghi đè để khôi phục nhầm vẫn "Hoàn tác" (Ctrl+Z) được.
- Thẻ mới "Sao lưu / Khôi phục dữ liệu trên trình duyệt này" trong tab "Danh mục & cấu hình"
  (`index.html`): nút "💾 Sao lưu dữ liệu", nút "📂 Khôi phục dữ liệu" (input file ẩn, style như
  nút), dòng trạng thái `#backupRestoreStatus`. **Chỉ** sao lưu/khôi phục dữ liệu người dùng tự
  nhập (danh mục Đại lý/Hỗ trợ, đối chiếu Excel, thông tin ngân hàng/WO) — không đụng dữ liệu
  Google Sheet (luôn tải lại từ nguồn, không có gì để "khôi phục").
- `downloadBlob()` chuyển từ hàm cục bộ trong `legacy-app.js` thành export dùng chung ở
  `utils/dom-utils.js` (Excel/PDF/JSON backup giờ đều gọi cùng 1 hàm, xoá trùng lặp).

### Sửa lỗi

- **JSDoc `logger.js` không khớp thực tế**: JSDoc mô tả có thể đổi cấp độ log ngay từ console
  trình duyệt lúc hỗ trợ từ xa (vd `app.logger.setLevel('DEBUG')`), nhưng `window.app` chưa từng
  thực sự được gán ở đâu — gọi `app.logger` từ console sẽ báo `app is not defined`. Đã sửa:
  `boot()` giờ gán `window.app = { logger, storageService }` làm dòng đầu tiên. Tiện thể cũng
  giúp `storageService.exportAll()` gọi thử được trực tiếp từ console khi cần hỗ trợ từ xa.
- Rà lại toàn bộ `src/`: xác nhận không còn `console.log`/`console.warn` nào sót lại ngoài chính
  `services/logger.js` (mục Phase 4 trong `TODO.md` — đã xong từ trước, xác nhận lại lần này).

### Kiểm chứng trước khi giao

- Mở rộng `tests/test-new-features.mjs` từ 10 → **22/22 kiểm tra khớp** (Playwright, trình
  duyệt thật), thêm: `window.app.logger.setLevel`/`window.app.storageService.exportAll` gọi
  được từ console; bấm "Sao lưu dữ liệu" kích hoạt sự kiện `download` thật + cập nhật trạng
  thái; kịch bản round-trip đầy đủ cho khôi phục — thêm 1 đại lý → `exportAll()` → tạo `File`
  JSON thật (qua `DataTransfer`, gán vào `<input type=file>`, bắn sự kiện `change` — không phải
  gọi thẳng hàm JS) → khôi phục lại → số đại lý khớp đúng số đã export (không mất/không thêm).
- `npx vite build`: thành công, `dist/index.html` = 573,05 kB (26 module).
- `npm run test:ui`: vẫn **KHỚP 100%** với baseline UI đã lưu — xác nhận tính năng mới không
  ảnh hưởng gì tới 14 bảng báo cáo hiện có.
- 2 hằng số font PDF (`PDF_FONT_REGULAR_B64`/`PDF_FONT_BOLD_B64`) vẫn nguyên vẹn trong
  `dist/index.html` (`addFileToVFS`/`addFont` xuất hiện đúng 2 lần — không bị ảnh hưởng vì lần
  sửa này không đụng tới `EXPORT_SERVICE`).

### Không đổi

- Toàn bộ logic tính báo cáo, 4 tiện ích Phase 3 trước đó (undo/redo, tìm không dấu, virtual
  scroll, Web Worker import Excel) — chỉ thêm tính năng mới, không sửa lại tính năng cũ.

---

## [Phase 3] — 4 tiện ích bổ sung: Undo/redo, tìm không dấu, virtual scroll, Web Worker import Excel

**Bối cảnh:** Theo yêu cầu bổ sung trực tiếp của người dùng, xác nhận muốn có cả 4 tính năng
sau khi đã được giải thích rõ từng cái làm gì. Không tính năng nào đổi số liệu/kết quả tính toán
— chỉ thêm tiện ích thao tác, có thể tắt hoàn toàn bằng cách không dùng (không có gì bị bắt buộc).

### Thêm mới

- **`store/app-state.js`** — Hoàn tác/Làm lại (Ctrl+Z / Ctrl+Y hoặc Ctrl+Shift+Z, hoặc 2 nút
  "↩ Hoàn tác"/"↪ Làm lại" mới ở tab "Danh mục & cấu hình") cho danh mục Đại lý và Hỗ trợ/Trợ
  giá — 2 nơi DUY NHẤT người dùng tự nhập tay dữ liệu (khác dữ liệu tải từ Google Sheet, chỉ
  đọc). Lưu tối đa 50 bước lùi, deep-clone bằng JSON round-trip.
- **`utils/fuzzy-search.js`** — tìm không dấu (accent-insensitive): gõ "nguyen van a" vẫn tìm
  ra "Nguyễn Văn A" trong ô tìm kiếm của mọi bảng báo cáo. Vẫn là khớp chuỗi con (substring) như
  cũ, chỉ chuẩn hoá bỏ dấu cả từ khoá lẫn dữ liệu trước khi so sánh — không đổi ngữ nghĩa tìm
  kiếm nào khác.
- **Virtual scroll trong `components/report-table.js`** — bảng nào có > 300 dòng sau khi lọc/
  tìm sẽ tự chuyển sang chế độ cuộn ảo (chỉ vẽ đúng số dòng đang nằm trong khung nhìn + vùng
  đệm, dùng 2 dòng "đệm" giữ đúng chiều cao thanh cuộn) thay vì phân trang 50 dòng/trang — cuộn
  mượt xem hết dữ liệu thay vì bấm "Trước/Sau" nhiều lần. Bảng ≤ 300 dòng **giữ nguyên 100%**
  hành vi phân trang cũ, không có gì đổi (ngưỡng 300 chọn bảo thủ để hầu hết báo cáo ngày
  thường không bị ảnh hưởng).
- **`services/excel-import-worker.js` + `services/tien-vay-import.js`** — đọc file Excel "Sổ
  chi tiết tiền vay" trong Web Worker (luồng nền), không làm treo giao diện khi file lớn. Nhân
  tiện phát hiện và sửa 1 lỗi nghiêm trọng có sẵn từ Phase 1 — xem mục ngay dưới.

### Sửa lỗi

- **[BUG-M0]** (Nghiêm trọng) `handleTienVayFile` — hàm xử lý nút tải file "Sổ chi tiết tiền
  vay" — bị bỏ sót hoàn toàn khi tách file ở Phase 1 (không phải lỗi cú pháp nên không bị
  `esbuild`/`vite build` bắt được, cũng không bị `ui-baseline.mjs` bắt được vì bộ test đó không
  thao tác tới nút này). Phát hiện khi đang làm tính năng Web Worker (đúng vùng code liên quan).
  Đã khôi phục đúng 100% logic gốc — chi tiết đầy đủ trong `BUG_FIXED.md`.

### Kiểm chứng trước khi giao

- Thuật toán parse Excel (Web Worker): test bằng package `xlsx` thật trong Node.js, dựng file
  giả lập đúng cấu trúc thật (kể cả ca biên "dòng Total lạ chèn giữa dữ liệu") — **6/6 khớp**.
- Playwright (trình duyệt thật, không phải suy luận trên code): **10/10 kiểm tra khớp** —
  undo/redo thêm/xoá đúng dòng, tìm không dấu ra đúng kết quả, virtual scroll chỉ vẽ < 100 DOM
  node thật cho bảng 500 dòng (không vẽ hết), cuộn làm dịch chuyển đúng cửa sổ dữ liệu đang vẽ,
  input file không còn `ReferenceError`. Xem `tests/test-new-features.mjs`
  (`npm run test:features`).
- `npm run test:ui` (bộ test baseline cũ, bảng nhỏ < 300 dòng): vẫn **KHỚP 100%** — xác nhận 4
  tính năng mới không ảnh hưởng gì tới hành vi mặc định khi dữ liệu nhỏ.
- Chạy lại 114 phép so sánh business logic (Phase 1): vẫn **khớp 100%**.

### Không đổi

- Toàn bộ 13 hàm `compute*()` tính báo cáo — không tính năng nào ở Phase 3 đụng tới lớp tính
  toán số liệu.
- Hành vi phân trang/tìm kiếm của bảng ≤ 300 dòng (đại đa số trường hợp dùng thực tế hàng ngày).

---

## [Phase 1] — Tách `BaoCaoNgay.html` thành dự án module (`app/`), build bằng Vite

**Bối cảnh:** Theo yêu cầu "enterprise upgrade" (24 bước), sau khi hỏi lại và được người dùng
xác nhận rõ 2 lựa chọn: (1) tách thành nhiều file thật `/src/...` + có build step, (2) tạo đủ 6
file tài liệu riêng theo checklist. Chi tiết lý do kiến trúc xem `ARCHITECTURE.md`.

### Thêm mới

- Dự án Vite mới tại `app/` (`package.json`, `vite.config.js`) dùng `vite-plugin-singlefile` để
  vẫn build ra **1 file HTML duy nhất** (`dist/index.html`), giữ được khả năng double-click mở
  trực tiếp như bản gốc.
- `src/config/config.js`, `src/config/pdf-fonts.js`, `src/constants/columns.js`,
  `src/constants/brand.js`, `src/utils/date-utils.js`, `src/utils/number-utils.js`,
  `src/utils/csv-utils.js`, `src/utils/number-to-words-vn.js`,
  `src/services/report-service.js` — lớp business logic thuần, tách module hoàn toàn từ bản
  gốc, **không đổi 1 dòng logic**, chỉ đổi cách khai báo (biến toàn cục → `export`).
- `src/services/storage-service.js` (mới): lớp bọc `localStorage` có `try/catch` tập trung,
  version hoá dữ liệu lưu, và `exportAll()/importAll()` để backup/khôi phục (chưa nối UI — xem
  `TODO.md`).
- `src/services/logger.js` (mới): lớp log có cấp độ (DEBUG/INFO/WARN/ERROR/PERF), thay dần
  `console.log` rải rác (chưa thay hết — xem `TODO.md`).
- `src/legacy-app.js`: giữ nguyên khối UI_SERVICE + EXPORT_SERVICE + STATE/DATA_SERVICE của bản
  gốc (chiến lược Strangler Fig — xem `ARCHITECTURE.md §4`), chỉ đổi: khai báo import thay cho
  biến toàn cục, và 5 nhóm `localStorage` trực tiếp → gọi qua `storageService`.
- `index.html` (entry point Vite): `<head>` nạp 5 thư viện qua CDN (giữ nguyên cách nạp của bản
  gốc — xem `ARCHITECTURE.md §3`), `<body>` giữ nguyên markup gốc.
- `src/styles/main.css`: CSS gốc, tách ra file riêng, nội dung không đổi.
- 6 file tài liệu theo yêu cầu: `ARCHITECTURE.md`, `TODO.md`, `BUG_FIXED.md`,
  `OPTIMIZATION_REPORT.md`, `PERFORMANCE_REPORT.md`, và file này.

### Sửa lỗi (phát sinh trong quá trình tách, đã sửa trước khi giao — chi tiết trong `BUG_FIXED.md`)

- **[BUG-M1]** (Nghiêm trọng) Thiếu 2 hằng số font PDF tiếng Việt (`PDF_FONT_REGULAR_B64`/
  `PDF_FONT_BOLD_B64`) khi tách `CONFIG` — sẽ làm mọi nút "Xuất PDF" báo lỗi `ReferenceError`
  nếu không phát hiện. Đã sửa, kiểm chứng khớp byte-for-byte với bản gốc.
- **[BUG-M2]** `const groups` bị gán lại trong `numToWordsVN` (chặn build) — đổi thành `let`.
- **[BUG-M3]** 4 lỗi khai báo trùng lặp (`REPORT_KEYS`/`REPORT_TITLES`, `BRAND`/`THIN_BORDER`/
  `OUTER_BORDER_STYLE`, `numToWordsVN`, khối `module.exports` mồ côi) — đều bị `esbuild`/Vite
  chặn build ngay, đã dọn sạch.

### Kiểm chứng trước khi giao

- 120 phép so sánh `JSON.stringify()` giữa bản gốc (`BaoCaoNgay.html`, load qua CommonJS) và
  bản mới (module ES6) trên util thuần + `numToWordsVN` + 6 hàm `compute*()` chính, dùng 8 bộ
  dữ liệu ngẫu nhiên khác nhau — **120/120 khớp (0 sai khác)**.
- Build production (`npm run build`): thành công, `dist/index.html` = 571.282 bytes (giảm ~8%
  so với bản gốc 620.998 bytes dù đã thêm code mới — nhờ minify).
- Playwright (headless Chromium) mở `dist/index.html`: 0 lỗi JavaScript (`pageerror`) khi trang
  tải và chạy script khởi tạo. (Không kiểm được việc nạp 5 thư viện CDN trong môi trường sandbox
  hiện tại do tường lửa sandbox chặn các domain CDN đó — đây là giới hạn của môi trường kiểm
  thử, không phải lỗi của code; cùng 1 URL CDN với bản gốc, vốn đã hoạt động bình thường trên
  trình duyệt thật của người dùng.)

## [Phase 2 — tách UI không phụ thuộc CDN] — `store/`, `data-service`, `report-table`, `dashboard`, `compare`

**Điều kiện đã đủ:** bộ test UI tự động (`tests/ui-baseline.mjs`, xem mục ngay dưới) đã sẵn
sàng, cho phép tách an toàn phần **không cần nạp thư viện CDN** để chạy được trong môi trường
kiểm thử hiện tại.

### Thêm mới

- `src/store/state.js`: `STATE`, `TABLES` (object dùng chung, mutate trực tiếp — đúng hành vi
  tham chiếu gốc), danh mục Đại lý/Hỗ trợ mặc định, `loadDM`/`saveDM`, `applyFilters`.
- `src/services/data-service.js`: `fetchCSV`, `loadAllData`, `setStatus`,
  `updateLastUpdatedText`, `populateFilterOptions` — ranh giới duy nhất chạm Google Sheet.
- `src/components/report-table.js`: `renderReportTable`, `ensureToolbar`, `applySortSearch`,
  `renderTableRows`, `fmtCell` — dùng chung cho cả 14 bảng báo cáo.
- `src/components/dashboard.js`: `renderDashboard`, `drawChart` (Chart.js).
- `src/components/compare.js`: công cụ đối chiếu số liệu Excel gốc vs HTML tính ra.
- `src/utils/dom-utils.js`: `$`, `$$`, `esc` — tách khỏi biến toàn cục của `legacy-app.js`.

### Thay đổi

- `legacy-app.js`: giảm từ 1.447 → 1.137 dòng (~21%). Giờ chỉ còn `renderDMTables`, `runReport`
  (điều phối), toàn bộ `EXPORT_SERVICE`, modal WO/Bank, `initEvents`/`boot`.
- 5 hàm được thêm `export` để các module mới gọi lại: `exportExcel`, `exportPDF`,
  `printSection`, `openBankInfoModal`, `RESULTS` (biến, không phải hàm), `runReport`.

### Kiểm chứng trước khi giao

- `npx esbuild --bundle` từng module: không lỗi cú pháp/khai báo trùng.
- `npm run build`: thành công, `dist/index.html` = 564,99 kB (gần như không đổi so với trước
  khi tách — 564,95 kB), 21 module (trước: 15).
- 2 hằng số font PDF vẫn nguyên vẹn byte-for-byte trong `dist/index.html` (không bị ảnh hưởng
  bởi lần tách này — kiểm tra lại cho chắc chắn).
- `npm run test:ui`: **KHỚP 100%** với baseline UI đã lưu (số dòng hiển thị của cả 14 báo cáo +
  dashboard không đổi).
- Chạy lại 114 phép so sánh business logic (Phase 1): vẫn **khớp 100%** (không đụng tới
  `report-service.js` trong lần tách này, nhưng chạy lại để chắc chắn không có tác dụng phụ).

### Giới hạn đã biết (không đổi so với trước)

Phần `EXPORT_SERVICE` (xuất Excel/PDF, phụ thuộc `window.ExcelJS`/`window.jspdf`) **chưa tách**
— cần môi trường có thể tải 5 thư viện CDN để kiểm chứng trước khi tách an toàn (xem `TODO.md`).

### Dọn dẹp nhỏ (không đổi hành vi mặc định)

- Thay 1 lệnh `console.warn` còn sót trong `on()` (helper gắn sự kiện an toàn — BUG-01, xem
  `package/CHANGELOG.md`) bằng `logger.warn` — mức log mặc định (`WARN`) giữ nguyên hành vi
  hiển thị cảnh báo này trên console như trước, chỉ đổi kênh ghi log để nhất quán với
  `Logger` đã thêm ở Phase 1.
- Ghi nhận 1 điểm chèn dữ liệu chưa qua `esc()` trong `components/compare.js` (kế thừa nguyên
  vẹn từ bản gốc, không phải lỗi mới) — xem `TODO.md`, chưa sửa vì cần xác nhận trước.

---

## [Phase 2 — khung test, chưa tách UI] — Bộ test UI tự động (điều kiện tiên quyết cho Phase 2)

### Thêm mới

- `tests/fixtures.mjs`: sinh dữ liệu CSV giả lập (đúng cấu trúc cột dữ liệu thật) cho 4 nguồn
  Google Sheet (PHIEUCAN, DNTT_CT, HD_NCC, HOSOKEO), dùng seed ngẫu nhiên cố định để kết quả lặp
  lại y hệt mỗi lần chạy test.
- `tests/ui-baseline.mjs`: mở `dist/index.html` bằng Playwright (Chromium), chặn 4 URL Google
  Sheet thật và trả về dữ liệu giả lập, bấm "LẬP BÁO CÁO", đọc số dòng hiển thị của cả 14 báo
  cáo trên UI, so sánh với baseline đã lưu (`tests/ui-baseline.json`) — thoát lỗi nếu phát hiện
  sai khác hành vi. Chạy bằng `npm run test:ui`.
- Đã tự kiểm chứng script phát hiện đúng khi có sai khác thật (thử nghiệm đổi số dòng dữ liệu
  giả lập, script báo "LỆCH" đúng như kỳ vọng, sau đó revert lại).

### Giới hạn đã biết

- Chưa kiểm được việc bấm nút xuất Excel/PDF vì sandbox hiện tại chặn domain CDN
  (`cdnjs.cloudflare.com`) nên 5 thư viện ngoài không nạp được để thực thi xuất file — cần chạy
  phần mở rộng này ở môi trường có mạng đầy đủ trước khi bắt đầu tách `EXPORT_SERVICE` (xem
  `TODO.md`).

### Không đổi (theo đúng ràng buộc "không đổi nghiệp vụ, không đổi giao diện, không mất dữ liệu")

- Toàn bộ logic tính báo cáo (13 hàm `compute*()`).
- Toàn bộ giao diện (HTML/CSS) — copy nguyên trạng, chỉ tách vào file riêng.
- Dữ liệu đã lưu trước đây của người dùng trong `localStorage` (`StorageService.get()` đọc
  được cả định dạng cũ chưa bọc version lẫn định dạng mới).
- Cách nạp 5 thư viện ngoài (ExcelJS/jsPDF/jspdf-autotable/Chart.js/XLSX) — vẫn qua CDN, cùng
  URL/version như bản gốc.

## [2026-09-22] Sửa lỗi đảo Ngày↔Tháng khi parse ngày dạng "X/Y/Năm" mập mờ

- **Lỗi:** `parseDateParts()` mặc định đọc ngày mập mờ (cả 2 số ≤12, vd "1/10/2026") theo kiểu
  Ngày/Tháng (Việt Nam), trong khi dữ liệu CSV thật từ Google Sheet nguồn lại là Tháng/Ngày
  (Mỹ) — gây đảo Ngày↔Tháng cho khoảng 1/3 số ngày trong dữ liệu. Ảnh hưởng nặng nhất: báo cáo
  Công nợ tính dư ra ~13,36 tỷ (17,44 tỷ thay vì đúng 4,28 tỷ) do nhiều phiếu đã thanh toán từ
  đầu năm bị đọc nhầm ngày thanh toán rơi vào sau kỳ báo cáo. Xem chi tiết quá trình kiểm chứng
  trong `BUG_FIXED.md`.
- **Sửa:** đổi mặc định nhánh mập mờ trong `src/utils/date-utils.js` (`parseDateParts`) sang
  Tháng/Ngày, khớp đúng dữ liệu nguồn. Không đổi 2 nhánh không mập mờ (đã tự suy luận đúng).
  Không đổi bất kỳ logic/công thức/giao diện nào khác.

## [2026-09-22] Thêm tách theo Đại lý/Nguồn gốc cho "Tổng hợp Nhập/Thanh toán" + tách "Xuất tất cả Excel" thành 2 file (Báo cáo tháng / Báo cáo ngày)

- **Tổng hợp Nhập/Thanh toán** (`computeTongHopNgay`, `src/services/report-service.js`): thêm
  cột tách khối lượng theo Đại lý (NHAP_DL.*/TT_DL.*) và theo Nguồn gốc (NHAP_NG.*/TT_NG.*) cho
  cả 2 phần Nhập và Thanh toán — khớp đúng cấu trúc "bản mẫu" (sheet TH_NHAPXUAT_THANHTOAN
  trong file Excel Power Query đối chiếu). Mã Đại lý/Nguồn gốc lấy ĐỘNG theo dữ liệu thật đang
  lọc (không hard-code DT/QT/KL) — cột tự thêm nếu sau này có mã mới. Đã kiểm chứng bằng script
  độc lập: tổng các cột tách = đúng cột Khối lượng nhập/thanh toán (không lệch dù chỉ 1 đơn vị).
  Không đổi 2 cột "Giá trị nhập"/"Giá trị thanh toán"/"Khối lượng nhập"/"Khối lượng thanh toán"
  hiện có — số liệu cũ giữ nguyên, chỉ thêm cột mới.
- **"Xuất tất cả Excel"** giờ tải về **2 file** khi bấm 1 nút: file thứ 1 "Báo cáo tháng"
  (`..._TatCa.xlsx`) — giữ nguyên y hệt hành vi cũ (Từ ngày→Đến ngày cho mọi báo cáo); file thứ
  2 MỚI "Báo cáo ngày" (`..._BaoCaoNgay.xlsx`) — cùng 9 báo cáo nhưng chỉ lấy dữ liệu ĐẾN "Đến
  ngày" (1 ngày báo cáo), RIÊNG "Tổng hợp Nhập/Thanh toán" vẫn giữ khoảng Từ ngày→Đến ngày.
  Tính hoàn toàn riêng, không đụng tới dữ liệu/bảng đang hiển thị trên màn hình.
- Refactor `buildWorksheet()` → tách phần vẽ sheet ra `buildWorksheetCore()` nhận tham số trực
  tiếp (không đọc từ `TABLES[key]`/DOM nữa) để dùng lại được cho "Báo cáo ngày" — logic vẽ
  (font/màu/viền/định dạng số) GIỮ NGUYÊN 100%, `exportExcel()`/`exportAllExcel()` (xuất từng
  báo cáo lẻ / "Báo cáo tháng") không đổi hành vi gì.

## [2026-09-22] Tách nút "Xuất tất cả Excel" (báo cáo tổng hợp) thành 2 nút riêng

- Theo yêu cầu người dùng: bỏ cách gộp 1 nút ra 2 file, đổi thành 2 nút bấm riêng ở mục "Báo
  cáo tổng hợp": **"BÁO CÁO TỔNG HỢP THÁNG"** (`#btnExportAllThang`, gọi đúng `exportAllExcel()`
  cũ — không đổi hành vi) và **"BÁO CÁO TỔNG HỢP NGÀY"** (`#btnExportAllNgay`, gọi
  `exportNgayExcel()`). Không còn nút `#btnExportAll` gộp chung nữa.

## [2026-09-22] Sửa lỗi trống "Số CCCD" trong "Bảng kê 02/TNDN" (Báo cáo ngân hàng)

**Bối cảnh:** Người dùng phản ánh nhiều dòng trong "Bảng kê 02/TNDN" bị trống Số CCCD, và chỉ
ra rằng theo đúng công thức Power Query gốc (sheet DNTT_CT — Đề nghị thanh toán chi tiết) thì
"về bản chất không bao giờ trống CCCD".

**Nguyên nhân:** Xác nhận từ công thức Power Query gốc của DNTT_CT trong file Excel mẫu:
`{"Họ tên Chủ rừng", type text}, {"Số CCCD Chủ rừng", type text}, ...` — sheet DNTT_CT tự nó
ĐÃ có sẵn cột "Số CCCD Chủ rừng" (nhập trực tiếp khi lập đề nghị thanh toán). Code app trước đó
lại lấy CCCD gián tiếp qua HD_NCC bằng khóa ghép "Số hợp đồng||Họ tên Chủ rừng" — khóa này dễ bị
lệch (sai chính tả tên, số hợp đồng ghi khác 1 ký tự, hoặc HD_NCC chưa có dòng tương ứng) khiến
CCCD bị trống dù dữ liệu đã có sẵn trên DNTT_CT.

**Sửa lỗi:** `computeBankTNDN()` (`src/services/report-service.js`) nay ưu tiên lấy
`dn['Số CCCD Chủ rừng']` trực tiếp từ DNTT_CT; chỉ dùng HD_NCC (`hd['Số CCCD']`) làm dự phòng
khi DNTT_CT chưa có. Địa chỉ/Số điện thoại vẫn lấy từ HD_NCC như cũ (DNTT_CT không có 2 cột
này). Nếu phiếu cân CHƯA từng có Đề nghị thanh toán nào (chưa có dòng DNTT_CT tương ứng) thì
CCCD vẫn trống — đây là trường hợp hợp lý (chưa có dữ liệu để lấy), không phải lỗi.

**Kiểm chứng:** Test độc lập với 3 trường hợp (DNTT_CT có CCCD nhưng khóa HD_NCC lệch; DNTT_CT
không có CCCD nhưng khóa HD_NCC khớp; phiếu cân chưa có Đề nghị thanh toán) — cả 3 đều cho đúng
kết quả kỳ vọng. `npm run test:ui` và `npm run test:features` đều PASS sau khi sửa.

## [2026-09-22] Sửa lỗi "Bảng kê 02/TNDN" — viết lại theo đúng công thức Power Query gốc (BK02_TNDN)

- Xác nhận qua Power Query trích từ file mẫu `ChungTuNganHang_DH.xlsx` (sheet chính "VAY", có
  sẵn sheet "BK02_TNDN"): nguồn đúng là DNTT_CT (không phải PHIEUCAN), ghép HD_NCC chỉ theo
  "Số hợp đồng" (không ghép kèm Họ tên).
- Thêm `STATE.hdnccBySoHopDong`; viết lại `computeBankTNDN()` theo đúng công thức gốc.
- Kết quả: Số CCCD/Địa chỉ/SĐT không còn bị trống do khóa ghép lệch tên; phiếu cân chưa có đề
  nghị thanh toán không còn bị đưa nhầm vào báo cáo; Số lượng/Đơn giá/Tổng tiền lấy đúng từ đề
  nghị thanh toán đã chốt (thay vì từ phiếu cân).

## [2026-09-22] Sửa nhãn "Khối lượng (KG)"→"(tấn)" ở bảng Thanh toán; bỏ "Đối chiếu Excel"; tách menu "Danh mục & cấu hình"; thêm tải file mẫu Sổ chi tiết tiền vay

- `THANHTOAN_COLS`: cột "Khối lượng" đổi nhãn "(KG)"→"(tấn)" + kiểu hiển thị 'int'→'kl' (2 số
  lẻ) — giá trị lấy từ DNTT_CT thực chất đã là tấn (kiểm chứng bằng đơn giá/tấn hợp lý), nhãn cũ
  gây hiểu lầm đơn vị.
- Bỏ hẳn tính năng "Đối chiếu Excel" (nhập tay số liệu Excel gốc để so sánh) theo yêu cầu người
  dùng: xoá menu, section HTML, `components/compare.js`, khoá lưu trữ COMPARE.
- Tách menu "Danh mục & cấu hình" thành 2 menu độc lập: "Danh mục" (DM_DL/DM_HT) và "Cấu hình"
  (Sao lưu/Khôi phục + Hướng dẫn sử dụng).
- Thêm nút "📥 Tải file mẫu" cạnh ô tải file "Sổ chi tiết tiền vay" — xuất file Excel mẫu đúng 8
  cột (Ngày chung, Ngày hạch toán, Ngày chứng từ, Tổng tiền vay, Ngày thanh toán, Số tấn, Tổng
  tiền chi, Họ tên Chủ rừng) kèm 1 dòng ví dụ.
