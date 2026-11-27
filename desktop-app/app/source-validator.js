/* HAK Sheet Source Validator — không lưu dữ liệu tải về, chỉ đọc hàng tiêu đề CSV. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.HAKSourceValidator = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const SOURCES = [
    { key: 'PhieuCan', label: 'Phiếu cân', required: true, columns: ['So_CT', 'Khách hàng', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số 1', 'KL hàng (KG)', 'Đơn giá_TC', 'Thành tiền', 'ĐL', 'NG'] },
    { key: 'DNTT', label: 'Đề nghị thanh toán', required: true, columns: ['Ngày thanh toán', 'Số hợp đồng', 'Họ tên Chủ rừng', 'Số CT', 'Khối lượng', 'Đơn giá thanh toán', 'Thành tiền'] },
    { key: 'HDNCC', label: 'Hợp đồng NCC', required: false, columns: ['Số hợp đồng', 'Họ tên Chủ rừng', 'Địa chỉ thường trú'] },
    { key: 'Hosokeo', label: 'Hồ sơ keo', required: false, columns: ['Mã hợp đồng', 'Ngày nhập', 'Số BKLS', 'Họ và tên chủ rừng', 'Khối lượng (Tấn)', 'Đơn giá', 'Thanh toán'] }
  ];
  const SHIPPING_TABS = [
    { key: 'NL_PC_XH', columns: ['Ngày xuất', 'Khối lượng (Tấn)', 'SỐ TKHQ'] },
    { key: 'NL_DH_XB', columns: ['Ngày đơn hàng', 'SỐ TKHQ', 'KL_BDMT', 'ĐƠN GIÁ (USD)'] },
  ];

  function shippingSheetId(value) {
    let url;
    try { url = new URL(value); } catch { /* Báo lỗi theo trường cấu hình. */ }
    const id = url?.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/)?.[1];
    if (url?.origin !== 'https://docs.google.com' || url.username || url.password || !id || id === 'e') {
      throw new Error('Nhập link của cả file Google Sheet XUATHANG_DN dạng /spreadsheets/d/…/edit.');
    }
    return id;
  }

  const HEADER_LIMIT = 65536;
  function validateUrl(value) {
    // URL sẽ được chèn vào JavaScript của báo cáo HTML; ký tự thoát chuỗi phải bị chặn.
    if (typeof value !== 'string' || /['"`<>\\\r\n]/.test(value)) {
      return 'Đường dẫn chứa ký tự không được phép.';
    }
    let url;
    try { url = new URL(value); } catch (e) { return 'Đường dẫn không hợp lệ.'; }
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.username || url.password || url.port) {
      return 'Chỉ nhận liên kết Google Sheets HTTPS tại docs.google.com.';
    }
    const published = /^\/spreadsheets\/d\/e\/[^/]+\/pub\/?$/.test(url.pathname) && url.searchParams.get('output') === 'csv';
    const exported = /^\/spreadsheets\/d\/[^/]+\/export\/?$/.test(url.pathname) && url.searchParams.get('format') === 'csv';
    if (!published && !exported) return 'Phải dùng liên kết xuất CSV (Xuất bản lên web hoặc export?format=csv).';
    return '';
  }
  // Tìm dấu xuống dòng đầu tiên nằm ngoài dấu ngoặc kép (tiêu đề có thể chứa xuống dòng).
  function headerEnd(text) {
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { i++; continue; }
        quoted = !quoted;
      }
      if (!quoted && (c === '\n' || c === '\r')) return i;
    }
    return -1;
  }
  function csvHeaders(header) {
    if (!header) return [];
    const cols = [], text = header.replace(/^\uFEFF/, '');
    let value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) { cols.push(value.trim()); value = ''; }
      else value += c;
    }
    if (quoted) throw new Error('Hàng tiêu đề CSV có dấu ngoặc kép chưa đóng.');
    cols.push(value.trim());
    return cols;
  }
  async function probeSource(source, value, fetcher, limitMs) {
    const url = String(value || '').trim();
    if (!url) return { key: source.key, ok: !source.required, skipped: true, message: source.required ? 'Thiếu đường dẫn bắt buộc.' : 'Không cấu hình (giữ nguồn mặc định của mẫu).' };
    const bad = validateUrl(url);
    if (bad) return { key: source.key, ok: false, message: bad };
    return probeCsv(source, url, fetcher, limitMs);
  }

  async function probeCsv(source, url, fetcher, limitMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), limitMs || 12000);
    let reader;
    try {
      const response = await (fetcher || fetch)(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow' });
      if (!response.ok) return { key: source.key, ok: false, message: 'HTTP ' + response.status + ' — kiểm tra quyền chia sẻ và địa chỉ.' };
      // Không xác nhận thành công nếu máy chủ Google chuyển tiếp tới trang ngoài không tin cậy.
      if (response.url) {
        const finalUrl = new URL(response.url);
        const googleHost = finalUrl.hostname === 'docs.google.com' ||
          finalUrl.hostname === 'googleusercontent.com' ||
          finalUrl.hostname.endsWith('.googleusercontent.com');
        if (finalUrl.protocol !== 'https:' || !googleHost) throw new Error('Nguồn CSV chuyển hướng ra ngoài Google.');
      }
      let txt = '', bytes = 0;
      if (response.body && response.body.getReader) {
        reader = response.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) { txt += dec.decode(); break; }
          bytes += chunk.value.byteLength;
          if (bytes > HEADER_LIMIT) throw new Error('Hàng tiêu đề CSV vượt quá giới hạn 64 KB.');
          txt += dec.decode(chunk.value, { stream: true });
          if (headerEnd(txt) >= 0) break;
        }
      } else {
        txt = (await response.text()).slice(0, HEADER_LIMIT + 1);
      }
      if (/^\s*<(!doctype|html)/i.test(txt)) throw new Error('Nhận HTML thay vì CSV — kiểm tra quyền chia sẻ.');
      const end = headerEnd(txt);
      const headers = csvHeaders(end >= 0 ? txt.slice(0, end) : txt);
      const missing = source.columns.filter((c) => !headers.includes(c));
      if (!headers.length || headers.every((h) => !h)) throw new Error('Không có hàng tiêu đề CSV.');
      if (missing.length) return { key: source.key, ok: false, missing, message: 'Thiếu cột: ' + missing.join(', ') };
      return { key: source.key, ok: true, message: 'Kết nối được; đủ ' + source.columns.length + ' cột bắt buộc.' };
    } catch (e) {
      return { key: source.key, ok: false, message: e.name === 'AbortError' ? 'Quá thời gian kiểm tra kết nối.' : 'Không kiểm tra được: ' + (e.message || String(e)) };
    } finally {
      clearTimeout(timeout);
      if (reader) { try { await reader.cancel(); } catch (e) { /* đã đọc xong */ } }
    }
  }
  async function probeShipping(value, fetcher, limitMs) {
    const key = 'XuatHang';
    if (!String(value ?? '').trim()) return { key, ok: true, skipped: true, message: 'Bỏ qua kiểm tra; báo cáo giữ link mặc định.' };
    let id;
    try { id = shippingSheetId(value); }
    catch (error) { return { key, ok: false, message: error.message }; }
    const checks = await Promise.all(SHIPPING_TABS.map(tab => {
      const url = new URL('https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq');
      url.searchParams.set('tqx', 'out:csv');
      url.searchParams.set('sheet', tab.key);
      return probeCsv(tab, url.href, fetcher, limitMs);
    }));
    const failed = checks.filter(check => !check.ok);
    return { key, ok: !failed.length, message: failed.length
      ? failed.map(check => check.key + ': ' + check.message).join(' | ')
      : 'NL_PC_XH và NL_DH_XB đều đọc được và đủ cột bắt buộc.' };
  }

  async function checkAll(config, fetcher, limitMs) {
    return Promise.all([
      ...SOURCES.map(source => probeSource(source, config[source.key], fetcher, limitMs)),
      probeShipping(config.XuatHang, fetcher, limitMs),
    ]);
  }
  return { SOURCES, validateUrl, shippingSheetId, csvHeaders, probeSource, checkAll };
});
