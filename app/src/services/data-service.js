/**
 * [DATA_SERVICE] GoogleSheetService — fetch CSV (1 lần/refresh), chuẩn hoá, nạp vào STATE. Đây
 * là ranh giới DUY NHẤT chạm tới Google Sheet. Logic GIỮ NGUYÊN 100% so với bản gốc.
 *
 * `runReport` import từ `legacy-app.js` (nơi vẫn giữ REPORT_SERVICE điều phối, xem TODO.md) —
 * cạnh phụ thuộc vòng an toàn tương tự `components/report-table.js` (xem ghi chú ở đó): chỉ
 * gọi bên trong `loadAllData()`, tức lúc người dùng bấm "CẬP NHẬT DỮ LIỆU" hoặc lúc `boot()`,
 * không phải lúc import module.
 * @module services/data-service
 */
import { CONFIG } from '../config/config.js';
import { STATE } from '../store/state.js';
import { $, esc } from '../utils/dom-utils.js';
import { dateKey, pad2 } from '../utils/date-utils.js';
import { parseCSV, csvToObjects } from '../utils/csv-utils.js';
import { runReport } from '../legacy-app.js';
import { logger } from './logger.js';
import { saveSheetText, loadSheetText } from './offline-cache.js';

/**
 * [SỬA 2026-09-23 — xử lý lỗi] Thời gian chờ tối đa cho 1 lần tải 1 Google Sheet. Trước đây
 * KHÔNG có giới hạn: nếu Google không trả lời (mạng chập chờn, proxy treo...), app đứng mãi ở
 * "Đang tải dữ liệu..." và nút "CẬP NHẬT DỮ LIỆU" bị khoá vĩnh viễn — người dùng chỉ còn cách tắt
 * app mở lại (đã tái hiện: chờ 20 giây vẫn treo nguyên). 60 giây là dư rộng cho Sheet lớn (bình
 * thường chỉ vài giây), chỉ để chặn trường hợp treo hẳn.
 */
export var FETCH_TIMEOUT_MS = 60000;
/** Số lần thử lại tự động khi lỗi mạng tạm thời / Google lỗi 5xx (không thử lại khi quá thời gian chờ hay lỗi 4xx). */
var FETCH_RETRIES = 1;
/** Cho phép bộ test tự động rút ngắn thời gian chờ (window.__bcFetchTimeoutMs) — người dùng không bao giờ đặt biến này. */
function timeoutMs() { return (typeof window !== 'undefined' && window.__bcFetchTimeoutMs) || FETCH_TIMEOUT_MS; }
var FETCH_RETRY_DELAY_MS = 1500;

/**
 * Các cột mà báo cáo THỰC SỰ đọc ở từng Sheet (đúng tên cột code đang dùng). Nếu Google Sheet bị
 * đổi tên/xoá cột, trước đây app vẫn báo "Đã tải ... ✓" rồi các báo cáo trống trơn/0 dòng mà
 * không có lời giải thích nào (đã tái hiện: đổi "Ngày cân 1" → báo cáo nhập keo 0 dòng, trạng
 * thái vẫn xanh). Nay sẽ cảnh báo rõ thiếu cột nào ở Sheet nào. Chỉ CẢNH BÁO, không chặn.
 */
