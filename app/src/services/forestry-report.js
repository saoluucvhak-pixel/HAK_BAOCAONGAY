// Công thức kiểm lâm theo Power Query trong BaoCaoKiemLam_DH.xlsx.
import { normalizeForestryModel } from '../config/forestry-defaults.js';

const DAY_MS = 86400000;

function formatKeyDate(value) {
  const key = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(key + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === key ? key : '';
}

function csvDate(value) {
  const text = String(value ?? '').trim();
  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!usDate) return formatKeyDate(text);
  const [, month, day, year] = usDate;
  return formatKeyDate([year, month.padStart(2, '0'), day.padStart(2, '0')].join('-'));
}

function csvNumber(value) {
  const text = String(value ?? '').trim();
  if (/^[+-]?\d{1,3}(,\d{3})+(?:\.\d+)?%?$/.test(text)) return csvNumber(text.replaceAll(',', ''));
  if (!/^[+-]?\d+(?:[.,]\d+)?%?$/.test(text)) return NaN;
  return Number(text.replace('%', '').replace(',', '.')) / (text.endsWith('%') ? 100 : 1);
}

export const FORESTRY_SOURCES = {
  intake: { label: 'HoSoKeo_DN', dates: ['Ngày nhập'], fields: ['Ngày nhập', 'Khối lượng (Tấn)'], numbers: ['Khối lượng (Tấn)'] },
  dispatch: { label: 'NL_PC_XH', dates: ['Ngày xuất'], fields: ['Ngày xuất', 'Khối lượng (Tấn)', 'SỐ TKHQ'], numbers: ['Khối lượng (Tấn)'] },
  orders: { label: 'NL_DH_XB', dates: ['Ngày đơn hàng'], fields: ['Ngày đơn hàng', 'SỐ TKHQ', 'KL_BDMT', 'ĐƠN GIÁ (USD)'], numbers: ['STT', 'KL_BDMT', 'ĐƠN GIÁ (USD)', 'ĐỘ KHÔ', 'ĐỘ KHÔ NHÀ MÁY'] },
};

const monthsPerPeriod = { M: 1, Q: 3, '6T': 6, Y: 12 };

export function forestryPeriodRange(kind, year, index = 1) {
  const months = monthsPerPeriod[kind];
  if (!Number.isInteger(months) || !Number.isInteger(year) || year < 1900 || year > 9999 ||
      !Number.isInteger(index) || index < 1 || index > 12 / months) return null;
  const month = (index - 1) * months;
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + months, 0)).toISOString().slice(0, 10),
  };
}

export function validateForestryPeriod(from, to) {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (!formatKeyDate(from) || !formatKeyDate(to) || days < 1 || days > 999) {
    throw new Error('Chọn kỳ báo cáo hợp lệ từ 1 đến 999 ngày.');
  }
  return days;
}

export function normalizeForestrySheet(source, headers, rows) {
  const missing = source.fields.filter(field => !headers.includes(field));
  if (missing.length) throw new Error(source.label + ' thiếu cột: ' + missing.join(', '));
  return rows.map((row, index) => {
    const normalized = { ...row };
    for (const field of source.dates) {
      if (!row[field] && !source.fields.includes(field)) continue;
      normalized[field] = csvDate(row[field]);
      if (!normalized[field]) throw new Error(source.label + ', dòng dữ liệu ' + (index + 1) + ': ' + field + ' phải có dạng YYYY-MM-DD hoặc MM/DD/YYYY.');
    }
    for (const field of source.numbers ?? []) {
      const value = row[field];
      if (!value && !source.fields.includes(field)) continue;
      normalized[field] = csvNumber(value);
      if (!Number.isFinite(normalized[field])) {
        throw new Error(source.label + ', dòng dữ liệu ' + (index + 1) + ': kiểm tra định dạng số ở cột ' + field + '.');
      }
    }
    return normalized;
  });
}

function groupByDate(rows, field) {
  const groups = Object.create(null);
  for (const row of rows) (groups[row[field]] ??= []).push(row);
  return groups;
}

