# HAK – Công cụ lập biên bản từ Bảng cân xuất hàng

Chạy offline: mở `index.html` bằng Chrome/Edge (không cần server, không cần cài đặt).

## Cách dùng
1. **Nhập liệu** → ① chọn **hình thức** (loại biên bản/chứng từ) → ② thêm file Excel cân **từng đợt** (mỗi file = 1 đợt, chọn được nhiều file cùng lúc; trùng tên file thì thay đợt cũ) → bấm dòng một đợt để xem/chỉnh sheet, dòng tiêu đề, ánh xạ cột. **Mỗi hình thức có dữ liệu riêng**: các trang biên bản dùng dữ liệu **gộp tất cả đợt** của đúng hình thức đó (tự bỏ phiếu trùng giữa các đợt: cùng số phiếu, biển số, ngày giờ cân), hình thức khác không thấy. Xóa một đợt bằng nút Xóa. Danh sách xe & tài xế dùng chung, áp cho mọi đợt. Chấm xanh ở menu = hình thức đã có dữ liệu.
2. Vào loại chứng từ: **Trung chuyển gửi kho** (chọn mẫu theo đợt hoặc theo tháng) / **Xuất hàng kho gửi** (Bảng xác nhận hàng gửi kho xuất khẩu, theo từng tàu) / **Xuất khẩu** (Bảng tổng hợp hàng xuất khẩu qua cân) / **Ủy thác xuất khẩu** / **Điều chuyển** / **Trao đổi hàng hóa** / **Xuất bán** (Biên bản giao nhận hàng hóa + đơn giá, thành tiền).
3. Nhập theo **5 tab** (v2.7.0): **Dữ liệu cân** (lọc ngày, xe trả về) → **Hợp đồng & bên** (hợp đồng, tàu, các bên, chứng thư; Điều chuyển: *Quyết định & chiều*) → **Kho & cảng** → **Biên bản** (tháng, ngày lập; Xuất bán: *Giá & biên bản*) → **BKLS**. Tab có ✓ = đủ, số đỏ = còn thiếu ô bắt buộc, số vàng (BKLS) = thiếu nếu muốn tạo BKLS. Bấm Tạo khi còn thiếu → app tự mở đúng tab, tô đỏ ô cần nhập. Kết quả tự tính + nút **Tạo file Word** luôn ở khung bên phải.
4. **Cài đặt**: sửa công ty, kho (cột **Ghi phụ lục** và **Ký hiệu kho** là nguồn của các dropdown "Kho xuất ở phụ lục" / "Ký hiệu kho gửi" ở trang Xuất hàng kho gửi và Ủy thác; chọn "Khác — nhập tay…" để gõ giá trị riêng), upload mẫu Word riêng, xuất/nhập cấu hình JSON.

## Tải PDF
Mỗi trang biên bản có nút **🖨️ Tải PDF** (cạnh nút Word). App dựng bản in từ chính file Word rồi mở hộp thoại in của trình duyệt → chọn máy in **Lưu dưới dạng PDF**, tắt "Đầu trang và chân trang". Tên file PDF gợi ý trùng tên file Word. Điều chuyển gộp Quyết định + Biên bản trong 1 PDF. File cân ~2.000 dòng dựng mất ~3 giây, ~12.000 dòng ~25 giây.

## Xuất Excel (file cân lưu trữ)
Cả 7 trang có nút **📊 Xuất Excel** (cạnh nút Tải PDF) → tải file `.xlsx` bảng cân chi tiết để lưu trữ, dùng đúng bộ lọc / khoảng ngày đang chọn.
- **Kiểu A** (Trung chuyển gửi kho, Trao đổi, Điều chuyển, Xuất bán — Xuất bán có thêm dòng Đơn giá / Thành tiền): 1 sheet "Chi tiết cân hàng", 10 cột (STT, Số phiếu, Ngày giờ cân 1/2, Biển số, Cân 1/2, KL Hàng, ĐVVC, Tài xế), dòng TỔNG CỘNG `=SUM`, khối chữ ký 2 bên. Tên file `BangChiTietCanHang_<Loại>_Thang_MMYYYY.xlsx`.
- **Kiểu B** (Xuất hàng kho gửi, Ủy thác, Xuất khẩu — Xuất khẩu có thêm sheet "Theo ngày"): sheet "Phiếu cân" (có cột Nơi cân); nếu Excel cân có cột **Kho** với ≥ 2 kho khác nhau thì tách thêm 1 sheet cho mỗi kho ("Xuất kho …"). Tên file `PhieuCan_<Tàu>_<ChủHàng>.xlsx`.
- Giữ **số phiếu gốc** (không đánh lại n/MMYYYY/TĐ); cột Đơn vị vận chuyển ghi **mã ngắn** (HHH / HAK / ĐH…) theo danh sách xe; xe "BO" đã bị loại như trong biên bản. Có cố định dòng tiêu đề, lặp tiêu đề khi in, in ngang A4.

