// Công thức chuyển từ main_hak/LamSan.gs (commit 4b9b858). Dữ liệu vào là CSV,
// dữ liệu ra là các bảng độc lập với Google Apps Script.
const DAY_MS = 86400000;

function localDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

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
  orders: { label: 'NL_DH_XB', dates: ['Ngày đơn hàng'], fields: ['Ngày đơn hàng', 'SỐ TKHQ', 'KL_BDMT', 'ĐƠN GIÁ (USD)'], numbers: ['KL_BDMT', 'ĐƠN GIÁ (USD)', 'ĐỘ KHÔ', 'ĐỘ KHÔ NHÀ MÁY', 'Khối lượng NK', 'Trị giá NK (USD)'] },
};

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

export function buildForestryReports({ calendar, settings, intake, dispatch, orders }, { from, to, opening, selected }) {
  const days = validateForestryPeriod(from, to);
  if (!Number.isFinite(opening)) throw new Error('Nhập tồn đầu kỳ hợp lệ.');
  const parameters = settings.filter(row => row['Mẫu']).map(row => ({ ...row, 'Mẫu': row['Mẫu'].toUpperCase() }));
  if (!parameters.length) throw new Error('Thamso_RPKL chưa có dòng cấu hình Mẫu.');
  const matchingCalendar = calendar.filter(row => row['Ngày trong năm'] >= from && row['Ngày trong năm'] <= to);
  const codes = new Set(parameters.map(row => row['Mẫu']));
  let dates = matchingCalendar.map(row => ({ ...row, 'Mẫu': row['Mẫu'].toUpperCase() }));
  const defaultCode = codes.has('MAU07') ? 'MAU07' : codes.size === 1 ? parameters[0]['Mẫu'] : '';
  if (!dates.length && defaultCode) {
    dates = Array.from({ length: days }, (_, index) => ({
      'Ngày trong năm': new Date(Date.parse(from) + index * DAY_MS).toISOString().slice(0, 10),
      'Mẫu': defaultCode,
    }));
  }
  if (new Set(dates.map(row => row['Ngày trong năm'])).size !== days ||
      dates.length !== days || dates.some(row => !codes.has(row['Mẫu']))) {
    throw new Error('Thamso_Ngay_MAU07 cần đúng một dòng có mã Mẫu hợp lệ cho mỗi ngày trong kỳ.');
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
  const data = {
    from, to, opening, defaultTS: applicable[0], exportParameters: parameters.find(row => row['Mẫu'] === 'MAU14') ?? applicable[0], data_TS_Ngay: dates, data_TS_Rp: applicable,
    data_DHXB: orders, hsKeoTheoNgay: groupByDate(intake, 'Ngày nhập'),
    pcxhTheoNgay: groupByDate(dispatch, 'Ngày xuất'), dhxbTheoTKHQ: orderByDeclaration,
  };
  return selected.flatMap(key => key === 'M04_14' ? _lsMau04Va14_(data) : [_lsMau29_(data, key)]);
}

function fnChenhLechDoKho(khoiLuong, doKhoPCXH, doKhoNhaMay) {
  var _khoiLuong = khoiLuong || 0;
  var _doKhoPCXH = doKhoPCXH || 0;
  var _doKhoNhaMay = doKhoNhaMay || 0;
  if (_doKhoNhaMay === 0) return 0;
  return ((_khoiLuong * _doKhoPCXH) / _doKhoNhaMay) - _khoiLuong;
}

function _lsTieuHaoDoKhoCuaPhieu_(D, rowPC) {
  var tkhqKey = rowPC['SỐ TKHQ'] ? String(rowPC['SỐ TKHQ']).trim() : '';
  var rowDHMatched = D.dhxbTheoTKHQ[tkhqKey] || {};
  var klXuatItem = Number(rowPC['Khối lượng (Tấn)']) || 0;
  return fnChenhLechDoKho(klXuatItem, Number(rowDHMatched['ĐỘ KHÔ']) || 0, Number(rowDHMatched['ĐỘ KHÔ NHÀ MÁY']) || 0);
}
function _lsTongKL_(list) {
  return list.reduce(function (sum, r) { return sum + (Number(r['Khối lượng (Tấn)']) || 0); }, 0);
}
function _lsMau04Va14_(D) {
  var defaultTS = D.exportParameters;

  // 1. CẤU HÌNH GỐC THEO MÃ HÀNG (MẪU) ĐỂ LẤY TÊN VÀ ĐỊNH MỨC
  var mapConfigGoc = {};
  D.data_TS_Rp.forEach(function (row) {
    var mauKey = row['Mẫu'] ? String(row['Mẫu']).trim().toUpperCase() : '';
    if (mauKey) {
      mapConfigGoc[mauKey] = {
        tonDauCauHinh: D.opening,
        tenTiengViet: row['Tên tiếng Việt/Tên thương mại'] || row['Tên thông thường'] || 'Dăm gỗ keo',
        tenKhoaHoc: row['Tên khoa học'] || 'Acacia mangium'
      };
    }
  });

  var thongTinTonLuyKeTheoMau = {};
  var daLayTonDauCauHinh = {};
  var tempAllProcessedData = [];

  D.data_TS_Ngay.forEach(function (rowSrc) {
    var ngayKey = formatKeyDate(rowSrc['Ngày trong năm']);
    var mauKey = rowSrc['Mẫu'] ? String(rowSrc['Mẫu']).trim().toUpperCase() : '';
    if (!ngayKey || !mauKey) return;

    var tsRepo = mapConfigGoc[mauKey];
    const effective = D.data_TS_Rp.find(row => (!row['Từ ngày'] || row['Từ ngày'] <= ngayKey) && (!row['Đến ngày'] || row['Đến ngày'] >= ngayKey));
    if (!effective) throw new Error('Thamso_RPKL thiếu định mức có hiệu lực ngày ' + ngayKey + '.');

    // 2. TỒN ĐẦU KỲ: chỉ bốc số dư cấu hình đúng 1 lần đầu tiên, sau đó lấy tồn cuối ngày trước
    var tonDauKyThucTe = 0;
    if (!daLayTonDauCauHinh[mauKey]) {
      tonDauKyThucTe = tsRepo.tonDauCauHinh;
      daLayTonDauCauHinh[mauKey] = true;
    } else {
      tonDauKyThucTe = thongTinTonLuyKeTheoMau[mauKey] || 0;
    }

    // --- Nhập trong ngày ---
    var mapHsKeoCuaNgay = D.hsKeoTheoNgay[ngayKey] || [];
    var klNhapTan = 0;
    var hoSoNhap = '';
    if (mapHsKeoCuaNgay.length > 0) {
      klNhapTan = _lsTongKL_(mapHsKeoCuaNgay);
      var countPhieuCan = 0, countBKLS = 0;
      var uniqueChuLamSan = {};
      mapHsKeoCuaNgay.forEach(function (r) {
        var pc = r['Số phiếu cân'] || r['SỐ PHIẾU CÂN'] || r['Số phiếu'] || r['Phiếu cân'] || '';
        var bk = r['Số BKLS'] || r['Số bảng kê'] || r['Số hiệu'] || '';
        var cls = r['Họ và tên chủ rừng'] || r['Chủ rừng'] || r['Chủ lâm sản'] || '';
        if (String(pc).trim() !== '' || String(bk).trim() !== '') countPhieuCan++;
        if (String(bk).trim() !== '') countBKLS++;
        if (String(cls).trim() !== '') uniqueChuLamSan[String(cls).trim()] = true;
      });
      hoSoNhap = countPhieuCan + ' số phiếu cân, ' + countBKLS + ' BKLS, ' + Object.keys(uniqueChuLamSan).length + ' Chủ lâm sản';
    }

    var tieuHaoSX_Calc = klNhapTan * effective['Tiêu hao SX'];

    // --- Xuất trong ngày ---
    var listPhieuXuatCuaNgay = D.pcxhTheoNgay[ngayKey] || [];
    var klXuatTanTong = 0, chenhLechXuatDoKhoTong = 0;
    var soBangKeXuat = '', hoSoXuatKem = '';
    if (listPhieuXuatCuaNgay.length > 0) {
      klXuatTanTong = _lsTongKL_(listPhieuXuatCuaNgay);
      if (klXuatTanTong !== 0) {
        var countXuatPhieuCan = 0, countXuatBKLS = 0;
        var listBKLS_Strings = [];
        var uniqueXeChay = {};
        listPhieuXuatCuaNgay.forEach(function (rowPC) {
          var pcXuat = rowPC['Số phiếu cân'] || rowPC['Số phiếu'] || rowPC['Phiếu cân'] || '';
          var bkXuat = rowPC['Số BKLS'] || rowPC['Số bảng kê'] || rowPC['Số hiệu'] || rowPC['SỐ TKHQ'] || '';
          var bksXe = rowPC['Biển số 1'] || rowPC['Số xe'] || rowPC['Biển số'] || '';
          if (String(pcXuat).trim() !== '') countXuatPhieuCan++;
          if (String(bkXuat).trim() !== '') {
            countXuatBKLS++;
            listBKLS_Strings.push(String(bkXuat).trim());
          }
          if (String(bksXe).trim() !== '') uniqueXeChay[String(bksXe).trim()] = true;
          chenhLechXuatDoKhoTong += _lsTieuHaoDoKhoCuaPhieu_(D, rowPC);
        });
        soBangKeXuat = listBKLS_Strings.filter(Boolean).join(', ');
        hoSoXuatKem = countXuatPhieuCan + ' số phiếu cân, ' + countXuatBKLS + ' BKLS, ' + Object.keys(uniqueXeChay).length + ' xe chạy và hóa đơn xuất bán';
      }
    }

    var tongNguyenLieuTieuHao = Number((tieuHaoSX_Calc + chenhLechXuatDoKhoTong).toFixed(3));
    var tonCuoiKyThucTe = Number((tonDauKyThucTe + klNhapTan - klXuatTanTong - tongNguyenLieuTieuHao).toFixed(3));
    thongTinTonLuyKeTheoMau[mauKey] = tonCuoiKyThucTe;

    var dateObj = localDate(ngayKey);
    var locThang = !isNaN(dateObj.getTime()) ? String(dateObj.getMonth() + 1).padStart(2, '0') + '/' + dateObj.getFullYear() : '';

    tempAllProcessedData.push({
      record: [
        tonDauKyThucTe, rowSrc['Ngày trong năm'], tsRepo.tenTiengViet, tsRepo.tenKhoaHoc, '-', 'Tấn', 0,
        klNhapTan, hoSoNhap, rowSrc['Ngày trong năm'], soBangKeXuat, 0, klXuatTanTong, hoSoXuatKem,
        tongNguyenLieuTieuHao, tonCuoiKyThucTe, rowSrc['Ghi chú'] || '-', '', locThang
      ]
    });
  });

  const finalOutputData1 = tempAllProcessedData.map(item => item.record);

  var headers1 = [
    'Lâm sản tồn đầu kỳ', 'Ngày, tháng, năm', 'Tên tiếng Việt/Tên thương mại', 'Tên khoa học',
    '.Số hiệu, nhãn đánh dấu', '.Đơn vị tính', '.Loài nguy cấp, quý, hiếm; CITES', '.Loài thông thường',
    'Hồ sơ kèm theo lâm sản nhập', 'Ngày, tháng, năm.', 'Số bảng kê lâm sản xuất ra', 'Loài nguy cấp, quý,hiếm;CITES',
    'Loài thông thường', 'Hồ sơ lâm sản xuất kèm theo', 'Ước tính nguyên liệu tiêu hao (nếu có)',
    'Lâm sản tồn cuối kỳ', 'Ghi chú', 'Xác nhận lâm sản tồn', 'LOC_THÁNG'
  ];


  // --- RP_MAU14: theo đơn hàng xuất bán trong kỳ ---
  var finalOutputData2 = [];
  var indexSTT = 1;
  D.data_DHXB.forEach(function (rowDH) {
    var donGiaUSD = Number(rowDH['ĐƠN GIÁ (USD)']) || 0;
    var klBDMT = Number(rowDH['KL_BDMT']) || 0;
    var triGiaUSD = Number((donGiaUSD * klBDMT).toFixed(2));
    const orderDate = formatKeyDate(rowDH['Ngày đơn hàng']);
    if (orderDate >= D.from && orderDate <= D.to) {
      finalOutputData2.push([
        indexSTT++,
        rowDH['SỐ TKHQ'] || '',
        defaultTS['TÊN HH_TKHQ'] || defaultTS['Tên thông thường'] || 'Dăm gỗ keo',
        defaultTS['Tên thông thường'] || 'Dăm gỗ keo',
        defaultTS['Tên khoa học'] || 'Acacia mangium',
        defaultTS['Đơn vị tính (MT)'] || 'Tấn',
        // Lấy từ NL_DH_XB nếu sheet có cột này, không có thì để trống như cũ
        rowDH['Khối lượng NK'] !== undefined ? rowDH['Khối lượng NK'] : '',
        rowDH['Trị giá NK (USD)'] !== undefined ? rowDH['Trị giá NK (USD)'] : '',
        defaultTS['Đơn vị tính (BDMT)'] || 'BDMT',
        klBDMT,
        triGiaUSD
      ]);
    }
  });

  var headers2 = ['STT', 'SỐ TKHQ', 'TÊN HH_TKHQ', 'Tên thông thường', 'Tên khoa học',
    'Đơn vị tính (MT)', 'Khối lượng NK', 'Trị giá NK (USD)', 'Đơn vị tính (BDMT)', 'KL_BDMT', 'Trị giá (USD)'];


  return [{ name: 'RP_MAU04', headers: headers1, rows: finalOutputData1 }, { name: 'RP_MAU14', headers: headers2, rows: finalOutputData2 }];
}

// =========================================================================
// HÀM 2-4: MẪU 29 THEO THÁNG / 6 THÁNG / NĂM (LŨY KẾ TỒN QUA CÁC KỲ)
// Ba hàm gốc giống hệt nhau, chỉ khác cách gom kỳ và các cột cuối —
// gộp chung, tham số hoá bằng `kieu`.
// =========================================================================
var LS_KY_29 = {
  M: {
    sheet: 'RP_MAU29_M',
    cotCuoi: ['LOC_THÁNG', 'Ngày báo cáo', 'Tháng báo cáo', 'Năm báo cáo'],
    ky: function (d) {
      var thang = d.getMonth() + 1, nam = d.getFullYear();
      return { khoa: String(thang).padStart(2, '0') + '/' + nam, thuTu: nam * 100 + thang, nhan: String(thang).padStart(2, '0') + '/' + nam, phu: [thang, nam] };
    }
  },
  '6T': {
    sheet: 'RP_MAU29_6T',
    cotCuoi: ['LOC_6T', 'Ngày báo cáo', 'Thời điểm báo cáo', 'Năm báo cáo'],
    ky: function (d) {
      var nam = d.getFullYear(), so = (d.getMonth() + 1) <= 6 ? 1 : 2; // 1: 6T đầu năm, 2: 6T cuối năm
      return { khoa: '6T' + so + '/' + nam, thuTu: nam * 10 + so, nhan: '6T' + so + '/' + nam, phu: [so, nam] };
    }
  },
  Y: {
    sheet: 'RP_MAU29_Y',
    cotCuoi: ['LOC_Y', 'Ngày báo cáo'],
    ky: function (d) {
      var nam = d.getFullYear();
      return { khoa: String(nam), thuTu: nam, nhan: nam, phu: [] };
    }
  }
};

function _lsMau29_(D, kieu) {
  var K = LS_KY_29[kieu];
  var data_TS_Rp = D.data_TS_Rp, defaultTS = D.defaultTS;

  // CẤU HÌNH THEO MẪU + KHOẢNG NGÀY HIỆU LỰC
  var listConfigs = data_TS_Rp.map(function (row) {
    var tuNgayRaw = row['Từ ngày'];
    var denNgayRaw = row['Đến ngày'];
    return {
      mau: row['Mẫu'] ? String(row['Mẫu']).trim() : '',
      tuNgay: tuNgayRaw ? localDate(tuNgayRaw) : null,
      denNgay: denNgayRaw ? localDate(denNgayRaw) : null,
      tieuHaoSX: Number(row['Tiêu hao SX']) || 0
    };
  });

  var rawMap = {};
  D.data_TS_Ngay.forEach(function (rowSrc) {
    var ngayGoc = rowSrc['Ngày trong năm'];
    var ngayKey = formatKeyDate(ngayGoc);
    var mauKey = rowSrc['Mẫu'] ? String(rowSrc['Mẫu']).trim() : '';
    if (!ngayKey || !mauKey) return;

    var dateObj = localDate(ngayGoc);
    var tsRepo = listConfigs.filter(function (cfg) {
      if (cfg.mau !== mauKey) return false;
      if (cfg.tuNgay && dateObj < cfg.tuNgay) return false;
      if (cfg.denNgay && dateObj > cfg.denNgay) return false;
      return true;
    })[0];
    if (!tsRepo) throw new Error('Thamso_RPKL thiếu định mức có hiệu lực ngày ' + ngayKey + '.');

    var ky = K.ky(dateObj);
    var groupKey = ky.khoa + '_' + mauKey;
    if (!rawMap[groupKey]) {
      rawMap[groupKey] = { ky: ky, mau: mauKey, nhap: 0, xuat: 0, tieuHao: 0 };
    }
    var g = rawMap[groupKey];
    if (g.tonDauCauHinhGoc === undefined) g.tonDauCauHinhGoc = D.opening;

    var klNhapTan = _lsTongKL_(D.hsKeoTheoNgay[ngayKey] || []);
    g.nhap += klNhapTan;
    g.tieuHao += (klNhapTan * tsRepo.tieuHaoSX);

    var listPhieuXuatCuaNgay = D.pcxhTheoNgay[ngayKey] || [];
    if (listPhieuXuatCuaNgay.length > 0) {
      g.xuat += _lsTongKL_(listPhieuXuatCuaNgay);
      listPhieuXuatCuaNgay.forEach(function (rowPC) { g.tieuHao += _lsTieuHaoDoKhoCuaPhieu_(D, rowPC); });
    }
  });

  var listPeriods = Object.keys(rawMap).map(function (k) { return rawMap[k]; });
  listPeriods.sort(function (a, b) { return a.ky.thuTu - b.ky.thuTu; });

  // Lũy kế: kỳ đầu của mẫu lấy tồn cấu hình, các kỳ sau lấy tồn cuối kỳ trước
  var tonLuyKe = {};
  var finalRowsOutput = [];
  var indexSTT = 1;
  listPeriods.forEach(function (p) {
    var tonDau = Object.prototype.hasOwnProperty.call(tonLuyKe, p.mau) ? tonLuyKe[p.mau] : (p.tonDauCauHinhGoc ?? 0);
    var tonCuoi = tonDau + (p.nhap - p.xuat - p.tieuHao);
    tonLuyKe[p.mau] = tonCuoi;

    var matchTS = data_TS_Rp.filter(function (r) { return String(r['Mẫu']).trim() === p.mau; })[0] || defaultTS;
    var ngayBaoCaoRaw = D.to;
    finalRowsOutput.push([
      indexSTT++,
      matchTS['TÊN HH_TKHQ'] || matchTS['Tên thông thường'] || 'Dăm gỗ keo',
      matchTS['Loài nguy cấp Quý hiếm'] || matchTS['Nhóm loài'] || 'Loài thông thường',
      matchTS['Đơn vị tính (MT)'] || 'Tấn',
      Number(tonDau.toFixed(3)),
      Number(p.nhap.toFixed(3)),
      Number((p.nhap + tonDau).toFixed(3)),
      Number((p.xuat + p.tieuHao).toFixed(3)),
      Number(tonCuoi.toFixed(3)),
      p.ky.nhan,
      ngayBaoCaoRaw ? formatKeyDate(ngayBaoCaoRaw) : '-'
    ].concat(p.ky.phu));
  });

  var headers = ['TT', 'Tên lâm sản', 'Nhóm loài (thông thường; nguy cấp, quý, hiếm; Phụ lục CITES)',
    'Đơn vị tính', 'Tồn kho đầu kỳ', 'Nhập trong kỳ', 'Tổng cộng', 'Lâm sản xuất ra', 'Tồn kho cuối kỳ'].concat(K.cotCuoi);
  return { name: K.sheet, headers, rows: finalRowsOutput };
}