export function buildForestryReports({ calendar, settings, intake, dispatch, orders }, { from, to, opening, selected, commodityCode = '' }) {
  const days = validateForestryPeriod(from, to);
  if (!Number.isFinite(opening)) throw new Error('Nhập tồn đầu kỳ hợp lệ.');
  const parameters = settings.filter(row => row['Mẫu']).map(row => ({ ...row, 'Mẫu': normalizeForestryModel(row['Mẫu']) }));
  if (!parameters.length) throw new Error('Thamso_RPKL chưa có dòng cấu hình Mẫu.');
  const matchingCalendar = calendar.filter(row => row['Ngày trong năm'] >= from && row['Ngày trong năm'] <= to);
  const codes = new Set(parameters.map(row => row['Mẫu']));
  let dates = matchingCalendar.map(row => ({ ...row, 'Mẫu': normalizeForestryModel(row['Mẫu']) }));
  const defaultCode = codes.has('MAU04') ? 'MAU04' : codes.size === 1 ? parameters[0]['Mẫu'] : '';
  if (!dates.length && defaultCode) {
    dates = Array.from({ length: days }, (_, index) => ({
      'Ngày trong năm': new Date(Date.parse(from) + index * DAY_MS).toISOString().slice(0, 10),
      'Mẫu': defaultCode,
    }));
  }
  if (new Set(dates.map(row => row['Ngày trong năm'])).size !== days ||
      dates.length !== days || dates.some(row => !codes.has(row['Mẫu']))) {
    throw new Error('Lịch tham số cần đúng một dòng có mã Mẫu hợp lệ cho mỗi ngày trong kỳ.');
  }
  if (new Set(dates.map(row => row['Mẫu'])).size > 1) {
    throw new Error('Kỳ có nhiều mã Mẫu. Chọn kỳ chỉ có một mã để nhập đúng tồn đầu kỳ.');
  }
  dates.sort((a, b) => a['Ngày trong năm'].localeCompare(b['Ngày trong năm']));
  const orderByDeclaration = Object.create(null);
  for (const order of orders) orderByDeclaration[order['SỐ TKHQ']] ??= order;
  const inPeriod = row => row['Ngày xuất'] >= from && row['Ngày xuất'] <= to;
  if (dispatch.some(row => inPeriod(row) && (!row['SỐ TKHQ'] || !orderByDeclaration[row['SỐ TKHQ']]))) {
    throw new Error('NL_PC_XH có phiếu trong kỳ chưa khớp tờ khai trong NL_DH_XB.');
  }
  const activeCode = dates[0]['Mẫu'];
  const applicable = parameters.filter(row => row['Mẫu'] === activeCode);
  const ledger = buildStockLedger(
    dates, applicable, groupByDate(intake, 'Ngày nhập'), groupByDate(dispatch, 'Ngày xuất'),
    orderByDeclaration, opening,
  );
  const exportParameters = parameters.find(row => row['Mẫu'] === 'MAU14') ?? applicable[0];
  const models = selected.flatMap(key => key === 'M04_14' ? ['M04', 'M14'] : [key]);
  return [...new Set(models)].map(key => {
    if (key === 'M04') return dailyReport(ledger);
    if (key === 'M14') return {
      ...exportReport(orders, exportParameters, from, to, commodityCode),
      closing: ledger.at(-1).closing,
    };
    return periodReport(ledger, key, to);
  });
}

