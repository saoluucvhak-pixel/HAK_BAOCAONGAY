/**
 * help.js — 📘 Hướng dẫn trong app (v2.6.5, Thủy chốt phương án A 27/09/2026).
 * Nội dung HTML tĩnh: phân quyền, chuẩn bị máy chính, cài máy trạm, cập nhật, quên mật khẩu, lỗi thường gặp, bảo quản công cụ khôi phục.
 * Mục nào có lớp .admin-only thì Nhân viên không thấy (xem style.css body.role-staff). Có nút In / lưu PDF.
 * Liên kết từ nơi khác: phần tử có data-help="<id mục>" → mở trang Hướng dẫn và cuộn tới mục đó.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** [id, tiêu đề, chỉ Quản trị?, nội dung HTML] */
  const SECTIONS = [
    ['help-model', 'Mô hình cài đặt', false,
      '<p>Mỗi máy chạy app <b>offline, độc lập</b> — dữ liệu (Lưu trữ, đợt Excel, nhật ký chứng từ) nằm trên máy đó. Cấu hình dùng chung được mang từ máy này sang máy khác bằng <b>Gói cấu hình cài đặt</b> (file .json).</p>' +
      '<ul><li><b>Máy chính</b> — máy của người phụ trách nhóm: làm được mọi công ty, giữ cấu hình gốc, xuất gói cho các máy khác.</li>' +
      '<li><b>Máy trạm</b> — máy cài từ gói <b>"cho công ty X"</b>: chỉ làm các công ty trong gói, chỉ có Google Sheet của các công ty đó.</li>' +
      '<li><b>Công cụ khôi phục</b> <span class="mono">HAK_KhoiPhucQuanTri.exe</span> — chỉ 1 người giữ (máy chính / USB), dùng khi Quản trị một máy quên mật khẩu. Không nằm trong bộ cài app.</li></ul>' +
      '<div class="help-flow"><span>Máy chính</span><i>→ 📦 gói cho công ty X →</i><span>Máy trạm X</span><i>→ tạo Quản trị riêng →</i><span>Dùng</span></div>'],

    ['help-roles', 'Phân quyền', false,
      '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm align-middle help-tbl"><thead><tr><th>Việc</th><th>Quản trị máy chính</th><th>Quản trị máy trạm</th><th>Nhân viên</th></tr></thead><tbody>' +
      [['Chọn công ty làm việc', 'Mọi công ty', 'Chỉ công ty của máy', 'Công ty được gán (trong phạm vi máy)'],
        ['Lập biên bản, BKLS, chứng từ, xuất PDF / Word / Excel', '✔', '✔', '✔'],
        ['Báo cáo, đồng bộ Google Sheet', '✔ mọi công ty', '✔ công ty của máy', '✔ công ty được làm'],
        ['Danh mục hợp đồng & khách hàng', 'Thêm / sửa / xóa', 'Thêm / sửa / xóa', 'Chỉ xem'],
        ['Xóa hồ sơ Lưu trữ, dòng nhật ký; khôi phục sao lưu', '✔', '✔', '✘'],
        ['Cài đặt công ty, kho, mã ĐVVC, mẫu Word', '✔', '✔ (chỉ trên máy mình)', '✘'],
        ['Google Sheet (URL, mã bí mật)', 'Mọi công ty', 'Chỉ công ty của máy', '✘'],
        ['Người dùng: thêm / sửa / khóa / đặt lại mật khẩu', '✔', '✔ (chỉ gán công ty của máy)', '✘ (chỉ đổi mật khẩu mình)'],
        ['Xuất gói cấu hình', 'Gói đầy đủ hoặc cho công ty bất kỳ', 'Chỉ gói cho công ty của máy', '✘'],
        ['Nhập gói cấu hình', '✔', '✔', '✘'],
        ['Khóa khôi phục của nhóm', 'Dán / thay / gỡ', '🔒 Chỉ xem — đổi bằng gói từ máy chính', '✘'],
        ['Tạo mã phản hồi khôi phục', 'Chỉ người giữ công cụ + mật khẩu chủ', '✘', '✘']
      ].map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<p class="small muted mb-0">Không máy nào tác động được sang máy khác. Đăng nhập là để <b>chặn người lạ mở app và ghi người lập</b> — ai có quyền quản trị Windows của máy vẫn có thể can thiệp dữ liệu trình duyệt nếu cố ý.</p>'],

    ['help-main', 'A. Chuẩn bị ở máy chính (làm 1 lần)', true,
      '<h6>A1. Hoàn tất cấu hình</h6><ol>' +
      '<li>Cài đặt → <b>Công ty</b> / <b>Kho</b> / <b>Chung</b> (bảng mã ĐVVC) / <b>Mẫu Word</b>: kiểm tra đủ và đúng.</li>' +
      '<li><b>Danh mục HĐ &amp; khách hàng</b>: nhập đủ hợp đồng, khách hàng.</li>' +
      '<li>Cài đặt → 👤 Tài khoản → <b>Người dùng</b>: tạo tài khoản <b>Nhân viên</b>, tick <b>công ty được làm</b>. Tên đăng nhập Nhân viên nên khác tên Quản trị các máy.</li>' +
      '<li>Cài đặt → Chung → ☁ <b>Đồng bộ Google Sheet</b>, mỗi công ty: 🎲 Tạo mã → 📋 Code.gs → mở file Google Sheet của công ty → Tiện ích mở rộng → Apps Script → xóa mã cũ, dán, Lưu → Triển khai → Ứng dụng web (Thực thi: Tôi · Truy cập: Bất kỳ ai) → Cấp quyền → chép URL <span class="mono">…/exec</span> dán vào dòng công ty → 🔌 Kiểm tra phải hiện "✔ Kết nối được".</li></ol>' +
      '<h6>A2. Đặt mật khẩu chủ của nhóm (v2.7.3 — khuyến nghị, đủ dùng cho mọi máy)</h6><ol>' +
      '<li>Cài đặt → 👤 Tài khoản → <b>🔐 Mật khẩu chủ của nhóm</b>: gõ 1 <b>câu dài ≥ 12 ký tự</b> (vd <span class="mono">HoangAnhKhoi-DaNang-2026-xuatdam</span>) 2 lần + mật khẩu đăng nhập của bạn → <b>Lưu mật khẩu chủ</b>.</li>' +
      '<li><b>Chép câu này ra giấy, cất két</b> — app chỉ lưu dạng mã hóa một chiều, không ai xem lại được. Phân biệt chữ hoa / thường.</li>' +
      '<li>Xuất <b>Gói cấu hình</b> (Cài đặt → Chung → 📦) → các máy / đơn vị cài gói là có cùng mật khẩu chủ. Bấm <b>🖨 In phiếu khôi phục của máy</b> ở từng máy, cất cùng tờ ghi mật khẩu chủ.</li></ol>' +
      '<h6>A2b. Tạo khóa khôi phục của nhóm (tùy chọn — thêm 1 đường dự phòng)</h6><ol>' +
      '<li>Chép thư mục <span class="mono">HAK_KhoiPhucQuanTri</span> ra nơi cố định (vd <span class="mono">D:\\HAK_KhoiPhuc</span> hoặc USB).</li>' +
      '<li>Chạy <span class="mono">HAK_KhoiPhucQuanTri.exe</span>. Windows cảnh báo "không rõ nguồn gốc" → <b>Thông tin thêm → Vẫn chạy</b>. Trình duyệt mở trang công cụ.</li>' +
      '<li>Đặt <b>mật khẩu của file khóa</b> (công cụ gọi là "mật khẩu chủ", ≥ 8 ký tự — có thể dùng chung câu mật khẩu chủ của nhóm) 2 lần → <b>Tạo khóa</b>. File <span class="mono">HAK_KhoaKhoiPhuc.key</span> tạo cạnh công cụ.</li>' +
      '<li><b>Sao lưu file .key</b> ra nơi thứ 2 và <b>nhớ mật khẩu file khóa</b> — mất một trong hai là không tạo được mã phản hồi.</li>' +
      '<li>Tab <b>📋 Khóa công khai</b> → Sao chép; ghi lại <b>dấu vân tay</b> (<span class="mono">XXXX-XXXX-XXXX-XXXX</span>).</li></ol>' +
      '<h6>A3. Dán khóa vào app</h6><ol><li>Cài đặt → 👤 Tài khoản → <b>🛡 Khóa khôi phục của nhóm</b> → dán → <b>Lưu khóa</b>.</li><li>Dấu vân tay app hiện phải <b>trùng</b> với công cụ.</li></ol>' +
      '<h6>A4. Xuất gói cấu hình</h6><ol>' +
      '<li>Cài đặt → Chung → <b>📦 Gói cấu hình cài đặt</b> → ở <b>Gói cho công ty</b>: tick <b>đúng công ty của máy sẽ cài</b> (gói máy trạm) — hoặc tick đủ mọi công ty (gói máy chính, dùng khi thay / dự phòng máy chính).</li>' +
      '<li><b>Xuất gói cấu hình</b> → file <span class="mono">HAK_GoiCaiDat_&lt;công ty&gt;_YYYYMMDD.json</span>.</li>' +
      '<li>Gửi file gói + bộ cài <span class="mono">HAK_QuanLyXuatHang_Setup_v….exe</span> cho người cài (USB / gửi riêng). ⚠ Gói có mật khẩu Nhân viên (mã hóa một chiều) và mã bí mật Google Sheet — không gửi nhóm chung.</li></ol>'],

    ['help-install', 'B. Cài máy trạm (máy mới)', true,
      '<ol><li>Chạy bộ cài, <b>giữ đường dẫn mặc định</b> → Finish mở app (dùng Chrome hoặc Edge).</li>' +
      '<li>Màn <b>Tạo tài khoản quản trị</b>: <u>chưa tạo vội</u> — bấm <b>📦 Cài máy mới? Nhập gói cấu hình trước</b> → chọn file gói.</li>' +
      '<li>Xem tóm tắt: <b>Loại gói</b> "Máy trạm — chỉ làm: …" đúng công ty; Google Sheet; Nhân viên; <b>Khóa khôi phục của nhóm: Có</b> → <b>Áp dụng gói</b>. App tải lại, vẫn ở màn tạo Quản trị (đúng).</li>' +
      '<li>Tạo <b>Quản trị riêng của máy</b>: họ tên, tên đăng nhập không dấu (vd <span class="mono">qt.daihiep</span>), mật khẩu ≥ 6 ký tự × 2.</li>' +
      '<li>Màn <b>Mã khôi phục</b> 12 ký tự: máy có khóa nhóm nên có nút <b>Bỏ qua</b>; nên vẫn tải .txt cất làm đường dự phòng.</li>' +
      '<li>Máy trạm 1 công ty → vào thẳng; nhiều công ty → chọn công ty làm việc.</li>' +
      '<li>Kiểm tra: Cài đặt → Chung → ☁ bấm <b>🔌 Kiểm tra</b>; Cài đặt → 👤 Tài khoản → dấu vân tay khóa nhóm đúng; đăng xuất, cho 1 nhân viên đăng nhập thử bằng mật khẩu cũ.</li>' +
      '<li>Danh sách xe không đi kèm gói → nhập lại ở máy mới nếu cần.</li></ol>'],

    ['help-update', 'C. Cập nhật máy đang dùng', true,
      '<p>Khi máy chính có thay đổi (thêm hợp đồng, nhân viên, đổi Sheet, mẫu Word…):</p><ol>' +
      '<li>Máy chính: xuất gói mới (bước A4) cho đúng công ty của máy cần cập nhật.</li>' +
      '<li>Máy cần cập nhật: đăng nhập Quản trị → Cài đặt → Chung → 💾 <b>Sao lưu toàn bộ</b> trước.</li>' +
      '<li>📦 <b>Nhập gói cấu hình</b> → chọn file → xem tóm tắt → <b>Áp dụng &amp; tải lại</b>.</li></ol>' +
      '<ul><li><b>Thay</b> theo gói: công ty, kho, mã ĐVVC, mẫu Word, Google Sheet (máy trạm: Sheet công ty khác bị xóa khỏi máy).</li>' +
      '<li><b>Gộp</b>: hợp đồng (trùng thì cập nhật theo gói, ô trống trong gói không xóa số liệu chứng thư của máy; HĐ riêng của máy giữ nguyên); Nhân viên theo tên đăng nhập (trùng tên Quản trị của máy → bỏ qua, có báo).</li>' +
      '<li><b>Loại máy</b> theo gói: gói cho công ty X → máy trạm X; gói đầy đủ → máy chính (bỏ giới hạn — tóm tắt có cảnh báo).</li>' +
      '<li><b>Không đụng</b>: Quản trị của máy, Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe.</li></ul>'],

    ['help-forgot', 'D. Quên mật khẩu', false,
      '<h6>Nhân viên quên</h6><p>Nhờ Quản trị của máy: Cài đặt → 👤 Tài khoản → Người dùng → <b>Sửa</b> → nhập mật khẩu mới → Lưu.</p>' +
      '<div class="admin-only"><h6>Quản trị quên — cách nhanh nhất: mật khẩu chủ của nhóm (v2.7.3)</h6><ol>' +
      '<li>Màn đăng nhập → <b>Quên mật khẩu Quản trị?</b> → <b>🔐 Dùng mật khẩu chủ của nhóm</b>.</li>' +
      '<li>Nhập tên đăng nhập Quản trị của máy (xem <b>phiếu khôi phục</b> đã in), mật khẩu chủ, mật khẩu mới × 2 → <b>Đặt lại mật khẩu</b> → vào app ngay.</li>' +
      '<li>Không cần file .key, không cần công cụ. Sai 5 lần → chờ 30 giây. Nút chỉ hiện khi máy đã có mật khẩu chủ (đặt ở máy chính hoặc cài qua Gói cấu hình).</li></ol>' +
      '<h6>Quản trị quên — cách 1: mã khôi phục 12 ký tự</h6><ol>' +
      '<li>Màn đăng nhập → <b>Quên mật khẩu Quản trị?</b></li><li>Nhập mã khôi phục + tên đăng nhập Quản trị + mật khẩu mới × 2 → <b>Đặt lại mật khẩu</b>.</li>' +
      '<li>App cấp <b>mã khôi phục mới</b> (mã cũ hết hiệu lực) → cất lại.</li></ol>' +
      '<h6>Quản trị quên — cách 2: công cụ khôi phục của nhóm</h6>' +
      '<div class="help-step"><b>① Máy quên mật khẩu</b><ol><li>Màn đăng nhập → <b>Quên mật khẩu Quản trị?</b> → <b>🛡 Dùng công cụ khôi phục của nhóm</b>.</li>' +
      '<li>Màn hình hiện <b>Mã yêu cầu</b> (vd <span class="mono">N4SU-QM5B-5VRP</span>) → 📋 Sao chép → gửi cho người giữ công cụ kèm <b>tên đăng nhập Quản trị</b>.</li>' +
      '<li>Đã gửi rồi thì <b>không bấm "Tạo mã yêu cầu mới"</b> (mã cũ mất hiệu lực). Đóng app không sao — mở lại vẫn đúng mã đó tới khi dùng xong.</li></ol></div>' +
      '<div class="help-step"><b>② Người giữ công cụ</b><ol><li>Chạy <span class="mono">HAK_KhoiPhucQuanTri.exe</span> → tab <b>🔑 Tạo mã phản hồi</b>.</li>' +
      '<li>Nhập mã yêu cầu (hoa / thường, có gạch hay không đều được), tên đăng nhập, mật khẩu chủ → <b>Tạo mã phản hồi</b>.</li>' +
      '<li>📋 Sao chép → gửi lại qua Zalo / email (khoảng 91 ký tự — <b>dán nguyên văn</b>, không gõ tay). Xong bấm <b>Thoát công cụ</b> (tự thoát sau 20 phút).</li></ol></div>' +
      '<div class="help-step"><b>③ Máy quên mật khẩu</b><ol><li>Nhập tên đăng nhập Quản trị, dán <b>mã phản hồi</b>, mật khẩu mới × 2 → <b>Đặt lại mật khẩu</b> → vào app.</li>' +
      '<li>Mã phản hồi dùng <b>1 lần</b>, trong <b>24 giờ</b>, chỉ đúng máy và tên đăng nhập đó.</li></ol></div>' +
      '<h6>Gỡ app rồi cài lại có vào được không?</h6><p><b>Không.</b> Tài khoản và dữ liệu nằm trong bộ nhớ của trình duyệt (Chrome / Edge), không nằm trong thư mục cài — gỡ / cài lại (kể cả thư mục khác) vẫn gặp đúng tài khoản cũ. Việc này để cập nhật / cài lại không mất dữ liệu.</p>' +
      '<h6>Cách cuối cùng — mất cả mã khôi phục lẫn công cụ, nhưng còn file Sao lưu toàn bộ</h6><ol>' +
      '<li>Mở app bằng <b>trình duyệt khác</b> (đang dùng Chrome thì mở bằng Edge, hoặc ngược lại) → app trắng như máy mới → nhập <b>gói cấu hình</b> (nếu có) → tạo <b>Quản trị mới</b>.</li>' +
      '<li>Cài đặt → Chung → 💾 → để tick <b>"Giữ tài khoản đang dùng trên máy này"</b> → <b>Khôi phục toàn bộ</b> → chọn file sao lưu.</li>' +
      '<li>Hồ sơ Lưu trữ, đợt Excel, danh mục, cài đặt được lấy về; tài khoản vẫn là Quản trị mới vừa tạo. Tạo lại tài khoản Nhân viên nếu cần (hoặc nhập gói cấu hình).</li>' +
      '<li>Từ nay mở app bằng trình duyệt mới này. Dữ liệu trong trình duyệt cũ vẫn còn nhưng không vào được.</li></ol>' +
      '<p class="small muted">Chỉ <b>bỏ tick</b> ô đó khi chuyển sang máy mới và muốn mọi người đăng nhập bằng mật khẩu cũ trong file sao lưu.</p></div>'],

    ['help-veh', 'Bảng cân + danh sách xe, tài xế theo từng đợt (v2.7.2)', false,
      '<p><b>Mỗi đợt xuất hàng có danh sách xe &amp; tài xế riêng</b> — chỉ áp cho bảng cân của đợt đó, không dùng cho lô / tàu khác.</p><ol>' +
      '<li>Tải <b>file Excel mẫu</b>: Nhập liệu → khung <b>Danh sách xe &amp; tài xế</b> → <button type="button" class="btn btn-sm btn-outline-success py-0" data-sample-xlsx>⬇ Tải file Excel mẫu</button>. 1 file = 1 đợt: sheet <b>BANG CAN</b> (phiếu cân) + <b>DS XE - TAI XE</b> (biển số, tài xế, SĐT, mã ĐVVC).</li>' +
      '<li>Điền xong → Nhập liệu → chọn hình thức → thêm file làm đợt. App tự đọc danh sách xe trong file; cột <b>DS xe</b> của bảng đợt ghi số xe và số biển số khớp.</li>' +
      '<li>File cân lấy từ phần mềm cân (không có sheet DS XE): bấm dòng đợt → <b>⬆ Gắn file danh sách xe</b>, hoặc <b>Dự phòng — dùng danh sách của đợt khác</b> (★ = đợt gần nhất).</li></ol>' +
      '<ul><li>Đợt chưa có danh sách: báo đỏ "🚚 Chưa có" + cảnh báo; Tài xế / Đơn vị vận chuyển để trống trên biên bản, BKLS, PXKKVCNB.</li>' +
      '<li>Chuyển Xuất hàng kho gửi sang hình thức khác: đợt chép mang theo danh sách xe của đợt gốc.</li></ul>'],

    ['help-autobk', 'Tự sao lưu mỗi ngày + Sức khỏe dữ liệu (v2.7.5)', false,
      '<p>Dữ liệu app nằm trong trình duyệt của máy — hỏng / xóa trình duyệt là mất. Từ v2.7.5 app <b>tự sao lưu mỗi ngày</b> vào 1 thư mục anh chọn:</p><ol>' +
      '<li>Quản trị: ⚙️ Cài đặt → 🛠️ Chung → thẻ <b>Bộ nhớ &amp; sao lưu</b> → <b>🔁 Tự sao lưu vào thư mục</b> → <b>📁 Chọn thư mục tự sao lưu…</b> → chọn thư mục (nên là thư mục <b>Google Drive / OneDrive</b> đồng bộ, hoặc ổ D) → bấm <b>Cho phép</b> (Allow) khi trình duyệt hỏi quyền sửa file.</li>' +
      '<li>Bấm <b>▶ Sao lưu vào thư mục ngay</b> để tạo bản đầu tiên. Chọn số bản giữ (mặc định 10).</li>' +
      '<li>Từ đó mỗi ngày, lần đầu mở app (sau khoảng 20 giây) app ghi <span class="mono">HAK_TuDong_&lt;ngày&gt;_&lt;giờ&gt;.zip</span>, đọc lại kiểm tra, rồi xóa bản <span class="mono">HAK_TuDong_*.zip</span> cũ hơn số bản giữ (không đụng file khác).</li></ol>' +
      '<ul><li>Chrome / Edge thường <b>hỏi lại quyền</b> sau mỗi lần mở trình duyệt: Tổng quan hiện dòng 🔁 → bấm <b>Cho phép &amp; sao lưu</b> (trình duyệt có lựa chọn "Cho phép mỗi lần truy cập" thì chọn để khỏi hỏi lại).</li>' +
      '<li>Nút <b>⬇ Sao lưu toàn bộ</b> giờ ra file <b>.zip</b> (nhẹ hơn ~3 lần). <b>⬆ Khôi phục toàn bộ</b> nhận cả .zip lẫn file .json của bản cũ. Khôi phục từ bản tự sao lưu: chọn file HAK_TuDong_….zip trong thư mục.</li>' +
      '<li><b>🩺 Sức khỏe dữ liệu</b> ở Tổng quan: 5 ô xanh / vàng / đỏ — bộ nhớ trình duyệt, cài đặt (localStorage), số hồ sơ Lưu trữ, sao lưu gần nhất, tự sao lưu. Ô vàng / đỏ: rê chuột xem cách xử lý.</li></ul>'],

    ['help-arch', 'Lưu trữ nhiều hồ sơ — Xuất & dọn hồ sơ cũ (v2.7.4)', false,
      '<p><b>App không còn tự xóa hồ sơ</b> (bản cũ: quá 500 hồ sơ tự xóa hồ sơ cũ nhất). Lưu trữ giữ tất cả; trang Lưu trữ hiện 200 dòng mỗi lần, bấm <b>Hiện thêm</b> để xem tiếp (tìm kiếm / lọc vẫn tìm trong toàn bộ).</p>' +
      '<p>Quá 1.500 hồ sơ: app nhắc 1 lần và hiện nhãn <b class="text-warning">nhiều — nên dọn</b>. Quản trị dọn như sau:</p><ol>' +
      '<li>🗄️ Lưu trữ → <b>📦 Xuất &amp; dọn hồ sơ cũ</b> → chọn <b>Hồ sơ cập nhật trước ngày</b> (mặc định: 1 năm trước). Chỉ tính hồ sơ trong phạm vi công ty đang xem (bật <b>Xem tất cả công ty</b> để dọn mọi công ty).</li>' +
      '<li>Bấm <b>① Xuất file hồ sơ cũ</b> → lưu file <span class="mono">HAK_LuuTru_HoSoCu_&lt;từ&gt;-&lt;đến&gt;.json</span> rồi chép ra USB / Google Drive.</li>' +
      '<li>Tick <b>"Tôi đã kiểm tra…"</b> → <b>② Xóa các hồ sơ này khỏi máy</b> (bấm 2 lần). Không xuất được file thì không có bước ②.</li></ol>' +
      '<ul><li>Cần lại hồ sơ cũ: Lưu trữ → <b>⬆ Khôi phục</b> → chọn file đó (chỉ thêm lại, không ghi đè hồ sơ mới hơn).</li>' +
      '<li>Báo cáo tổng hợp chỉ tính hồ sơ đang có trên máy — dọn xong thì các tháng đã dọn không còn trong báo cáo cho tới khi khôi phục lại.</li></ul>'],

    ['help-tabs', 'Trang biên bản: nhập theo 5 tab (v2.7.0)', false,
      '<p>Mỗi trang biên bản chia ô nhập thành các tab, cùng thứ tự ở mọi hình thức (trang nào không có vùng đó thì bỏ tab):</p><ol>' +
      '<li><b>Dữ liệu cân</b> — lọc khoảng ngày, chọn xe trả về.</li>' +
      '<li><b>Hợp đồng &amp; bên</b> — chọn hợp đồng, tên tàu, các bên, hợp đồng ủy thác, chứng thư giám định. Điều chuyển: <b>Quyết định &amp; chiều</b> (chiều điều chuyển, kho đi / đến, số và ngày Quyết định).</li>' +
      '<li><b>Kho &amp; cảng</b> — kho xuất / bàn cân, cảng / nơi giao.</li>' +
      '<li><b>Biên bản</b> — tháng, ngày lập, mẫu biên bản (Xuất bán: <b>Giá &amp; biên bản</b>).</li>' +
      '<li><b>BKLS</b> — số BKLS, hệ số, bên mua, nguồn gốc, <b>Mã HS</b> (v2.7.6: Xuất khẩu / Ủy thác mặc định 4401220090, hàng nội địa để trống → in dấu chấm; sửa theo tờ khai hải quan), các bản cần tạo. Ô <b>"Bản tổng: liệt kê BKLS từng xe…"</b> (mặc định bật, v2.7.1): mục 5 "Hồ sơ kèm theo" của BKLS tổng ghi tổng số BKLS con, số xe, rồi từng ngày → từng BKLS con (số, KL MT – BDMT, số xe, tài xế); bản tổng thành nhiều tờ, "Tổng số tờ" tự đếm. Bỏ tick = bản tổng gọn 1 trang như cũ.</li></ol>' +
      '<ul><li>Dấu trên tab: <b class="text-success">✓</b> đủ ô bắt buộc · <b class="text-danger">số đỏ</b> còn thiếu (chưa tạo được biên bản) · <b class="text-warning">số vàng</b> ở tab BKLS = còn thiếu nếu muốn tạo BKLS. Rê chuột lên tab để xem thiếu ô nào.</li>' +
      '<li>Bấm <b>Tạo biên bản</b> / <b>Tạo BKLS</b> khi còn thiếu → app tự mở đúng tab và tô đỏ ô cần nhập.</li>' +
      '<li>Nút <b>Tiếp ›</b> / <b>‹ Quay lại</b> ở cuối mỗi tab; mở lại trang thì app nhớ tab đang làm. Kết quả tự tính và các nút Tạo luôn ở khung bên phải (điện thoại: bên dưới).</li></ul>'],

    ['help-convert', 'Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán', false,
      '<p>Hàng ở <b>kho gửi</b> xuất đi để bán, xuất khẩu hoặc ủy thác: trang <b>Xuất hàng kho gửi</b> chỉ lập <b>biên bản giao nhận hàng xuất kho gửi</b> (không lập BKLS). BKLS lập ở hình thức đích — khi hàng chuyển chủ sở hữu.</p><ol>' +
      '<li>Nhập liệu → <b>Xuất hàng kho gửi</b> → thêm file Excel cân của đợt.</li>' +
      '<li>Trang Xuất hàng kho gửi: nhập tàu, bên gửi, kho, lọc ngày, chọn xe trả về → <b>⚡ Tạo biên bản</b>.</li>' +
      '<li>Khung <b>➡ Chuyển sang hình thức khác</b> → bấm <b>Xuất khẩu</b>, <b>Ủy thác</b> hoặc <b>Xuất bán</b>. App chép đúng các phiếu cân đang lọc sang trang đích, điền sẵn tàu, bên gửi (→ đơn vị xuất khẩu / bên ủy thác / bên bán), kho xuất, xe trả về (Xuất bán: tự loại xe trả về).</li>' +
      '<li>Trang đích: <b>chọn hợp đồng</b> (bên nhận ủy thác / bên mua theo hợp đồng) → nhập <b>Số BKLS</b> → <b>⚡ Tạo biên bản</b> → <b>🧾 Tạo BKLS</b> (Tổng + Từng xe, Word + PDF).</li></ol>' +
      '<ul><li><b>Mỗi đợt chỉ 1 hình thức.</b> Đợt đã chuyển có nhãn "➡ đã chuyển sang …" (Nhập liệu và trang kho gửi). Muốn đổi hình thức: Nhập liệu → hình thức đã chuyển → <b>Xóa</b> đợt đã chép → chuyển lại. Chuyển lại đúng hình thức cũ = cập nhật.</li>' +
      '<li>Trang đích hiện dòng "Phạm vi chuyển từ Xuất hàng kho gửi…" — chỉ lấy đúng đợt đã chuyển. Tải lại app thì phạm vi lọc về mặc định → bấm Chuyển sang lần nữa (cùng hình thức) để mang lại.</li>' +
      '<li>Báo cáo đơn vị vận chuyển không cộng trùng xe giữa hồ sơ kho gửi và hồ sơ đã chuyển.</li></ul>'],

    ['help-errors', 'E. Lỗi thường gặp', false,
      '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm align-middle help-tbl"><thead><tr><th>Báo lỗi</th><th>Nguyên nhân</th><th>Xử lý</th></tr></thead><tbody>' +
      [['Sai tên đăng nhập hoặc mật khẩu', 'Gõ sai / Caps Lock', 'Nhập lại; Nhân viên nhờ Quản trị đặt lại'],
        ['Sai nhiều lần — thử lại sau … giây', 'Sai 5 lần liên tiếp', 'Chờ 30 giây'],
        ['Tài khoản đang bị khóa', 'Quản trị đã khóa', 'Liên hệ Quản trị của máy'],
        ['Tài khoản chưa được gán công ty nào', 'Không có công ty được làm (hoặc công ty không thuộc máy trạm này)', 'Quản trị gán công ty ở Người dùng'],
        ['Mật khẩu chủ không đúng (công cụ)', 'Gõ sai mật khẩu chủ', 'Nhập lại, chú ý Caps Lock'],
        ['Mã yêu cầu phải có 12 ký tự (công cụ)', 'Chép thiếu', 'Xin lại mã yêu cầu'],
        ['Mã phản hồi đã hết hạn', 'Quá 24 giờ', 'Tạo mã phản hồi mới (vẫn mã yêu cầu cũ)'],
        ['Mã phản hồi không khớp mã yêu cầu / tên đăng nhập', 'Sai tên, dán thiếu ký tự, hoặc máy đã tạo mã yêu cầu mới', 'Kiểm tra tên, dán lại; mã yêu cầu mới → ký lại'],
        ['Không có Quản trị tên "…" trên máy này', 'Tên đó không phải Quản trị của máy', 'Kiểm tra tên đăng nhập'],
        ['Hạn dùng bất thường — kiểm tra đồng hồ máy', 'Ngày giờ Windows sai', 'Chỉnh ngày giờ'],
        ['Đây là file Sao lưu toàn bộ…', 'Chọn nhầm file khi nhập gói', 'Chọn file HAK_GoiCaiDat_….json'],
        ['Google Sheet: Không kết nối được / Sai mã bí mật', 'Mạng chặn, Web App chưa "Bất kỳ ai", mã trong app khác Code.gs', 'Xem mục Đồng bộ Google Sheet trong HUONG_DAN.md']
      ].map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') + '</tbody></table></div>'],

    ['help-tool', 'F. Bảo quản công cụ khôi phục', true,
      '<ul><li>File <span class="mono">.exe</span> và <span class="mono">HAK_KhoaKhoiPhuc.key</span> luôn đi <b>cùng nhau</b> — chuyển máy thì chép cả hai.</li>' +
      '<li><b>Đổi mật khẩu chủ</b>: tab ⚙ trong công cụ — khóa không đổi, các máy không phải làm gì.</li>' +
      '<li>Công cụ <b>không tạo lại khóa</b> khi đã có file .key (tránh làm hỏng các máy đang dùng khóa cũ).</li>' +
      '<li>Mất hẳn file .key hoặc quên mật khẩu chủ: chạy công cụ ở <b>thư mục trống</b> tạo khóa mới → dán khóa công khai mới ở máy chính → xuất gói và nhập lại ở các máy. Trong lúc chờ, các máy vẫn khôi phục bằng mã 12 ký tự của từng máy.</li>' +
      '<li>Công cụ chỉ chạy trên máy người giữ, không cần mạng, chỉ mở trang cho chính máy đó (127.0.0.1).</li></ul>']
  ];

  function machineInfo() {
    const A = HAK.Auth; if (!A || !A.current || !A.current()) return '';
    const st = A.stationCos ? A.stationCos() : null, cos = (HAK.Config && HAK.Config.data.companies) || [];
    const nm = (id) => { const c = cos.find((x) => x.id === id); return c ? c.short || c.name : id; };
    let gk = null, mp = null; try { const ad = HAK.Store.get('hak.auth.v1', {}) || {}; gk = ad.groupPub; mp = ad.master; } catch (e) { /* bỏ qua */ }
    const u = A.current();
    return '<ul class="sum-list mb-0">' +
      '<li><span>Máy này</span><b>' + (st ? 'Máy trạm — ' + esc(st.map(nm).join(', ')) : 'Máy chính — mọi công ty') + '</b></li>' +
      '<li><span>Bạn</span><b>' + esc(u.name) + ' · ' + (u.role === 'admin' ? 'Quản trị' : 'Nhân viên') + '</b></li>' +
      '<li class="admin-only"><span>Mật khẩu chủ của nhóm</span><b>' + (mp && mp.hash ? '<span class="text-success">Đã đặt</span> · <span class="mono">' + esc(mp.fp || '') + '</span>' : '<span class="text-warning">Chưa đặt</span>') + '</b></li>' +
      '<li class="admin-only"><span>Khóa khôi phục của nhóm</span><b>' + (gk && gk.key ? '<span class="text-success">Đã cài</span> · <span class="mono">' + esc(gk.fp || '') + '</span>' : '<span class="text-warning">Chưa cài</span>') + '</b></li></ul>';
  }

  let built = false;
  function render() {
    const box = $('#helpRoot'); if (!box) return;
    if (!built) {
      box.innerHTML =
        '<div class="card mb-3"><div class="card-body d-flex flex-wrap align-items-start gap-3">' +
        '<div class="flex-grow-1" style="min-width:240px"><h5 class="mb-1">📘 Hướng dẫn cài đặt, phân quyền &amp; khôi phục</h5><div class="small muted">Cập nhật bản v2.7.7. In ra hoặc lưu PDF để đưa cho người cài máy.</div>' +
        '<div class="help-toc no-print mt-2">' + SECTIONS.map((s) => '<button type="button" class="btn btn-sm btn-outline-primary' + (s[2] ? ' admin-only' : '') + '" data-help-go="' + s[0] + '">' + esc(s[1].replace(/^[A-F]\. /, '')) + '</button>').join('') + '</div></div>' +
        '<div style="min-width:260px;flex:1 1 280px" id="helpInfo"></div>' +
        '<button type="button" class="btn btn-primary no-print" id="helpPrint">🖨 In / lưu PDF</button></div></div>' +
        SECTIONS.map((s) => '<div class="card mb-3 help-sec' + (s[2] ? ' admin-only' : '') + '" id="' + s[0] + '"><div class="card-header">' + esc(s[1]) + '</div><div class="card-body">' + s[3] + '</div></div>').join('');
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-help-go]'); if (b) go(b.dataset.helpGo);
        if (e.target.closest('#helpPrint')) root.print();
      });
      built = true;
    }
    const info = $('#helpInfo'); if (info) info.innerHTML = machineInfo();
  }
  function go(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  /** Mở trang Hướng dẫn tại mục id (dùng cho liên kết data-help ở các thẻ khác). */
  function open(id) {
    if (location.hash !== '#/help') location.hash = '#/help'; else render();
    setTimeout(() => go(id), 80);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-help]'); if (!a) return;
    e.preventDefault(); open(a.dataset.help);
  });

  HAK.Help = { render, open, SECTIONS };
})(window);