export var REQUIRED_COLUMNS = {
  PHIEUCAN: ['So_CT', 'Khách hàng', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số 1', 'KL hàng (KG)', 'Đơn giá_TC', 'Thành tiền', 'ĐL', 'NG'],
  DNTT_CT: ['Ngày thanh toán', 'Số hợp đồng', 'Họ tên Chủ rừng', 'Số CT', 'Khối lượng', 'Đơn giá thanh toán', 'Thành tiền'],
  HD_NCC: ['Số hợp đồng', 'Họ tên Chủ rừng', 'Địa chỉ thường trú'],
  HOSOKEO: ['Mã hợp đồng', 'Ngày nhập', 'Số BKLS', 'Họ và tên chủ rừng', 'Khối lượng (Tấn)', 'Đơn giá', 'Thanh toán']
};

/** Lỗi có kèm lời giải thích dễ hiểu cho người dùng (tiếng Việt) + chi tiết kỹ thuật gốc. */
function friendlyFetchError(err) {
  var msg = (err && err.message) || String(err);
  if (err && err.name === 'AbortError') return new Error('quá ' + Math.round(timeoutMs() / 1000) + ' giây Google Sheet không phản hồi (mạng chậm/chập chờn)');
  if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(msg)) return new Error('không kết nối được tới Google Sheet — kiểm tra kết nối Internet (' + msg + ')');
  return err instanceof Error ? err : new Error(msg);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function fetchTextOnce(url) {
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs()) : null;
  try {
    var res = await fetch(url, ctrl ? { cache: 'no-store', signal: ctrl.signal } : { cache: 'no-store' });
    if (!res.ok) { var he = new Error('HTTP ' + res.status); he.httpStatus = res.status; throw he; }
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tải CSV thô của 1 Sheet (có thời gian chờ + thử lại). Tách riêng khỏi bước parse để lớp lưu
 * offline (offline-cache.js) lưu đúng chuỗi gốc đã tải — xem giải thích ở đầu file đó.
 * @param {string} url @returns {Promise<string>}
 */
export async function fetchCSVText(url) {
  if (!url) return '';
  var text, lastErr;
  for (var attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try { text = await fetchTextOnce(url); lastErr = null; break; }
    catch (e) {
      lastErr = e;
      var retryable = e && e.name !== 'AbortError' && !(e.httpStatus >= 400 && e.httpStatus < 500);
      if (!retryable || attempt === FETCH_RETRIES) break;
      await sleep(FETCH_RETRY_DELAY_MS);
    }
  }
  if (lastErr) throw friendlyFetchError(lastErr);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('HTML thay vì CSV — kiểm tra lại quyền chia sẻ / link Xuất bản lên web');
  return text;
}

/** Giữ nguyên API cũ: tải + parse thành mảng object. @param {string} url */
export async function fetchCSV(url) {
  if (!url) return [];
  return csvToObjects(parseCSV(await fetchCSVText(url)));
}

/** "14:26 25/09/2026" @param {Date} d */
function fmtStamp(d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

/**
 * [Phase 4.1 — Offline] Tải 1 Sheet: thành công → lưu bản mới vào IndexedDB (không chờ, không làm
 * chậm) rồi dùng luôn; thất bại → dùng bản lưu gần nhất nếu có (ghi nhận vào `offlineUsed` để báo
 * rõ cho người dùng), không có bản lưu → ném lỗi gốc như trước đây.
 * @param {string} name @param {string} url @param {Array} offlineUsed
 */
function loadSheet(name, url, offlineUsed) {
  return fetchCSVText(url).then(function (text) {
    if (url) saveSheetText(url, name, text);
    return csvToObjects(parseCSV(text));
  }, function (err) {
    return loadSheetText(url).then(function (cached) {
      if (!cached) throw err;
      offlineUsed.push({ name: name, savedAt: cached.savedAt, reason: err.message });
      logger.warn('[Offline] ' + name + ': không tải được (' + err.message + ') — dùng bản lưu lúc ' + fmtStamp(cached.savedAt));
      return csvToObjects(parseCSV(cached.text));
    });
  });
}

/** true nếu lần tải gần nhất phải dùng dữ liệu lưu offline cho ít nhất 1 Sheet. */
var lastLoadOffline = false;

/** Trả về danh sách cột bắt buộc bị thiếu (rỗng nếu đủ, hoặc nếu Sheet không có dòng nào). */
export function missingColumns(rows, required) {
  if (!rows || !rows.length) return [];
  var have = rows[0];
  return required.filter(function (c) { return !Object.prototype.hasOwnProperty.call(have, c); });
}

export function setStatus(text, kind, detail) {
  $('#statusText').textContent = text;
  $('#statusText').title = detail || text; // rê chuột vào để xem đầy đủ khi chữ quá dài
  var dot = $('#statusDot'); dot.className = 'dot' + (kind ? ' ' + kind : '');
}

export async function loadAllData() {
  setStatus('Đang tải dữ liệu từ Google Sheet...', 'busy');
  $('#btnReload').disabled = true;
  // [SỬA 2026-09-23] HD_NCC/HOSOKEO vẫn KHÔNG bắt buộc (lỗi không chặn các báo cáo khác — giữ
  // nguyên hành vi), nhưng trước đây lỗi bị nuốt im lặng: trạng thái vẫn báo xanh "Đã tải..."
  // trong khi Bảng kê lâm sản/02-TNDN trống trơn không rõ lý do (đã tái hiện). Nay ghi lại lỗi
  // để hiện cảnh báo rõ ràng trên thanh trạng thái.
  var warnings = [];
  var offlineUsed = [];
  try {
    var results = await Promise.all([
      loadSheet('PHIEUCAN', CONFIG.PHIEUCAN, offlineUsed).catch(function (e) { throw new Error('PHIEUCAN: ' + e.message); }),
      loadSheet('DNTT_CT', CONFIG.DNTT_CT, offlineUsed).catch(function (e) { throw new Error('DNTT_CT: ' + e.message); }),
      loadSheet('HD_NCC', CONFIG.HD_NCC, offlineUsed).catch(function (e) { warnings.push('không tải được HD_NCC (địa chỉ/CCCD người bán sẽ trống): ' + e.message); return []; }),
      loadSheet('HOSOKEO', CONFIG.HOSOKEO, offlineUsed).catch(function (e) { warnings.push('không tải được HOSOKEO (Bảng kê lâm sản sẽ trống): ' + e.message); return []; })
    ]);
    [['PHIEUCAN', results[0]], ['DNTT_CT', results[1]], ['HD_NCC', results[2]], ['HOSOKEO', results[3]]].forEach(function (p) {
      var miss = missingColumns(p[1], REQUIRED_COLUMNS[p[0]]);
      if (miss.length) warnings.push('Sheet ' + p[0] + ' thiếu cột: ' + miss.join(', ') + ' (có thể đã bị đổi tên — báo cáo liên quan sẽ trống/sai)');
    });
    STATE.phieucan = results[0];
    STATE.dntt = results[1];
    STATE.hdncc = results[2];
    STATE.hosokeo = results[3];

    STATE.phieucanBySoCT = {};
    STATE.phieucan.forEach(function (r) { if (r['So_CT']) STATE.phieucanBySoCT[r['So_CT']] = r; });
    STATE.dnttBySoCT = {};
    // Nếu 1 So_CT có nhiều đề nghị thanh toán, lấy đề nghị có Ngày thanh toán MỚI NHẤT
    STATE.dntt.forEach(function (r) {
      var k = r['Số CT']; if (!k) return;
      var cur = STATE.dnttBySoCT[k];
      if (!cur || (dateKey(r['Ngày thanh toán']) || 0) >= (dateKey(cur['Ngày thanh toán']) || 0)) STATE.dnttBySoCT[k] = r;
    });
    // Map tra "Địa chỉ thường trú" theo (Số hợp đồng, Họ tên Chủ rừng) từ HDMB_DH, dùng cho báo cáo BKLS xuất khẩu
    STATE.hdmbByKey = {};
    STATE.hdncc.forEach(function (r) {
      var k = (r['Số hợp đồng'] || '') + '||' + (r['Họ tên Chủ rừng'] || '');
      STATE.hdmbByKey[k] = r;
    });
    // [BUGFIX 2026-09-22] Map tra HD_NCC CHỈ theo "Số hợp đồng" — đúng công thức Power Query gốc
    // của Bảng kê 02/TNDN (query BK02_TNDN trong file mẫu ChungTuNganHang_DH.xlsx):
    //   Table.NestedJoin(..., {"Số hợp đồng"}, HD_NCC, {"Số hợp đồng"}, "HD_NCC", JoinKind.LeftOuter)
    // — khác với hdmbByKey (khóa ghép "Số hợp đồng||Họ tên") dùng cho báo cáo BKLS xuất khẩu.
    // Dùng riêng cho computeBankTNDN() để không phụ thuộc vào chữ viết tên có khớp tuyệt đối
    // giữa DNTT_CT và HD_NCC hay không (đây là nguyên nhân khiến Số CCCD hay bị trống).
    STATE.hdnccBySoHopDong = {};
    STATE.hdncc.forEach(function (r) {
      var k = r['Số hợp đồng'] || ''; if (!k) return;
      STATE.hdnccBySoHopDong[k] = r;
    });

    populateFilterOptions();
    lastLoadOffline = offlineUsed.length > 0;
    // Dùng bản lưu offline → "Cập nhật lần cuối" phải là giờ của bản lưu CŨ NHẤT đang dùng (không
    // phải giờ hiện tại), để người dùng không nhầm là số liệu mới nhất.
    STATE.lastUpdated = lastLoadOffline
      ? offlineUsed.reduce(function (m, o) { return o.savedAt < m ? o.savedAt : m; }, offlineUsed[0].savedAt)
      : new Date();
    updateLastUpdatedText();
    var okText = 'Đã tải ' + STATE.phieucan.length.toLocaleString('vi-VN') + ' phiếu cân, ' + STATE.dntt.length.toLocaleString('vi-VN') + ' đề nghị thanh toán';
    if (lastLoadOffline) {
      var offlineText = 'ĐANG XEM DỮ LIỆU OFFLINE (không kết nối được Google Sheet): ' + offlineUsed.map(function (o) { return o.name + ' lưu lúc ' + fmtStamp(o.savedAt); }).join(', ');
      setStatus(okText + ' — ⚠ ' + [offlineText].concat(warnings).join(' | '), 'warn',
        okText + '\n' + offlineText + '\nLý do: ' + offlineUsed[0].reason + (warnings.length ? '\n' + warnings.join('\n') : '') + '\nBấm "CẬP NHẬT DỮ LIỆU" khi có mạng để tải bản mới.');
    } else if (warnings.length) {
      warnings.forEach(function (w) { logger.warn('[Tải dữ liệu] ' + w); });
      setStatus(okText + ' — ⚠ ' + warnings.join(' | '), 'warn');
    } else {
      setStatus(okText, 'ok');
    }
    runReport();
  } catch (err) {
    logger.error('[Tải dữ liệu] ' + err.message);
    // Dữ liệu lần tải trước (nếu có) KHÔNG bị xoá khi làm mới thất bại — nói rõ để người dùng
    // biết số liệu đang xem là của lần tải trước, không phải số mới nhất.
    var keep = STATE.lastUpdated ? ' — vẫn đang hiển thị dữ liệu lần tải trước (' + pad2(STATE.lastUpdated.getHours()) + ':' + pad2(STATE.lastUpdated.getMinutes()) + ')' : '';
    setStatus('Lỗi tải dữ liệu: ' + err.message + keep, 'err');
  } finally {
    $('#btnReload').disabled = false;
  }
}

export function updateLastUpdatedText() {
  if (!STATE.lastUpdated) return;
  var d = STATE.lastUpdated;
  var t = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  $('#lastUpdated').textContent = 'Cập nhật lần cuối: ' + t + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + (lastLoadOffline ? ' (dữ liệu offline)' : '');
}

export function populateFilterOptions() {
  function fillSelect(id, values) {
    var sel = $(id), cur = sel.value;
    var opts = Array.from(new Set(values.filter(function (v) { return v; }))).sort();
    sel.innerHTML = '<option value="">Tất cả</option>' + opts.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    if (opts.indexOf(cur) >= 0) sel.value = cur;
  }
  fillSelect('#fDL', STATE.phieucan.map(function (r) { return r['ĐL']; }));
  fillSelect('#fNG', STATE.phieucan.map(function (r) { return r['NG']; }));
  fillSelect('#fKH', STATE.phieucan.map(function (r) { return r['Khách hàng']; }));
  fillSelect('#fBS', STATE.phieucan.map(function (r) { return r['Biển số 1']; }));
}
