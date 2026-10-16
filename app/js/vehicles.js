/**
 * vehicles.js — Danh sách xe & tài xế (file "danh sách xe chạy tàu.xlsx").
 *
 * v2.7.2 (Thủy chốt 30/09/2026): danh sách xe RIÊNG TỪNG ĐỢT — chỉ áp cho bảng cân của đợt đó, không dùng cho lô / tàu khác.
 *   - Nguồn: sheet "DS XE - TAI XE" trong CHÍNH file đợt (file mẫu) · hoặc gắn file danh sách riêng cho đợt · hoặc chọn dùng lại
 *     danh sách của đợt khác (dự phòng, mặc định đợt gần nhất). Đợt không có danh sách → cảnh báo, Tài xế / ĐVVC để trống.
 *   - Danh sách chung kiểu cũ (KEY) chỉ còn để chuyển tiếp: gắn 1 lần vào các đợt đã có + hiện trong danh sách dự phòng.
 * Quy trình cũ (trước v2.7.2):
 *   1. Người dùng upload danh sách xe MỖI LẦN LÀM (trang "Chọn File Excel").
 *   2. Nếu lần này không upload → dùng danh sách của lần upload GẦN NHẤT (lưu trong trình duyệt).
 *   3. Ghép theo BIỂN SỐ (đã chuẩn hoá: bỏ dấu "-", ".", khoảng trắng; viết hoa) →
 *      điền Tài xế + Đơn vị vận chuyển (mã HHH / HAK / HAK QN / ĐH → tên đầy đủ theo bảng đổi mã ở Cài đặt).
 *   4. Chỉ điền vào ô còn TRỐNG — nếu Excel cân đã có cột Tài xế / ĐVVC thì giữ nguyên dữ liệu Excel.
 *
 * Không phụ thuộc DOM → chạy được trong Node để kiểm thử.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.vehicles.v1';
  const U = () => HAK.Excel.util;

  /** Chuẩn hoá biển số để so khớp: "43H-010.68" / "43H-01068" / "43h 01068" → "43H01068". */
  function normPlate(p) { return String(p == null ? '' : p).toUpperCase().replace(/[^0-9A-Z]/g, ''); }
  const PLATE_OK = /^\d{2}[A-Z]{1,2}\d{3,6}$/;
  /** Mã ĐVVC → khoá tra bảng đổi mã: "HAK QN" / "hak-qn" → "hakqn"; "ĐH" → "dh". */
  const codeKey = (c) => U().norm(c).replace(/[^a-z0-9]/g, '');

  const state = { meta: null, list: [], map: new Map(), source: 'none' };   // source: none | saved | upload

  function index() {
    state.map = new Map();
    state.list.forEach((v) => { if (!state.map.has(v.k)) state.map.set(v.k, v); });
  }

  /* ---------------------------------------------------------------
   * Đọc file danh sách xe → { list, meta, warnings }
   * ------------------------------------------------------------- */
  function parseWorkbook(wb, fileName, opts) {
    opts = opts || {};
    // v2.7.2: ưu tiên sheet có cột "Họ và tên / Tài xế" (sheet DS XE của file mẫu) — trước đây sheet đầu có cột "Biển số" (có khi là
    // chính bảng cân) bị đọc nhầm làm danh sách xe. opts.skip = tên sheet bỏ qua (sheet bảng cân của đợt); opts.needDriver = chỉ nhận sheet có cột tài xế.
    const cands = [];
    for (const sn of wb.SheetNames) {
      if (sn === opts.skip) continue;
      const r = parseSheetVeh(wb, sn);
      if (r && r.list.length) { if (r.hasDriver) return r; cands.push(r); }
    }
    return !opts.needDriver && cands.length ? cands[0] : { list: [], dup: 0, sheet: '', warnings: [], hasDriver: false };
  }
  function parseSheetVeh(wb, sn) {
    const N = U().norm, isBlank = U().isBlank;
    const out = { list: [], dup: 0, sheet: '', warnings: [], hasDriver: false };
    {
      const G = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: true });
      // --- dòng tiêu đề: dòng có ô "Biển số" ---
      let hr = -1, cPlate = -1;
      for (let r = 0; r < Math.min(G.length, 30) && hr < 0; r++) {
        (G[r] || []).forEach((v, c) => { if (hr < 0 && !isBlank(v) && /(^|\s)(bien so|bks|bs xe|so xe)(\s|$)/.test(N(v))) { hr = r; cPlate = c; } });
      }
      if (hr < 0) return null;
      const head = G[hr] || [], width = Math.max(head.length, ...G.slice(hr + 1, hr + 40).map((r) => (r || []).length));
      let cDrv = -1, cTel = -1, cCode = -1;
      for (let c = 0; c < width; c++) {
        const h = isBlank(head[c]) ? '' : N(head[c]);
        if (cDrv < 0 && /ho (va )?ten|tai xe|lai xe|nguoi lai/.test(h)) cDrv = c;
        else if (cTel < 0 && /dien thoai|sdt|so dt|phone/.test(h)) cTel = c;
        else if (cCode < 0 && /don vi|dvvc|cty|cong ty|ma dv|chu xe|nha xe|thuoc/.test(h)) cCode = c;
      }
      const body = G.slice(hr + 1);
      // cột mã đơn vị không có tiêu đề (như file mẫu): chọn cột chữ ít giá trị khác nhau, không phải biển số/tên/SĐT.
      // Ưu tiên cột có nhiều giá trị khớp bảng đổi mã (Cài đặt → Chung); BỎ cột "đầu biển số" (92C, 43H… = phần đầu biển số
      // của chính dòng đó) — trước đây cột này có thể thắng khi cột mã thật thiếu vài ô → biên bản in "92C" thay cho tên ĐVVC.
      if (cCode < 0) {
        const known = new Set(((HAK.Config && HAK.Config.data && HAK.Config.data.carrierCodes) || []).map((x) => codeKey(x.code)).filter(Boolean));
        let best = null;
        for (let c = 0; c < width; c++) {
          if (c === cPlate || c === cDrv || c === cTel) continue;
          const cells = body.map((r) => [(r || [])[c], (r || [])[cPlate]]).filter((x) => typeof x[0] === 'string' && x[0].trim());
          if (cells.length < 3) continue;
          const vals = cells.map((x) => x[0].trim());
          const uniq = new Set(vals.map((v) => v.toUpperCase()));
          if (uniq.size > 12 || !vals.every((v) => v.length <= 20)) continue;
          const platePart = cells.filter((x) => { const k = normPlate(x[0]); return k && normPlate(x[1]).indexOf(k) === 0; }).length;
          if (platePart > cells.length / 2) continue;
          const hits = vals.filter((v) => known.has(codeKey(v))).length;
          if (!best || hits > best.hits || (hits === best.hits && vals.length > best.n)) best = { c, n: vals.length, hits };
        }
        if (best) cCode = best.c;
      }
      const seen = new Set();
      body.forEach((row) => {
        row = row || [];
        const raw = isBlank(row[cPlate]) ? '' : String(row[cPlate]).trim(), k = normPlate(raw);
        if (!PLATE_OK.test(k)) return;
        if (seen.has(k)) { out.dup++; return; }
        seen.add(k);
        out.list.push({
          k, p: raw,
          d: cDrv >= 0 && !isBlank(row[cDrv]) ? String(row[cDrv]).replace(/\s+/g, ' ').trim() : '',
          t: cTel >= 0 && !isBlank(row[cTel]) ? String(row[cTel]).trim() : '',
          c: cCode >= 0 && !isBlank(row[cCode]) ? String(row[cCode]).replace(/\s+/g, ' ').trim() : ''
        });
      });
      if (out.list.length) {
        out.sheet = sn; out.hasDriver = cDrv >= 0;
        if (cDrv < 0) out.warnings.push('Không tìm thấy cột "Họ và tên" (tài xế) trong danh sách xe.');
        if (cCode < 0) out.warnings.push('Không tìm thấy cột mã đơn vị vận chuyển (HHH / HAK / …) trong danh sách xe.');
      }
    }
    return out;
  }
  /** v2.7.2 Danh sách xe của 1 đợt: { fileName, sheet, count, dup, list, at, src: 'file'|'attach'|'copy'|'legacy', from? } */
  function makeVeh(r, fileName, src, extra) {
    return Object.assign({ fileName: fileName || '', sheet: r.sheet || '', count: r.list.length, dup: r.dup || 0, list: r.list, at: Date.now(), src, warnings: r.warnings || [] }, extra || {});
  }
  /** Đọc danh sách xe có sẵn trong CHÍNH file đợt (sheet khác sheet bảng cân, phải có cột tài xế) → veh hoặc null. */
  function fromWorkbook(wb, fileName, canSheet) {
    const r = parseWorkbook(wb, fileName, { skip: canSheet, needDriver: true });
    return r.list.length ? makeVeh(r, fileName, 'file') : null;
  }
  /** Gắn file danh sách xe riêng cho 1 đợt. */
  async function readFileVeh(file) {
    const info = await HAK.Excel.readFile(file);
    const r = parseWorkbook(info.workbook, file.name);
    if (!r.list.length) throw new Error('Không tìm thấy danh sách xe: cần cột "Biển số xe" (và "Họ và tên", mã đơn vị).');
    return makeVeh(r, file.name, 'attach');
  }
  /** Danh sách chung kiểu cũ (trước v2.7.2) còn lưu trong máy → veh (chỉ dùng chuyển tiếp / dự phòng). */
  function legacy() {
    return state.list.length ? makeVeh({ list: state.list, sheet: state.meta && state.meta.sheet, dup: 0 }, state.meta ? state.meta.fileName : '', 'legacy',
      { at: state.meta && state.meta.savedAt ? Date.parse(state.meta.savedAt) || 0 : 0 }) : null;
  }

  /** Upload danh sách xe từ File → lưu làm "lần upload gần nhất". */
  async function loadFile(file) {
    const info = await HAK.Excel.readFile(file);
    const r = parseWorkbook(info.workbook, file.name);
    if (!r.list.length) throw new Error('Không tìm thấy danh sách xe: cần cột "Biển số xe" (và "Họ và tên", mã đơn vị).');
    state.list = r.list;
    state.meta = { fileName: file.name, savedAt: new Date().toISOString(), count: r.list.length, sheet: r.sheet, dup: r.dup, warnings: r.warnings };
    state.source = 'upload';
    index();
    const persisted = HAK.Store.set(KEY, { meta: state.meta, list: state.list });
    return Object.assign({}, state.meta, { persisted });
  }

  function clear() {
    state.list = []; state.meta = null; state.map = new Map(); state.source = 'none';
    HAK.Store.remove(KEY);
  }

  /** Nạp danh sách lần upload gần nhất (khi mở app). */
  function loadSaved() {
    const s = HAK.Store.get(KEY, null);
    if (s && Array.isArray(s.list) && s.list.length) {
      state.list = s.list; state.meta = s.meta || null; state.source = 'saved';
      // Danh sách lưu từ bản cũ có thể đã đọc nhầm cột "đầu biển số" làm mã ĐVVC → bỏ mã sai (để trống còn hơn in "92C"), nhắc upload lại.
      let bad = 0;
      state.list.forEach((v) => { const c = normPlate(v.c); if (c && v.k.indexOf(c) === 0) { v.c = ''; bad++; } });
      if (bad && state.meta) state.meta.badCodes = bad;
      index();
    }
  }

  /* ---------------------------------------------------------------
   * Bảng đổi mã ĐVVC → tên đầy đủ (Cài đặt → Chung)
   * ------------------------------------------------------------- */
  function carrierName(code) {
    const k = codeKey(code);
    const hit = ((HAK.Config.data.carrierCodes) || []).find((x) => codeKey(x.code) === k);
    return hit ? hit.name : '';
  }

  /* ---------------------------------------------------------------
   * Ghép vào dữ liệu cân: điền Tài xế / ĐVVC còn trống
   * ------------------------------------------------------------- */
  /** veh = danh sách xe của ĐỢT (v2.7.2); null = đợt chưa có → cảnh báo. Không truyền (undefined) = danh sách chung kiểu cũ (Node test cũ). */
  function enrich(ds, veh) {
    if (!ds) return ds;
    ds.vehicleInfo = null;
    if (!ds.ok) return ds;
    const perBatch = veh !== undefined;
    const list = perBatch ? (veh && veh.list) || [] : state.list;
    if (!list.length) {
      if (perBatch) {
        const need = ds.rows.filter((r) => !r.driver || !r.carrier).length;
        ds.vehicleInfo = { source: 'none', meta: null, total: 0, plates: new Set(ds.rows.map((r) => normPlate(r.plate))).size, matched: 0, missing: [], unknownCodes: [] };
        if (need) ds.warnings.push('🚚 Đợt này chưa có danh sách xe & tài xế — ' + need + ' phiếu thiếu Tài xế / Đơn vị vận chuyển (để trống). Nhập liệu → dòng đợt → 🚚: gắn file danh sách xe hoặc dùng danh sách của đợt khác.');
      }
      return ds;
    }
    const map = perBatch ? new Map() : state.map;
    if (perBatch) list.forEach((v) => { if (!map.has(v.k)) map.set(v.k, v); });
    const missing = new Map(), unknownCodes = new Set(), plates = new Set(), matched = new Set();
    ds.rows.forEach((r) => {
      const k = normPlate(r.plate);
      if (!k) return;
      plates.add(k);
      const v = map.get(k);
      if (!v) { missing.set(k, r.plate); return; }
      matched.add(k);
      if (!r.driver && v.d) { r.driver = v.d; r.driverFromList = true; }
      if (!r.carrier && v.c) {
        const nm = carrierName(v.c);
        if (nm) r.carrier = nm; else { r.carrier = v.c; unknownCodes.add(v.c); }
        r.carrierFromList = true; r.carrierCode = v.c;          // mã ngắn (HHH / HAK / ĐH …) — dùng cho file Excel lưu trữ
      }
    });
    ds.vehicleInfo = {
      source: perBatch ? veh.src : state.source, meta: perBatch ? { fileName: veh.fileName, sheet: veh.sheet, at: veh.at } : state.meta, total: list.length,
      plates: plates.size, matched: matched.size, missing: Array.from(missing.values()).sort(), unknownCodes: Array.from(unknownCodes)
    };
    // Cột Tài xế / ĐVVC đã được bù từ danh sách xe → bỏ dòng cảnh báo "Không có cột" cho 2 trường đó
    const optLeft = (ds.missingOptional || []).filter((f) => f.key !== 'driver' && f.key !== 'carrier');
    ds.warnings = ds.warnings.filter((w) => w.indexOf('Không có cột:') !== 0);
    if (optLeft.length) ds.warnings.unshift('Không có cột: ' + optLeft.map((f) => f.label).join(', ') + ' — các trường này sẽ để trống hoặc dùng giá trị mặc định trong Cài đặt.');
    const vi = ds.vehicleInfo;
    if (vi.missing.length) ds.warnings.push('🚚 ' + vi.missing.length + '/' + vi.plates + ' biển số chưa có trong danh sách xe (tài xế, ĐVVC để trống): ' + vi.missing.slice(0, 10).join(', ') + (vi.missing.length > 10 ? ' …' : '') + '.');
    if (vi.unknownCodes.length) ds.warnings.push('🚚 Mã đơn vị chưa có trong bảng đổi mã (Cài đặt → Chung): ' + vi.unknownCodes.join(', ') + ' — đang in nguyên mã.');
    return ds;
  }

  HAK.Vehicles = {
    normPlate, parseWorkbook, loadFile, loadSaved, clear, enrich, carrierName, fromWorkbook, readFileVeh, legacy, makeVeh,
    get state() { return state; },
    get count() { return state.list.length; }
  };
  HAK.Vehicles.loadSaved();
})(typeof window !== 'undefined' ? window : globalThis);