## Xuất khẩu & Xuất bán
- **📤 Xuất khẩu** — công ty tự xuất khẩu (không ủy thác, 1 đơn vị xuất khẩu): nhập tên tàu, khoảng ngày, kho xuất → *Bảng tổng hợp hàng xuất khẩu qua cân*: thông tin chung + **Phụ lục 1** tổng hợp theo ngày (số xe, qua cân, xe trả về, thực xuất) + **Phụ lục 2** chi tiết phiếu cân. Xe trả về chọn như trang Ủy thác và được trừ khỏi khối lượng thực xuất.
- **💰 Xuất bán** — *Biên bản giao nhận hàng hóa* giống Trao đổi, thêm **Số hợp đồng mua bán**, **Đơn giá (đồng/tấn)** → Thành tiền = số tấn (làm tròn 2 số lẻ) × đơn giá, kèm số tiền bằng chữ. Để trống đơn giá thì không in dòng giá. Ô "Ghi chú giá" (vd: chưa bao gồm thuế GTGT) tuỳ chọn.
- Cả hai đều có Word / PDF / Excel, tự lưu vào Lưu trữ và được tính trong Báo cáo tổng hợp (từng loại riêng, không cộng chung).
- Mẫu dựng bằng `python3 tools/build_templates2.py && python3 tools/embed_templates.py` (sinh từ các mẫu có sẵn trong `templates/`).

## Chứng từ xuất hàng (🧾 menu Chứng từ)
1. Vào **Nhập liệu**, chọn hình thức, nạp file Excel của từng đợt (có thể nạp nhiều đợt cho một hình thức).
2. Vào **Chứng từ xuất hàng** → chọn hình thức → chọn **một đợt** → điền Của (bên xuất), Về việc, Lý do, Xuất kho tại, Nhập kho tại, số PXK bắt đầu, căn cứ lệnh, tên đơn vị.
3. Bấm **Tạo PXKKVCNB (Excel)** → file import Bkav 26 cột, mỗi xe một phiếu PXK (số liên tiếp từ số bắt đầu), tài xế / đơn vị vận chuyển lấy từ danh sách xe.
4. Trung chuyển gửi kho và Điều chuyển nội bộ chỉ lập PXKKVCNB (không lập BKLS). BKLS: xem bên dưới.
5. "Về việc" và "Lý do" đổi theo hình thức (danh sách theo dự án); chọn "Khác" để nhập tay. Tên "Của" chỉnh ở Cài đặt → Công ty.

### BKLS (Bảng kê lâm sản — lập ở Xuất khẩu, Ủy thác, Xuất bán, Trao đổi)
- **Mục 5 "Hồ sơ kèm theo" của BKLS tổng (v2.7.1)**: ô tick "Bản tổng: liệt kê BKLS từng xe…" (tab BKLS, mặc định bật) → ghi "N Bảng kê lâm sản từng xe (số …-0001 đến …-N); M xe vận chuyển, N lượt", rồi từng ngày (số BKLS, số xe, MT, BDMT) và từng BKLS con: số, KL MT – BDMT, số xe (biển số), tài xế. Bản tổng thành nhiều tờ, "Tổng số tờ" tự đếm (Word: trường NUMPAGES; PDF: số tờ thật). Tổng ngày = cộng các dòng con — có thể lệch 0,01 BDMT so với mục 3 do làm tròn từng xe. Bỏ tick = bản tổng 1 trang như cũ.
- **Xuất hàng kho gửi chỉ lập biên bản, không lập BKLS** (từ v2.6.7) — BKLS lập ở hình thức đích khi hàng chuyển chủ sở hữu. Hồ sơ Xuất hàng kho gửi cũ đã có BKLS vẫn tạo lại được ở Lưu trữ.
- **➡ Chuyển sang** (trang Xuất hàng kho gửi, v2.6.7): chép phiếu cân đang lọc + tàu, bên gửi, kho xuất, xe trả về sang **Xuất khẩu / Ủy thác / Xuất bán** → chọn hợp đồng, số BKLS → tạo biên bản + BKLS. Mỗi đợt chỉ 1 hình thức (đổi: xóa đợt đã chép ở Nhập liệu của hình thức đó rồi chuyển lại). Chi tiết: menu 📘 Hướng dẫn.
- Điền mục ⑤: Số BKLS, hệ số RMT → BDMT (mặc định 0,468), ngày lập, bên mua (tên / MST / địa chỉ / SĐT / email), nguồn gốc, **Mã HS** (v2.7.6 — thay chữ cố định "B11 3" của mẫu cũ; Xuất khẩu / Ủy thác mặc định 4401220090 (in đúng như gõ, không tự thêm dấu chấm), Trao đổi / Xuất bán để trống → in dấu chấm; sửa theo tờ khai hải quan của lô). Chủ lâm sản (bên xuất) lấy theo mục "Của" + thông tin công ty ở Cài đặt.
- Chọn bản cần tạo: Tổng (Word/PDF) và Từng xe (Word/PDF — mỗi xe 1 trang, số BKLS-0001, -0002…) rồi bấm **Tạo BKLS**; tải từng file hoặc **Tải tất cả (ZIP)**.
- Điểm đi = "Xuất kho tại", điểm đến = "Nhập kho tại". PDF dựng theo bố cục mẫu Word — nên đối chiếu bản Word trước khi nộp.

