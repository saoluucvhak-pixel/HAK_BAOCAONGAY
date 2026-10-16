/**
 * [CONSTANTS] Định nghĩa cột cho từng bảng báo cáo — [dataKey, tiêu đề hiển thị, kiểu dữ liệu]
 * dùng chung bởi UI (render bảng) và export (Excel/PDF/In). GIỮ NGUYÊN 100% so với bản gốc.
 * @module constants/columns
 */
export const NHAPKEO_COLS = [
  ['STT','STT','int'], ['So_CT','Số CT','text'], ['Mã hàng','Mã hàng','text'], ['Khách hàng','Khách hàng','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['Biển số 2','Biển số 2','text'], ['Cân lần 1','Cân lần 1','int'], ['Cân lần 2','Cân lần 2','int'],
  ['KL hàng (KG)','Khối lượng (KG)','int'], ['Đơn giá_TC','Đơn giá','money'], ['Thành tiền','Thành tiền','money'], ['ĐL','Đại lý','text'], ['NG','Nguồn gốc','text']
];
export const XECHO_COLS = [ ['TT','TT','int'], ['So_CT','Số CT','text'], ['Mã hàng','Mã hàng','text'], ['Khách hàng','Khách hàng','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['KL hàng (KG)','Khối lượng (KG)','int'], ['Thời gian chờ','Thời gian chờ','text'] ];
export const THANHTOAN_COLS = [ ['STT','STT','int'], ['Ngày thanh toán','Ngày thanh toán','date'], ['Số hợp đồng','Số hợp đồng','text'], ['Họ tên Chủ rừng','Chủ rừng','text'],
  ['Người nhận tiền','Người nhận tiền','text'], ['Số TK nhận tiền','Số TK','text'], ['Số CT','Số CT','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['Cân lần 1','Cân lần 1','int'], ['Cân lần 2','Cân lần 2','int'],
  // [BUGFIX 2026-09-22] "Khối lượng" ở đây lấy từ DNTT_CT — đơn vị THẬT là TẤN (kiểm chứng bằng
  // Đơn giá = Thành tiền/Khối lượng ra ~1,5 triệu đồng/tấn gỗ keo, đúng giá thị trường; nếu là
  // KG thì giá sẽ vô lý ~1,5 triệu/kg). Nhãn cũ "(KG)" + kiểu 'int' (làm tròn số nguyên, mất số
  // lẻ như 257.17) là SAI — đổi lại "(tấn)" + kiểu 'kl' (2 số lẻ), khớp đúng cách hiển thị đã
  // dùng cho cùng loại dữ liệu này ở báo cáo "Tổng hợp" (cột 'Khối lượng thanh toán (tấn)').
  ['Khối lượng','Khối lượng (tấn)','kl'], ['Đơn giá thanh toán','Đơn giá TT','money'], ['Thành tiền','Thành tiền','money'] ];
export const CONGNO_COLS = [ ['STT','STT','int'], ['So_CT','Số CT','text'], ['Khách hàng','Khách hàng','text'], ['Số hợp đồng','Số hợp đồng','text'], ['Mã hàng','Mã hàng','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['Cân lần 1','Cân lần 1','int'], ['Cân lần 2','Cân lần 2','int'],
  ['KL hàng (KG)','Khối lượng (KG)','int'], ['Đơn giá_TC','Đơn giá','money'], ['Thành tiền','Thành tiền','money'], ['ĐL','Đại lý','text'], ['NG','Nguồn gốc','text'] ];
export const HOTRO_COLS = [ ['STT','STT','int'], ['So_CT','Số CT','text'], ['Khách hàng','Khách hàng','text'], ['Mã hàng','Mã hàng','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['Cân lần 1','Cân lần 1','int'], ['Cân lần 2','Cân lần 2','int'],
  ['Khối lượng_Tấn','Khối lượng (tấn)','kl'], ['Hỗ trợ','Mức hỗ trợ/tấn','money'], ['Tiền hỗ trợ','Tiền hỗ trợ','money'], ['ĐL','Đại lý','text'], ['NG','Nguồn gốc','text'] ];
export const TROGIA_COLS = [ ['STT','STT','int'], ['So_CT','Số CT','text'], ['Khách hàng','Khách hàng','text'], ['Mã hàng','Mã hàng','text'],
  ['Ngày cân 1','Ngày cân 1','date'], ['Giờ cân 1','Giờ cân 1','time'], ['Ngày cân 2','Ngày cân 2','date'], ['Giờ cân 2','Giờ cân 2','time'],
  ['Biển số 1','Biển số 1','text'], ['Cân lần 1','Cân lần 1','int'], ['Cân lần 2','Cân lần 2','int'],
  ['Khối lượng_Tấn','Khối lượng (tấn)','kl'], ['Hỗ trợ','Mức trợ giá/tấn','money'], ['Tiền trợ giá','Tiền trợ giá','money'], ['ĐL','Đại lý','text'], ['NG','Nguồn gốc','text'] ];
export const TONGHOPTRO_COLS = [ ['STT','STT','int'], ['Biển số 1','Biển số','text'], ['Từ ngày','Từ ngày','datekey'], ['Đến ngày','Đến ngày','datekey'],
  ['Số chuyến','Số chuyến','int'], ['Khối lượng_Tấn','Khối lượng (tấn)','kl'], ['Đơn giá hỗ trợ','Đơn giá hỗ trợ','money'],
  ['Tiền hỗ trợ','Tiền hỗ trợ','money'], ['Khấu trừ thuế TNCN','Khấu trừ thuế TNCN','money'], ['Còn thanh toán','Còn thanh toán','money'] ];
export const HOAHONG_COLS = [ ['STT','STT','int'], ['Tên Đại lý','Đại lý','text'], ['Từ ngày','Từ ngày','datekey'], ['Đến ngày','Đến ngày','datekey'],
  ['Khối lượng thanh toán','Khối lượng (KG)','kl'], ['Hoa hồng','Đơn giá hoa hồng','money'], ['Tiền hoa hồng','Tiền hoa hồng','money'] ];
export const TONGHOP_COLS = [ ['Ngày','Ngày','date'], ['Giá trị nhập','Giá trị nhập','money'], ['Khối lượng nhập','Khối lượng nhập (tấn)','kl'],
  ['Giá trị thanh toán','Giá trị thanh toán','money'], ['Khối lượng thanh toán','Khối lượng thanh toán (tấn)','kl'] ];
// [BỔ SUNG 2026-09-22] Thêm "Tàu"/"Khách hàng xuất" (gán tay, xem services/tau-assignment.js) —
// theo yêu cầu "BKLS chi tiết, tổng hợp muốn nhóm theo Tàu, Khách hàng". Đặt ngay sau "Số BKLS"
// để dễ thấy/lọc/sắp xếp (bảng dùng chung renderer report-table.js đã hỗ trợ sort/tìm theo mọi
// cột — không cần code thêm gì để "lọc theo tàu": gõ tên tàu vào ô tìm kiếm của bảng là ra).
export const BKLSCT_COLS = [ ['STT','STT','int'], ['Số BKLS','Số BKLS','text'], ['Tàu','Tàu','text'], ['Khách hàng xuất','Khách hàng xuất','text'], ['Ngày BKLS','Ngày BKLS','date'],
  ['Họ và tên người bán','Họ và tên người bán','text'], ['Số CCCD','Số CCCD','text'], ['Tên nguyên liệu','Tên nguyên liệu','text'],
  ['Địa điểm khai thác','Địa điểm khai thác','text'], ['Khối lượng (Tấn)','Khối lượng (Tấn)','kl'], ['Mã hợp đồng','Mã hợp đồng','text'],
  ['Nhà máy','Nhà máy','text'], ['Đơn giá','Đơn giá','money'], ['Thanh toán','Thanh toán','money'], ['Địa chỉ thường trú','Địa chỉ thường trú','text'] ];
export const BKLSTH_COLS = [ ['STT','STT','int'], ['Tàu','Tàu','text'], ['Khách hàng xuất','Khách hàng xuất','text'], ['Ngày nhập','Ngày nhập','date'], ['Họ và tên người bán','Họ và tên người bán','text'],
  ['Địa chỉ thường trú','Địa chỉ thường trú','text'], ['Số CCCD','Số CCCD','text'], ['Tên nguyên liệu','Tên nguyên liệu','text'],
  ['Mã HS','Mã HS','text'], ['Địa điểm khai thác','Địa điểm khai thác','text'], ['Khối lượng_Tấn','Khối lượng (tấn)','kl'],
  ['Đơn giá','Đơn giá','money'], ['Tổng trị giá','Tổng trị giá','money'] ];
/** [MỚI 2026-09-22] Báo cáo tổng hợp nguyên liệu xuất theo tàu — xem computeTauTongHop(). */
export const TAUTONGHOP_COLS = [ ['STT','STT','int'], ['Tàu','Tàu','text'], ['Khách hàng xuất','Khách hàng xuất','text'],
  ['Số dòng BKLS','Số dòng BKLS','int'], ['Khối lượng_Tấn','Khối lượng (tấn)','kl'], ['Tổng thanh toán','Tổng thanh toán','money'],
  ['Ngày gán gần nhất','Ngày gán gần nhất','text'] ];
/* [Báo cáo ngân hàng] */
export const BANKVAY_COLS = [ ['STT','STT','int'], ['Ngày chung','Ngày chung','date'], ['Ngày hạch toán','Ngày hạch toán','date'],
  ['Ngày chứng từ','Ngày chứng từ','date'], ['Tổng tiền vay','Tổng tiền vay','money'], ['Ngày thanh toán','Ngày thanh toán','date'],
  ['Số tấn','Số tấn','kl'], ['Tổng tiền chi','Tổng tiền chi','money'], ['Họ tên Chủ rừng','Họ tên Chủ rừng','text'],
  ['Chênh lệch','Chênh lệch','money'], ['Lũy kế tiền vay chi','Lũy kế tiền vay chi','money'] ];
export const BANKTNDN_COLS = [ ['STT','STT','int'], ['Ngày tháng năm mua hàng','Ngày mua hàng','date'], ['Tên người bán','Tên người bán','text'],
  ['Địa chỉ','Địa chỉ','text'], ['Số CCCD','Số CCCD','text'], ['Số Điện thoại','Số điện thoại','text'],
  ['Tên hàng hóa/dịch vụ','Tên hàng hóa/dịch vụ','text'], ['Số lượng/trọng lượng','Số lượng/trọng lượng','kl'],
  ['Đơn giá','Đơn giá','money'], ['Tổng giá thanh toán','Tổng giá thanh toán','money'], ['Ghi chú','Ghi chú','text'] ];
export const BANKPNK_COLS = [ ['STT','STT','int'], ['Ngày nhập kho','Ngày nhập kho','date'], ['Khối lượng','Khối lượng (Tấn)','kl'],
  ['Đơn giá thanh toán','Đơn giá thanh toán','money'], ['Thành tiền','Thành tiền','money'], ['Số tiền bằng chữ','Số tiền bằng chữ','text'],
  ['Số CT','Số CT','text'] ];

/** Danh sách key của 14 báo cáo, dùng cho export "Xuất tất cả" và điều hướng In/PDF chung. */
export const REPORT_KEYS = ['nhapkeo','thanhtoan','congno','xecho','tonghop','hotro','trogia','tonghoptro','hoahong','bklsct','bklsth','tautonghop','tienvay','tndn','pnk'];

/** Tiêu đề in đúng theo tên báo cáo trong file Excel mẫu (BaoCaoNgay_DH_*.xlsx). */
export const REPORT_TITLES = {
  nhapkeo: 'BẢNG KÊ CHI TIẾT NHẬP GỖ KEO',
  thanhtoan: 'BẢNG KÊ CHI TIẾT THANH TOÁN GỖ KEO',
  congno: 'BẢNG KÊ CHI TIẾT CÔNG NỢ GỖ KEO',
  xecho: 'BẢNG KÊ XE NHẬP KEO THỜI GIAN XUỐNG HÀNG TRÊN 1H',
  tonghop: 'BẢNG TỔNG HỢP NHẬP XUẤT VÀ THANH TOÁN GỖ KEO',
  hotro: 'BẢNG KÊ CHI TIẾT TIỀN HỖ TRỢ TÀI XẾ CUỐI THÁNG',
  trogia: 'BẢNG KÊ CHI TIẾT HỖ TRỢ GIÁ THANH TOÁN VÀO GIÁ MUA',
  tonghoptro: 'BẢNG TỔNG HỢP THANH TOÁN TIỀN HỖ TRỢ TÀI XẾ',
  hoahong: 'BẢNG TỔNG HỢP HOA HỒNG ĐẠI LÝ',
  bklsct: 'BẢNG KÊ LÂM SẢN XUẤT KHẨU — CHI TIẾT',
  bklsth: 'BẢNG KÊ LÂM SẢN XUẤT KHẨU — TỔNG HỢP',
  tautonghop: 'BÁO CÁO TỔNG HỢP NGUYÊN LIỆU XUẤT THEO TÀU',
  tienvay: 'SỔ CHI TIẾT TIỀN VAY',
  tndn: 'BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ KHÔNG CÓ HÓA ĐƠN (MẪU 02/TNDN)',
  // "BẢNG KÊ PHIẾU NHẬP KHO" chỉ dùng cho In/PDF/Excel chung (bảng liệt kê) — khác với tiêu đề
  // "PHIẾU NHẬP KHO" hardcode riêng trong export-service (mẫu 01-VT in từng ngày) — cố ý, không phải lỗi.
  pnk: 'BẢNG KÊ PHIẾU NHẬP KHO'
};
