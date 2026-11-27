// Chỉ các cột in trên biểu mẫu. Các cột tra cứu nội bộ vẫn dùng trong bảng xem trước.
const col = (column, text, across = 1, down = 1) => ({ column, text, across, down });

const M04 = {
  number: '04', description: 'Sổ theo dõi nhập, xuất lâm sản',
  title: 'SỔ THEO DÕI NHẬP, XUẤT LÂM SẢN', unit: 'TÊN ĐƠN VỊ LẬP SỔ',
  landscape: true,
  widths: [9, 12, 12, 9, 9, 8, 12, 10, 13, 11, 11, 11, 10, 13, 11, 9, 8, 9],
  heights: [19, 20, 93],
  headers: [
    [col(0, 'Lâm sản tồn đầu kỳ (1)', 1, 3), col(1, 'Lâm sản nhập trong kỳ', 8),
      col(9, 'Lâm sản xuất ra trong kỳ', 6), col(15, 'Lâm sản tồn cuối kỳ (2)', 1, 3),
      col(16, 'Ghi chú', 1, 3), col(17, 'Xác nhận (3)', 1, 3)],
    [col(1, 'Ngày, tháng, năm', 1, 2), col(2, 'Tên lâm sản', 2),
      col(4, 'Số hiệu, nhãn đánh dấu', 1, 2), col(5, 'Đơn vị tính', 1, 2),
      col(6, 'Khối lượng', 2), col(8, 'Hồ sơ kèm theo lâm sản nhập', 1, 2),
      col(9, 'Ngày, tháng, năm', 1, 2), col(10, 'Số bảng kê lâm sản xuất ra', 1, 2),
      col(11, 'Khối lượng', 2), col(13, 'Hồ sơ xuất lâm sản kèm theo', 1, 2),
      col(14, 'Ước tính nguyên liệu tiêu hao (nếu có)', 1, 2)],
    [col(2, 'Tên tiếng Việt/tên thương mại'), col(3, 'Tên khoa học'),
      col(6, 'Loài nguy cấp, quý, hiếm; CITES'), col(7, 'Loài thông thường'),
      col(11, 'Loài nguy cấp, quý, hiếm; CITES'), col(12, 'Loài thông thường')],
  ],
  signatures: ['CHỦ ĐƠN VỊ LẬP SỔ', 'NGƯỜI GHI SỔ (4)'],
  signatureNotes: ['(Ký, ghi rõ họ tên, đóng dấu đối với tổ chức)', ''],
  notes: [
    '(1) Ghi thông tin lâm sản có ở đầu kỳ theo dõi.',
    '(2) Ghi thông tin lâm sản có ở cuối kỳ theo dõi.',
    '(3) Đại diện cơ quan Kiểm lâm sở tại đối chiếu khối lượng lâm sản tồn; ghi ngày, tháng, năm xác nhận khối lượng lâm sản tồn và ký, ghi rõ họ tên.',
    '(4) Ngày cuối của tháng, của năm: ghi tổng hợp số lượng, khối lượng từng loại lâm sản nhập, xuất, tồn kho trong tháng, trong năm và người ghi sổ, chủ đơn vị lập sổ ký xác nhận. Chủ lâm sản lưu theo dõi, quản lý.',
  ],
};

const M14 = {
  number: '14', description: '',
  title: 'TỔNG HỢP THÔNG TIN TÌNH HÌNH NHẬP KHẨU, XUẤT KHẨU GỖ',
  landscape: true,
  widths: [6, 14, 22, 16, 16, 11, 12, 13, 11, 12, 13],
  heights: [20, 46, 19],
  headers: [
    [col(0, 'STT', 1, 2), col(1, 'Mã số hàng hóa', 1, 2),
      col(2, 'Tên hàng khai báo/Mô tả hàng hóa', 1, 2), col(3, 'Tên loài gỗ', 2),
      col(5, 'Nhập khẩu', 3), col(8, 'Xuất khẩu', 3)],
    [col(3, 'Tên Việt Nam thường gọi'), col(4, 'Tên khoa học'), col(5, 'Đơn vị tính'),
      col(6, 'Số lượng'), col(7, 'Trị giá (USD)'), col(8, 'Đơn vị tính'),
      col(9, 'Số lượng'), col(10, 'Trị giá (USD)')],
    Array.from({ length: 11 }, (_, i) => col(i, '(' + (i + 1) + ')')),
  ],
  signatures: ['NGƯỜI LẬP BẢNG', 'THỦ TRƯỞNG CƠ QUAN'],
  signatureNotes: ['', ''],
};

