/**
 * ui.js — Tiện ích giao diện dùng chung: toast, loading, thanh tiến độ, escape HTML, chủ đề sáng/tối.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Toast ---------- */
  function toast(msg, type, ms) {
    type = type || 'info';
    const cls = { success: 'text-bg-success', error: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-primary' }[type];
    const el = document.createElement('div');
    el.className = 'toast align-items-center border-0 ' + cls;
    el.setAttribute('role', 'alert');
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + esc(msg) + '</div>' +
      '<button type="button" class="btn-close ' + (type === 'warning' ? '' : 'btn-close-white') + ' me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    $('#toasts').appendChild(el);
    const t = new bootstrap.Toast(el, { delay: ms || (type === 'error' ? 8000 : 4500) });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  /* ---------- Loading overlay + thanh tiến độ trên cùng ---------- */
  let topTimer = null;
  const Loading = {
    show(msg) { $('#loading').classList.remove('d-none'); this.set(0, msg || 'Đang xử lý…'); },
    set(pct, msg) {
      if (msg) $('#loadingMsg').textContent = msg;
      pct = Math.max(0, Math.min(100, pct || 0));
      $('#loadingBar').style.width = pct + '%';
      $('#loadingPct').textContent = Math.round(pct) + '%';
      Loading.top(pct);
    },
    hide() { $('#loading').classList.add('d-none'); Loading.top(100); },
    top(pct) {
      const bar = $('#topProgress .bar');
      clearTimeout(topTimer);
      bar.style.width = pct + '%';
      if (pct >= 100) topTimer = setTimeout(() => { bar.style.width = '0%'; }, 500);
    }
  };

  /* ---------- Chủ đề ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-bs-theme', t);
    HAK.Store.set('hak.theme', t);
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
  }

  /** Nút "bấm 2 lần để xác nhận" (tránh dùng hộp thoại confirm của trình duyệt). */
  function confirmClick(btn, action, label) {
    if (btn.dataset.armed === '1') { clearTimeout(btn._t); btn.dataset.armed = ''; btn.innerHTML = btn.dataset.orig; action(); return; }
    btn.dataset.armed = '1'; btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = label || 'Bấm lần nữa để xác nhận';
    btn._t = setTimeout(() => { btn.dataset.armed = ''; btn.innerHTML = btn.dataset.orig; }, 3500);
  }

  const debounce = (fn, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms || 200); }; };
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- Nạp thư viện khi cần (không nạp sẵn lúc mở app để khởi động nhanh) ---------- */
  const loaded = {};
  /** Chèn <script src> một lần; lỗi thì cho phép thử lại lần sau. */
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('Không nạp được ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  /** Thư viện nặng chỉ dùng ở vài chức năng: [biến toàn cục kiểm tra, file]. */
  const LIBS = {
    exceljs: ['ExcelJS', 'libs/exceljs.min.js'],          // Xuất Excel lưu trữ, Báo cáo tổng hợp (~0,9 MB)
    docxPreview: ['docx', 'libs/docx-preview.min.js']     // Tải PDF biên bản (dựng trang từ Word)
  };
  async function needLib(name) {
    const L = LIBS[name];
    if (L && !root[L[0]]) await loadScript(L[1]);
  }

  HAK.UI = { $, $$, esc, toast, Loading, setTheme, toggleTheme, confirmClick, debounce, todayISO, loadScript, needLib };
})(window);
