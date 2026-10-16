/**
 * settings.js — Trang ⚙️ Cài đặt: cấu hình công ty, kho, mẫu Word (upload), cài đặt chung, sao lưu.
 * v2.6.9: Công ty / Kho / Mã ĐVVC sửa qua cửa sổ nổi (💾 Lưu / Hủy), xóa có kiểm tra nơi đang dùng; Cài đặt chung có nút Lưu / Hủy thay đổi.
 * Lưu vào localStorage (HAK.Config.save) và cập nhật lại các dropdown ở các trang.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, confirmClick, debounce } = HAK.UI;
  const C = () => HAK.Config;

  const WH_TYPES = ['Kho xuất', 'Kho nhận', 'Kho gửi', 'Cảng', 'Kho khác'];
  const COMPANY_FIELDS = [
    ['name', 'Tên công ty', 6], ['short', 'Tên viết tắt', 3], ['kind', 'Loại', 3],
    ['tax', 'Mã số thuế / MST', 3], ['address', 'Địa chỉ', 9],
    ['rep', 'Người đại diện', 4], ['salutation', 'Xưng hô', 2], ['position', 'Chức vụ', 3], ['factory', 'Nhà máy (Ủy thác)', 3],
    ['email', 'Email', 6], ['phone', 'Số điện thoại', 6],
    ['cua', 'Tên ghi trên chứng từ xuất hàng (cột "Của" PXK / chủ lâm sản BKLS)', 12]
  ];

  const changed = debounce(() => {
    const ok = C().save();
    if (HAK.Pages) HAK.Pages.refreshSelects();
    const el = $('#savedTick');
    if (el) { el.textContent = ok ? '✓ Đã lưu' : '⚠ Không lưu được — bộ nhớ trình duyệt đầy hoặc bị chặn'; el.classList.toggle('text-danger', !ok); setTimeout(() => { el.textContent = ''; }, ok ? 1500 : 6000); }
  }, 250);

  /* ===============================================================
   * v2.6.9 (Thủy chốt 29/09/2026: 1A · 2 chặn hẳn · 3 thêm "Kho xuất mặc định")
   * Công ty / Kho / Mã ĐVVC: danh sách CHỈ XEM + nút ✏ Sửa / 🗑 Xóa; Sửa / Thêm mở cửa sổ nổi có 💾 Lưu / Hủy — chỉ ghi khi bấm Lưu.
   * Xóa: kiểm tra nơi đang dùng → đang dùng thì CHẶN (liệt kê chỗ dùng); không dùng → bấm 2 lần để xác nhận.
   * ============================================================= */
  let modal = null, saveFn = null, warnKey = '';
  function ensureModal() {
    if (modal) return;
    const el = document.createElement('div');
    el.className = 'modal fade'; el.id = 'setModal'; el.tabIndex = -1;
    el.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="setModalTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><form id="setModalForm" autocomplete="off"><div class="row g-2" id="setModalBody"></div><button type="submit" hidden></button></form></div>' +
      '<div class="modal-footer"><div class="small me-auto" id="setModalMsg"></div>' +
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button><button type="button" class="btn btn-primary" id="setModalSave">💾 Lưu</button></div></div></div>';
    document.body.appendChild(el);
    modal = root.bootstrap.Modal.getOrCreateInstance(el);
    const go = (e) => { if (e) e.preventDefault(); if (saveFn) saveFn(); };
    $('#setModalSave').addEventListener('click', go);
    $('#setModalForm').addEventListener('submit', go);
    el.addEventListener('shown.bs.modal', () => { const f = el.querySelector('#setModalBody input, #setModalBody select'); if (f) f.focus(); });
  }
  /** fields: [{k, label, col, type:'text'|'select', options:[[v, text]], value, ph, req, help}]; onSave(v, ack) → { errors?, warnings? } */
  function openForm(title, fields, onSave) {
    ensureModal();
    $('#setModalTitle').textContent = title;
    $('#setModalBody').innerHTML = fields.map((f) => {
      const id = 'sf-' + f.k, val = f.value == null ? '' : String(f.value);
      const ctl = f.type === 'select'
        ? '<select class="form-select" id="' + id + '">' + f.options.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>'
        : '<input class="form-control" id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(f.ph || '') + '">';
      return '<div class="col-md-' + (f.col || 6) + '"><label class="form-label small' + (f.req ? ' req' : '') + '" for="' + id + '">' + esc(f.label) + '</label>' + ctl +
        (f.help ? '<div class="form-text">' + esc(f.help) + '</div>' : '') + '</div>';
    }).join('');
    $('#setModalMsg').innerHTML = ''; warnKey = '';
    saveFn = () => {
      const v = {}; fields.forEach((f) => { v[f.k] = String($('#sf-' + f.k).value || '').trim(); });
      const key = JSON.stringify(v), r = onSave(v, warnKey === key) || {};
      const msg = $('#setModalMsg');
      if (r.errors && r.errors.length) { warnKey = ''; msg.className = 'small me-auto text-danger'; msg.innerHTML = r.errors.map(esc).join('<br>'); return; }
      if (r.warnings && r.warnings.length) { warnKey = key; msg.className = 'small me-auto text-warning'; msg.innerHTML = r.warnings.map(esc).join('<br>') + '<br><b>Bấm Lưu lần nữa để vẫn lưu.</b>'; return; }
      modal.hide();
    };
    modal.show();
  }
  const norm = (x) => String(x || '').trim().toLowerCase();
  /** Lưu cấu hình + cập nhật các ô chọn ở các trang. */
  function commit(msg) {
    const ok = C().save();
    if (HAK.Pages) HAK.Pages.refreshSelects();
    toast(ok ? msg : 'Không lưu được — bộ nhớ trình duyệt đầy hoặc bị chặn.', ok ? 'success' : 'error');
    return ok;
  }
  /** Nút Xóa: lần 1 kiểm tra nơi đang dùng (đang dùng → chặn), không dùng → chờ bấm lần 2. */
  async function onDelete(btn, usageFn, doDelete, what) {
    if (btn.dataset.armed === '1') { confirmClick(btn, doDelete); return; }
    btn.disabled = true;
    let used = [];
    try { used = await usageFn(); } finally { btn.disabled = false; }
    if (used.length) { toast('Không xóa được ' + what + ' — đang được dùng ở: ' + used.join('; ') + '.', 'warning'); return; }
    confirmClick(btn, doDelete, 'Xác nhận xóa?');
  }
  const actBtns = (kind, i) => '<td class="text-end text-nowrap"><div class="btn-group btn-group-sm">' +
    '<button class="btn btn-outline-primary" type="button" title="Sửa" data-' + kind + '-edit="' + i + '">✏<span class="d-none d-md-inline"> Sửa</span></button>' +
    '<button class="btn btn-outline-danger" type="button" title="Xóa" data-' + kind + '-del="' + i + '">🗑<span class="d-none d-md-inline"> Xóa</span></button></div></td>';
  const whName = (id) => { const w = C().data.warehouses.find((x) => x.id === id); return w ? (w.short || w.name) : ''; };

  /* ---------------- Công ty ---------------- */
  function companyUsage(id) {
    return (async () => {
      const out = [], K = HAK.Catalog;
      if (K && K.byCompany) {
        const cu = K.byCompany(id);
        const n = cu ? K.contracts().filter((c) => [c.sellerId, c.customerId, c.deliverId].indexOf(cu.id) >= 0).length : 0;
        if (n) out.push(n + ' hợp đồng trong Danh mục');
      }
      const au = HAK.Store.get('hak.auth.v1', null);
      if (au) {
        const us = (au.users || []).filter((u) => u.role !== 'admin' && (u.companies || []).indexOf(id) >= 0);
        if (us.length) out.push(us.length + ' nhân viên được gán (' + us.map((u) => u.username).join(', ') + ')');
        if (au.station && (au.station.cos || []).indexOf(id) >= 0) out.push('máy trạm của công ty này');
      }
      const gs = (HAK.Store.get('hak.gsync.v2', null) || {}).cos || {};
      if (gs[id] && gs[id].url) out.push('cấu hình Google Sheet');
      if (HAK.Auth && HAK.Auth.company && HAK.Auth.company() === id) out.push('công ty đang làm việc');
      if (HAK.Archive && HAK.Auth && HAK.Auth.companyOfMeta) {
        try { const n = (await HAK.Archive.list()).filter((m) => HAK.Auth.companyOfMeta(m) === id).length; if (n) out.push(n + ' hồ sơ Lưu trữ'); } catch (e) { /* bỏ qua */ }
      }
      if (C().data.companies.length <= 1) out.push('(cần giữ lại ít nhất 1 công ty)');
      return out;
    })();
  }
  function companyForm(i) {
    const isNew = i < 0;
    const c = isNew ? { kind: 'Công ty', salutation: 'Ông', position: 'Giám đốc' } : C().data.companies[i];
    const whOpts = [['', '— Chưa chọn —']].concat(C().data.warehouses.map((w) => [w.id, (w.short || w.name) + (w.type ? ' · ' + w.type : '')]));
    const fields = COMPANY_FIELDS.map(([k, label, col]) => {
      const f = { k, label, col, value: k === 'cua' ? (isNew ? '' : C().companyAttr(c, 'cua')) : (c[k] || ''), req: k === 'name' || k === 'short' };
      if (k === 'kind') Object.assign(f, { type: 'select', options: [['Công ty', 'Công ty'], ['Chi nhánh', 'Chi nhánh']] });
      if (k === 'salutation') Object.assign(f, { type: 'select', options: [['Ông', 'Ông'], ['Bà', 'Bà']] });
      return f;
    });
    const at = fields.findIndex((f) => f.k === 'factory') + 1;
    fields.splice(at, 0, { k: 'khoXuat', label: 'Kho xuất mặc định', col: 6, type: 'select', options: whOpts, value: isNew ? '' : C().companyAttr(c, 'khoXuat') || '',
      help: 'Chọn công ty làm bên xuất → tự chọn kho xuất này; là "Vận chuyển từ" trên BKLS.' });
    openForm(isNew ? 'Thêm công ty' : 'Sửa công ty — ' + (c.short || c.name), fields, (v, ack) => {
      const errors = [], warnings = [], others = C().data.companies.filter((x, j) => j !== i);
      if (!v.name) errors.push('Nhập tên công ty.');
      if (!v.short) errors.push('Nhập tên viết tắt.');
      else if (others.some((x) => norm(x.short) === norm(v.short))) errors.push('Tên viết tắt "' + v.short + '" đã có ở công ty khác.');
      if (errors.length) return { errors };
      if (v.tax && others.some((x) => norm(x.tax) === norm(v.tax))) warnings.push('Mã số thuế ' + v.tax + ' trùng với công ty khác.');
      if (warnings.length && !ack) return { warnings };
      const obj = isNew ? { id: C().newId('c_') } : c;
      Object.assign(obj, v);
      if (isNew) C().data.companies.push(obj);
      if (HAK.Catalog && HAK.Catalog.syncCompanies) { try { HAK.Catalog.syncCompanies(); } catch (e) { /* bỏ qua */ } }
      commit((isNew ? 'Đã thêm' : 'Đã lưu') + ' công ty ' + (v.short || v.name) + '.');
      renderCompanies();
      return {};
    });
  }
  function renderCompanies() {
    $('#companyList').innerHTML = '<div class="tbl-wrap" style="max-height:none"><table class="table align-middle mb-0 set-tbl"><thead><tr><th>Tên viết tắt</th><th style="min-width:200px">Tên công ty</th><th>Loại</th><th>Mã số thuế</th><th>Kho xuất mặc định</th><th>Người đại diện</th><th></th></tr></thead><tbody>' +
      C().data.companies.map((c, i) => '<tr><td class="fw-semibold">' + esc(c.short || '') + '</td><td>' + esc(c.name || '') + '</td><td><span class="badge badge-soft">' + esc(c.kind || '') + '</span></td>' +
        '<td class="mono">' + esc(c.tax || '') + '</td><td>' + (esc(whName(C().companyAttr(c, 'khoXuat'))) || '<span class="text-warning small">chưa chọn</span>') + '</td>' +
        '<td>' + esc([c.salutation, c.rep].filter(Boolean).join(' ')) + (c.position ? '<div class="small muted">' + esc(c.position) + '</div>' : '') + '</td>' + actBtns('co', i) + '</tr>').join('') +
      '</tbody></table></div>';
    $$('#companyList [data-co-edit]').forEach((b) => b.addEventListener('click', () => companyForm(+b.dataset.coEdit)));
    $$('#companyList [data-co-del]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.coDel, c = C().data.companies[i];
      onDelete(b, () => companyUsage(c.id), () => { C().data.companies.splice(i, 1); commit('Đã xóa công ty ' + (c.short || c.name) + '.'); renderCompanies(); renderWarehouses(); }, 'công ty ' + (c.short || c.name));
    }));
  }

  /* ---------------- Kho ---------------- */
  function whUsage(id) {
    const out = [];
    const cos = C().data.companies.filter((c) => C().companyAttr(c, 'khoXuat') === id);
    if (cos.length) out.push('kho xuất mặc định của ' + cos.map((c) => c.short || c.name).join(', '));
    const n = HAK.Catalog ? HAK.Catalog.contracts().filter((c) => c.whId === id).length : 0;
    if (n) out.push(n + ' hợp đồng trong Danh mục (kho xuất)');
    const pages = Object.keys((HAK.Pages && HAK.Pages.DOCS) || {}).filter((t) => { const sv = HAK.Store.get('hak.form.' + t, null) || {}; return sv.khoGiaoId === id || sv.khoNhanId === id; });
    if (pages.length) out.push('đang chọn ở trang ' + pages.map((t) => HAK.Pages.DOCS[t].title).join(', '));
    if (C().data.warehouses.length <= 1) out.push('(cần giữ lại ít nhất 1 kho)');
    return Promise.resolve(out);
  }
  function whForm(i) {
    const isNew = i < 0, w = isNew ? { type: 'Kho xuất' } : C().data.warehouses[i];
    openForm(isNew ? 'Thêm kho / cảng' : 'Sửa kho — ' + (w.short || w.name), [
      { k: 'name', label: 'Tên kho', col: 8, value: w.name || '', req: true },
      { k: 'type', label: 'Loại kho', col: 4, type: 'select', options: WH_TYPES.map((t) => [t, t]), value: w.type || 'Kho khác' },
      { k: 'short', label: 'Tên rút gọn', col: 6, value: w.short || '' },
      { k: 'code', label: 'Ký hiệu kho', col: 6, value: isNew ? '' : C().whAttr(w, 'code'), ph: 'VD: HAKĐN', help: 'Hiện ở ô "Ký hiệu kho gửi".' },
      { k: 'address', label: 'Địa chỉ', col: 12, value: w.address || '', help: 'Là "Xuất kho tại" / "Vận chuyển từ" trên BKLS và chứng từ.' },
      { k: 'label', label: 'Ghi phụ lục', col: 12, value: isNew ? '' : C().whAttr(w, 'label'), ph: 'VD: HAK Đà Nẵng', help: 'Chữ ghi vào cột "Kho xuất" ở phụ lục.' }
    ], (v, ack) => {
      const errors = [], warnings = [], others = C().data.warehouses.filter((x, j) => j !== i);
      if (!v.name) errors.push('Nhập tên kho.');
      if (errors.length) return { errors };
      if (v.code && others.some((x) => norm(C().whAttr(x, 'code')) === norm(v.code))) warnings.push('Ký hiệu kho "' + v.code + '" trùng với kho khác.');
      if (others.some((x) => norm(x.name) === norm(v.name))) warnings.push('Đã có kho cùng tên "' + v.name + '".');
      if (warnings.length && !ack) return { warnings };
      const obj = isNew ? { id: C().newId('w_') } : w;
      Object.assign(obj, v, { short: v.short || v.name });
      if (isNew) C().data.warehouses.push(obj);
      commit((isNew ? 'Đã thêm' : 'Đã lưu') + ' kho ' + (obj.short || obj.name) + '.');
      renderWarehouses(); renderCompanies();
      return {};
    });
  }
  function renderWarehouses() {
    $('#whList').innerHTML = C().data.warehouses.map((w, i) =>
      '<tr><td>' + esc(w.name) + '</td><td>' + esc(w.short || '') + '</td><td class="small">' + esc(w.address || '') + '</td>' +
      '<td>' + esc(C().whAttr(w, 'label')) + '</td><td class="mono">' + esc(C().whAttr(w, 'code')) + '</td><td><span class="badge badge-soft">' + esc(w.type || '') + '</span></td>' + actBtns('wh', i) + '</tr>').join('');
    $$('#whList [data-wh-edit]').forEach((b) => b.addEventListener('click', () => whForm(+b.dataset.whEdit)));
    $$('#whList [data-wh-del]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.whDel, w = C().data.warehouses[i];
      onDelete(b, () => whUsage(w.id), () => { C().data.warehouses.splice(i, 1); commit('Đã xóa kho ' + (w.short || w.name) + '.'); renderWarehouses(); }, 'kho ' + (w.short || w.name));
    }));
  }

  /* ---------------- Mẫu Word ---------------- */
  const fmtKB = (n) => (n / 1024).toFixed(1) + ' KB';
  async function renderTemplates() {
    const box = $('#tplList'); let html = '';
    for (const key of Object.keys(HAK.TEMPLATE_DEFS)) {
      let st = '<span class="badge text-bg-secondary">Chưa có</span>', det = '';
      try {
        const t = await HAK.Word.Templates.get(key);
        st = t.source === 'custom' ? '<span class="badge text-bg-warning">Tùy chỉnh</span>' : '<span class="badge badge-soft">Mặc định</span>';
        det = esc(t.name) + ' · ' + fmtKB(t.size || t.bytes.length);
      } catch (e) { det = esc(e.message); }
      html += '<div class="d-flex flex-wrap align-items-center gap-2 py-2 border-bottom" data-tpl="' + key + '">' +
        '<div class="flex-grow-1" style="min-width:240px"><div class="fw-semibold">' + esc(HAK.TEMPLATE_DEFS[key].title) + '</div><div class="small muted">' + st + ' ' + det + '</div><div class="small mt-1" id="tplInfo-' + key + '"></div></div>' +
        '<button class="btn btn-sm btn-outline-secondary" data-act="dl" type="button">⬇ Tải mẫu</button>' +
        '<label class="btn btn-sm btn-outline-primary mb-0">⬆ Upload mẫu .docx<input type="file" accept=".docx" hidden data-act="up"></label>' +
        '<button class="btn btn-sm btn-outline-danger" data-act="reset" type="button">Khôi phục mặc định</button></div>';
    }
    box.innerHTML = html;
    $$('#tplList [data-tpl]').forEach((row) => {
      const key = row.dataset.tpl;
      row.querySelector('[data-act=dl]').addEventListener('click', () => HAK.Word.Templates.download(key).catch((e) => toast(e.message, 'error')));
      row.querySelector('[data-act=reset]').addEventListener('click', () => { HAK.Word.Templates.reset(key); toast('Đã khôi phục mẫu mặc định.', 'info'); renderTemplates(); });
      row.querySelector('[data-act=up]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try {
          const r = await HAK.Word.Templates.saveCustom(key, f);
          toast('Đã nạp mẫu "' + f.name + '" (' + r.info.tags.length + ' placeholder)' + (r.persisted ? '' : ' — chỉ dùng trong phiên này (trình duyệt không cho lưu).'), r.persisted ? 'success' : 'warning');
          await renderTemplates();
          const info = $('#tplInfo-' + key);
          if (info) info.innerHTML = 'Placeholder tìm thấy: ' + (r.info.tags.map((t) => '<kbd class="ph">' + esc(t) + '</kbd>').join(' ') || '(không có)') +
            (r.info.unknown.length ? '<div class="text-warning mt-1">⚠ Không có dữ liệu cho: ' + esc(r.info.unknown.join(', ')) + ' — sẽ để trống.</div>' : '');
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    $('#phList').innerHTML = HAK.PLACEHOLDERS.map((r) => '<tr><td><code class="ph">' + esc(r[0]) + '</code></td><td>' + esc(r[1]) + '</td></tr>').join('');
  }

  /* ---------------- Chung ---------------- */
  let gDraft = null, gDirty = false;
  function renderGeneral() {
    const g = C().data.general;
    gDraft = Object.assign({}, g); gDirty = false;
    $('#generalBody').innerHTML =
      '<div class="row g-3">' +
      '<div class="col-md-4"><label class="form-label">Nơi lập văn bản</label><input class="form-control" data-g="place" value="' + esc(g.place) + '"><div class="form-text">Dùng cho "Đà Nẵng, ngày … tháng … năm …" trong Quyết định.</div></div>' +
      '<div class="col-md-4"><label class="form-label">Ký hiệu cho giá trị bỏ trống</label><input class="form-control" data-g="blank" value="' + esc(g.blank) + '"><div class="form-text">Hiện trong Word khi bạn chưa nhập (vd số hợp đồng) để điền tay.</div></div>' +
      '<div class="col-md-4"><label class="form-label">Kiểu cân mặc định (Điều chuyển)</label><input class="form-control" data-g="defaultWeightType" value="' + esc(g.defaultWeightType) + '"></div>' +
      '<div class="col-md-6"><label class="form-label">Đơn vị vận chuyển mặc định</label><input class="form-control" data-g="defaultCarrier" value="' + esc(g.defaultCarrier) + '"><div class="form-text">Dùng khi Excel không có cột "Đơn vị vận chuyển".</div></div>' +
      '<div class="col-md-6"><label class="form-label">Tài xế mặc định</label><input class="form-control" data-g="defaultDriver" value="' + esc(g.defaultDriver) + '"><div class="form-text">Dùng khi Excel không có cột "Tài xế". Thường để trống.</div></div>' +
      '<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="setSwap" data-g="autoSwap"' + (g.autoSwap ? ' checked' : '') + '><label class="form-check-label" for="setSwap">Tự hoán đổi Cân lần 1 / Cân lần 2 khi lần 1 lớn hơn lần 2 (nghi nhập đảo)</label></div></div>' +
      '</div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-3"><button class="btn btn-primary" id="gSave" type="button" disabled>💾 Lưu</button>' +
      '<button class="btn btn-outline-secondary" id="gCancel" type="button" disabled>Hủy thay đổi</button><span class="small" id="gState"></span></div><hr>' +
      '<div class="d-flex flex-wrap gap-2">' +
      '<button class="btn btn-outline-primary" id="btnExportCfg" type="button">⬇ Xuất cấu hình (.json)</button>' +
      '<label class="btn btn-outline-primary mb-0">⬆ Nhập cấu hình<input type="file" id="importCfg" accept=".json" hidden></label>' +
      '<button class="btn btn-outline-danger ms-auto" id="btnResetCfg" type="button">Khôi phục cấu hình mặc định</button></div>';
    const mark = (dirty) => {
      gDirty = dirty; $('#gSave').disabled = !dirty; $('#gCancel').disabled = !dirty;
      const st = $('#gState'); st.className = 'small ' + (dirty ? 'text-warning' : 'text-success'); st.textContent = dirty ? '● Có thay đổi chưa lưu' : '';
    };
    $$('#generalBody [data-g]').forEach((el) => el.addEventListener('input', () => {
      gDraft[el.dataset.g] = el.type === 'checkbox' ? el.checked : el.value; mark(true);
    }));
    $('#gSave').addEventListener('click', () => {
      const swapChanged = !!gDraft.autoSwap !== !!g.autoSwap;
      Object.assign(g, gDraft);
      if (commit('Đã lưu cài đặt chung.')) mark(false);
      if (swapChanged && HAK.App && HAK.App.reparse) HAK.App.reparse();
    });
    $('#gCancel').addEventListener('click', () => { renderGeneral(); toast('Đã hủy thay đổi cài đặt chung.', 'info'); });
    $('#btnExportCfg').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(C().data, null, 2)], { type: 'application/json' });
      HAK.Word.Files.saveBlob(blob, 'HAK_CauHinh.json');
    });
    $('#importCfg').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!Array.isArray(d.companies) || !Array.isArray(d.warehouses)) throw new Error('File không đúng định dạng cấu hình.');
        C().data.companies = d.companies; C().data.warehouses = d.warehouses; C().data.general = Object.assign(C().data.general, d.general || {}); if (Array.isArray(d.carrierCodes)) C().data.carrierCodes = d.carrierCodes;
        C().save(); HAK.Settings.render(); HAK.Pages.refreshSelects(); toast('Đã nhập cấu hình.', 'success');
      } catch (err) { toast('Không nhập được: ' + err.message, 'error'); }
    });
    $('#btnResetCfg').addEventListener('click', (e) => confirmClick(e.currentTarget, () => { C().reset(); HAK.Settings.render(); HAK.Pages.refreshSelects(); toast('Đã khôi phục mặc định.', 'info'); }, 'Bấm lần nữa để khôi phục'));
  }

  /* ---------------- Bảng đổi mã ĐVVC ---------------- */
  const ckey = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '').toLowerCase();
  function carrierForm(i) {
    const isNew = i < 0, c = isNew ? { code: '', name: '' } : C().data.carrierCodes[i];
    openForm(isNew ? 'Thêm mã đơn vị vận chuyển' : 'Sửa mã ' + c.code, [
      { k: 'code', label: 'Mã (trong file danh sách xe)', col: 4, value: c.code, req: true, ph: 'VD: HHH' },
      { k: 'name', label: 'Tên đầy đủ in ở cột ĐVVC', col: 8, value: c.name, req: true }
    ], (v) => {
      const errors = [];
      if (!v.code) errors.push('Nhập mã.');
      if (!v.name) errors.push('Nhập tên đầy đủ.');
      if (v.code && C().data.carrierCodes.some((x, j) => j !== i && ckey(x.code) === ckey(v.code))) errors.push('Mã "' + v.code + '" đã có.');
      if (errors.length) return { errors };
      if (isNew) C().data.carrierCodes.push(v); else Object.assign(c, v);
      commit((isNew ? 'Đã thêm' : 'Đã lưu') + ' mã ' + v.code + '.');
      renderCarriers(); if (HAK.App && HAK.App.reparse) HAK.App.reparse();
      return {};
    });
  }
  function renderCarriers() {
    const list = C().data.carrierCodes;
    $('#carrierList').innerHTML = '<div class="tbl-wrap" style="max-height:none"><table class="table align-middle mb-0 set-tbl"><thead><tr><th style="width:140px">Mã</th><th>Tên đầy đủ</th><th></th></tr></thead><tbody>' +
      list.map((c, i) => '<tr><td class="mono fw-semibold">' + esc(c.code) + '</td><td>' + esc(c.name) + '</td>' + actBtns('ca', i) + '</tr>').join('') +
      '</tbody></table></div>' +
      '<div class="form-text">Mã lấy từ cột đơn vị trong file danh sách xe (không phân biệt hoa/thường, dấu, khoảng trắng: "HAK QN" = "hakqn").</div>';
    $$('#carrierList [data-ca-edit]').forEach((b) => b.addEventListener('click', () => carrierForm(+b.dataset.caEdit)));
    $$('#carrierList [data-ca-del]').forEach((b) => b.addEventListener('click', () => confirmClick(b, () => {
      const c = C().data.carrierCodes[+b.dataset.caDel];
      C().data.carrierCodes.splice(+b.dataset.caDel, 1); commit('Đã xóa mã ' + c.code + '.'); renderCarriers(); if (HAK.App && HAK.App.reparse) HAK.App.reparse();
    }, 'Xác nhận xóa?')));
  }

  HAK.Settings = {
    init() {
      $('#btnAddCarrier').addEventListener('click', () => carrierForm(-1));
      $('#btnAddCompany').addEventListener('click', () => companyForm(-1));
      $('#btnAddWh').addEventListener('click', () => whForm(-1));
      // Cài đặt chung chưa lưu mà rời trang Cài đặt → nhắc
      root.addEventListener('hashchange', () => { if (gDirty && !/^#\/settings/.test(location.hash)) toast('Cài đặt chung có thay đổi CHƯA LƯU — quay lại Cài đặt → Chung bấm 💾 Lưu (hoặc Hủy thay đổi).', 'warning'); });
      this.render();
    },
    render() { renderCompanies(); renderWarehouses(); renderTemplates(); renderGeneral(); renderCarriers(); }
  };
})(window);