const M29 = {
  number: '29', description: 'Báo cáo tình hình nhập, xuất lâm sản',
  title: 'BÁO CÁO NHẬP, XUẤT LÂM SẢN', unit: 'ĐƠN VỊ BÁO CÁO',
  landscape: false,
  widths: [6, 17, 23, 10, 14, 14, 13, 13, 14],
  heights: [20, 97],
  headers: [
    [col(0, 'TT', 1, 2), col(1, 'Tên lâm sản', 1, 2),
      col(2, 'Nhóm loài (thông thường; nguy cấp, quý, hiếm; Phụ lục CITES)', 1, 2),
      col(3, 'Đơn vị tính', 1, 2), col(4, 'Lâm sản nhập vào', 3),
      col(7, 'Lâm sản xuất ra', 1, 2), col(8, 'Tồn kho cuối kỳ', 1, 2)],
    [col(4, 'Tồn kho đầu kỳ'), col(5, 'Nhập trong kỳ'), col(6, 'Tổng cộng')],
  ],
  signatures: ['THỦ TRƯỞNG ĐƠN VỊ', 'NGƯỜI LẬP BÁO CÁO'],
  signatureNotes: ['(Ký, ghi rõ họ tên, đóng dấu)', '(Ký, ghi rõ họ tên)'],
};

function displayDate(value) {
  return String(value).split('-').reverse().join('/');
}

function periodLabel(report, value, from, to) {
  const period = String(value);
  const [first, second] = period.split('/');
  const year = Number(second ?? first);
  let month = 1;
  let months = 12;
  let label = 'Năm ' + year;
  if (report.endsWith('_M')) {
    month = Number(first);
    months = 1;
    label = 'Tháng ' + month + ' năm ' + year;
  } else if (report.endsWith('_6T')) {
    month = first === '6T1' ? 1 : 7;
    months = 6;
    label = '06 tháng ' + (month === 1 ? 'đầu' : 'cuối') + ' năm ' + year;
  }
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + months - 1, 0)).toISOString().slice(0, 10);
  if (from <= start && to >= end) return label;
  return label + ' · ' + displayDate(from > start ? from : start) + ' – ' + displayDate(to < end ? to : end);
}

function exportRows14(rows, commodityCode) {
  const groups = new Map();
  for (const row of rows) {
    const product = [commodityCode, row[2], row[3], row[4], row[5], row[8]];
    const key = JSON.stringify(product);
    if (!groups.has(key)) groups.set(key, [groups.size + 1, ...product.slice(0, 5), '', '', product[5], 0, 0]);
    const total = groups.get(key);
    for (const index of [6, 7, 9, 10]) {
      if (typeof row[index] === 'number') total[index] = (total[index] || 0) + row[index];
    }
  }
  return [...groups.values()];
}

export function forestryPrintPages(reports, { from, to, company, commodityCode, bookNumber }) {
  const dateRange = 'Từ ngày ' + displayDate(from) + ' đến ngày ' + displayDate(to);
  return reports.flatMap(report => {
    if (report.name === 'RP_MAU04') {
      return [{ ...M04, name: report.name, company, period: dateRange,
        reference: 'Số sổ: ' + (bookNumber || '………') + ' / Năm lập: ' + from.slice(0, 4),
        rows: report.rows.map(row => row.slice(0, 18).map((value, index) => {
          if (index === 17) return '';
          return index === 1 || index === 9 ? displayDate(value) : value;
        })),
      }];
    }
    if (report.name === 'RP_MAU14') {
      const isFirst = from.endsWith('-01-01') && to.endsWith('-06-30');
      const isLast = from.endsWith('-07-01') && to.endsWith('-12-31');
      const sameYear = from.slice(0, 4) === to.slice(0, 4);
      const period = sameYear && (isFirst || isLast) ?
        '06 tháng ' + (isFirst ? 'đầu' : 'cuối') + ' năm ' + from.slice(0, 4) : dateRange;
      return [{ ...M14, name: report.name, company, period, rows: exportRows14(report.rows, commodityCode) }];
    }
    const periods = new Map();
    for (const row of report.rows) {
      if (!periods.has(row[9])) periods.set(row[9], []);
      periods.get(row[9]).push(row);
    }
    return [...periods].map(([period, rows]) => ({
      ...M29, company, name: report.name + '_' + String(period).replace('/', '-'),
      period: periodLabel(report.name, period, from, to),
      rows: rows.map((row, index) => [index + 1, ...row.slice(1, 9)]),
    }));
  });
}