## Tổng quan & Tìm kiếm chung (🏠 / 🔍)
- **Tổng quan** (thay Trang chủ): số lượt xe / tấn / biển số / tài xế (đã khử phiếu trùng giữa các hình thức), số PXK–BKLS đã lập, hồ sơ lưu; biểu đồ **theo tháng × hình thức** (nút Tấn/Xe, nút *Bảng số* để xem số liệu), **Top 10 xe / tài xế** (bấm để tra cứu), chứng từ gần đây.
- **Cần chú ý**: đợt Excel chưa lập PXK/BKLS, số BKLS dùng cho nhiều đợt, PXK chồng dải số, cảnh báo dữ liệu Excel, chưa sao lưu hoặc quá 14 ngày. Chỉ đọc dữ liệu — không đổi Báo cáo tổng hợp.
- **Tìm kiếm**: bấm 🔍 trên thanh trên hoặc **Ctrl+K**. Gõ ≥ 2 ký tự để tìm biển số (không cần dấu gạch), tài xế (không dấu cũng được), số phiếu cân, tàu/lô, `PXK000123` hoặc số thuần, số BKLS, bên mua/đơn vị, hồ sơ lưu, tên file đợt. ↑↓ chọn, Enter xem chi tiết lượt cân (biển số/tài xế/phiếu) hoặc mở nơi chứa (chứng từ, lưu trữ, đợt), Esc đóng. Phạm vi: dữ liệu Excel đang nạp, nhật ký chứng từ, hồ sơ lưu trữ.

## Dữ liệu lưu bền & nhật ký chứng từ
- **Các đợt Excel đã nhập được lưu trong trình duyệt** (file gốc + sheet + ánh xạ cột). Mở lại app là dữ liệu các loại biên bản / Chứng từ còn nguyên; xóa đợt ở mục Nhập liệu thì xóa luôn bản lưu.
- **Chứng từ đã lập** (bảng cuối trang Chứng từ xuất hàng): mỗi lần tạo PXKKVCNB / BKLS được ghi lại. Từ đó app:
  - cảnh báo khi dải số PXK chồng lên lần lập trước (cùng công ty), hoặc đợt này đã lập PXK rồi, hoặc số BKLS đã dùng cho đợt khác — nút đổi thành "⚠ Trùng số — bấm lại để vẫn tạo";
  - gợi ý số PXK bắt đầu tiếp theo và số BKLS kế tiếp (011/2026/BKLS sau 010/2026/BKLS).
- Sao lưu toàn bộ (Cài đặt → Chung) đã gồm các đợt Excel và nhật ký chứng từ.