// QR_NHAP / QR_XUAT / QR_CLKHO / QR_TONKHO. Giữ số gốc trong sổ tính và
// dùng cùng số tồn cho mọi mẫu. Làm tròn chỉ ở phần hiển thị và định dạng in.
function buildStockLedger(dates, settings, intakeByDate, dispatchByDate, declarations, initialStock) {
  let stock = initialStock;
  return dates.map(row => {
    const date = row['Ngày trong năm'];
    const parameters = settings.find(item =>
      (!item['Từ ngày'] || item['Từ ngày'] <= date) && (!item['Đến ngày'] || item['Đến ngày'] >= date));
    if (!parameters) throw new Error('Thamso_RPKL thiếu định mức có hiệu lực ngày ' + date + '.');

    const intake = (intakeByDate[date] ?? [{}]).map(source => ({
      source, consumption: (source['Khối lượng (Tấn)'] ?? 0) * (Number(parameters['Tiêu hao SX']) || 0),
    }));
    const dispatch = (dispatchByDate[date] ?? [{}]).map(source => {
      const order = declarations[source['SỐ TKHQ']] ?? {};
      const mass = source['Khối lượng (Tấn)'] ?? 0;
      const factoryDry = order['ĐỘ KHÔ NHÀ MÁY'];
      // Power Query trả null khi thiếu độ khô nhà máy hoặc mẫu số bằng 0.
      // QR_THNX quy null về 0 khi tính tổng tiêu hao.
      const consumption = factoryDry ? (mass * (order['ĐỘ KHÔ'] ?? 0)) / factoryDry - mass : 0;
      return { source, consumption };
    });
    const sumMass = rows => rows.reduce((sum, movement) => sum + (movement.source['Khối lượng (Tấn)'] ?? 0), 0);
    const incoming = sumMass(intake);
    const outgoing = sumMass(dispatch);
    const consumption = [...intake, ...dispatch].reduce((sum, movement) => sum + movement.consumption, 0);
    const opening = stock;
    stock += incoming - outgoing - consumption;
    return { date, parameters, intake, dispatch, incoming, outgoing, consumption, opening, closing: stock };
  });
}

function dailyReport(ledger) {
  const headers = [
    'Lâm sản tồn đầu kỳ', 'Ngày, tháng, năm', 'Tên tiếng Việt/Tên thương mại', 'Tên khoa học',
    '.Số hiệu, nhãn đánh dấu', '.Đơn vị tính', '.Loài nguy cấp, quý, hiếm; CITES', '.Loài thông thường',
    'Hồ sơ kèm theo lâm sản nhập', 'Ngày, tháng, năm.', 'Số bảng kê lâm sản xuất ra', 'Loài nguy cấp, quý,hiếm;CITES',
    'Loài thông thường', 'Hồ sơ lâm sản xuất kèm theo', 'Ước tính nguyên liệu tiêu hao (nếu có)',
    'Lâm sản tồn cuối kỳ', 'Ghi chú', 'Xác nhận lâm sản tồn', 'LOC_THÁNG',
  ];
  // RP_MAU04 nối dòng nhập và dòng xuất riêng; giữ nguyên thứ tự trong từng nguồn.
  const incoming = [];
  const outgoing = [];
  for (const day of ledger) {
    const { parameters: p, date } = day;
    const name = p['Tên tiếng Việt/Tên thương mại'] || p['Tên thông thường'] || 'Dăm gỗ keo';
    const scientific = p['Tên khoa học'] || 'Acacia mangium';
    const month = date.slice(5, 7) + '/' + date.slice(0, 4);
    for (const { source, consumption } of day.intake) {
      const document = source['Số BKLS'];
      const owner = source['Họ và tên chủ rừng'] ?? source['Họ và tên Chủ rừng'];
      const reference = document || owner ? [p['Diễn giải hồ sơ nhập'], document, owner].filter(Boolean).join(' ') : '';
      incoming.push([
        day.opening, date, name, scientific, p['Số hiệu, nhãn đánh dấu'] ?? '',
        p['Đơn vị tính (MT)'] || 'Tấn', p['Loài nguy cấp Quý hiếm'] ?? '',
        source['Khối lượng (Tấn)'] ?? '', reference, date, '', '', '', '',
        consumption, day.closing, '', '', month,
      ]);
    }
    for (const { source, consumption } of day.dispatch) {
      const document = source['Số BKLS'] ?? '';
      const reference = document ? [p['Diễn giải hồ sơ xuất'], document].filter(Boolean).join(' ') : '';
      outgoing.push([
        day.opening, date, name, scientific, '', '', '', '', '', date, document,
        p['Loài nguy cấp Quý hiếm'] ?? '', source['Khối lượng (Tấn)'] ?? '', reference,
        consumption, day.closing, p['Ghi chú'] ?? '', '', month,
      ]);
    }
  }
  return { name: 'RP_MAU04', headers, rows: incoming.concat(outgoing) };
}

