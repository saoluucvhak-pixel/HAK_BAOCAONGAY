/**
 * auth.js — 🔒 Đăng nhập + người dùng (v2.6.1 Phase B). Thủy chốt 27/09/2026: nhiều người dùng, 2 quyền (Quản trị / Nhân viên),
 * mỗi người được gán công ty được làm (dùng ở Phase C — chọn công ty xuất).
 *
 * LƯU Ý: app chạy offline trong trình duyệt → đây là CHỐT CỬA (chặn người lạ mở app, ghi "người lập"), KHÔNG phải bảo mật máy chủ:
 * ai vào được tài khoản Windows của máy vẫn đọc được dữ liệu trình duyệt nếu cố ý. Mật khẩu chỉ lưu dạng băm (SHA-256 × 2.000 vòng + muối).
 * Dữ liệu: HAK.Store 'hak.auth.v1' = { v, users:[{ id, username, name, role:'admin'|'staff', companies:[companyId], disabled, salt, hash, createdAt }], rec:{ salt, hash } }
 *          (nằm trong Sao lưu toàn bộ). Phiên: sessionStorage 'hak.session' → giữ đăng nhập tới khi đóng trình duyệt.
 * Quyền Nhân viên (ẩn bằng lớp body.role-staff — xem style.css): không vào Cài đặt (trừ tab 👤 Tài khoản), Danh mục chỉ xem,
 * không xóa hồ sơ Lưu trữ / dòng nhật ký, không khôi phục sao lưu.
 * v2.6.2 Phase C — CÔNG TY LÀM VIỆC (Thủy chốt 2a/3a): chọn sau khi đăng nhập (chỉ công ty người dùng được làm; Quản trị = mọi công ty
 * trong Cài đặt; 1 công ty thì vào thẳng), lưu trong phiên ('hak.session'.co) + nhớ lần trước ('hak.auth.lastco'). Công ty = "bên xuất"
 * (ô Của / chủ lâm sản): các trang lấy làm MẶC ĐỊNH (vẫn đổi được); Danh mục / Lưu trữ / Báo cáo mặc định chỉ hiện dữ liệu liên quan công ty,
 * có công tắc "Xem tất cả công ty" (scopeIds / scopeSwitch — nhớ ở 'hak.scope.v1'). Đổi công ty = tải lại app (dữ liệu đã nạp vẫn giữ).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.auth.v1', SKEY = 'hak.session', ITER = 2000;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- SHA-256 (thuần JS — chạy như nhau trên mọi máy, kể cả khi mở từ file://) ---------------- */
  const K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256hex(str) {
    const bytes = unescape(encodeURIComponent(str)), n = bytes.length;
    const words = new Array(((n + 9 + 63) >> 6) << 4).fill(0);
    for (let i = 0; i < n; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i & 3) * 8);
    words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
    words[words.length - 1] = n * 8;
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Array(64), ror = (x, r) => (x >>> r) | (x << (32 - r));
    for (let j = 0; j < words.length; j += 16) {
      for (let i = 0; i < 64; i++) {
        if (i < 16) w[i] = words[j + i] | 0;
        else { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0; }
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function hashPw(pw, salt) { let h = sha256hex(salt + ':' + pw); for (let i = 0; i < ITER; i++) h = sha256hex(h + salt); return h; }
  function rand(n, abc) {
    abc = abc || 'abcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint8Array(n); (root.crypto || root.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => abc[b % abc.length]).join('');
  }
  const newRecoveryCode = () => rand(12, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789').replace(/(.{4})(?=.)/g, '$1-');
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normUser = (s) => String(s || '').trim().toLowerCase();

  /* ---------------- Dữ liệu ---------------- */
  const data = () => { const d = HAK.Store.get(KEY, null); return d && Array.isArray(d.users) ? d : { v: 1, users: [], rec: null }; };
  const save = (d) => HAK.Store.set(KEY, d);
  const users = () => data().users;
  const allCompanyIds = () => ((HAK.Config && HAK.Config.data && HAK.Config.data.companies) || []).map((c) => c.id);
  let cur = null;                                                   // người đang đăng nhập (bản ghi)
  let curCo = '';                                                  // công ty làm việc (id trong Cài đặt → Công ty)
  const LASTCO = 'hak.auth.lastco', SCOPE = 'hak.scope.v1';
  const companies = () => (HAK.Config && HAK.Config.data && HAK.Config.data.companies) || [];
  /** Công ty người dùng được chọn: Quản trị = mọi công ty trong Cài đặt; Nhân viên = danh sách được gán (còn tồn tại). */
  /** v2.6.5 D4 — MÁY TRẠM: cài từ gói "cho công ty X" → d.station = { cos:[id], at, by }; null = máy chính (mọi công ty). */
  const station = () => { const st = data().station; return st && Array.isArray(st.cos) && st.cos.length ? st.cos.slice() : null; };
  function allowedCos(u) {
    u = u || cur; if (!u) return [];
    const st = station(), ids = companies().map((c) => c.id).filter((id) => !st || st.indexOf(id) >= 0);
    return u.role === 'admin' ? ids : (u.companies || []).filter((id) => ids.indexOf(id) >= 0);
  }
  const sessGet = () => { try { return JSON.parse(root.sessionStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } };
  const sessSet = (v) => { try { if (v) root.sessionStorage.setItem(SKEY, JSON.stringify(v)); else root.sessionStorage.removeItem(SKEY); } catch (e) { /* bị chặn */ } };
  const activeAdmins = (list) => list.filter((u) => u.role === 'admin' && !u.disabled);

  function setPassword(u, pw) { u.salt = rand(16); u.hash = hashPw(pw, u.salt); }
  function checkPw(u, pw) { return !!(u && u.salt && hashPw(pw, u.salt) === u.hash); }
  function pwProblem(pw) { return String(pw || '').length < 6 ? 'Mật khẩu tối thiểu 6 ký tự.' : ''; }
  function setRecovery(d) { const code = newRecoveryCode(), salt = rand(16); d.rec = { salt, hash: hashPw(normCode(code), salt) }; return code; }

  /* ---------------- v2.6.4 D3 — Khóa khôi phục của nhóm (công cụ HAK_KhoiPhucQuanTri.exe, ECDSA P-256) ----------------
   * d.groupPub = { key: base64 65 byte (khóa công khai thô), fp, at }; d.chal = { c: mã yêu cầu 12 ký tự, at } — giữ tới khi dùng xong / tạo mới.
   * Công cụ ký "HAK-RESET|1|<mã yêu cầu>|<tên đăng nhập>|<hết hạn giây>"; mã phản hồi = base64url(4 byte hết hạn + 64 byte chữ ký r||s). */
  const fpOf = (b64) => sha256hex(String(b64)).slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
  const b64Bytes = (s) => { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '') + '==='.slice((String(s).replace(/\s+/g, '').length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  const subtleOk = () => !!(root.crypto && root.crypto.subtle && root.TextEncoder);
  async function importPub(b64) {
    const raw = b64Bytes(b64);
    if (raw.length !== 65 || raw[0] !== 4) throw new Error('Khóa công khai không đúng (cần 65 byte, dạng base64 lấy từ công cụ khôi phục).');
    return root.crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  /** Kiểm tra mã phản hồi — trả '' nếu hợp lệ, ngược lại là lý do. */
  async function checkReset(pubB64, chal, user, code) {
    let b; try { b = b64Bytes(String(code || '').trim()); } catch (e) { return 'Mã phản hồi không đúng định dạng.'; }
    if (b.length !== 68) return 'Mã phản hồi không đúng định dạng (thiếu / thừa ký tự).';
    const exp = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3], now = Date.now() / 1000;
    if (exp < now) return 'Mã phản hồi đã hết hạn — xin mã mới.';
    if (exp > now + 2 * 86400) return 'Mã phản hồi không hợp lệ (hạn dùng bất thường — kiểm tra đồng hồ máy).';
    const key = await importPub(pubB64);
    const ok = await root.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b.slice(4), new TextEncoder().encode('HAK-RESET|1|' + chal + '|' + user + '|' + exp));
    return ok ? '' : 'Mã phản hồi không khớp mã yêu cầu / tên đăng nhập của máy này.';
  }

  /* ---------------- v2.7.3 MẬT KHẨU CHỦ CỦA NHÓM (Thủy chốt phương án A, 07/10/2026) ----------------
   * 1 câu mật khẩu dài cho cả nhóm, đi kèm Gói cấu hình như khóa nhóm → quên mật khẩu Quản trị ở bất kỳ máy nào: tự đặt lại ngay trong app
   * (không cần file .key / công cụ exe). Máy chỉ lưu d.master = { salt, iter, hash: PBKDF2-SHA256(câu đã chuẩn hóa), fp, at } — không lưu câu gốc.
   * Chuẩn hóa: NFC, gộp khoảng trắng, bỏ khoảng trắng 2 đầu (PHÂN BIỆT hoa / thường). Sai 5 lần → khóa 30 giây (như đăng nhập). */
  const MP_ITER = 310000, MP_MIN = 12;
  const normMaster = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const masterProblem = (s) => (normMaster(s).length < MP_MIN ? 'Mật khẩu chủ tối thiểu ' + MP_MIN + ' ký tự — nên là 1 câu dài, dễ nhớ với anh/chị nhưng người ngoài không đoán được.' : '');
  const toB64 = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));
  async function masterHash(pass, saltB64, iter) {
    const key = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(normMaster(pass)), 'PBKDF2', false, ['deriveBits']);
    const bits = await root.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64Bytes(saltB64), iterations: iter || MP_ITER }, key, 256);
    return toB64(new Uint8Array(bits));
  }
  async function makeMaster(pass) {
    const salt = toB64(root.crypto.getRandomValues(new Uint8Array(16))), hash = await masterHash(pass, salt, MP_ITER);
    return { salt, iter: MP_ITER, hash, fp: fpOf('M:' + hash), at: Date.now() };
  }
  async function checkMaster(m, pass) { return !!(m && m.salt && m.hash) && (await masterHash(pass, m.salt, m.iter)) === m.hash; }
  const masterFp = (m) => (m ? m.fp || fpOf('M:' + m.hash) : '');

  /* ---------------- Màn hình chặn (đăng nhập / tạo quản trị / khôi phục) ---------------- */
  let gate = null, resolveGate = null, fails = 0, lockUntil = 0;
  function showGate(html) {
    if (!gate) { gate = document.createElement('div'); gate.id = 'authGate'; gate.className = 'auth-gate'; document.body.appendChild(gate); }
    document.body.classList.add('auth-locked');
    gate.innerHTML = '<div class="auth-card card"><div class="card-body p-4">' +
      '<div class="d-flex align-items-center gap-3 mb-3"><div class="sb-logo">HAK</div><div><div class="fw-bold">QUẢN LÝ XUẤT HÀNG</div><div class="small muted">HAK Group · chạy offline trên máy này</div></div></div>' +
      html + '</div></div>';
    const f = gate.querySelector('input'); if (f) f.focus();
  }
  function hideGate() { if (gate) { gate.remove(); gate = null; } document.body.classList.remove('auth-locked'); }
  const err = (t) => { const e = gate && gate.querySelector('.auth-err'); if (e) e.textContent = t || ''; };
  const field = (id, label, type, extra) => '<div class="mb-2"><label class="form-label" for="' + id + '">' + label + '</label><input class="form-control" id="' + id + '" type="' + (type || 'text') + '" autocomplete="off"' + (extra || '') + '></div>';

  function screenSetup() {
    showGate('<h5 class="mb-1">Tạo tài khoản quản trị</h5><div class="small muted mb-3">Lần đầu dùng đăng nhập: tạo tài khoản <b>Quản trị</b> (toàn quyền). Dữ liệu cũ của app vẫn giữ nguyên.</div>' +
      '<form id="authForm">' + field('auName', 'Họ tên') + field('auUser', 'Tên đăng nhập', 'text', ' placeholder="vd: thuy"') + field('auPw', 'Mật khẩu (≥ 6 ký tự)', 'password') + field('auPw2', 'Nhập lại mật khẩu', 'password') +
      '<div class="auth-err text-danger small mb-2"></div><button class="btn btn-primary w-100" type="submit">Tạo tài khoản</button></form>' +
      (HAK.Backup && HAK.Backup.packRead ? '<div class="text-center mt-3"><label class="small link-primary mb-0" style="cursor:pointer">📦 Cài máy mới? Nhập gói cấu hình trước<input type="file" id="auPack" accept=".json,application/json" hidden></label></div>' : ''));
    const pk = $('#auPack'); if (pk) pk.addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { screenPack(await HAK.Backup.packRead(f), f.name); } catch (x) { err(x.message || String(x)); }
    });
    gate.querySelector('#authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#auName').value.trim(), un = normUser($('#auUser').value), pw = $('#auPw').value;
      if (!name || !un) return err('Nhập họ tên và tên đăng nhập.');
      if (!/^[a-z0-9._-]{2,32}$/.test(un)) return err('Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm / gạch (2–32 ký tự).');
      if (pwProblem(pw)) return err(pwProblem(pw));
      if (pw !== $('#auPw2').value) return err('Hai lần nhập mật khẩu không khớp.');
      const d = data();
      const u = { id: 'u' + Date.now().toString(36), username: un, name, role: 'admin', companies: station() || allCompanyIds(), disabled: false, createdAt: Date.now() };
      setPassword(u, pw); d.users.push(u);
      const code = setRecovery(d); save(d);
      screenRecovery(code, () => login(u), !!(d.groupPub || d.master));
    });
  }
  /** v2.6.4: xem trước + áp dụng gói cấu hình ngay ở lần cài đầu (chưa có Quản trị). */
  function screenPack(j, name) {
    showGate('<h5 class="mb-1">📦 Gói cấu hình cài đặt</h5><div class="small muted mb-2">' + esc(name) + '</div>' + HAK.Backup.packSummaryHtml(j) +
      '<div class="small muted mb-3">Sau khi áp dụng, app tải lại để bạn tạo tài khoản <b>Quản trị</b> riêng cho máy này.</div>' +
      '<button class="btn btn-primary w-100" type="button" id="auPkApply">Áp dụng gói</button><div class="text-center mt-3"><a href="#" class="small" id="auBack">← Quay lại</a></div>');
    $('#auBack').addEventListener('click', (e) => { e.preventDefault(); screenSetup(); });
    $('#auPkApply').addEventListener('click', (e) => { e.currentTarget.disabled = true; HAK.UI.toast(HAK.Backup.packMsg(HAK.Backup.packApply(j)), 'success'); setTimeout(() => location.reload(), 1200); });
  }
  function screenRecovery(code, next, optional) {
    showGate('<h5 class="mb-1">🔑 Mã khôi phục</h5><div class="small mb-3">Dùng khi <b>quên mật khẩu Quản trị</b>. Mã chỉ hiện <b>một lần</b> — hãy chép / in và cất ở nơi an toàn (không lưu cùng máy nếu có thể).</div>' +
      (optional ? '<div class="alert alert-info small py-2">Máy này đã có ' + (data().master ? '<b>mật khẩu chủ của nhóm</b> — quên mật khẩu thì tự đặt lại bằng mật khẩu chủ' : '<b>khóa khôi phục của nhóm</b> — quên mật khẩu có thể nhờ người giữ công cụ khôi phục') + '. Cất mã này là <b>không bắt buộc</b> (thêm 1 đường dự phòng).</div>' : '') +
      '<div class="auth-code mono text-center mb-3">' + esc(code) + '</div>' +
      '<div class="d-flex gap-2 mb-3"><button class="btn btn-outline-primary flex-fill" type="button" id="auCopy">📋 Sao chép</button><button class="btn btn-outline-primary flex-fill" type="button" id="auSave">⬇ Tải file .txt</button></div>' +
      '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="auKept"><label class="form-check-label" for="auKept">Tôi đã cất mã khôi phục</label></div>' +
      '<button class="btn btn-primary w-100" type="button" id="auNext" disabled>Tiếp tục</button>' +
      (optional ? '<button class="btn btn-outline-secondary w-100 mt-2" type="button" id="auSkip">Bỏ qua — ' + (data().master ? 'dùng mật khẩu chủ của nhóm' : 'dùng công cụ khôi phục của nhóm') + '</button>' : ''));
    const txt = 'HAK - QUAN LY XUAT HANG\r\nMa khoi phuc tai khoan Quan tri: ' + code + '\r\nTao luc: ' + new Date().toLocaleString('vi-VN') + '\r\n';
    $('#auCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); HAK.UI.toast('Đã sao chép mã khôi phục.', 'success'); } catch (e) { HAK.UI.toast('Không sao chép được — hãy tải file .txt.', 'warning'); } });
    $('#auSave').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'HAK_MaKhoiPhuc.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    $('#auKept').addEventListener('change', (e) => { $('#auNext').disabled = !e.target.checked; });
    $('#auNext').addEventListener('click', next);
    if (optional) $('#auSkip').addEventListener('click', next);
  }
  function screenLogin(msg) {
    showGate('<h5 class="mb-3">Đăng nhập</h5><form id="authForm">' + field('auUser', 'Tên đăng nhập') + field('auPw', 'Mật khẩu', 'password') +
      '<div class="auth-err text-danger small mb-2">' + esc(msg || '') + '</div><button class="btn btn-primary w-100" type="submit">Đăng nhập</button></form>' +
      '<div class="text-center mt-3"><a href="#" class="small" id="auForgot">Quên mật khẩu Quản trị?</a></div>' +
      '<div class="small muted mt-2 text-center">Nhân viên quên mật khẩu: nhờ Quản trị đặt lại ở Cài đặt → 👤 Tài khoản.</div>');
    gate.querySelector('#authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (Date.now() < lockUntil) return err('Sai nhiều lần — thử lại sau ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' giây.');
      const u = users().find((x) => x.username === normUser($('#auUser').value));
      if (!u || !checkPw(u, $('#auPw').value)) {
        fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        $('#auPw').value = ''; return err('Sai tên đăng nhập hoặc mật khẩu.');
      }
      if (u.disabled) return err('Tài khoản đang bị khóa — liên hệ Quản trị.');
      fails = 0; login(u);
    });
    $('#auForgot').addEventListener('click', (e) => { e.preventDefault(); screenForgot(); });
  }
  function screenForgot() {
    showGate('<h5 class="mb-1">Đặt lại mật khẩu Quản trị</h5>' +
      (data().master ? '<button class="btn btn-success w-100 mb-3" type="button" id="auMaster">🔐 Dùng mật khẩu chủ của nhóm</button><div class="small muted mb-2 text-center">— hoặc nhập mã khôi phục 12 ký tự của máy này —</div>' : '') +
      '<div class="small muted mb-3">Nhập mã khôi phục đã cất khi tạo tài khoản Quản trị.</div><form id="authForm">' +
      field('auCode', 'Mã khôi phục', 'text', ' placeholder="XXXX-XXXX-XXXX"') + field('auUser', 'Tên đăng nhập Quản trị') + field('auPw', 'Mật khẩu mới (≥ 6 ký tự)', 'password') + field('auPw2', 'Nhập lại mật khẩu mới', 'password') +
      '<div class="auth-err text-danger small mb-2"></div><button class="btn btn-primary w-100" type="submit">Đặt lại mật khẩu</button></form>' +
      (data().groupPub ? '<div class="text-center mt-3"><a href="#" class="small fw-semibold" id="auTool">🛡 Không có mã khôi phục? Dùng công cụ khôi phục của nhóm</a></div>' : '') +
      '<div class="text-center mt-2"><a href="#" class="small" id="auBack">← Quay lại đăng nhập</a></div>');
    $('#auBack').addEventListener('click', (e) => { e.preventDefault(); screenLogin(); });
    const tl = $('#auTool'); if (tl) tl.addEventListener('click', (e) => { e.preventDefault(); screenForgotTool(); });
    const mb = $('#auMaster'); if (mb) mb.addEventListener('click', () => screenForgotMaster());
    gate.querySelector('#authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (Date.now() < lockUntil) return err('Sai nhiều lần — thử lại sau ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' giây.');
      const d = data(), u = d.users.find((x) => x.username === normUser($('#auUser').value) && x.role === 'admin');
      if (!d.rec || hashPw(normCode($('#auCode').value), d.rec.salt) !== d.rec.hash || !u) {
        fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        return err('Mã khôi phục hoặc tên đăng nhập Quản trị không đúng.');
      }
      const pw = $('#auPw').value;
      if (pwProblem(pw)) return err(pwProblem(pw));
      if (pw !== $('#auPw2').value) return err('Hai lần nhập mật khẩu không khớp.');
      setPassword(u, pw); u.disabled = false;
      const code = setRecovery(d); save(d);               // mã cũ đã dùng → cấp mã mới
      screenRecovery(code, () => login(u));
    });
  }

  /** v2.7.3: đặt lại mật khẩu Quản trị bằng MẬT KHẨU CHỦ của nhóm. */
  function screenForgotMaster() {
    const d = data();
    if (!d.master) return screenForgot();
    showGate('<h5 class="mb-1">🔐 Khôi phục bằng mật khẩu chủ của nhóm</h5><div class="small muted mb-3">Nhập mật khẩu chủ (câu dài chung của cả nhóm), tên đăng nhập Quản trị của máy này và mật khẩu mới.</div><form id="authForm">' +
      field('auUser', 'Tên đăng nhập Quản trị') + field('auMp', 'Mật khẩu chủ của nhóm', 'password') +
      field('auPw', 'Mật khẩu mới (≥ 6 ký tự)', 'password') + field('auPw2', 'Nhập lại mật khẩu mới', 'password') +
      '<div class="auth-err text-danger small mb-2">' + (subtleOk() ? '' : 'Trình duyệt này không hỗ trợ — hãy mở app bằng Chrome / Edge.') + '</div>' +
      '<button class="btn btn-primary w-100" type="submit">Đặt lại mật khẩu</button></form>' +
      '<div class="small muted mt-2 text-center">Dấu vân tay mật khẩu chủ của máy: <span class="mono">' + esc(masterFp(d.master)) + '</span></div>' +
      '<div class="text-center mt-2"><a href="#" class="small" id="auBack">← Quay lại</a></div>');
    $('#auBack').addEventListener('click', (e) => { e.preventDefault(); screenForgot(); });
    gate.querySelector('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (Date.now() < lockUntil) return err('Sai nhiều lần — thử lại sau ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' giây.');
      if (!subtleOk()) return;
      const d2 = data(), un = normUser($('#auUser').value), u = d2.users.find((x) => x.username === un && x.role === 'admin');
      const pw = $('#auPw').value;
      if (pwProblem(pw)) return err(pwProblem(pw));
      if (pw !== $('#auPw2').value) return err('Hai lần nhập mật khẩu không khớp.');
      const btn = gate.querySelector('button[type=submit]'); btn.disabled = true; err('Đang kiểm tra…');
      let ok = false;
      try { ok = !!u && await checkMaster(d2.master, $('#auMp').value); } catch (x) { ok = false; }
      btn.disabled = false;
      if (!ok) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } $('#auMp').value = ''; return err('Mật khẩu chủ hoặc tên đăng nhập Quản trị không đúng.'); }
      fails = 0; setPassword(u, pw); u.disabled = false; save(d2);
      HAK.UI.toast('Đã đặt lại mật khẩu Quản trị ' + u.username + ' bằng mật khẩu chủ.', 'success');
      login(u);
    });
  }

  /** v2.6.4 D3: đặt lại mật khẩu Quản trị bằng mã phản hồi từ công cụ HAK_KhoiPhucQuanTri.exe. */
  function screenForgotTool(fresh) {
    const d = data();
    if (!d.groupPub) return screenForgot();
    if (fresh || !d.chal || !d.chal.c) { d.chal = { c: rand(12, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'), at: Date.now() }; save(d); }
    const shown = d.chal.c.replace(/(.{4})(?=.)/g, '$1-');
    showGate('<h5 class="mb-1">🛡 Khôi phục bằng công cụ của nhóm</h5>' +
      '<div class="small mb-2">1. Gửi cho người giữ <b>công cụ khôi phục</b> (HAK_KhoiPhucQuanTri.exe): <b>mã yêu cầu</b> dưới đây + <b>tên đăng nhập Quản trị</b>.<br>2. Nhận lại <b>mã phản hồi</b> (hiệu lực 24 giờ) → dán vào ô bên dưới, đặt mật khẩu mới.</div>' +
      '<div class="auth-code mono text-center mb-1" id="auChal">' + esc(shown) + '</div>' +
      '<div class="d-flex justify-content-center gap-3 small mb-3"><a href="#" id="auChalCopy">📋 Sao chép</a><a href="#" id="auChalNew">↻ Tạo mã yêu cầu mới</a></div>' +
      '<form id="authForm">' + field('auUser', 'Tên đăng nhập Quản trị') +
      '<div class="mb-2"><label class="form-label" for="auResp">Mã phản hồi</label><textarea class="form-control mono" id="auResp" rows="2" autocomplete="off" spellcheck="false"></textarea></div>' +
      field('auPw', 'Mật khẩu mới (≥ 6 ký tự)', 'password') + field('auPw2', 'Nhập lại mật khẩu mới', 'password') +
      '<div class="auth-err text-danger small mb-2">' + (subtleOk() ? '' : 'Trình duyệt này không hỗ trợ kiểm tra chữ ký — hãy mở app bằng Chrome / Edge.') + '</div>' +
      '<button class="btn btn-primary w-100" type="submit">Đặt lại mật khẩu</button></form>' +
      '<div class="small muted mt-2 text-center">Khóa nhóm: <span class="mono">' + esc(d.groupPub.fp || fpOf(d.groupPub.key)) + '</span></div>' +
      '<div class="text-center mt-2"><a href="#" class="small" id="auBack">← Quay lại</a></div>');
    $('#auBack').addEventListener('click', (e) => { e.preventDefault(); screenForgot(); });
    $('#auChalCopy').addEventListener('click', async (e) => { e.preventDefault(); try { await navigator.clipboard.writeText(shown); HAK.UI.toast('Đã sao chép mã yêu cầu.', 'success'); } catch (x) { HAK.UI.toast('Không sao chép được — hãy đọc / chép tay.', 'warning'); } });
    $('#auChalNew').addEventListener('click', (e) => { e.preventDefault(); screenForgotTool(true); });
    gate.querySelector('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (Date.now() < lockUntil) return err('Sai nhiều lần — thử lại sau ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' giây.');
      if (!subtleOk()) return;
      const d2 = data(), un = normUser($('#auUser').value), u = d2.users.find((x) => x.username === un && x.role === 'admin');
      const pw = $('#auPw').value;
      if (pwProblem(pw)) return err(pwProblem(pw));
      if (pw !== $('#auPw2').value) return err('Hai lần nhập mật khẩu không khớp.');
      const btn = gate.querySelector('button[type=submit]'); btn.disabled = true;
      let why = '';
      try { why = !u ? 'Không có Quản trị tên đăng nhập "' + un + '" trên máy này.' : (!d2.chal || !d2.chal.c) ? 'Mã yêu cầu đã dùng — tạo mã mới.' : await checkReset(d2.groupPub.key, d2.chal.c, un, $('#auResp').value); }
      catch (x) { why = 'Không kiểm tra được mã phản hồi: ' + (x.message || x); }
      btn.disabled = false;
      if (why) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } return err(why); }
      fails = 0; setPassword(u, pw); u.disabled = false; delete d2.chal; save(d2);   // mã yêu cầu đã dùng → hết hiệu lực
      HAK.UI.toast('Đã đặt lại mật khẩu Quản trị ' + u.username + '.', 'success');
      login(u);
    });
  }

  /* ---------------- Phiên ---------------- */
  function applyRole() {
    const staff = !!cur && cur.role !== 'admin';
    document.body.classList.toggle('role-staff', staff);
    document.body.classList.toggle('role-admin', !!cur && !staff);
    const box = $('#topUser');
    const co = companies().find((c) => c.id === curCo);
    document.body.dataset.company = curCo || '';
    if (box) box.innerHTML = cur ? (co ? '<button class="btn btn-sm btn-primary text-truncate" style="max-width:220px" id="btnCompany" type="button" title="Công ty làm việc: ' + esc(co.name) + (allowedCos().length > 1 ? ' — bấm để đổi' : '') + '">🏢 ' + esc(co.short || co.name) + (allowedCos().length > 1 ? ' ▾' : '') + '</button>' : '') +
      '<span class="badge badge-soft rounded-pill text-truncate d-none d-sm-inline" style="max-width:180px" title="' + esc(cur.name + ' — ' + (staff ? 'Nhân viên' : 'Quản trị')) + '">👤 ' + esc(cur.name) + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="btnLogout" type="button" title="Đăng xuất">🔒<span class="d-none d-md-inline"> Đăng xuất</span></button>' : '';
    const b = $('#btnLogout'); if (b) b.addEventListener('click', logout);
    const bc = $('#btnCompany'); if (bc && allowedCos().length > 1) bc.addEventListener('click', () => screenCompany(true));
  }
  function login(u) {
    cur = u;
    const allowed = allowedCos(u);
    if (!allowed.length) { cur = null; return screenLogin('Tài khoản chưa được gán công ty nào — liên hệ Quản trị.'); }
    if (allowed.length === 1) return enter(allowed[0]);
    screenCompany(false);
  }
  /** Vào app với công ty `co`. */
  function enter(co) {
    curCo = co;
    sessSet({ uid: cur.id, at: Date.now(), co });
    const last = HAK.Store.get(LASTCO, {}) || {}; last[cur.id] = co; HAK.Store.set(LASTCO, last);
    hideGate(); applyRole();
    if (resolveGate) { const r = resolveGate; resolveGate = null; r(cur); }
  }
  /** Màn chọn công ty làm việc. switching = đang trong app bấm "đổi công ty" (có nút Hủy, chọn xong tải lại app). */
  function screenCompany(switching) {
    const allowed = allowedCos(), last = (HAK.Store.get(LASTCO, {}) || {})[cur.id];
    const pre = switching ? curCo : (allowed.indexOf(last) >= 0 ? last : allowed[0]);
    const cos = companies().filter((c) => allowed.indexOf(c.id) >= 0);
    showGate('<h5 class="mb-1">Chọn công ty làm việc</h5><div class="small muted mb-3">Xin chào <b>' + esc(cur.name) + '</b>. Công ty chọn ở đây là <b>bên xuất</b> (ô "Của" / chủ lâm sản) mặc định ở mọi trang; Danh mục, Lưu trữ, Báo cáo mặc định lọc theo công ty này.</div>' +
      '<div class="d-grid gap-2" id="auCos">' + cos.map((c) => '<button type="button" class="btn text-start auth-co' + (c.id === pre ? ' active' : '') + '" data-co="' + esc(c.id) + '">' +
        '<div class="fw-semibold">' + esc(c.short ? c.short + ' — ' + c.name : c.name) + (c.id === last && !switching ? ' <span class="badge badge-soft ms-1">lần trước</span>' : '') + (switching && c.id === curCo ? ' <span class="badge badge-soft ms-1">đang làm</span>' : '') + '</div>' +
        '<div class="small muted">' + esc([c.tax ? 'MST ' + c.tax : '', c.address].filter(Boolean).join(' · ')) + '</div></button>').join('') + '</div>' +
      (switching ? '<div class="small muted mt-3">Đổi công ty sẽ tải lại app — dữ liệu đã nạp (đợt Excel, form, danh mục…) vẫn giữ.</div><button class="btn btn-outline-secondary w-100 mt-2" type="button" id="auCancel">Hủy</button>' : ''));
    const act = gate.querySelector('.auth-co.active'); if (act) act.focus();
    gate.querySelector('#auCos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-co]'); if (!b) return;
      if (!switching) return enter(b.dataset.co);
      if (b.dataset.co === curCo) { hideGate(); return; }
      sessSet({ uid: cur.id, at: Date.now(), co: b.dataset.co });
      const last2 = HAK.Store.get(LASTCO, {}) || {}; last2[cur.id] = b.dataset.co; HAK.Store.set(LASTCO, last2);
      location.reload();
    });
    if (switching) gate.querySelector('#auCancel').addEventListener('click', hideGate);
  }
  function logout() { sessSet(null); cur = null; location.reload(); }
  /** Gọi khi khởi động: resolve khi đã đăng nhập (có phiên hợp lệ thì vào thẳng). */
  function require() {
    const s = sessGet(), u = s && users().find((x) => x.id === s.uid && !x.disabled);
    if (u && s.co && allowedCos(u).indexOf(s.co) >= 0) { cur = u; curCo = s.co; applyRole(); return Promise.resolve(u); }
    return new Promise((ok) => {
      resolveGate = ok;
      if (u) login(u);                                  // còn phiên nhưng chưa chọn / không còn quyền công ty đó → chọn lại
      else if (!users().some((x) => x.role === 'admin')) screenSetup(); else screenLogin();   // v2.6.4: gói cấu hình chỉ mang Nhân viên → máy mới vẫn tạo Quản trị
    });
  }

  /* ---------------- Cài đặt → 👤 Tài khoản ---------------- */
  const coName = (id) => { const c = HAK.Config && HAK.Config.data.companies.find((x) => x.id === id); return c ? (c.short || c.name) : id; };
  let editing = null;          // id người dùng đang sửa ('' = thêm mới)
  function renderAccount() {
    const box = $('#authAccount'); if (!box || !cur) return;
    const me = users().find((u) => u.id === cur.id) || cur;
    box.innerHTML =
      '<div class="card mb-3"><div class="card-header">👤 Tài khoản của tôi</div><div class="card-body"><div class="row g-2">' +
      '<div class="col-md-4"><label class="form-label">Tên đăng nhập</label><input class="form-control" value="' + esc(me.username) + '" disabled></div>' +
      '<div class="col-md-4"><label class="form-label" for="acName">Họ tên</label><input class="form-control" id="acName" value="' + esc(me.name) + '"></div>' +
      '<div class="col-md-4"><label class="form-label">Quyền</label><input class="form-control" value="' + (me.role === 'admin' ? 'Quản trị' : 'Nhân viên') + '" disabled></div>' +
      '<div class="col-md-4"><label class="form-label" for="acOld">Mật khẩu hiện tại</label><input class="form-control" id="acOld" type="password" autocomplete="off"></div>' +
      '<div class="col-md-4"><label class="form-label" for="acNew">Mật khẩu mới (≥ 6 ký tự)</label><input class="form-control" id="acNew" type="password" autocomplete="off"></div>' +
      '<div class="col-md-4"><label class="form-label" for="acNew2">Nhập lại mật khẩu mới</label><input class="form-control" id="acNew2" type="password" autocomplete="off"></div></div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-3"><button class="btn btn-primary" type="button" id="acSave">Lưu</button><span class="small" id="acMsg"></span></div>' +
      '<div class="form-text">Để trống 3 ô mật khẩu nếu chỉ đổi họ tên. Công ty được làm: ' + esc((me.companies || []).map(coName).join(', ') || '—') + '.</div></div></div>' +
      '<div class="card admin-only"><div class="card-header d-flex align-items-center">👥 Người dùng <button class="btn btn-sm btn-primary ms-auto" type="button" id="usAdd">＋ Thêm người dùng</button></div><div class="card-body">' +
      '<div id="usForm"></div>' +
      '<div class="tbl-wrap" style="max-height:none"><table class="table align-middle mb-0"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Quyền</th><th>Công ty được làm</th><th>Trạng thái</th><th></th></tr></thead><tbody id="usBody"></tbody></table></div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-3"><button class="btn btn-sm btn-outline-secondary" type="button" id="usRec">🔑 Tạo mã khôi phục mới</button><span class="small muted">Mã cũ hết hiệu lực khi tạo mã mới.</span></div>' +
      '</div></div>' +
      '<div class="card admin-only mt-3"><div class="card-header">🔐 Mật khẩu chủ của nhóm <span class="muted small fw-normal d-none d-md-inline">— 1 câu cho mọi máy, quên mật khẩu Quản trị thì tự đặt lại trong app</span></div><div class="card-body" id="mpBody"></div></div>' +
      '<div class="card admin-only mt-3"><div class="card-header">🛡 Khóa khôi phục của nhóm <span class="muted small fw-normal d-none d-md-inline">— quên mật khẩu Quản trị thì nhờ công cụ HAK_KhoiPhucQuanTri.exe</span></div><div class="card-body" id="gkBody"></div></div>';
    $('#acSave').addEventListener('click', saveMine);
    if (cur.role === 'admin') {
      $('#usAdd').addEventListener('click', () => { editing = ''; renderUserForm(); });
      $('#usRec').addEventListener('click', (e) => HAK.UI.confirmClick(e.currentTarget, () => {
        const d = data(), code = setRecovery(d); save(d);
        const m = $('#usForm'); m.innerHTML = '<div class="alert alert-warning">Mã khôi phục mới (chỉ hiện 1 lần — chép / in cất đi): <b class="mono fs-5 ms-2">' + esc(code) + '</b></div>';
      }, 'Bấm lần nữa để tạo mã mới'));
      $('#usBody').addEventListener('click', onUserAction);
      renderUsers(); renderMaster(); renderGroupKey();
    }
  }
  /** v2.7.3 thẻ "Mật khẩu chủ của nhóm" (Cài đặt → Tài khoản). Máy trạm: chỉ xem (đổi bằng Gói cấu hình từ máy chính). */
  function renderMaster() {
    const box = $('#mpBody'); if (!box) return;
    const m = data().master;
    const info = m ? '<ul class="sum-list mb-2"><li><span>Trạng thái</span><b class="text-success">Đã đặt</b></li><li><span>Dấu vân tay</span><b class="mono">' + esc(masterFp(m)) + '</b></li>' +
        '<li><span>Đặt lúc</span><b>' + (m.at ? new Date(m.at).toLocaleString('vi-VN') : '—') + '</b></li></ul>'
      : '<p class="small mb-2 text-warning">Chưa đặt — quên mật khẩu Quản trị thì chỉ còn mã khôi phục 12 ký tự / công cụ khôi phục.</p>';
    const printBtn = '<button class="btn btn-outline-secondary btn-sm" type="button" id="mpPrint">🖨 In phiếu khôi phục của máy</button>';
    if (station()) {
      box.innerHTML = info + '<div class="d-flex flex-wrap gap-2 mb-2">' + printBtn + '</div><div class="form-text">🔒 Máy trạm: mật khẩu chủ chỉ thay được bằng <b>Gói cấu hình</b> xuất từ máy chính. <a href="#/help" data-help="help-forgot">📘 Xem hướng dẫn</a></div>';
      $('#mpPrint').addEventListener('click', printRecoverySheet);
      return;
    }
    box.innerHTML = info +
      '<div class="row g-2"><div class="col-md-4"><label class="form-label" for="mpNew">' + (m ? 'Đổi mật khẩu chủ mới' : 'Mật khẩu chủ (≥ ' + MP_MIN + ' ký tự)') + '</label><input class="form-control" id="mpNew" type="password" autocomplete="new-password"></div>' +
      '<div class="col-md-4"><label class="form-label" for="mpNew2">Nhập lại mật khẩu chủ</label><input class="form-control" id="mpNew2" type="password" autocomplete="new-password"></div>' +
      '<div class="col-md-4"><label class="form-label" for="mpMe">Mật khẩu đăng nhập của bạn (xác nhận)</label><input class="form-control" id="mpMe" type="password" autocomplete="off"></div></div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-2"><button class="btn btn-primary btn-sm" type="button" id="mpSave">' + (m ? 'Đổi mật khẩu chủ' : 'Lưu mật khẩu chủ') + '</button>' +
      (m ? '<button class="btn btn-outline-danger btn-sm" type="button" id="mpDel">Gỡ</button>' : '') + printBtn + '<span class="small" id="mpMsg"></span></div>' +
      '<div class="form-text">Mật khẩu chủ đi kèm <b>Gói cấu hình cài đặt</b> (Cài đặt → Chung → 📦) — đặt ở máy chính rồi xuất gói cho các máy / đơn vị. Máy chỉ lưu dạng mã hóa một chiều, không ai xem lại được câu gốc → <b>chép ra giấy cất két</b>. Phân biệt chữ hoa / thường. <a href="#/help" data-help="help-forgot">📘 Xem hướng dẫn</a></div>';
    const msg = (t, ok) => { const el = $('#mpMsg'); el.className = 'small ' + (ok ? 'text-success' : 'text-danger'); el.textContent = t; };
    $('#mpPrint').addEventListener('click', printRecoverySheet);
    $('#mpSave').addEventListener('click', async (e) => {
      const a = $('#mpNew').value, b = $('#mpNew2').value, me = data().users.find((u) => u.id === cur.id);
      if (masterProblem(a)) return msg(masterProblem(a));
      if (normMaster(a) !== normMaster(b)) return msg('Hai lần nhập mật khẩu chủ không khớp.');
      if (!checkPw(me, $('#mpMe').value)) return msg('Mật khẩu đăng nhập của bạn không đúng.');
      if (!subtleOk()) return msg('Trình duyệt không hỗ trợ — dùng Chrome / Edge.');
      e.currentTarget.disabled = true; msg('Đang mã hóa…', true);
      try { const mm = await makeMaster(a), d = data(); d.master = mm; save(d); renderMaster(); HAK.UI.toast('Đã lưu mật khẩu chủ của nhóm — dấu vân tay ' + mm.fp + '. Xuất lại Gói cấu hình để cài cho các máy khác.', 'success'); }
      catch (x) { msg('Không lưu được: ' + (x.message || x)); }
    });
    const del = $('#mpDel'); if (del) del.addEventListener('click', (e) => HAK.UI.confirmClick(e.currentTarget, () => {
      if (!checkPw(data().users.find((u) => u.id === cur.id), $('#mpMe').value)) return msg('Nhập mật khẩu đăng nhập của bạn ở ô xác nhận trước khi gỡ.');
      const d = data(); delete d.master; save(d); renderMaster(); HAK.UI.toast('Đã gỡ mật khẩu chủ trên máy này.', 'info');
    }, 'Bấm lần nữa để gỡ'));
  }
  /** v2.7.3 Phiếu khôi phục của máy (in / lưu PDF): loại máy, Quản trị, dấu vân tay mật khẩu chủ + khóa nhóm, các bước — KHÔNG có mật khẩu. */
  function printRecoverySheet() {
    const d = data(), st = station(), cos = companies(), nm = (id) => { const c = cos.find((x) => x.id === id); return c ? (c.short || c.name) : id; };
    const admins = d.users.filter((u) => u.role === 'admin'), now = new Date().toLocaleString('vi-VN');
    const row = (a, b) => '<tr><th>' + a + '</th><td>' + b + '</td></tr>';
    const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu khôi phục — HAK</title><style>body{font:14px/1.5 Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0 0 4px}' +
      'table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{width:34%;background:#f1f3f5}.mono{font-family:Consolas,monospace}.box{border:2px dashed #555;padding:10px;margin-top:12px}ol{margin:6px 0 0 18px;padding:0}</style></head><body>' +
      '<h1>PHIẾU KHÔI PHỤC — QUẢN LÝ XUẤT HÀNG (HAK)</h1><div>In lúc ' + esc(now) + ' · <b>Phiếu này không có mật khẩu</b> — cất cùng tờ ghi mật khẩu chủ.</div>' +
      '<table>' + row('Tên máy / đơn vị (ghi tay)', '&nbsp;<br>&nbsp;') + row('Loại máy', st ? 'Máy trạm — ' + esc(st.map(nm).join(', ')) : 'Máy chính — mọi công ty') +
      row('Tài khoản Quản trị', admins.length ? admins.map((u) => '<span class="mono">' + esc(u.username) + '</span> — ' + esc(u.name) + (u.disabled ? ' (đang khóa)' : '')).join('<br>') : '—') +
      row('Mật khẩu chủ của nhóm', d.master ? 'Đã đặt · dấu vân tay <span class="mono">' + esc(masterFp(d.master)) + '</span>' : '<b>Chưa đặt</b>') +
      row('Khóa khôi phục của nhóm', d.groupPub ? 'Đã cài · dấu vân tay <span class="mono">' + esc(d.groupPub.fp || fpOf(d.groupPub.key)) + '</span>' : 'Chưa cài') +
      row('Sao lưu toàn bộ gần nhất', (() => { const t = HAK.Store.get('hak.backup.last', 0); return t ? new Date(t).toLocaleString('vi-VN') : 'Chưa sao lưu'; })()) + '</table>' +
      '<div class="box"><b>Quên mật khẩu Quản trị:</b><ol><li>Màn đăng nhập → <b>Quên mật khẩu Quản trị?</b> → <b>🔐 Dùng mật khẩu chủ của nhóm</b>.</li>' +
      '<li>Nhập tên đăng nhập Quản trị (bảng trên), mật khẩu chủ, mật khẩu mới × 2 → <b>Đặt lại mật khẩu</b>.</li>' +
      '<li>Không nhớ mật khẩu chủ: dùng mã khôi phục 12 ký tự của máy, hoặc công cụ HAK_KhoiPhucQuanTri.exe; cuối cùng: trình duyệt khác + <b>Khôi phục toàn bộ</b> từ file sao lưu.</li></ol></div>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>';
    const w = root.open('', '_blank');
    if (!w) { HAK.UI.toast('Trình duyệt chặn cửa sổ mới — cho phép popup rồi bấm lại.', 'warning'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
  function renderGroupKey() {
    const box = $('#gkBody'); if (!box) return;
    const g = data().groupPub;
    if (station()) {
      box.innerHTML = (g ? '<ul class="sum-list mb-2"><li><span>Trạng thái</span><b class="text-success">Đã cài</b></li><li><span>Dấu vân tay</span><b class="mono">' + esc(g.fp || fpOf(g.key)) + '</b></li></ul>'
        : '<p class="small mb-2 text-warning">Chưa cài — máy này chỉ khôi phục được bằng mã khôi phục 12 ký tự.</p>') +
        '<div class="form-text">🔒 Máy trạm: khóa khôi phục chỉ thay được bằng <b>Gói cấu hình</b> xuất từ máy chính (Cài đặt → Chung → 📦). <a href="#/help" data-help="help-forgot">📘 Xem hướng dẫn</a></div>';
      return;
    }
    box.innerHTML = (g ? '<ul class="sum-list mb-2"><li><span>Trạng thái</span><b class="text-success">Đã cài</b></li><li><span>Dấu vân tay</span><b class="mono">' + esc(g.fp || fpOf(g.key)) + '</b></li>' +
        '<li><span>Cài lúc</span><b>' + (g.at ? new Date(g.at).toLocaleString('vi-VN') : '—') + '</b></li></ul>'
      : '<p class="small mb-2 text-warning">Chưa cài — máy này chỉ khôi phục được bằng mã khôi phục 12 ký tự.</p>') +
      '<label class="form-label" for="gkKey">' + (g ? 'Thay bằng khóa công khai khác' : 'Dán khóa công khai (từ công cụ khôi phục → 📋 Khóa công khai)') + '</label>' +
      '<textarea class="form-control mono" id="gkKey" rows="2" spellcheck="false" placeholder="BASE64…"></textarea>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-2"><button class="btn btn-primary btn-sm" type="button" id="gkSave">Lưu khóa</button>' +
      (g ? '<button class="btn btn-outline-danger btn-sm" type="button" id="gkDel">Gỡ khóa</button>' : '') + '<span class="small" id="gkMsg"></span></div>' +
      '<div class="form-text"><a href="#/help" data-help="help-forgot">📘 Xem hướng dẫn</a> · Kiểm tra dấu vân tay trùng với dãy công cụ hiện. Khóa đi kèm <b>Gói cấu hình cài đặt</b> (Cài đặt → Chung) nên chỉ cần dán ở 1 máy. Khóa công khai không phải bí mật; khóa bí mật chỉ nằm trong file của người giữ công cụ.</div>';
    const msg = (t, ok) => { const m = $('#gkMsg'); m.className = 'small ' + (ok ? 'text-success' : 'text-danger'); m.textContent = t; };
    $('#gkSave').addEventListener('click', async () => {
      const k = $('#gkKey').value.replace(/\s+/g, '');
      if (!k) return msg('Dán khóa công khai trước.');
      if (!subtleOk()) return msg('Trình duyệt không hỗ trợ — dùng Chrome / Edge.');
      try { await importPub(k); } catch (e) { return msg(e.message || 'Khóa công khai không đúng.'); }
      const d = data(); d.groupPub = { key: k, fp: fpOf(k), at: Date.now() }; save(d);
      renderGroupKey(); HAK.UI.toast('Đã lưu khóa khôi phục của nhóm — dấu vân tay ' + fpOf(k) + '.', 'success');
    });
    const del = $('#gkDel'); if (del) del.addEventListener('click', (e) => HAK.UI.confirmClick(e.currentTarget, () => {
      const d = data(); delete d.groupPub; delete d.chal; save(d); renderGroupKey(); HAK.UI.toast('Đã gỡ khóa khôi phục của nhóm.', 'info');
    }, 'Bấm lần nữa để gỡ'));
  }
  function saveMine() {
    const d = data(), me = d.users.find((u) => u.id === cur.id), msg = $('#acMsg');
    const say = (t, ok) => { msg.className = 'small ' + (ok ? 'text-success' : 'text-danger'); msg.textContent = t; };
    const name = $('#acName').value.trim(); if (!name) return say('Họ tên không được trống.');
    const o = $('#acOld').value, n = $('#acNew').value, n2 = $('#acNew2').value;
    if (o || n || n2) {
      if (!checkPw(me, o)) return say('Mật khẩu hiện tại không đúng.');
      if (pwProblem(n)) return say(pwProblem(n));
      if (n !== n2) return say('Hai lần nhập mật khẩu mới không khớp.');
      setPassword(me, n);
    }
    me.name = name; save(d); cur = me; applyRole();
    ['#acOld', '#acNew', '#acNew2'].forEach((s) => { $(s).value = ''; });
    say('Đã lưu' + (n ? ' — mật khẩu mới dùng từ lần đăng nhập sau.' : '.'), true);
    if (cur.role === 'admin') renderUsers();
  }
  function renderUsers() {
    const body = $('#usBody'); if (!body) return;
    body.innerHTML = users().map((u) => '<tr' + (u.disabled ? ' class="opacity-50"' : '') + '><td class="mono">' + esc(u.username) + '</td><td>' + esc(u.name) + (u.id === cur.id ? ' <span class="badge badge-soft">bạn</span>' : '') + '</td>' +
      '<td>' + (u.role === 'admin' ? '<span class="badge text-bg-primary">Quản trị</span>' : '<span class="badge badge-soft">Nhân viên</span>') + '</td>' +
      '<td class="small">' + esc((u.companies || []).map(coName).join(', ') || '—') + '</td><td>' + (u.disabled ? '🔒 Khóa' : 'Đang dùng') + '</td>' +
      '<td class="text-end text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-us="edit" data-id="' + u.id + '" type="button">Sửa</button>' +
      (u.id === cur.id ? '' : '<button class="btn btn-outline-secondary" data-us="lock" data-id="' + u.id + '" type="button">' + (u.disabled ? 'Mở khóa' : 'Khóa') + '</button>') + '</div></td></tr>').join('');
  }
  function renderUserForm() {
    const u = editing ? users().find((x) => x.id === editing) : { username: '', name: '', role: 'staff', companies: allCompanyIds() };
    const st = station(), cos = (HAK.Config.data.companies || []).filter((c) => !st || st.indexOf(c.id) >= 0);
    $('#usForm').innerHTML = '<div class="border rounded p-3 mb-3"><div class="fw-semibold mb-2">' + (editing ? 'Sửa người dùng ' + esc(u.username) : 'Thêm người dùng') + '</div><div class="row g-2">' +
      '<div class="col-md-3"><label class="form-label" for="usUser">Tên đăng nhập</label><input class="form-control" id="usUser" value="' + esc(u.username) + '"' + (editing ? ' disabled' : '') + ' autocomplete="off"></div>' +
      '<div class="col-md-4"><label class="form-label" for="usName">Họ tên</label><input class="form-control" id="usName" value="' + esc(u.name) + '"></div>' +
      '<div class="col-md-2"><label class="form-label" for="usRole">Quyền</label><select class="form-select" id="usRole"><option value="staff"' + (u.role !== 'admin' ? ' selected' : '') + '>Nhân viên</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Quản trị</option></select></div>' +
      '<div class="col-md-3"><label class="form-label" for="usPw">' + (editing ? 'Đặt lại mật khẩu (để trống = giữ)' : 'Mật khẩu (≥ 6 ký tự)') + '</label><input class="form-control" id="usPw" type="password" autocomplete="new-password"></div>' +
      '<div class="col-12"><div class="form-label mb-1">Công ty được làm</div><div class="d-flex flex-wrap gap-3">' +
      cos.map((c) => '<div class="form-check"><input class="form-check-input" type="checkbox" data-co="' + esc(c.id) + '" id="usCo-' + esc(c.id) + '"' + ((u.companies || []).indexOf(c.id) >= 0 ? ' checked' : '') + '><label class="form-check-label" for="usCo-' + esc(c.id) + '">' + esc(c.short ? c.short + ' — ' + c.name : c.name) + '</label></div>').join('') +
      '</div></div></div><div class="text-danger small mt-2" id="usErr"></div>' +
      '<div class="d-flex gap-2 mt-2"><button class="btn btn-primary" type="button" id="usSave">Lưu</button><button class="btn btn-outline-secondary" type="button" id="usCancel">Hủy</button></div></div>';
    $('#usCancel').addEventListener('click', () => { editing = null; $('#usForm').innerHTML = ''; });
    $('#usSave').addEventListener('click', saveUser);
    $('#usName').focus();
  }
  function saveUser() {
    const d = data(), e = (t) => { $('#usErr').textContent = t; };
    const un = normUser($('#usUser').value), name = $('#usName').value.trim(), role = $('#usRole').value, pw = $('#usPw').value;
    const companies = Array.from(document.querySelectorAll('#usForm [data-co]:checked')).map((x) => x.dataset.co);
    if (!name) return e('Nhập họ tên.');
    if (!companies.length) return e('Chọn ít nhất 1 công ty được làm.');
    let u;
    if (editing) {
      u = d.users.find((x) => x.id === editing);
      if (u.role === 'admin' && role !== 'admin' && activeAdmins(d.users).length <= 1 && !u.disabled) return e('Phải còn ít nhất 1 Quản trị đang dùng.');
      if (pw) { if (pwProblem(pw)) return e(pwProblem(pw)); setPassword(u, pw); }
    } else {
      if (!/^[a-z0-9._-]{2,32}$/.test(un)) return e('Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm / gạch (2–32 ký tự).');
      if (d.users.some((x) => x.username === un)) return e('Tên đăng nhập "' + un + '" đã có.');
      if (pwProblem(pw)) return e(pwProblem(pw));
      u = { id: 'u' + Date.now().toString(36) + rand(3), username: un, disabled: false, createdAt: Date.now() };
      setPassword(u, pw); d.users.push(u);
    }
    Object.assign(u, { name, role, companies });
    save(d);
    if (u.id === cur.id) { cur = u; applyRole(); }
    editing = null; $('#usForm').innerHTML = ''; renderUsers();
    HAK.UI.toast('Đã lưu người dùng ' + u.username + (pw ? ' (mật khẩu mới)' : '') + '.', 'success');
    root.dispatchEvent(new CustomEvent('hak:users'));
  }
  function onUserAction(ev) {
    const b = ev.target.closest('[data-us]'); if (!b) return;
    if (b.dataset.us === 'edit') { editing = b.dataset.id; renderUserForm(); return; }
    const d = data(), u = d.users.find((x) => x.id === b.dataset.id); if (!u) return;
    if (!u.disabled && u.role === 'admin' && activeAdmins(d.users).length <= 1) { HAK.UI.toast('Phải còn ít nhất 1 Quản trị đang dùng.', 'warning'); return; }
    u.disabled = !u.disabled; save(d); renderUsers();
    HAK.UI.toast((u.disabled ? 'Đã khóa ' : 'Đã mở khóa ') + u.username + '.', 'info');
  }

  /** Nhân viên mở Cài đặt → chỉ tab 👤 Tài khoản. */
  function onRoute(key) {
    if (key !== 'settings' || !cur || cur.role === 'admin') return;
    const t = document.querySelector('[data-bs-target="#tab-account"]');
    if (t && root.bootstrap) root.bootstrap.Tab.getOrCreateInstance(t).show();
  }
  function init() { renderAccount(); root.addEventListener('hashchange', () => onRoute((location.hash.match(/^#\/(\w+)/) || [])[1])); onRoute((location.hash.match(/^#\/(\w+)/) || [])[1]); }

  /* ---------------- Phạm vi dữ liệu theo công ty (Danh mục / Lưu trữ / Báo cáo) ---------------- */
  const scopeAll = (key) => !!((HAK.Store.get(SCOPE, {}) || {})[key]);
  /** Danh sách id công ty để lọc, hoặc null = không lọc. Mặc định: chỉ công ty đang làm; bật "Xem tất cả" → Quản trị: tất cả, Nhân viên: các công ty được làm. */
  function scopeIds(key) {
    if (!cur || !curCo) return null;
    if (!scopeAll(key)) return [curCo];
    return cur.role === 'admin' && !station() ? null : allowedCos();   // máy trạm: "tất cả" = các công ty của máy
  }
  /** Công tắc "Xem tất cả công ty" (HTML) — thay đổi phát sự kiện 'hak:scope' {key}. */
  function scopeSwitch(key) {
    if (!cur || !curCo) return '';
    const co = companies().find((c) => c.id === curCo), id = 'scope-' + key;
    return '<div class="form-check form-switch mb-0 text-nowrap" title="Tắt = chỉ dữ liệu liên quan ' + esc(co ? co.name : '') + '"><input class="form-check-input" type="checkbox" id="' + id + '" data-scope="' + esc(key) + '"' + (scopeAll(key) ? ' checked' : '') + '>' +
      '<label class="form-check-label small" for="' + id + '">Xem tất cả công ty</label></div>';
  }
  document.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest('[data-scope]'); if (!el) return;
    const s = HAK.Store.get(SCOPE, {}) || {}; s[el.dataset.scope] = el.checked; HAK.Store.set(SCOPE, s);
    root.dispatchEvent(new CustomEvent('hak:scope', { detail: { key: el.dataset.scope } }));
  });
  /** Công ty (id) của 1 hồ sơ Lưu trữ: meta.cid (từ v2.6.2), hồ sơ cũ → dò theo tên rút gọn bên giao (meta.giao). */
  function companyOfMeta(m) {
    if (m.cid) return m.cid;
    const g = String(m.giao || '').trim().toLowerCase(); if (!g) return '';
    const c = companies().find((x) => String(x.short || '').trim().toLowerCase() === g || String(x.name || '').trim().toLowerCase() === g);
    return c ? c.id : '';
  }

  /* ---------------- v2.6.4 D2 — Gói cấu hình cài đặt (chỉ Nhân viên; Quản trị đặt riêng ở từng máy) ---------------- */
  /** Phần đăng nhập của gói: tài khoản Nhân viên (mật khẩu dạng băm) + khóa công khai khôi phục của nhóm (nếu có). */
  function packOut(ids) {
    const d = data(), inIds = (id) => !ids || ids.indexOf(id) >= 0;
    const us = d.users.filter((u) => u.role !== 'admin' && (u.companies || []).some(inIds))
      .map((u) => Object.assign({}, u, { companies: (u.companies || []).filter(inIds) }));
    return { users: us, groupPub: d.groupPub || null, master: d.master || null, station: ids ? { cos: ids.slice() } : null };
  }
  /** Gộp phần đăng nhập của gói vào máy này. Trùng tên đăng nhập với Quản trị của máy → bỏ qua; trùng Nhân viên → cập nhật (giữ id máy này). */
  function packIn(p, dry) {
    const d = dry ? JSON.parse(JSON.stringify(data())) : data(), r = { added: 0, updated: 0, skipped: [], groupPub: false };
    ((p && p.users) || []).forEach((pu) => {
      if (!pu || pu.role === 'admin' || !pu.username || !pu.salt || !pu.hash) return;
      const un = normUser(pu.username), loc = d.users.find((x) => x.username === un);
      if (loc && loc.role === 'admin') { r.skipped.push(un); return; }
      const v = { username: un, name: pu.name || un, role: 'staff', companies: Array.isArray(pu.companies) ? pu.companies.slice() : [], disabled: !!pu.disabled, salt: pu.salt, hash: pu.hash };
      if (loc) { Object.assign(loc, v); r.updated++; }
      else { const id = pu.id && !d.users.some((x) => x.id === pu.id) ? pu.id : 'u' + Date.now().toString(36) + rand(3); d.users.push(Object.assign({ id, createdAt: pu.createdAt || Date.now() }, v)); r.added++; }
    });
    if (p && p.groupPub && p.groupPub.key) { d.groupPub = p.groupPub; r.groupPub = true; }
    if (p && p.master && p.master.hash && p.master.salt) { d.master = p.master; r.master = true; }   // v2.7.3 mật khẩu chủ của nhóm
    // Gói "cho công ty X" → máy trạm (chỉ làm các công ty đó); gói đầy đủ → máy chính (bỏ giới hạn)
    r.station = p && p.station && Array.isArray(p.station.cos) && p.station.cos.length ? p.station.cos.slice() : null;
    r.wasStation = station();
    if (r.station) d.station = { cos: r.station, at: Date.now() }; else delete d.station;
    if (!dry) save(d);
    return r;
  }

  HAK.Auth = {
    require, init, logout, renderAccount,
    current: () => cur, isAdmin: () => !!cur && cur.role === 'admin',
    /** Tên ghi vào "Người lập" (hồ sơ Lưu trữ, nhật ký chứng từ). */
    who: () => (cur ? cur.name + ' (' + cur.username + ')' : ''),
    companiesOf: (u) => ((u || cur) && (u || cur).companies) || [],
    /** Công ty làm việc (id) — '' khi chưa đăng nhập. */
    company: () => curCo,
    allowedCompanies: () => allowedCos(),
    scopeIds, scopeSwitch, companyOfMeta, packOut, packIn,
    /** Máy trạm: danh sách công ty của máy; null = máy chính. */
    stationCos: station, _checkReset: checkReset, _fp: fpOf,
    _sha256: sha256hex, _hash: hashPw
  };
})(window);