## Bộ nhớ & sao lưu toàn bộ (⚙️ Cài đặt → Chung)
- Mọi cài đặt (công ty, kho, danh sách xe, mẫu Word, form) được **lưu 2 nơi**: localStorage và bản sao IndexedDB. Nếu localStorage bị xóa hoặc đầy, lần mở sau app tự khôi phục từ bản sao.
- Không lưu được ở cả hai nơi thì app báo lỗi đỏ (trước đây im lặng).
- **Sao lưu toàn bộ (.zip)** (từ v2.7.5; bản cũ là .json): cài đặt + danh sách xe + mẫu Word + đợt Excel + nhật ký chứng từ + Lưu trữ trong 1 file nén (bên trong là HAK_SaoLuuToanBo.json). **Khôi phục toàn bộ** nhận .zip, file .json cũ và file sao lưu riêng Lưu trữ; sau khi khôi phục trang tự tải lại.
- **🔁 Tự sao lưu vào thư mục** (v2.7.5, Chrome/Edge, Quản trị cài): Cài đặt → Chung → Bộ nhớ & sao lưu → 📁 Chọn thư mục tự sao lưu (nên là thư mục Google Drive / OneDrive hoặc ổ D) → cho phép ghi → ▶ Sao lưu vào thư mục ngay. Mỗi ngày lần đầu mở app (sau ~20 giây) app ghi `HAK_TuDong_<yyyymmdd>_<hhmm>.zip`, đọc lại kiểm tra dung lượng, giữ 5/10/20/30 bản mới nhất (mặc định 10) — chỉ xóa file `HAK_TuDong_*.zip`, không đụng file khác. Trình duyệt hỏi lại quyền sau khi mở lại → Tổng quan có dòng 🔁 **Cho phép & sao lưu**. Cài đặt tự sao lưu gắn với máy (không đi theo file sao lưu / khôi phục).
- **🩺 Sức khỏe dữ liệu** (Tổng quan): bộ nhớ trình duyệt, cài đặt (localStorage / 5 MB), số hồ sơ Lưu trữ (vàng khi > 1.500), sao lưu toàn bộ gần nhất (vàng > 7 ngày, đỏ > 14 ngày / chưa có), tự sao lưu (xanh khi đang bật và có quyền ghi, đỏ khi lỗi).
- Lưu trữ **không tự xóa hồ sơ** (từ v2.7.4; bản cũ tự xóa khi quá 500). Nhiều hồ sơ thì dùng **📦 Xuất & dọn hồ sơ cũ** ở trang Lưu trữ. Nên sao lưu định kỳ, nhất là trước khi đổi máy / trình duyệt.

## Báo cáo tổng hợp (📊 menu Hệ thống)
Cộng các hồ sơ trong Lưu trữ: thẻ tổng theo loại (Ủy thác xuất khẩu, Xuất hàng kho gửi, Trung chuyển gửi kho, Điều chuyển, Trao đổi), bảng theo loại (qua cân · xe trả về · thực giao), theo tháng, theo tàu. Lọc theo khoảng ngày (tính theo ngày bắt đầu của hồ sơ). Nút **Xuất Excel** ra file 4 sheet.
- **Theo đơn vị vận chuyển (theo tàu / theo đợt, chi tiết theo ngày)**: chọn 1 mục trong danh sách xổ xuống (nhóm theo loại). Xuất khẩu / Ủy thác xuất khẩu / Xuất hàng kho gửi chọn theo **tàu** (gộp mọi hồ sơ cùng tên tàu). Trung chuyển gửi kho / Điều chuyển nội bộ / Trao đổi hàng hóa / Xuất bán không có tàu nên chọn theo **đợt** (mỗi hồ sơ trong Lưu trữ là 1 đợt riêng, nhãn hiển thị theo ngày + bên giao/nhận + loại). App đọc lại các dòng phiếu cân từ 🗄️ Lưu trữ, gộp theo **ngày + đơn vị vận chuyển** (cột ĐVVC / nhà xe / chủ xe trong Excel cân — dòng không có cột này gộp vào "(Không xác định)"), kèm bảng tổng theo từng đơn vị vận chuyển. Có thể mất vài giây với tàu/đợt nhiều xe vì phải giải nén lại dữ liệu đã lưu. Nút **Xuất Excel (tất cả tàu / đợt)** xuất 1 sheet gộp mọi tàu/đợt đang được tính (theo tick chọn hồ sơ + khoảng ngày lọc).
- Thực giao = qua cân − xe trả về. Không có tổng chung của mọi loại (một lô hàng có thể đi qua nhiều loại biên bản).
- Hồ sơ **trùng kỳ** (cùng loại, cùng tàu / bên giao-nhận, khoảng ngày chồng nhau) mặc định chỉ tính bản mới nhất; có thể tick lại từng hồ sơ ở bảng "Hồ sơ được tính".
- Chỉ gồm các lần đã xuất từ khi có Lưu trữ; muốn có tháng cũ thì nạp lại file Excel cân cũ và xuất lại.
- **📑 Xuất hàng theo hợp đồng** (v2.5.3): Xuất khẩu / Ủy thác / Xuất bán / Trao đổi gộp theo hợp đồng trong 📇 Danh mục. Nút **📊 Xuất Excel Xuất hàng** ra 2 sheet đúng cột file XUATHANG_DN: NL_DH_XB (mỗi hợp đồng 1 dòng) và NL_PC_XH (mỗi phiếu cân 1 dòng; Ngày xuất = ngày cân; Số BKLS = số đã cấp khi tạo BKLS; M3 = tấn ÷ 0,7). Cột nền xám là cột bổ sung ngoài mẫu gốc.

