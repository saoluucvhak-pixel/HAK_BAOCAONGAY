(function () {
  'use strict';
  const fields = ['TenCty', 'MaHS', 'NhaMay', 'MST', 'SDT', 'DiaChi', 'DiaChiThuMua'];
  const sourceLabels = {
    PhieuCan: 'Phiếu cân', DNTT: 'DNTT', HDNCC: 'HDMB', XuatHang: 'Xuất hàng', Hosokeo: 'Hồ sơ keo',
  };

  const companyLabels = {
    TenCty: 'Tên công ty', MaHS: 'Mã HS mặc định', NhaMay: 'Mã nhà máy',
    MST: 'Mã số thuế', SDT: 'Số điện thoại', DiaChi: 'Địa chỉ trụ sở', DiaChiThuMua: 'Địa chỉ thu mua',
  };
  const sheetName = 'Cấu hình';
  const required = new Set(['TenCty', ...Object.keys(sourceLabels)]);
  const templateRows = [...fields.map((key, index) => [key, 6 + index]),
    ...Object.keys(sourceLabels).map((key, index) => [key, 15 + index])];
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async function parseConfig(buffer) {
    const workbook = new window.ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); }
    catch { throw new Error('File Excel không đúng định dạng .xlsx.'); }
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet || sheet.getCell('A1').value !== 'CẤU HÌNH CÔNG TY · HAK') {
      throw new Error('Hãy dùng file Excel mẫu tải từ màn hình này.');
    }
    const data = {};
    for (const [key, row] of templateRows) {
      if (sheet.getCell('D' + row).value !== key) throw new Error('Cấu trúc mẫu đã thay đổi. Hãy tải file mẫu mới.');
      const raw = sheet.getCell('B' + row).value;
      const value = raw && typeof raw === 'object' && 'hyperlink' in raw ? raw.hyperlink : raw;
      if (value != null && typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Ô B' + row + ' cần giá trị văn bản, hãy dán giá trị trực tiếp.');
      }
      data[key] = String(value ?? '').trim();
    }
    if (!data.TenCty) throw new Error('File thiếu tên công ty (TenCty).');
    const missing = Object.keys(sourceLabels).filter(key => !data[key]);
    if (missing.length) throw new Error('File thiếu link: ' + missing.map(key => sourceLabels[key]).join(', ') + '.');
    return data;
  }

  async function templateWorkbook() {
    const book = new window.ExcelJS.Workbook();
    book.creator = 'HAK Group';
    const sheet = book.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    sheet.columns = [{ width: 29 }, { width: 67 }, { width: 44 }, { hidden: true }];
    const banner = (row, text, fill, fontSize) => {
      sheet.mergeCells(row, 1, row, 3);
      const cell = sheet.getCell(row, 1);
      cell.value = text;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.font = { name: 'Calibri', color: { argb: 'FFFFFFFF' }, size: fontSize, bold: true };
      cell.alignment = { vertical: 'middle', indent: 1 };
      sheet.getRow(row).height = fontSize + 15;
    };
    banner(1, 'CẤU HÌNH CÔNG TY · HAK', 'FF17314D', 18);
    sheet.mergeCells('A2:C2');
    sheet.getCell('A2').value = 'Điền vào ô màu xanh nhạt ở cột B. Các mục dấu * là bắt buộc.';
    sheet.getCell('A2').alignment = { indent: 1, vertical: 'middle' };
    sheet.getRow(2).height = 24;
    banner(4, 'THÔNG TIN CÔNG TY', 'FF175C9C', 12);
    banner(13, 'ĐỊA CHỈ GOOGLE SHEETS', 'FF20653E', 12);
    const hint = {
      MaHS: 'Dùng khi mẫu báo cáo chưa khai báo mã HS.',
      MST: 'Nhập như văn bản để giữ số 0 ở đầu.',
      SDT: 'Nhập như văn bản để giữ số 0 ở đầu.',
      XuatHang: 'Link Google Sheet chứa NL_PC_XH và NL_DH_XB.',
    };
    for (const [key, row] of templateRows) {
      const label = companyLabels[key] ?? sourceLabels[key];
      sheet.getRow(row).values = [label + (required.has(key) ? ' *' : ''), '',
        hint[key] ?? (sourceLabels[key] ? 'Dán link Google Sheets đã chia sẻ.' : ''), key];
      sheet.getRow(row).height = 25;
      for (let column = 1; column <= 3; column++) {
        const cell = sheet.getCell(row, column);
        cell.font = { name: 'Calibri', size: 11, bold: column === 1, color: { argb: 'FF17314D' } };
        cell.alignment = { vertical: 'middle', wrapText: column === 3, indent: 1 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column === 2 ? 'FFE5F3FF' : 'FFF4F7FA' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCDDBE6' } } };
        if (column === 2) cell.numFmt = '@';
      }
    }
    sheet.mergeCells('A21:C21');
    sheet.getCell('A21').value = 'Lưu file .xlsx  →  Nhập vào app  →  Kiểm tra 5 nguồn  →  Xác nhận lưu.';
    sheet.getCell('A21').font = { name: 'Calibri', bold: true, color: { argb: 'FF17314D' } };
    return book;
  }

  function companyLine(company) {
    return [company.TenCty, company.MST ? 'MST ' + company.MST : '', company.DiaChi, company.SDT].filter(Boolean).join(' · ');
  }

  function mount({ current, confirm }) {
    const $ = id => document.getElementById(id);
    const fileInput = $('configFile');
    const check = $('btnCheck');
    const save = $('btnSave');
    const summary = $('companySummary');
    const status = $('msg');
    const results = $('sourceResults');
    let pending;
    let verified;
    let revision = 0;
    function message(text, kind = '') {
      status.textContent = text;
      status.className = kind;
    }

    if (current?.TenCty) $('currentCompany').textContent = companyLine(current);
    $('btnTemplate').addEventListener('click', async () => {
      try {
        const workbook = await templateWorkbook();
        const url = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer()], { type: mime }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Mau_cau_hinh_cong_ty_HAK.xlsx';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        message('Không tạo được mẫu Excel. Vui lòng thử lại.', 'err');
      }
    });
    fileInput.addEventListener('change', async () => {
      const ticket = ++revision;
      const file = fileInput.files[0];
      fileInput.value = '';
      pending = verified = undefined;
      check.disabled = save.disabled = true;
      summary.textContent = '';
      $('currentCompany').hidden = false;
      results.replaceChildren();
      message('');
      if (!file) return;
      try {
        if (file.size > 256 * 1024) throw new Error('File cấu hình vượt quá 256 KB.');
        const data = await parseConfig(await file.arrayBuffer());
        if (ticket !== revision) return;
        pending = data;
        check.disabled = false;
        message('Đã nhập file. Bấm Kiểm tra 5 nguồn Google Sheets.');
      } catch (error) {
        if (ticket === revision) message('Không nhập được cấu hình: ' + error.message, 'err');
      }
    });
    check.addEventListener('click', async () => {
      if (!pending) return;
      const ticket = ++revision;
      const data = pending;
      verified = undefined;
      check.disabled = save.disabled = true;
      summary.textContent = '';
      $('currentCompany').hidden = false;
      results.replaceChildren();
      message('Đang kiểm tra 5 nguồn Google Sheets…');
      try {
        const checks = await window.HAKSourceValidator.checkAll(data);
        if (ticket !== revision) return;
        for (const result of checks) {
          const row = document.createElement('li');
          row.textContent = sourceLabels[result.key] + ' · ' + result.message.replace(/https?:\/\/[^\s]+/gi, '[đường dẫn ẩn]');
          row.className = result.ok ? 'ok' : 'err';
          results.append(row);
        }
        if (!checks.every(result => result.ok)) {
          message('Chưa thể lưu. Hãy sửa file cấu hình rồi nhập lại.', 'err');
          return;
        }
        verified = data;
        summary.textContent = companyLine(data);
        $('currentCompany').hidden = true;
        save.disabled = false;
        message('Cả 5 nguồn đạt. Kiểm tra dòng công ty rồi xác nhận lưu.', 'ok');
      } catch {
        if (ticket === revision) message('Không hoàn tất được kiểm tra nguồn. Vui lòng thử lại.', 'err');
      } finally {
        if (ticket === revision) check.disabled = false;
      }
    });
    save.addEventListener('click', async () => {
      if (!verified || verified !== pending) return;
      const data = verified;
      const ticket = revision;
      save.disabled = check.disabled = fileInput.disabled = true;
      try {
        const result = await confirm(data);
        if (!result?.ok) throw new Error(result?.error || 'Không lưu được cấu hình.');
        pending = verified = undefined;
        $('currentCompany').textContent = companyLine(data);
        $('currentCompany').hidden = false;
        summary.textContent = '';
        results.replaceChildren();
        message(result.message || 'Đã lưu cấu hình.', 'ok');
      } catch (error) {
        if (ticket === revision) {
          message(error.message, 'err');
          save.disabled = check.disabled = false;
        }
      } finally {
        fileInput.disabled = false;
      }
    });
  }

  window.HAKCompanyImport = { mount };
})();
