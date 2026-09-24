// Bộ máy đồng bộ hai chiều giữa máy và kho xa (Google Drive).
//
// NGUYÊN TẮC, theo đúng thứ tự ưu tiên:
//   1. Không bao giờ mất dữ liệu. Ghi xuống máy trước, đẩy lên sau.
//   2. Không bao giờ lệch âm thầm. Lệch là phải báo.
//   3. Xoá là xoá cả hai nơi, và mục đã xoá không được sống lại.
//
// Máy vẫn là nơi làm việc chính. Mất mạng thì app chạy bình thường, thay đổi
// nằm chờ trong máy, có mạng lại thì tự đẩy lên.
import { CAU_HINH, LOAI } from './config.js';
import { db } from './db.js';
import {
  KHO, duyet, apDungTuXa, xoaTuXa, layDauXoa, donDauXoaCu, anhDangDung, khiDoi,
} from './store.js';
import { khoXaDrive } from './drive.js';

const TEN_FILE = 'du-lieu.json';

// --- Trạng thái ------------------------------------------------------------
// chuaNoi | dangChay | xong | choMang | loi
let _trangThai = { ma: 'chuaNoi', luc: 0, loi: '', choDay: 0 };
const nghe = new Set();
let _khoXa = khoXaDrive;
let _dangChay = null;        // Promise của lần đồng bộ đang chạy
let _hen = null;             // bộ đếm giờ gom thay đổi
let _coDoi = false;          // có thay đổi chưa đẩy

export function datKhoXa(kx) { _khoXa = kx; }
export function khoXa() { return _khoXa; }
export async function layVaCham() { return (await db.lay('dongbo', 'vaCham'))?.ds || []; }
export async function xoaVaCham() { await db.xoa('dongbo', 'vaCham'); }
export function trangThai() { return { ..._trangThai, coDoi: _coDoi }; }
export function khiTrangThaiDoi(fn) { nghe.add(fn); return () => nghe.delete(fn); }

function dat(ma, them = {}) {
  _trangThai = { ..._trangThai, ma, luc: Date.now(), loi: '', ...them };
  for (const fn of nghe) { try { fn(trangThai()); } catch (e) { console.error(e); } }
}