## Đăng nhập & người dùng (🔒 — v2.6.1)
- **Lần đầu mở bản v2.6.1**: màn hình **Tạo tài khoản quản trị** (họ tên, tên đăng nhập không dấu, mật khẩu ≥ 6 ký tự). Sau đó app hiện **mã khôi phục** (dạng XXXX-XXXX-XXXX) — chép / in / tải file .txt và cất kỹ: dùng để đặt lại mật khẩu Quản trị khi quên (hoặc dùng công cụ khôi phục của nhóm — xem mục 🛡 bên dưới). Dữ liệu cũ (danh mục, lưu trữ, đợt Excel…) giữ nguyên.
- **Mỗi lần mở app**: đăng nhập; giữ đăng nhập tới khi đóng trình duyệt. Nút **🔒 Đăng xuất** ở góc trên. Sai mật khẩu 5 lần → chờ 30 giây.
- **Cài đặt → 👤 Tài khoản**: đổi họ tên / mật khẩu của mình. Quản trị thấy thêm bảng **Người dùng**: thêm, sửa, khóa / mở khóa, đặt lại mật khẩu, chọn quyền và **công ty được làm**; nút **🔑 Tạo mã khôi phục mới** (mã cũ hết hiệu lực). Luôn phải còn ít nhất 1 Quản trị đang dùng.
- **Quyền**: *Quản trị* làm được tất cả. *Nhân viên*: lập biên bản / BKLS / chứng từ, xem báo cáo, xuất Excel, đồng bộ Google Sheet; KHÔNG vào Cài đặt (trừ tab Tài khoản), Danh mục chỉ xem, không xóa hồ sơ Lưu trữ / dòng nhật ký, không khôi phục sao lưu.
- **Người lập**: tên người đăng nhập được ghi vào hồ sơ Lưu trữ (dòng 👤 dưới tên hồ sơ) và cột **Người lập** ở nhật ký chứng từ. Hồ sơ lập trước v2.6 hiện "(trước v2.6)".
- **Quên mật khẩu Quản trị**: màn đăng nhập → *Quên mật khẩu Quản trị?* → nhập mã khôi phục + tên đăng nhập Quản trị + mật khẩu mới → app cấp mã khôi phục mới. Nhân viên quên mật khẩu: nhờ Quản trị đặt lại.
- Lưu ý: app chạy offline trong trình duyệt nên đăng nhập là để **chặn người lạ mở app và ghi người lập**, không phải bảo mật máy chủ. Mật khẩu chỉ lưu dạng mã hóa một chiều. Danh sách người dùng nằm trong **Sao lưu toàn bộ** — khôi phục sang máy khác đăng nhập bằng tài khoản cũ.

## Công ty làm việc (🏢 — v2.6.2)
- Đăng nhập xong chọn **công ty làm việc** (chỉ hiện các công ty người dùng được làm; Quản trị thấy mọi công ty; được làm 1 công ty thì vào thẳng). App nhớ công ty lần trước.
- Công ty này là **bên xuất** (ô "Của" / chủ lâm sản): mỗi lần mở app, các trang biên bản (trừ Điều chuyển), BKLS và Chứng từ PXK tự chọn sẵn bên xuất + kho xuất / bàn cân theo kho mặc định của công ty (Cài đặt → Công ty). Vẫn đổi được trên từng trang khi cần. Số BKLS / PXK gợi ý theo dãy số của công ty.
- **Danh mục, Lưu trữ, Báo cáo** mặc định chỉ hiện dữ liệu liên quan công ty đang làm; bật công tắc **Xem tất cả công ty** để xem hết (Nhân viên: tất cả công ty mình được làm). Hợp đồng "liên quan" = công ty là bên bán/giao, bên mua/nhận hoặc bên giao hàng; hợp đồng chưa gán bên nội bộ nào thì công ty nào cũng thấy. Ô "Chọn hợp đồng" ở trang biên bản xếp hợp đồng của công ty đang làm lên trước, hợp đồng công ty khác ở nhóm dưới.
- Báo cáo Xuất hàng + Đồng bộ Google Sheet theo đúng phạm vi đang xem (chỉ công ty đang làm hoặc tất cả).
- **Đổi công ty**: bấm nút 🏢 trên thanh trên cùng → chọn công ty → app tải lại (dữ liệu đã nạp vẫn giữ).

