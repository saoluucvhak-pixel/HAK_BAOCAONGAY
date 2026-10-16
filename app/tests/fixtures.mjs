// Synthetic CSV fixtures matching the real Google Sheet column headers, used to drive the
// UI end-to-end without hitting the real network (blocked in this sandbox, and undesirable
// for a repeatable/offline regression suite anyway).
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => csvEscape(r[h])).join(',')));
  return lines.join('\n');
}

function randDate() {
  const y = 2024 + Math.floor(Math.random() * 2);
  const mo = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return `${d}/${mo}/${y}`;
}
function randTime() { return `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const dlNames = ['DL01', 'DL02', 'DL03'];
const ngList = ['NG01', 'NG02'];
const khNames = ['Cty A', 'Cty B', 'Cty C'];

export function genPhieuCan(n = 40) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      'So_CT': 'CT' + String(i).padStart(4, '0'), 'Mã hàng': 'MH' + (i % 3), 'Khách hàng': pick(khNames),
      'Ngày cân 1': randDate(), 'Giờ cân 1': randTime(), 'Ngày cân 2': randDate(), 'Giờ cân 2': randTime(),
      'Biển số 1': '51C-' + (10000 + (i % 15)), 'Biển số 2': '51C-' + (20000 + (i % 15)),
      'Cân lần 1': (10000 + Math.random() * 5000).toFixed(0), 'Cân lần 2': (5000 + Math.random() * 3000).toFixed(0),
      'KL hàng (KG)': (Math.random() * 8000).toFixed(0), 'Đơn giá_TC': (Math.random() * 2000).toFixed(0),
      'Thành tiền': (Math.random() * 50000000).toFixed(0), 'ĐL': pick(dlNames), 'NG': pick(ngList),
    });
  }
  return rows;
}

export function genDNTT(phieucan, n = 15) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const pc = pick(phieucan);
    rows.push({
      'Ngày thanh toán': randDate(), 'Số hợp đồng': 'HD' + i, 'Họ tên Chủ rừng': 'CR' + i,
      'Người nhận tiền': 'NT' + i, 'Số TK nhận tiền': '00' + i, 'Số CT': pc['So_CT'],
      'Khối lượng': (Math.random() * 8000).toFixed(0), 'Đơn giá thanh toán': (Math.random() * 2000).toFixed(0),
      'Thành tiền': (Math.random() * 50000000).toFixed(0),
    });
  }
  return rows;
}

export function genHDNCC(dntt) {
  return dntt.map((r) => ({
    'Số hợp đồng': r['Số hợp đồng'], 'Họ tên Chủ rừng': r['Họ tên Chủ rừng'],
    'Địa chỉ thường trú': 'Xã X, Huyện Y, Quảng Nam',
  }));
}

export function genHosokeo(n = 10) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      'Mã hợp đồng': 'HD' + i, 'Ngày nhập': randDate(), 'Số BKLS': 'BKLS' + i,
      'Họ và tên chủ rừng': 'CR' + i, 'Mã khách hàng': 'KH' + i, 'ĐỊA CHỈ RỪNG': 'Rừng ' + i,
      'Khối lượng (Tấn)': (Math.random() * 50).toFixed(2), 'Đơn giá': (Math.random() * 2000000).toFixed(0),
      'Thanh toán': (Math.random() * 50000000).toFixed(0),
    });
  }
  return rows;
}