function exportReport(orders, p, from, to, commodityCode) {
  const headers = ['STT', 'SỐ TKHQ', 'TÊN HH_TKHQ', 'Tên thông thường', 'Tên khoa học',
    'Đơn vị tính (MT)', 'Khối lượng NK', 'Trị giá NK (USD)', 'Đơn vị tính (BDMT)', 'KL_BDMT', 'Trị giá (USD)', 'Mã số hàng hóa'];
  const rows = orders.filter(row => row['Ngày đơn hàng'] >= from && row['Ngày đơn hàng'] <= to)
    .map((row, index) => [
      row.STT || index + 1, row['SỐ TKHQ'],
      p['TÊN HH_TKHQ'] || p['Tên thông thường'] || 'Dăm gỗ keo',
      p['Tên thông thường'] || 'Dăm gỗ keo', p['Tên khoa học'] || 'Acacia mangium',
      p['Đơn vị tính (MT)'] || 'Tấn', p['Khối lượng NK'] ?? '', p['Trị giá NK (USD)'] ?? '',
      p['Đơn vị tính (BDMT)'] || 'BDMT', row.KL_BDMT,
      row['ĐƠN GIÁ (USD)'] * row.KL_BDMT,
      p['Mã số hàng hóa'] || commodityCode,
    ]);
  return { name: 'RP_MAU14', headers, rows };
}

const PERIODS = {
  M: { suffix: ['LOC_THÁNG', 'Ngày báo cáo', 'Tháng báo cáo', 'Năm báo cáo'], group: (year, month) => [
    String(month).padStart(2, '0') + '/' + year, month, year,
  ] },
  Q: { suffix: ['LOC_QUÝ', 'Ngày báo cáo', 'Quý báo cáo', 'Năm báo cáo'], group: (year, month) => {
    const quarter = Math.ceil(month / 3);
    return ['Q' + quarter + '/' + year, quarter, year];
  } },
  '6T': { suffix: ['LOC_6T', 'Ngày báo cáo', 'Thời điểm báo cáo', 'Năm báo cáo'], group: (year, month) => {
    const half = month <= 6 ? 1 : 2;
    return ['6T' + half + '/' + year, half, year];
  } },
  CUSTOM: { suffix: ['LOC_KỲ', 'Ngày báo cáo'], group: () => ['Tùy chọn'] },
  Y: { suffix: ['LOC_Y', 'Ngày báo cáo'], group: year => [year] },
};

function periodReport(ledger, kind, to) {
  const period = PERIODS[kind];
  const groups = new Map();
  for (const day of ledger) {
    const [year, month] = day.date.split('-').map(Number);
    const [label, ...extra] = period.group(year, month);
    if (!groups.has(label)) {
      groups.set(label, { opening: day.opening, incoming: 0, outgoing: 0, consumption: 0, extra, parameters: day.parameters });
    }
    const group = groups.get(label);
    group.incoming += day.incoming;
    group.outgoing += day.outgoing;
    group.consumption += day.consumption;
    group.hasIntake ||= day.intake.some(({ source }) => source['Khối lượng (Tấn)'] != null);
    group.hasDispatch ||= day.dispatch.some(({ source }) => source['Khối lượng (Tấn)'] != null);
    group.closing = day.closing;
  }
  const headers = ['TT', 'Tên lâm sản', 'Nhóm loài (thông thường; nguy cấp, quý, hiếm; Phụ lục CITES)',
    'Đơn vị tính', 'Tồn kho đầu kỳ', 'Nhập trong kỳ', 'Tổng cộng', 'Lâm sản xuất ra', 'Tồn kho cuối kỳ',
    ...period.suffix];
  const rows = Array.from(groups, ([label, group], index) => {
    const p = group.parameters;
    // List.Sum trên cột toàn null trả null. Mẫu 29 quy giá trị kết quả null về 0.
    const available = group.hasIntake ? group.opening + group.incoming : 0;
    const issued = group.hasDispatch ? group.outgoing + group.consumption : 0;
    return [
      index + 1, p['TÊN HH_TKHQ'] || p['Tên thông thường'] || 'Dăm gỗ keo',
      p['Loài nguy cấp Quý hiếm'] || p['Nhóm loài'] || 'Loài thông thường',
      p['Đơn vị tính (MT)'] || 'Tấn', group.opening, group.incoming, available,
      issued, group.closing, label, to, ...group.extra,
    ];
  });
  return { name: 'RP_MAU29_' + kind, headers, rows };
}