## Cài nhiều máy / công ty, phân quyền, quên mật khẩu (📘 — v2.6.4, v2.6.5)
- **Mật khẩu chủ của nhóm (v2.7.3)**: Cài đặt → 👤 Tài khoản → 🔐 — 1 câu ≥ 12 ký tự cho cả nhóm, đi kèm Gói cấu hình. Quên mật khẩu Quản trị ở máy nào: đăng nhập → Quên mật khẩu → **🔐 Dùng mật khẩu chủ của nhóm** → tên đăng nhập Quản trị + mật khẩu chủ + mật khẩu mới (không cần file .key / công cụ). Máy chỉ lưu dạng mã hóa một chiều (PBKDF2-SHA256 310.000 vòng) — chép câu ra giấy cất két. **🖨 In phiếu khôi phục của máy** (loại máy, tên Quản trị, dấu vân tay — không có mật khẩu). Tổng quan nhắc khi chưa đặt mật khẩu chủ và khi quá 7 ngày chưa sao lưu toàn bộ.
Hướng dẫn đầy đủ, có nút **In / lưu PDF**: trong app → menu **📘 Hướng dẫn** (Nhân viên chỉ thấy phần của mình). Tóm tắt:
- **Máy chính** (mọi công ty) → Cài đặt → Chung → **📦 Gói cấu hình cài đặt** → tick công ty của máy sẽ cài → Xuất gói `HAK_GoiCaiDat_<công ty>_YYYYMMDD.json`. Tick đủ mọi công ty = gói máy chính.
- **Máy mới**: cài app → màn Tạo tài khoản quản trị → **📦 Nhập gói cấu hình trước** → Áp dụng → tạo Quản trị riêng của máy. Máy cài từ gói "cho công ty X" là **máy trạm**: Quản trị ở đó chỉ làm công ty X, chỉ có Google Sheet của X, không đổi được khóa khôi phục.
- Gói không chứa tài khoản Quản trị, Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe. ⚠ Gói có mật khẩu Nhân viên (mã hóa) và mã bí mật Google Sheet — chỉ gửi người cài máy.
- **Quên mật khẩu Quản trị**: mã khôi phục 12 ký tự, hoặc công cụ **HAK_KhoiPhucQuanTri.exe** (người giữ công cụ tạo *mã phản hồi* từ *mã yêu cầu* của máy; 1 lần, 24 giờ). Nhân viên quên → Quản trị của máy đặt lại. Gỡ / cài lại app **không** làm mất mật khẩu (tài khoản nằm trong bộ nhớ trình duyệt). Cách cuối cùng khi mất hết đường khôi phục: mở app bằng trình duyệt khác → tạo Quản trị mới → *Khôi phục toàn bộ* với tick **"Giữ tài khoản đang dùng trên máy này"** (v2.6.6).

