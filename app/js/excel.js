/**
 * excel.js — Đọc "Bảng Cân Xuất Hàng" (Excel) bằng SheetJS và chuẩn hoá thành dataset.
 *
 * Quy trình:
 *   readFile()  → đọc workbook (async, có tiến độ)
 *   parseSheet()→ tìm dòng tiêu đề, tự nhận diện cột (có thể ghi đè thủ công), chuẩn hoá từng dòng,
 *                 kiểm tra dữ liệu, thống kê.
 *
 * Không phụ thuộc DOM nên chạy được cả trong Node để kiểm thử.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /* ---------------------------------------------------------------
   * Danh sách trường chuẩn + nhãn hiển thị
   * required: bắt buộc phải có (thiếu → không sinh được biên bản)
   * ------------------------------------------------------------- */
  const FIELDS = [
    { key: 'ticket',     label: 'Số phiếu',           req: false },
    { key: 'date',       label: 'Ngày cân',           req: true  },
    { key: 'timeIn',     label: 'Giờ cân vào',        req: false },
    { key: 'timeOut',    label: 'Giờ cân ra',         req: false },
    { key: 'datetime1',  label: 'Ngày giờ cân 1',     req: false, hidden: true },
    { key: 'datetime2',  label: 'Ngày giờ cân 2',     req: false, hidden: true },
    { key: 'plate',      label: 'Biển số',            req: true  },
    { key: 'tare',       label: 'Cân lần 1 (xe không)', req: false },
    { key: 'gross',      label: 'Cân lần 2 (có hàng)', req: false },
    { key: 'net',        label: 'Khối lượng hàng',    req: true  },
    { key: 'unit',       label: 'Đơn vị tính',        req: false },
    { key: 'driver',     label: 'Tài xế',             req: false },
    { key: 'carrier',    label: 'Đơn vị vận chuyển',  req: false },
    { key: 'wh',         label: 'Kho',                req: false },
    { key: 'weightType', label: 'Loại cân',           req: false },
    { key: 'weigher',    label: 'Người cân',          req: false },
    { key: 'note',       label: 'Nhãn / Ghi chú (tàu…)', req: false }
  ];

  /* Quy tắc nhận diện cột theo tiêu đề đã chuẩn hoá (không dấu, chữ thường). Thứ tự = độ ưu tiên. */
  const RULES = [
    ['datetime2', /ngay gio can 2|thoi gian can 2|ngay can 2/],
    ['datetime1', /ngay gio can 1|thoi gian can 1|ngay gio can( vao)?$/],
    ['timeIn',    /gio can vao|gio vao|gio can 1|gio can lan 1/],
    ['timeOut',   /gio can ra|gio ra|gio can 2|gio can lan 2/],
    ['date',      /^ngay( can)?( 1| vao)?$|^ngay xuat|^ngay can|^ngay$/],
    ['ticket',    /phieu/],
    ['tare',      /xe khong|can lan 1|tl xe|^bi$|^tare|trong luong xe$|khoi luong xe$/],
    ['gross',     /co hang|can lan 2|tong trong luong|^gross/],
    ['net',       /luong hang|kl hang|khoi luong hang|^khoi luong$|^trong luong$|^net/],
    ['unit',      /^don vi tinh$|^dvt$/],
    ['weigher',   /nguoi can/],
    ['driver',    /tai xe|lai xe/],
    ['carrier',   /don vi van (chuyen|tai)|dvvc|nha xe|nha van tai|chu xe/],
    ['wh',        /^kho( xuat| nhap| giao| nhan| gui)?$|ten kho|kho xuat|kho nhan/],
    ['weightType',/loai can|kieu can/],
    ['plate',     /so xe|bien so|bien kiem soat|^xe$|^bks$/],
    ['note',      /ghi chu|^tau$|chuyen tau|lo hang|^nhom$/]
  ];

  /* ---------------------------------------------------------------
   * Tiện ích chuỗi / số / ngày
   * ------------------------------------------------------------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  /** Đọc số từ ô Excel: hỗ trợ "13.770", "13,770", "1,979", "36,042,650", "12.5", "12,5". */
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (isBlank(v)) return null;
    let s = String(v).replace(/[^\d.,\-]/g, '');
    if (!s || s === '-') return null;
    const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
    if (dots && commas) {
      // dấu xuất hiện cuối cùng là dấu thập phân
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (commas > 1 || dots > 1) {
      s = s.replace(/[.,]/g, '');
    } else if (commas === 1) {
      s = /,\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.');
    } else if (dots === 1) {
      if (/\.\d{3}$/.test(s) && !/^0\./.test(s)) s = s.replace('.', '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');

  /** Số serial Excel → {y,m,d,hh,mm,ss}. */
  function serialToParts(n) {
    const day = Math.floor(n);
    let frac = Math.round((n - day) * 86400);
    const ms = Date.UTC(1899, 11, 30) + day * 86400000;
    const dt = new Date(ms);
    const hh = Math.floor(frac / 3600); frac -= hh * 3600;
    const mm = Math.floor(frac / 60); const ss = frac - mm * 60;
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh, mm, ss, hasDate: n >= 1, hasTime: n % 1 !== 0 };
  }

  /**
   * Phân tích ngày / giờ ở nhiều dạng:
   *   "16/08/2026", "16/08/2026 11:43:33", "2026-01-22 06:28:43", "16-08-2026", "11:43:33", số serial, Date.
   * Trả về {y,m,d,hh,mm,ss,hasDate,hasTime} hoặc null.
   */
  function parseDT(v) {
    if (isBlank(v)) return null;
    if (v instanceof Date) {
      return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), hh: v.getHours(), mm: v.getMinutes(), ss: v.getSeconds(), hasDate: true, hasTime: true };
    }
    if (typeof v === 'number') return v >= 0 ? serialToParts(v) : null;     // v2.7.2: 0 < v < 1 = ô GIỜ của Excel (07:05 = 0,295…) → chỉ có giờ
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return { y: +m[3], m: +m[2], d: +m[1], hh: +(m[4] || 0), mm: +(m[5] || 0), ss: +(m[6] || 0), hasDate: true, hasTime: m[4] !== undefined };
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3], hh: +(m[4] || 0), mm: +(m[5] || 0), ss: +(m[6] || 0), hasDate: true, hasTime: m[4] !== undefined };
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return { y: 0, m: 0, d: 0, hh: +m[1], mm: +m[2], ss: +(m[3] || 0), hasDate: false, hasTime: true };
    return null;
  }
  const partsToTs = (p) => Date.UTC(p.y, p.m - 1, p.d, p.hh || 0, p.mm || 0, p.ss || 0);
  const tsToParts = (ts) => { const d = new Date(ts); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds() }; };
  const fmtDate = (p) => pad(p.d) + '/' + pad(p.m) + '/' + p.y;
  const fmtDateTime = (p) => fmtDate(p) + ' ' + pad(p.hh) + ':' + pad(p.mm) + ':' + pad(p.ss);

  /** Chuẩn hoá số phiếu: "7998/2026 /XK" → "7998/2026/XK"; số nguyên giữ nguyên. */
  function normTicket(v) {
    if (isBlank(v)) return '';
    if (typeof v === 'number') return String(v);
    return String(v).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
  }

  const PLATE_RE = /^\d{2}[A-Z]{1,2}[- ]?\d{3,6}(\.\d+)?$/i;

  /* ---------------------------------------------------------------
   * Đọc file
   * ------------------------------------------------------------- */
  function readFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 60)); };
      fr.onerror = () => reject(new Error('Không đọc được file.'));
      fr.onload = () => {
        try {
          if (onProgress) onProgress(70);
          // Cho trình duyệt cơ hội vẽ lại loading trước khi SheetJS parse (đồng bộ, có thể vài trăm ms)
          setTimeout(() => {
            try {
              const wb = root.XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: false, cellNF: false, cellStyles: false });
              if (onProgress) onProgress(100);
              resolve({ workbook: wb, sheetNames: wb.SheetNames.slice(), fileName: file.name, size: file.size });
            } catch (e) { reject(new Error('File không phải Excel hợp lệ: ' + e.message)); }
          }, 30);
        } catch (e) { reject(e); }
      };
      fr.readAsArrayBuffer(file);
    });
  }

  /** Đọc từ ArrayBuffer/Uint8Array (dùng cho kiểm thử Node). */
  function readBuffer(buf) {
    const wb = root.XLSX.read(buf, { type: buf instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: false });
    return { workbook: wb, sheetNames: wb.SheetNames.slice() };
  }

  /* ---------------------------------------------------------------
   * Phân tích 1 sheet
   * ------------------------------------------------------------- */
  function findHeaderRow(grid) {
    let best = { row: -1, score: 0 };
    const lim = Math.min(grid.length, 60);
    for (let r = 0; r < lim; r++) {
      const row = grid[r] || [];
      let score = 0;
      const used = new Set();
      row.forEach((c) => {
        if (isBlank(c) || typeof c === 'number') return;
        const n = norm(c);
        if (!n) return;
        for (const [f, re] of RULES) if (re.test(n) && !used.has(f)) { used.add(f); score++; break; }
      });
      if (score > best.score) best = { row: r, score };
    }
    return best.score >= 3 ? best.row : -1;
  }

  function detectMapping(headerCells, dataSample) {
    const mapping = {};
    const used = new Set();
    headerCells.forEach((h, ci) => {
      const n = norm(h);
      if (!n) return;
      for (const [f, re] of RULES) {
        if (mapping[f] === undefined && re.test(n)) { mapping[f] = ci; used.add(ci); break; }
      }
    });
    // --- Dự phòng theo nội dung cho cột chưa nhận diện ---
    const ncol = headerCells.length;
    for (let ci = 0; ci < ncol; ci++) {
      if (used.has(ci)) continue;
      const vals = dataSample.map((r) => r[ci]).filter((v) => !isBlank(v));
      if (!vals.length) continue;
      if (mapping.plate === undefined && vals.filter((v) => PLATE_RE.test(String(v).trim())).length > vals.length * 0.8) {
        mapping.plate = ci; used.add(ci); continue;
      }
      // cột chữ có ít giá trị khác nhau (vd "TÀU 1", "TÀU 2", "CHO QC MƯỢN") → nhãn / ghi chú
      const strs = vals.filter((v) => typeof v === 'string');
      if (mapping.note === undefined && strs.length === vals.length && !strs.every((x) => /^\d+$/.test(x.trim()))) {
        const distinct = new Set(strs.map((s) => s.trim()));
        if (distinct.size >= 1 && distinct.size <= 30 && vals.length >= dataSample.length * 0.02) { mapping.note = ci; used.add(ci); continue; }
      }
    }
    return mapping;
  }

  /** Dòng tiêu đề báo cáo: công ty, khoảng thời gian, tổng số xe / KL khai báo, kiểu cân. */
  function parseMeta(grid, headerRow) {
    const meta = { company: '', address: '', title: '', from: null, to: null, declaredTrips: null, declaredKg: null, weightType: '' };
    const texts = [];
    for (let r = 0; r < Math.max(0, headerRow); r++) {
      // ô gộp (merge) có thể được SheetJS lặp lại ở nhiều cột → chỉ lấy giá trị duy nhất của mỗi dòng
      const seen = new Set();
      (grid[r] || []).forEach((c) => {
        if (isBlank(c) || typeof c !== 'string') return;
        const t = c.trim();
        if (!seen.has(t)) { seen.add(t); texts.push(t); }
      });
    }
    if (texts[0]) meta.company = texts[0];
    if (texts[1]) meta.address = texts[1];
    if (texts[2]) meta.title = texts[2];
    texts.forEach((t) => {
      let m = t.match(/t[ưu]̣?\s*ng[àa]y\s*(\d{1,2}\/\d{1,2}\/\d{4}).*?[đd][ếe]n\s*ng[àa]y\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
           || t.match(/(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (m && !meta.from) { meta.from = parseDT(m[1]); meta.to = parseDT(m[2]); }
      m = t.match(/T[ổo]ng s[ốo]\s*:\s*([\d.,]+)\s*xe[^\d]*([\d.,]+)\s*(kg|t[ấa]n)?/i);
      if (m) {
        meta.declaredTrips = parseNum(m[1]);
        let kg = parseNum(m[2]);
        if (m[3] && /t[ấa]n/i.test(m[3])) kg *= 1000;
        meta.declaredKg = kg;
      }
      m = t.match(/ki[ểe]u c[âa]n\s*=\s*([^;]+)/i);
      if (m) meta.weightType = m[1].trim();
    });
    return meta;
  }

  /**
   * parseSheet(workbook, sheetName, opts)
   *   opts.mapping   : ghi đè ánh xạ cột { field: colIndex | -1 }
   *   opts.autoSwap  : hoán đổi cân lần 1/2 khi lần 1 > lần 2
   */
  function parseSheet(workbook, sheetName, opts) {
    opts = opts || {};
    const ws = workbook.Sheets[sheetName];
    if (!ws) throw new Error('Không tìm thấy sheet "' + sheetName + '"');
    // Đọc toàn bộ sheet thành mảng 2 chiều. blankrows:true để giữ đúng số dòng thực trong Excel.
    const range = root.XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const rowOff = range.s.r, colOff = range.s.c;
    const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });

    const ds = {
      sheetName, rows: [], columns: [], mapping: {}, autoMapping: {}, missing: [], missingOptional: [],
      warnings: [], errors: [], meta: {}, headerRow: -1, stats: null, ok: false
    };
    // Cho phép người dùng chỉ định dòng tiêu đề (số dòng Excel, bắt đầu từ 1) nếu tự dò thất bại
    const hr = opts.headerRow ? opts.headerRow - 1 - rowOff : findHeaderRow(G);
    if (hr < 0 || hr >= G.length) {
      ds.errors.push('Không tìm thấy dòng tiêu đề (cần ít nhất 3 cột như Số phiếu / Ngày cân / Số xe / Trọng lượng…).');
      return ds;
    }
    ds.headerRow = hr;
    const headerCells = G[hr] || [];
    const width = Math.max(headerCells.length, ...G.slice(hr + 1, hr + 50).map((r) => (r || []).length));
    ds.columns = [];
    for (let i = 0; i < width; i++) {
      const h = headerCells[i];
      ds.columns.push({ index: i, label: isBlank(h) ? '(cột ' + colName(i + colOff) + ' — không có tiêu đề)' : String(h).trim(), letter: colName(i + colOff) });
    }
    const sample = G.slice(hr + 1, hr + 301).map((r) => r || []);
    ds.autoMapping = detectMapping(Array.from({ length: width }, (_, i) => headerCells[i]), sample);
    ds.mapping = Object.assign({}, ds.autoMapping);
    if (opts.mapping) Object.keys(opts.mapping).forEach((k) => {
      if (opts.mapping[k] === -1 || opts.mapping[k] === null) delete ds.mapping[k];
      else ds.mapping[k] = opts.mapping[k];
    });
    ds.meta = parseMeta(G, hr);

    const M = ds.mapping;
    const has = (k) => M[k] !== undefined;
    const hasDate = has('date') || has('datetime1');
    // ---- thiếu cột ----
    FIELDS.forEach((f) => {
      if (f.hidden) return;
      let present = has(f.key);
      if (f.key === 'date') present = hasDate;
      if (f.key === 'net') present = has('net') || (has('tare') && has('gross'));
      if (!present) (f.req ? ds.missing : ds.missingOptional).push(f);
    });
    if (ds.missing.length) {
      ds.errors.push('Thiếu cột bắt buộc: ' + ds.missing.map((f) => f.label).join(', ') + '. Hãy chọn cột tương ứng ở bảng "Ánh xạ cột".');
    }
    if (ds.missingOptional.length) {
      ds.warnings.push('Không có cột: ' + ds.missingOptional.map((f) => f.label).join(', ') + ' — các trường này sẽ để trống hoặc dùng giá trị mặc định trong Cài đặt.');
    }
    if (ds.errors.length) return ds;

    // ---- đơn vị ----
    let unitFactor = 1; // → kg
    if (/\(t[ấáa]n\)|\(tan\)|\(t\)/i.test(String(headerCells[M.net] || ''))) unitFactor = 1000;

    // ---- chuẩn hoá từng dòng ----
    const rows = [];
    const issues = { swap: [], mismatch: [], noDate: [], dupTicket: [], nonPos: [], plate: [] };
    const seenTicket = new Map();
    const cancelled = [];   // phiếu "BO" (bỏ cân — xe cân lại phiếu khác) → loại khỏi biên bản
    let skipped = 0;
    for (let r = hr + 1; r < G.length; r++) {
      const raw = G[r] || [];
      const g = (k) => (has(k) ? raw[M[k]] : null);
      const plate = isBlank(g('plate')) ? '' : String(g('plate')).trim();
      let tare = parseNum(g('tare')), gross = parseNum(g('gross')), net = parseNum(g('net'));
      const first = isBlank(raw[0]) ? '' : norm(raw[0]);
      if (/^(cong|tong)\b/.test(first)) { skipped++; continue; }
      if (!plate && net === null) { skipped++; continue; }
      if (net === null && (tare === null || gross === null)) { skipped++; continue; }
      let rowUnit = unitFactor;
      if (has('unit')) { const u = norm(g('unit')); if (/^t(an)?$/.test(u)) rowUnit = 1000; else if (/^kg$/.test(u)) rowUnit = 1; }
      if (tare !== null) tare *= rowUnit; if (gross !== null) gross *= rowUnit; if (net !== null) net *= rowUnit;

      const row = {
        idx: r + 1 + rowOff, // số dòng thực trong Excel
        ticket: normTicket(g('ticket')),
        plate,
        driver: has('driver') && !isBlank(g('driver')) ? String(g('driver')).trim() : '',
        carrier: has('carrier') && !isBlank(g('carrier')) ? String(g('carrier')).trim() : '',
        wh: has('wh') && !isBlank(g('wh')) ? String(g('wh')).trim() : '',
        weightType: has('weightType') && !isBlank(g('weightType')) ? String(g('weightType')).trim() : '',
        weigher: has('weigher') && !isBlank(g('weigher')) ? String(g('weigher')).trim() : '',
        note: has('note') && !isBlank(g('note')) ? String(g('note')).trim() : '',
        warn: []
      };
      // --- thời gian ---
      let d1 = has('datetime1') ? parseDT(g('datetime1')) : null;
      let dDate = has('date') ? parseDT(g('date')) : null;
      const base = (d1 && d1.hasDate) ? d1 : dDate;
      const tIn = has('timeIn') ? parseDT(g('timeIn')) : (d1 && d1.hasTime ? d1 : null);
      const tOut = has('timeOut') ? parseDT(g('timeOut')) : null;
      let d2 = has('datetime2') ? parseDT(g('datetime2')) : null;
      if (!base || !base.hasDate) { issues.noDate.push(row.idx); row.warn.push('Thiếu/sai ngày cân'); row.ts1 = null; row.ts2 = null; row.dateStr = ''; row.time1 = ''; row.time2 = ''; }
      else {
        const p1 = { y: base.y, m: base.m, d: base.d, hh: tIn ? tIn.hh : (base.hasTime ? base.hh : 0), mm: tIn ? tIn.mm : (base.hasTime ? base.mm : 0), ss: tIn ? tIn.ss : (base.hasTime ? base.ss : 0) };
        row.ts1 = partsToTs(p1);
        row.dateStr = fmtDate(p1);
        row.time1 = fmtDateTime(p1);
        let ts2 = null;
        if (d2 && d2.hasDate) ts2 = partsToTs(d2);
        else if (tOut && tOut.hasTime) {
          ts2 = partsToTs({ y: base.y, m: base.m, d: base.d, hh: tOut.hh, mm: tOut.mm, ss: tOut.ss });
          if (ts2 < row.ts1) ts2 += 86400000; // ra sau nửa đêm
        } else if (d2 && d2.hasTime) {
          ts2 = partsToTs({ y: base.y, m: base.m, d: base.d, hh: d2.hh, mm: d2.mm, ss: d2.ss });
          if (ts2 < row.ts1) ts2 += 86400000;
        }
        row.ts2 = ts2;
        row.time2 = ts2 !== null ? fmtDateTime(tsToParts(ts2)) : '';
      }
      // --- khối lượng (kg) ---
      if (net === null) net = Math.abs(gross - tare);
      if (isCancelledPlate(plate)) { cancelled.push({ idx: r + 1 + rowOff, ticket: normTicket(g('ticket')), net }); continue; }
      if (tare !== null && gross !== null) {
        if (tare > gross) {
          issues.swap.push(row.idx); row.warn.push('Cân lần 1 (' + tare + ') > cân lần 2 (' + gross + ')');
          if (opts.autoSwap) { const t = tare; tare = gross; gross = t; row.swapped = true; }
        }
        if (Math.abs(Math.abs(gross - tare) - net) > 1) { issues.mismatch.push(row.idx); row.warn.push('KL hàng ≠ |lần 2 − lần 1|'); }
      }
      if (net <= 0) { issues.nonPos.push(row.idx); row.warn.push('KL hàng ≤ 0'); }
      row.tare = tare; row.gross = gross; row.net = net;
      // --- biển số bất thường (vd "BO") ---
      if (plate && !PLATE_RE.test(plate)) { issues.plate.push(row.idx + ' "' + plate + '"'); row.warn.push('Biển số bất thường'); }
      // --- trùng số phiếu ---
      if (row.ticket) {
        if (seenTicket.has(row.ticket)) { issues.dupTicket.push(row.idx + ' (trùng dòng ' + seenTicket.get(row.ticket) + ')'); row.warn.push('Trùng số phiếu'); }
        else seenTicket.set(row.ticket, row.idx);
      }
      rows.push(row);
    }
    ds.rows = rows;
    ds.skipped = skipped;
    ds.cancelled = cancelled;
    ds.cancelledKg = cancelled.reduce((a, c) => a + c.net, 0);
    if (!rows.length) { ds.errors.push('Không có dòng dữ liệu hợp lệ sau dòng tiêu đề.'); return ds; }

    // ---- Cảnh báo dữ liệu ----
    const lim = (a) => a.slice(0, 8).join(', ') + (a.length > 8 ? ' … (+' + (a.length - 8) + ')' : '');
    if (issues.noDate.length) ds.warnings.push('⚠ ' + issues.noDate.length + ' dòng thiếu/sai ngày cân (dòng Excel: ' + lim(issues.noDate) + ').');
    if (cancelled.length) ds.warnings.push('🚫 Đã loại ' + cancelled.length + ' phiếu "BO" (bỏ cân, xe cân lại phiếu khác) khỏi biên bản — dòng Excel: ' + cancelled.map((c) => c.idx + (c.ticket ? ' (phiếu ' + c.ticket + ', ' + Math.round(c.net).toLocaleString('vi-VN') + ' kg)' : '')).slice(0, 8).join(', ') + (cancelled.length > 8 ? ' …' : '') + '.');
    if (issues.swap.length) ds.warnings.push('⚠ ' + issues.swap.length + ' dòng có cân lần 1 > cân lần 2, nghi nhập đảo (dòng Excel: ' + lim(issues.swap) + ')' + (opts.autoSwap ? ' — đã tự hoán đổi theo Cài đặt.' : ' — giữ nguyên số liệu gốc; bật "Tự hoán đổi" trong Cài đặt nếu muốn sửa tự động.'));
    if (issues.mismatch.length) ds.warnings.push('⚠ ' + issues.mismatch.length + ' dòng có KL hàng ≠ |cân lần 2 − cân lần 1| (dòng Excel: ' + lim(issues.mismatch) + ').');
    if (issues.nonPos.length) ds.warnings.push('⚠ ' + issues.nonPos.length + ' dòng có KL hàng ≤ 0 (dòng Excel: ' + lim(issues.nonPos) + ').');
    if (issues.plate.length) ds.warnings.push('⚠ ' + issues.plate.length + ' dòng có biển số bất thường (dòng Excel: ' + lim(issues.plate) + ').');
    if (issues.dupTicket.length) ds.warnings.push('⚠ ' + issues.dupTicket.length + ' phiếu bị trùng số phiếu (dòng Excel: ' + lim(issues.dupTicket) + ').');
    ds.issues = issues;

    // ---- Thống kê ----
    ds.stats = computeStats(rows);
    // ---- Đối chiếu với dòng "Tổng số" trong tiêu đề báo cáo ----
    const mt = ds.meta;
    // (đối chiếu tính cả phiếu BO vì tiêu đề báo cáo của phần mềm cân vẫn đếm chúng)
    const allTrips = ds.stats.trips + cancelled.length, allKg = ds.stats.kg + ds.cancelledKg;
    if (mt.declaredTrips !== null && mt.declaredTrips !== allTrips)
      ds.warnings.push('⚠ Số xe đọc được (' + allTrips + ') khác "Tổng số" ghi ở tiêu đề báo cáo (' + mt.declaredTrips + ').');
    if (mt.declaredKg !== null && Math.abs(mt.declaredKg - allKg) > 1)
      ds.warnings.push('⚠ Tổng KL đọc được (' + allKg.toLocaleString('en-US') + ' kg) khác "Tổng KL" ghi ở tiêu đề báo cáo (' + mt.declaredKg.toLocaleString('en-US') + ' kg).');
    ds.reconciled = mt.declaredTrips !== null && mt.declaredTrips === allTrips && mt.declaredKg !== null && Math.abs(mt.declaredKg - allKg) <= 1;
    ds.ok = true;
    return ds;
  }

  /** Biển số "BO" = bỏ cân (không tính vào biên bản). */
  function isCancelledPlate(plate) { return !!plate && norm(plate).replace(/[^a-z0-9]/g, '') === 'bo'; }

  function colName(i) {
    let s = ''; i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /* ---------------------------------------------------------------
   * Thống kê
   * ------------------------------------------------------------- */
  function computeStats(rows) {
    let kg = 0, minTs = Infinity, maxTs = -Infinity;
    const plates = new Map(), groups = new Map(), tickets = new Set();
    rows.forEach((r) => {
      kg += r.net;
      if (r.ts1 !== null) { if (r.ts1 < minTs) minTs = r.ts1; if (r.ts1 > maxTs) maxTs = r.ts1; }
      let p = plates.get(r.plate);
      if (!p) { p = { plate: r.plate, trips: 0, kg: 0, minTs: Infinity, maxTs: -Infinity }; plates.set(r.plate, p); }
      p.trips++; p.kg += r.net;
      if (r.ts1 !== null) { if (r.ts1 < p.minTs) p.minTs = r.ts1; if (r.ts1 > p.maxTs) p.maxTs = r.ts1; }
      const gk = r.note || '';
      let g = groups.get(gk);
      if (!g) { g = { label: gk, trips: 0, kg: 0, minTs: Infinity, maxTs: -Infinity }; groups.set(gk, g); }
      g.trips++; g.kg += r.net;
      if (r.ts1 !== null) { if (r.ts1 < g.minTs) g.minTs = r.ts1; if (r.ts1 > g.maxTs) g.maxTs = r.ts1; }
      if (r.ticket) tickets.add(r.ticket);
    });
    const byPlate = Array.from(plates.values()).sort((a, b) => a.plate.localeCompare(b.plate));
    return {
      trips: rows.length, kg, tons: kg / 1000, tickets: tickets.size,
      plates: byPlate.length, byPlate, groups: Array.from(groups.values()),
      minTs: isFinite(minTs) ? minTs : null, maxTs: isFinite(maxTs) ? maxTs : null,
      from: isFinite(minTs) ? fmtDate(tsToParts(minTs)) : '', to: isFinite(maxTs) ? fmtDate(tsToParts(maxTs)) : ''
    };
  }

  HAK.Excel = {
    FIELDS, RULES, readFile, readBuffer, parseSheet, computeStats,
    util: { norm, parseNum, parseDT, partsToTs, tsToParts, fmtDate, fmtDateTime, normTicket, colName, isBlank }
  };
})(typeof window !== 'undefined' ? window : globalThis);
