/**
 * records.js — dữ liệu nghiệp vụ lưu bền trong IndexedDB (HAK.DB):
 *   HAK.Batches : các ĐỢT Excel đã nhập ở mục Nhập liệu (thông số + file gốc) → mở lại app vẫn còn, đọc lại bằng đúng bộ đọc hiện hành.
 *   HAK.Issued  : nhật ký chứng từ đã lập (PXKKVCNB / BKLS) → cảnh báo trùng số, gợi ý số kế tiếp, tra cứu về sau.
 * Lỗi lưu KHÔNG bao giờ làm hỏng việc chính (mọi hàm ghi đều bắt lỗi và chỉ báo cảnh báo).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const DB = () => HAK.DB;
  const warn = (m) => { if (HAK.UI) HAK.UI.toast(m, 'warning'); };

  /* ======================= Các đợt Excel ======================= */
  const bid = (type, fileName) => type + '|' + fileName;
  const Batches = {
    /** Lưu (hoặc thay) 1 đợt: thông số + file gốc. bytes = ArrayBuffer của file. */
    async save(type, b, bytes) {
      try {
        if (!b.addedAt) b.addedAt = Date.now();
        await DB().put('batchdata', bytes, bid(type, b.fileName));
        await this.saveMeta(type, b);
        b.saved = true;
        return true;
      } catch (e) { console.warn('Không lưu được đợt:', e); warn('Không lưu được đợt "' + b.fileName + '" vào bộ nhớ trình duyệt — đợt chỉ tồn tại đến khi đóng trang.'); return false; }
    },
    /** Cập nhật thông số (sheet / ánh xạ cột) của đợt đã lưu. */
    async saveMeta(type, b) {
      if (!b.saved && !b.addedAt) return;
      try {
        await DB().put('batches', { id: bid(type, b.fileName), type, fileName: b.fileName, size: b.size, sheet: b.sheet, mapping: b.mapping || {}, headerRow: b.headerRow || null, addedAt: b.addedAt || Date.now(), updatedAt: Date.now(), conv: b.conv || null, from: b.from || null, veh: b.veh || null });   // v2.6.7: conv = đã chuyển sang hình thức; from = chép từ hình thức · v2.7.2 veh = danh sách xe riêng của đợt
      } catch (e) { console.warn('Không cập nhật được thông số đợt:', e); }
    },
    /** v2.6.7: file gốc (ArrayBuffer) của 1 đợt đã lưu — dùng khi chép đợt sang hình thức khác. */
    async bytes(type, fileName) { return DB().get('batchdata', bid(type, fileName)); },
    async remove(type, fileName) {
      try { await DB().del('batches', bid(type, fileName)); await DB().del('batchdata', bid(type, fileName)); }
      catch (e) { console.warn('Không xóa được đợt đã lưu:', e); }
    },
    /** Toàn bộ đợt đã lưu, cũ → mới: [{ meta, bytes }]. */
    async loadAll() {
      const metas = (await DB().getAll('batches')).sort((a, b) => a.addedAt - b.addedAt);
      const out = [];
      for (const m of metas) { const bytes = await DB().get('batchdata', m.id); if (bytes) out.push({ meta: m, bytes }); }
      return out;
    },
    /** Dùng cho sao lưu toàn bộ. */
    async exportAll() {
      const list = await this.loadAll();
      return list.map((x) => ({ meta: x.meta, b64: bufToB64(x.bytes) }));
    },
    async importAll(items) {
      let n = 0;
      for (const it of items || []) {
        if (!it || !it.meta || !it.meta.id || typeof it.b64 !== 'string') continue;
        await DB().put('batchdata', b64ToBuf(it.b64), it.meta.id); await DB().put('batches', it.meta); n++;
      }
      return n;
    }
  };
  function bufToB64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  /* ======================= Nhật ký chứng từ ======================= */
  /**
   * rec = { id, at, kind:'pxk'|'bkls', type, cid, cua, batch, from, to, trips, kg,
   *         pxkFrom, pxkTo (kind pxk) | soBkls, benMua, outputs (kind bkls), canCuLenh }
   */
  const Issued = {
    list: [],                                   // mới → cũ
    loaded: false,
    async load() {
      try { this.list = (await DB().getAll('issued')).sort((a, b) => b.at - a.at); } catch (e) { console.warn('Không đọc được nhật ký chứng từ:', e); this.list = []; }
      this.loaded = true;
      return this.list;
    },
    async add(rec) {
      rec.id = rec.id || 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      rec.at = rec.at || Date.now();
      if (!rec.by && root.HAK && root.HAK.Auth && root.HAK.Auth.who) rec.by = root.HAK.Auth.who();   // v2.6.1: người lập
      this.list.unshift(rec);
      try { await DB().put('issued', rec); }
      catch (e) { console.warn('Không ghi được nhật ký chứng từ:', e); warn('Không ghi được nhật ký chứng từ vừa lập.'); }
      return rec;
    },
    async remove(id) {
      this.list = this.list.filter((r) => r.id !== id);
      try { await DB().del('issued', id); } catch (e) { console.warn('Không xóa được nhật ký:', e); }
    },
    async importAll(items) {
      let n = 0;
      for (const r of items || []) { if (r && r.id && !this.list.some((x) => x.id === r.id)) { await DB().put('issued', r); n++; } }
      await this.load();
      return n;
    },

    /** Lần lập PXK gần nhất (theo số lớn nhất) của 1 công ty. */
    lastPxk(cid) {
      let best = null;
      this.list.forEach((r) => { if (r.kind === 'pxk' && r.cid === cid && (!best || r.pxkTo > best.pxkTo)) best = r; });
      return best;
    },
    /** Số BKLS gần nhất (theo thời gian lập) của 1 công ty. */
    lastBkls(cid) { return this.list.find((r) => r.kind === 'bkls' && r.cid === cid) || null; },
    /** "010/2026/BKLS" → "011/2026/BKLS" (giữ độ rộng số, chỉ tăng số đầu tiên). */
    nextBklsNo(so) {
      const m = String(so || '').match(/^(\D*)(\d+)(.*)$/); if (!m) return '';
      return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3];
    },

    /** Xung đột khi lập PXK: dải số chồng lên lần trước (cùng công ty) / cùng đợt đã lập PXK rồi. */
    checkPxk(o) {
      const out = [];
      this.list.forEach((r) => {
        if (r.kind !== 'pxk') return;
        if (r.cid === o.cid && o.from <= r.pxkTo && o.to >= r.pxkFrom) out.push({ rec: r, why: 'overlap' });
        else if (r.type === o.type && r.batch === o.batch && r.cid === o.cid) out.push({ rec: r, why: 'again' });
      });
      return out;
    },
    /** Xung đột khi lập BKLS: số BKLS đã dùng cho đợt khác (cùng công ty). */
    checkBkls(o) {
      const out = [];
      this.list.forEach((r) => {
        if (r.kind === 'bkls' && r.cid === o.cid && r.soBkls === o.so && !(r.type === o.type && r.batch === o.batch)) out.push({ rec: r, why: 'sameNo' });
      });
      return out;
    }
  };

  HAK.Batches = Batches;
  HAK.Issued = Issued;
})(window);