## Đồng bộ Google Sheet (☁ — v2.5.4; mỗi công ty 1 Sheet từ v2.6.3)
Đẩy báo cáo Xuất hàng lên Google Sheet (1 chiều: app → Sheet; sửa trên Sheet không làm đổi app). **Mỗi công ty 1 file Google Sheet riêng**: mỗi lô tự về Sheet của công ty bên xuất; công ty chưa cài Sheet thì bỏ qua và báo.
**Cài 1 lần cho mỗi công ty (khoảng 5 phút):**
1. App: **Cài đặt → Chung → ☁ Đồng bộ Google Sheet** → ở dòng của công ty: bấm **🎲 Tạo mã** → **📋 Sao chép Code.gs** (mã bí mật của công ty đó đã điền sẵn trong đoạn mã).
2. Mở Google Sheet nhận dữ liệu (vd XUATHANG_DN) → **Tiện ích mở rộng → Apps Script** → xóa hết mã có sẵn → dán (Ctrl+V) → **Lưu** (Ctrl+S).
3. **Triển khai → Tùy chọn triển khai mới** → bấm bánh răng chọn **Ứng dụng web** → Thực thi với tư cách: **Tôi** · Người có quyền truy cập: **Bất kỳ ai** → **Triển khai** → **Cấp quyền truy cập** (chọn tài khoản Google → Nâng cao → Đi tới … (không an toàn) → Cho phép — đây là script của chính chị nên Google hỏi như vậy).
4. Sao chép **URL ứng dụng web** (dạng https://script.google.com/macros/s/…/exec) → dán vào ô URL ở dòng công ty đó → **🔌 Kiểm tra** → phải hiện "✔ Kết nối được file …". Cài xong ở 1 máy thì *Xuất gói cấu hình* để các máy khác có luôn.

**Dùng:** Báo cáo → chọn khoảng ngày (nếu cần) → thẻ 📑 Xuất hàng theo hợp đồng → **☁ Đồng bộ Google Sheet** → bấm lần nữa để xác nhận.
- Chỉ gửi các lô **có hồ sơ cân** trong khoảng lọc, hình thức **Xuất khẩu, Ủy thác, Xuất bán** (Trao đổi hàng hóa **không** đồng bộ lên Sheet từ v2.6.7 — vẫn có trong báo cáo và file Excel Xuất hàng). Lô được gửi: sheet NL_PC_XH **xóa toàn bộ phiếu cũ của lô đó rồi ghi lại** (nhận lô theo SỐ TKHQ, lô không có TKHQ theo cột "Mã lô (app)"); NL_DH_XB cập nhật đúng dòng của lô (giữ STT), lô mới thêm cuối. Lô khác trên Sheet (vd số liệu năm 2025 gõ tay) giữ nguyên.
- Script tìm cột theo **tên tiêu đề** (dời cột vẫn đúng), thiếu cột thì tự thêm bên phải (nền xám). Không nên tự thêm cột công thức vào 2 sheet này — dòng của lô được gửi sẽ ghi lại, ô công thức ở dòng đó bị xóa; đặt công thức ở sheet khác (VLOOKUP / QUERY sang).
- Đồng bộ lại nhiều lần không bị nhân đôi. Lô lớn tự chia nhiều lần gửi; lỗi giữa chừng thì bấm lại.
- Đổi mã bí mật → Sao chép Code.gs dán lại → **Triển khai → Quản lý các bản triển khai → ✎ → Phiên bản: Phiên bản mới → Triển khai** (URL giữ nguyên).
- Lỗi "Không kết nối được Google": máy offline, mạng công ty chặn script.google.com, hoặc Web App chưa để "Bất kỳ ai". Lỗi "Sai mã bí mật": mã trong app khác mã trong Code.gs.

## Lưu trữ (🗄️ menu Hệ thống → Lưu trữ)
Mỗi lần **Tạo biên bản / Tải PDF / Xuất Excel** thành công, app tự lưu 1 hồ sơ (thông số form + các dòng phiếu cân đã lọc, nén) vào **trình duyệt của máy này**. Cùng thông số + cùng dữ liệu = cùng 1 hồ sơ (không nhân bản).
- Trang Lưu trữ: tìm kiếm, lọc theo loại; nút **Word / PDF / Excel** dựng lại file ngay cả khi KHÔNG chọn lại file Excel cân (dùng mẫu Word và thông tin công ty hiện hành); nút 🗑 xóa hồ sơ.
- **Sao lưu (.json)** / **Khôi phục**: chép hồ sơ sang máy khác hoặc phòng khi xóa dữ liệu trình duyệt. Khôi phục chỉ thêm / cập nhật hồ sơ mới hơn, không ghi đè bản mới hơn.
- **Không giới hạn, không tự xóa** (v2.7.4). Mỗi hồ sơ ~30 KB cho 350 xe, ~570 KB cho 12.000 xe. Trang hiện 200 dòng mỗi lần, bấm **Hiện thêm** để xem tiếp; tìm kiếm / lọc tìm trong toàn bộ.
- Quá 1.500 hồ sơ: app nhắc 1 lần mỗi phiên + nhãn "nhiều — nên dọn".
- **📦 Xuất & dọn hồ sơ cũ** (Quản trị): chọn "Hồ sơ cập nhật trước ngày" (mặc định 1 năm trước; chỉ tính công ty đang xem, bật Xem tất cả công ty để dọn hết) → **① Xuất file hồ sơ cũ** (`HAK_LuuTru_HoSoCu_<từ>-<đến>.json`, cùng định dạng Sao lưu Lưu trữ) → tick "đã kiểm tra file" → **② Xóa các hồ sơ này khỏi máy** (bấm 2 lần). Cần lại thì **⬆ Khôi phục** file đó. Báo cáo tổng hợp chỉ tính hồ sơ đang có trên máy.

## Danh sách xe & tài xế
- **v2.7.2: mỗi đợt một danh sách riêng** — chỉ áp cho bảng cân của đợt đó, không dùng cho lô / tàu khác.
- **File Excel mẫu** (Nhập liệu → khung Danh sách xe → **⬇ Tải file Excel mẫu**, hoặc link dưới ô thả file): 1 file = 1 đợt, sheet **BANG CAN** (bảng cân) + sheet **DS XE - TAI XE** (Biển số, Họ và tên tài xế, SĐT, Mã ĐVVC) + **MA DVVC** + **HUONG DAN**. Thêm file này làm đợt → app tự đọc danh sách xe trong file. Giờ cân gõ dạng 07:05 (ô giờ kiểu Excel cũng đọc được từ v2.7.2).
- File cân xuất từ phần mềm cân (không có sheet DS XE): bấm dòng đợt → khung **Danh sách xe & tài xế** → **⬆ Gắn file danh sách xe** (file có cột Biển số xe / Họ và tên / mã đơn vị HHH, HAK, HAK QN, ĐH), hoặc **Dự phòng — dùng danh sách của đợt khác** (★ = đợt gần nhất; mọi hình thức). **Bỏ danh sách** để gỡ.
- Đợt chưa có danh sách: cột **DS xe** ở bảng đợt đỏ "🚚 Chưa có", app cảnh báo ở Nhập liệu / trang biên bản / Chứng từ; Tài xế, ĐVVC để trống. Thay file đợt cùng tên mà file mới không có sheet DS → giữ danh sách đã gắn. Chuyển kho gửi sang hình thức khác → đợt chép mang theo danh sách xe.
- Nâng cấp từ bản cũ: các đợt đã nhập được gắn 1 lần danh sách chung đang dùng (không mất tài xế / ĐVVC); danh sách chung cũ vẫn có trong ô dự phòng.
- Ghép theo biển số (bỏ dấu `-` `.`), điền Tài xế và ĐVVC vào ô còn trống. Bảng đổi mã → tên đầy đủ: Cài đặt → Chung.
- Phiếu có biển số **BO** (bỏ cân) bị loại khỏi biên bản.

## Cài đặt Công ty / Kho / Mã ĐVVC (v2.6.9)
- Danh sách chỉ để xem; bấm **✏ Sửa** (hoặc **＋ Thêm**) → cửa sổ nhập → **💾 Lưu** mới ghi (bấm **Hủy** là bỏ). Tên / tên viết tắt không được trống; tên viết tắt trùng thì không cho lưu; mã số thuế hoặc ký hiệu kho trùng thì nhắc (bấm Lưu lần nữa để vẫn lưu).
- Công ty có ô **Kho xuất mặc định**: chọn công ty làm bên xuất thì trang biên bản tự chọn kho này; địa chỉ kho là "Vận chuyển từ" trên BKLS.
- **🗑 Xóa** bị **chặn** khi công ty / kho đang được dùng (hợp đồng trong Danh mục, nhân viên được gán, Google Sheet, máy trạm, công ty đang làm việc, hồ sơ Lưu trữ; kho xuất mặc định của công ty, kho đang chọn ở trang biên bản) — app liệt kê chỗ đang dùng. Không dùng thì bấm Xóa 2 lần để xác nhận.
- **Cài đặt → Chung**: sửa xong bấm **💾 Lưu** (hoặc **Hủy thay đổi**); rời trang khi chưa lưu app sẽ nhắc.

## Lưu ý dữ liệu
- Excel không có cột Tài xế / ĐVVC / Kho / Loại cân → để trống hoặc dùng mặc định trong Cài đặt.
- Phiếu cân có KL bì > KL cả xe bị cảnh báo (tùy chọn tự đảo trong Cài đặt).
- "Xe trả về" (Ủy thác) chọn thủ công trong hộp thoại (dán số phiếu hoặc tích chọn).
- Cấu hình và mẫu tùy chỉnh lưu trong localStorage của trình duyệt.

## Placeholder mẫu Word (delimiter `{{ }}`)
`{{company}} {{address}} {{tax}} {{director}} {{position}} {{from}} {{to}} {{weight}} {{trip}} {{date}} {{month}} {{year}}`
Bảng lặp dòng: đặt `{{#table}}` ở ô đầu và `{{/table}}` ở ô cuối của cùng một dòng (phụ lục: `appendix`, xe trả về: `returned`).
Danh sách đầy đủ: Cài đặt → Mẫu Word.

## Dựng lại mẫu mặc định
`python3 tools/build_templates.py <thư_mục_file_mẫu> templates && python3 tools/embed_templates.py`