// --- Mã đối chiếu ----------------------------------------------------------
// Rút gọn toàn bộ dữ liệu thành một chuỗi ngắn. Hai bên cùng mã = giống nhau.
// Không có thứ này thì app chỉ TIN là đã đồng bộ chứ không BIẾT.
function bam(chuoi) {
  let h = 0x811c9dc5;
  for (let i = 0; i < chuoi.length; i++) {
    h ^= chuoi.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function chuKyTu(duLieu) {
  const phan = [];
  for (const l of LOAI) {
    const ds = (duLieu[l] || []).slice().sort((a, b) => (a.id > b.id ? 1 : -1));
    for (const r of ds) phan.push(l + ':' + r.id + ':' + (r.capNhat || 0));
  }
  return bam(phan.join('|')) + '-' + phan.length;
}

export function chuKyMay() {
  const d = {};
  for (const l of LOAI) d[l] = [...duyet(l)];
  return chuKyTu(d);
}

// --- Gói dữ liệu của máy ---------------------------------------------------
async function goiCuaMay() {
  const duLieu = {};
  for (const l of LOAI) duLieu[l] = [...duyet(l)];
  return {
    app: 'duoc_hoc',
    phienBan: CAU_HINH.PHIEN_BAN,
    ghiLuc: Date.now(),
    duLieu,
    meta: await db.layTatCa('meta'),
    daXoa: await layDauXoa(),
    chuKy: chuKyTu(duLieu),
  };
}

// --- Gộp hai bên -----------------------------------------------------------
// Quy tắc: bản ghi nào SỬA SAU CÙNG thì thắng. Dấu xoá cũng là một lần sửa —
// dấu xoá mới hơn bản ghi thì bản ghi phải biến mất.
function gop(mayDs, xaDs, dauXoaGop) {
  const ra = new Map();
  const nhet = (r) => {
    if (!r?.id) return;
    const cu = ra.get(r.id);
    if (!cu || (r.capNhat || 0) > (cu.capNhat || 0)) ra.set(r.id, r);
  };
  for (const r of mayDs) nhet(r);
  for (const r of xaDs) nhet(r);

  // Loại những mục đã bị xoá sau lần sửa cuối
  for (const [id, r] of [...ra]) {
    const d = dauXoaGop.get(id);
    if (d && (d.xoaLuc || 0) >= (r.capNhat || 0)) ra.delete(id);
  }
  return ra;
}

function gopDauXoa(mayDs, xaDs) {
  const m = new Map();
  for (const x of [...mayDs, ...xaDs]) {
    if (!x?.banGhiId) continue;
    const cu = m.get(x.banGhiId);
    if (!cu || (x.xoaLuc || 0) > (cu.xoaLuc || 0)) m.set(x.banGhiId, x);
  }
  return m;
}

// --- Đồng bộ ---------------------------------------------------------------
export function dongBoNgay({ imLang = true } = {}) {
  if (_dangChay) return _dangChay;
  _dangChay = chay(imLang).finally(() => { _dangChay = null; });
  return _dangChay;
}

async function chay(imLang) {
  if (!_khoXa.sanSang()) {
    dat('chuaNoi', { loi: 'Chưa khai báo mã Client ID của Google.' });
    return { ok: false, ly: 'chuaCauHinh' };
  }
  if (!navigator.onLine) {
    dat('choMang');
    return { ok: false, ly: 'khongMang' };
  }

  dat('dangChay');
  const tomTat = { tuXaVe: 0, tuMayLen: 0, xoaTheo: 0, anhLen: 0, anhVe: 0, anhXoa: 0, vaCham: 0 };
  const vaChamMoi = [];   // bản thua cuộc, cất lại chứ không vứt

  try {
    await _khoXa.noi(imLang);

    // --- 1. Đọc bên kia
    let xa = null;
    try {
      xa = await _khoXa.docJson(TEN_FILE);
    } catch (e) {
      throw new Error('Không đọc được dữ liệu trên Drive: ' + e.message);
    }
    const xaDuLieu = xa?.duLieu || {};
    const xaDaXoa = xa?.daXoa || [];

    // --- 2. Gộp
    const mayDaXoa = await layDauXoa();
    const dauXoaGop = gopDauXoa(mayDaXoa, xaDaXoa);
    const lanCuoi = (await db.lay('dongbo', 'trangThai'))?.lanCuoi || 0;

    for (const l of LOAI) {
      const may = [...duyet(l)];
      const mayTheoId = new Map(may.map(r => [r.id, r]));
      const hopNhat = gop(may, xaDuLieu[l] || [], dauXoaGop);

      const canGhi = [];
      for (const [id, r] of hopNhat) {
        const cu = mayTheoId.get(id);
        if (!cu) { canGhi.push(r); tomTat.tuXaVe++; }
        else if ((r.capNhat || 0) > (cu.capNhat || 0)) {
          canGhi.push(r); tomTat.tuXaVe++;
          // Cả hai bên cùng sửa kể từ lần đồng bộ trước = va chạm thật.
          // Bản thua KHÔNG bị vứt đi — cất lại để còn xem lại được.
          if ((cu.capNhat || 0) > lanCuoi) {
            tomTat.vaCham++;
            vaChamMoi.push({ loai: l, banThua: cu, banThang: r, luc: Date.now() });
          }
        }
      }
      if (canGhi.length) await apDungTuXa(l, canGhi);

      // Mục nào máy còn mà bản hợp nhất không còn -> đã bị xoá ở đâu đó
      for (const r of may) {
        if (!hopNhat.has(r.id)) { await xoaTuXa(l, r.id); tomTat.xoaTheo++; }
      }
      tomTat.tuMayLen += hopNhat.size;
    }

    // --- 3. Gộp tiến độ ôn tập (kho meta)
    for (const m of xa?.meta || []) {
      if (!m?.id) continue;
      if (m.id === 'tienDoOnTap') {
        const cu = (await db.lay('meta', 'tienDoOnTap'))?.giaTri || {};
        const gopTd = { ...cu };
        for (const [k, v] of Object.entries(m.giaTri || {})) {
          if (!gopTd[k] || (v.lanCuoi || 0) > (gopTd[k].lanCuoi || 0)) gopTd[k] = v;
        }
        await db.ghi('meta', { id: 'tienDoOnTap', giaTri: gopTd });
      } else if (!(await db.lay('meta', m.id))) {
        await db.ghi('meta', m);
      }
    }

    // --- 4. Ghi bản hợp nhất lên Drive
    const goiMoi = await goiCuaMay();
    goiMoi.daXoa = [...dauXoaGop.values()];
    await _khoXa.ghiJson(TEN_FILE, goiMoi);

    // --- 5. Ảnh
    const kq = await dongBoAnh(dauXoaGop);
    Object.assign(tomTat, kq);

    // --- 6. Đối chiếu lại để chắc chắn hai bên giống nhau
    const kiemTra = await _khoXa.docJson(TEN_FILE);
    const chuKyXa = kiemTra?.chuKy || '';
    const chuKyNay = chuKyMay();
    const khop = chuKyXa === chuKyNay;

    if (vaChamMoi.length) {
      const cuVC = (await db.lay('dongbo', 'vaCham'))?.ds || [];
      await db.ghi('dongbo', { id: 'vaCham', ds: [...vaChamMoi, ...cuVC].slice(0, 50) });
    }
    await donDauXoaCu();
    await db.ghi('dongbo', {
      id: 'trangThai',
      lanCuoi: Date.now(),
      chuKy: chuKyNay,
      chuKyXa,
      khop,
      tomTat,
    });

    _coDoi = false;
    if (!khop) {
      dat('loi', { loi: 'Đã đẩy lên nhưng hai bên chưa khớp. Bấm "Đối chiếu ngay" để xem.' });
      return { ok: false, ly: 'lechChuKy', tomTat };
    }
    dat('xong');
    return { ok: true, tomTat };

  } catch (e) {
    const canDangNhap = /Cần đăng nhập|đóng cửa sổ|chưa cho phép|Client ID/i.test(e.message || '');
    dat(canDangNhap ? 'chuaNoi' : 'loi', { loi: e.message || String(e) });
    return { ok: false, ly: 'loi', loi: e.message };
  }
}

// --- Ảnh -------------------------------------------------------------------
async function dongBoAnh(dauXoaGop) {
  const ra = { anhLen: 0, anhVe: 0, anhXoa: 0 };
  const canGiu = anhDangDung();
  const mayCo = new Set(await db.layKhoa('anh'));
  const xaCo = new Set(await _khoXa.danhSachAnh());

  // Xoá trên Drive những ảnh đã bị gỡ ở máy
  for (const id of xaCo) {
    const d = dauXoaGop.get(id);
    if (d || (!mayCo.has(id) && !canGiu.has(id))) {
      try { await _khoXa.xoaAnh(id); ra.anhXoa++; xaCo.delete(id); } catch (_) { /* thử lại lần sau */ }
    }
  }

  // Đẩy lên những ảnh máy có mà Drive chưa có
  for (const id of mayCo) {
    if (xaCo.has(id) || dauXoaGop.has(id)) continue;
    const a = await db.lay('anh', id);
    if (!a?.blob) continue;
    try { await _khoXa.ghiAnh(id, a.blob); ra.anhLen++; } catch (_) { /* thử lại lần sau */ }
  }

  // Kéo về những ảnh Drive có mà máy chưa có (máy mới cài chẳng hạn)
  for (const id of xaCo) {
    if (mayCo.has(id) || dauXoaGop.has(id)) continue;
    try {
      const b = await _khoXa.docAnh(id);
      if (b) {
        await db.ghi('anh', { id, taoLuc: Date.now(), blob: b, co: b.size });
        ra.anhVe++;
      }
    } catch (_) { /* thử lại lần sau */ }
  }
  return ra;
}

// --- Đối chiếu -------------------------------------------------------------
// Không chỉ tin là đã đồng bộ, mà đi đếm lại từng bên rồi so.
export async function doiChieu() {
  if (!_khoXa.sanSang()) throw new Error('Chưa khai báo mã Client ID của Google.');
  await _khoXa.noi(true);
  const xa = await _khoXa.docJson(TEN_FILE);
  const chuKyNay = chuKyMay();

  if (!xa) {
    return { khop: false, loi: 'Trên Drive chưa có dữ liệu nào.', may: demMay(), xa: null };
  }
  const demXa = {};
  let tongXa = 0;
  for (const l of LOAI) { demXa[l] = (xa.duLieu?.[l] || []).length; tongXa += demXa[l]; }

  const lech = [];
  for (const l of LOAI) {
    const may = new Map([...duyet(l)].map(r => [r.id, r.capNhat || 0]));
    const xaM = new Map((xa.duLieu?.[l] || []).map(r => [r.id, r.capNhat || 0]));
    for (const [id, t] of may) {
      if (!xaM.has(id)) lech.push({ loai: l, id, ly: 'chỉ có trên máy' });
      else if (xaM.get(id) !== t) lech.push({ loai: l, id, ly: 'hai bên khác phiên bản' });
    }
    for (const id of xaM.keys()) {
      if (!may.has(id)) lech.push({ loai: l, id, ly: 'chỉ có trên Drive' });
    }
  }

  const anhMay = (await db.layKhoa('anh')).length;
  const anhXa = (await _khoXa.danhSachAnh()).length;

  return {
    khop: xa.chuKy === chuKyNay && lech.length === 0,
    chuKyMay: chuKyNay,
    chuKyXa: xa.chuKy,
    may: demMay(),
    xa: demXa,
    tongMay: Object.values(demMay()).reduce((a, b) => a + b, 0),
    tongXa,
    anhMay,
    anhXa,
    lech: lech.slice(0, 50),
    soLech: lech.length,
  };
}

function demMay() {
  const d = {};
  for (const l of LOAI) d[l] = KHO[l].size;
  return d;
}

// --- Tự động ---------------------------------------------------------------
export async function napTrangThai() {
  const t = await db.lay('dongbo', 'trangThai');
  if (t?.lanCuoi) {
    _trangThai = { ma: t.khop ? 'xong' : 'loi', luc: t.lanCuoi, loi: t.khop ? '' : 'Hai bên chưa khớp.' };
  }
  return t;
}

export function batTuDong() {
  khiDoi(() => {
    if (!CAU_HINH.DONG_BO_TU_DONG) return;
    if (_dangChay) return;                 // thay đổi do chính lần đồng bộ gây ra
    if (!_khoXa.sanSang() || !_khoXa.daNoi()) return;
    _coDoi = true;
    dat(_trangThai.ma === 'dangChay' ? 'dangChay' : 'choMang', { choDay: Date.now() });
    clearTimeout(_hen);
    _hen = setTimeout(() => dongBoNgay({ imLang: true }), CAU_HINH.CHO_TRUOC_KHI_DAY * 1000);
  });

  window.addEventListener('online', () => {
    if (_coDoi && _khoXa.sanSang() && _khoXa.daNoi()) dongBoNgay({ imLang: true });
  });
}

export async function dangNhap() {
  await _khoXa.noi(false);
  return dongBoNgay({ imLang: true });
}

export async function dangXuat() {
  await _khoXa.ngat();
  dat('chuaNoi');
}
