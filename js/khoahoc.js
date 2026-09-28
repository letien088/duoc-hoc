// Khoá học — 4 bộ dữ liệu của khoá đào tạo dược sĩ (Excel "Bộ data 700 - 1500 - 3000",
// 6.4.2026), sinh bằng tools/xuat_khoahoc.py thành data/khoahoc.json.
//
//   Bộ HV      bộ chính thức của học viên, chia 3 tuần
//   Bộ 700 · 1500 · 3000   Level 1 → 2 → 3
//   + tình huống cắt liều (đề, đáp án, từ khoá), lịch bài giảng, tình huống QTBH
//
// Đơn vị học là MỤC = hoạt chất + hàm lượng + dạng bào chế, kèm các biệt dược tương
// đương của nó — đúng một dòng Excel. Tiến độ ghi vào bản ghi tiến độ ôn tập với khoá
// 'kh:<hoạt chất>|<hàm lượng>|<dạng>' bỏ dấu, nên:
//   - đi theo sao lưu và đồng bộ Drive như Ôn tập, Lộ trình
//   - học ở Bộ HV thì sang Bộ 1500 các mục trùng đã tính là đã học
//   - không lệch khi Excel được sửa rồi xuất lại (không dùng số thứ tự làm khoá)
import { CAU_HINH } from './config.js';
import { el, boDau, datMau, chuLoi } from './util.js';
import { LICH_ON, tienDoMuc, suaTienDoMuc, xaoMang } from './ontap.js';
import { napDanhMuc, hangThuoc, thuocTheoSku } from './danhmuc.js';

const MAU = '#4f46e5';
const TEP = 'data/khoahoc.json';
const KHOA_BO = 'duoc_hoc_kh_bo';          // bộ đang học — tiện ích riêng từng máy
const { NHAC_LAI, TEN_HAN, MUC_THUOC } = LICH_ON;

let KH = null;
let _dangNap = null;
let _loiNap = null;

export function daNapKH() { return !!KH; }

// "ASPIRIN 81 MEKOPHAR 10X10" -> "Aspirin 81 Mekophar 10x10". Tên đã viết hoa thường thì giữ nguyên.
function tenDep(s) {
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

export function napKhoaHoc() {
  if (KH) return Promise.resolve(KH);
  if (_dangNap) return _dangNap;
  _loiNap = null;
  _dangNap = fetch(TEP)
    .then(r => { if (!r.ok) throw new Error('Không tải được dữ liệu khoá học (HTTP ' + r.status + ').'); return r.json(); })
    .then(g => { KH = dung(g); _dangNap = null; return KH; })
    .catch(e => { _dangNap = null; _loiNap = e; throw e; });
  return _dangNap;
}

function dung(g) {
  const sp = g.sp.map(([ma, ten, nuoc, loai, banChay, coDm, keDon], i) => ({
    i, ma, ten: tenDep(ten), nuoc, loai, banChay: !!banChay, coDm: !!coDm, keDon,
  }));
  for (const s of sp) s.khoa = boDau(s.ten);
  const muc = [];
  const theoKhoa = new Map();       // khoá tiến độ -> các mục (mỗi bộ một mục)
  const bo = g.bo.map(b => {
    // Hai dòng Excel trùng hoạt chất + hàm lượng + dạng trong CÙNG một bộ thì gộp làm
    // một mục: cùng một thứ phải nhớ, không học hai lần.
    const trong = new Map();
    for (const j of b.muc) {
      const [n, p, dc, ham, dang, ds] = g.muc[j];
      const cacSp = ds.map(k => sp[k]);
      const khoa = 'kh:' + [dc || cacSp[0]?.ten || '', ham, dang].map(boDau).join('|');
      if (trong.has(khoa)) {
        const m = trong.get(khoa);
        for (const s of cacSp) if (!m.sp.includes(s)) m.sp.push(s);
        continue;
      }
      const m = { i: muc.length, bo: b.k, nhom: n, pn: p, dc, ham, dang, sp: cacSp, khoa };
      muc.push(m);
      trong.set(khoa, m);
      if (!theoKhoa.has(khoa)) theoKhoa.set(khoa, []);
      theoKhoa.get(khoa).push(m);
    }
    return { k: b.k, ten: b.ten, mo: b.mo, muc: [...trong.values()] };
  });
  for (const m of muc) {
    m.tieuDe = m.dc || m.sp[0]?.ten || '(không tên)';
    m.khoaTim = boDau([m.dc, ...m.sp.map(s => s.ten)].join(' '));
    // Kê đơn: chỉ kết luận khi MỌI biệt dược có trong danh mục cùng một loại
    const kd = m.sp.map(s => s.keDon).filter(v => v === 0 || v === 1);
    m.rx = kd.length && kd.every(v => v === 1) ? 1 : kd.length && kd.every(v => v === 0) ? 0 : null;
  }
  const theoSku = new Map();
  for (const m of muc) for (const s of m.sp) {
    if (!s.ma) continue;
    if (!theoSku.has(s.ma)) theoSku.set(s.ma, []);
    theoSku.get(s.ma).push(m);
  }
  return {
    ...g, sp, muc, bo, theoKhoa, theoSku,
    boTheoK: new Map(bo.map(b => [b.k, b])),
    tuan: new Map(Object.entries(g.tuan).map(([n, t]) => [+n, t])),
  };
}

// ---------------------------------------------------------------------------
// TIẾN ĐỘ
const td = (m) => tienDoMuc(m.khoa);
const daHoc = (m) => (td(m)?.lan || 0) > 0;
const daThuoc = (m) => daHoc(m) && (td(m).mucDo || 0) >= MUC_THUOC;
const denHan = (m) => daHoc(m) && (td(m).honLai || 0) <= Date.now();
const hayQuen = (m) => (td(m)?.quen || 0) >= 2 && (td(m)?.mucDo || 0) < MUC_THUOC;

async function ghiNho(m, nho) {
  // Cùng luật với Ôn tập / Lộ trình: nhớ thì lên một mức, quên thì về 0 (gặp lại sau 10 phút).
  // Đếm thêm số lần quên để gom ra danh sách "hay quên".
  return suaTienDoMuc(m.khoa, cu => {
    const mucDo = nho ? Math.min(NHAC_LAI.length - 1, (cu?.mucDo || 0) + 1) : 0;
    return {
      ...(cu || {}), mucDo, lan: (cu?.lan || 0) + 1, quen: (cu?.quen || 0) + (nho ? 0 : 1),
      lanCuoi: Date.now(), honLai: Date.now() + NHAC_LAI[mucDo],
    };
  });
}

function boDangHoc() {
  let k = null;
  try { k = localStorage.getItem(KHOA_BO); } catch (_) { /* chế độ riêng tư */ }
  return KH.boTheoK.get(k) || KH.bo[0];
}
function chonBo(k) { try { localStorage.setItem(KHOA_BO, k); } catch (_) { /* bỏ qua */ } }

// Các mục khác nhau (theo khoá tiến độ) — mục trùng giữa các bộ chỉ tính một lần
function khongTrung(ds) {
  const da = new Set();
  return ds.filter(m => !da.has(m.khoa) && da.add(m.khoa));
}
const tatCaMuc = () => khongTrung(KH.muc);
const soMoiLuot = () => CAU_HINH.KH_MOI_MOI_LUOT || 15;
const mucMoi = (b) => b.muc.filter(m => !daHoc(m)).slice(0, soMoiLuot());
const dsDenHan = (b) => khongTrung(b ? b.muc : KH.muc).filter(denHan);
const dsHayQuen = (b) => khongTrung(b ? b.muc : KH.muc).filter(hayQuen)
  .sort((x, y) => (td(y).quen || 0) - (td(x).quen || 0));

function nhomCuaBo(b) {
  const ra = new Map();
  for (const m of b.muc) {
    if (!ra.has(m.nhom)) ra.set(m.nhom, []);
    ra.get(m.nhom).push(m);
  }
  return ra;
}

function ketQuaTh(i) { return tienDoMuc('khth:' + i); }

// ---------------------------------------------------------------------------
// HIỂN THỊ DÙNG CHUNG
const soVN = (n) => Number(n).toLocaleString('vi-VN');
const pt = (n, tong) => tong ? Math.round(100 * n / tong) + '%' : '—';

function thanh(n, tong, lop = '') {
  return el('div', { class: 'lt-thanh ' + lop }, el('i', { style: `width:${(100 * n / Math.max(1, tong)).toFixed(1)}%` }));
}

function trong(icon, tieuDe, chu) {
  return el('div', { class: 'trong' }, el('div', { class: 'trong-icon', text: icon }), el('h3', { text: tieuDe }), chu ? el('p', { text: chu }) : null);
}

function vach(m) {
  const t = td(m);
  if (!t?.lan) return null;
  const d = t.mucDo || 0;
  return el('span', { class: 'lt-vach', title: 'Mức thuộc', text: '●'.repeat(d) + '○'.repeat(NHAC_LAI.length - 1 - d) });
}

function nhanRx(rx) {
  if (rx === 1) return el('span', { class: 'dm-rx', text: 'Kê đơn' });
  if (rx === 0) return el('span', { class: 'dm-otc', text: 'Không kê đơn' });
  return null;
}

function nhanLoai(s) {
  if (s.loai === 1) return el('span', { class: 'kh-tag kh-brand', text: 'Brandname' });
  if (s.loai === 0) return el('span', { class: 'kh-tag', text: 'Generic' });
  return null;
}

// Một biệt dược: tên (bấm được nếu có trong danh mục) · nước · Brandname/Generic · 🔥
function dongSp(s, di) {
  const ten = s.coDm && di
    ? el('a', { class: 'kh-sp-ten', href: '#/dm/t/' + s.ma, onclick: (e) => { e.preventDefault(); di('#/dm/t/' + s.ma); }, text: s.ten })
    : el('span', { class: 'kh-sp-ten', text: s.ten });
  return el('li', { class: 'kh-sp' },
    s.banChay ? el('span', { class: 'kh-chay', title: 'Bán chạy', text: '🔥' }) : null,
    ten, s.nuoc ? el('span', { class: 'lt-hg', text: ' · ' + s.nuoc }) : null, ' ', nhanLoai(s));
}

function tenNhom(m) {
  const n = KH.nhom[m.nhom], p = KH.pn[m.pn];
  return p && p !== n ? n + ' › ' + p : n;
}

function noiDungMuc(m, di) {
  const dong = (nhan, ...con) => el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: nhan }), ...con);
  return [
    dong('Nhóm: ', tenNhom(m)),
    m.dc && (m.ham || m.dang) ? dong('Hàm lượng · dạng: ', [m.ham, m.dang].filter(Boolean).join(' · ')) : null,
    m.sp.length ? el('div', { class: 'lt-dong' },
      el('span', { class: 'lt-k', text: m.sp.length > 1 ? `${m.sp.length} biệt dược tương đương:` : 'Biệt dược:' }),
      el('ul', { class: 'kh-sp-ds' }, ...m.sp.map(s => dongSp(s, di)))) : null,
  ].filter(Boolean);
}

function theMuc(m, di, { tieuDeBam = false } = {}) {
  const ten = tieuDeBam && di
    ? el('a', { class: 'lt-ten kh-ten-lk', href: '#/kh/m/' + m.i, onclick: (e) => { e.preventDefault(); di('#/kh/m/' + m.i); }, text: m.tieuDe })
    : el('b', { class: 'lt-ten', text: m.tieuDe });
  return el('div', { class: 'lt-the ' + (m.rx === 1 ? 'rx' : m.rx === 0 ? 'otc' : '') },
    el('div', { class: 'lt-dau' }, ten,
      m.dc && m.ham ? el('span', { class: 'kh-ham', text: m.ham }) : null,
      nhanRx(m.rx), vach(m)),
    ...noiDungMuc(m, di));
}

function hangMuc(icon, ten, phu, dich, di, phai) {
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: icon }),
    el('span', { class: 'ds-chu' }, el('span', { class: 'ds-ten', text: ten }), phu ? el('span', { class: 'ds-phu', text: phu }) : null),
    phai || null,
    el('span', { class: 'ds-mui', text: '›' }));
}

// ---------------------------------------------------------------------------
// TRA CỨU (tab 🔍): tìm theo hoạt chất, tên biệt dược, mã SP
export function timKH(q) {
  if (!KH) return [];
  const tu = boDau(q).split(/\s+/).filter(Boolean);
  if (!tu.length) return [];
  const ma = /^\d{3,}$/.test(q.trim()) ? q.trim() : null;
  const ra = [];
  for (const m of tatCaMuc()) {
    if (ma) {
      if (m.sp.some(s => s.ma && (s.ma === ma.padStart(8, '0') || s.ma.includes(ma)))) ra.push({ m, hang: 0 });
      continue;
    }
    if (!tu.every(w => m.khoaTim.includes(w))) continue;
    const dc = boDau(m.dc);
    ra.push({ m, hang: dc.startsWith(tu[0]) ? 0 : dc.includes(tu[0]) ? 1 : 2 });
  }
  return ra.sort((a, b) => a.hang - b.hang).map(x => x.m);
}

export function hangKH(m, di) {
  const dich = '#/kh/m/' + m.i;
  const phu = [m.ham, m.dang, KH.nhom[m.nhom]].filter(Boolean).join(' · ');
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: '🎓' }),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: m.tieuDe }),
      el('span', { class: 'ds-phu', text: phu + (m.dc ? ' · ' + m.sp.map(s => s.ten).slice(0, 2).join(', ') : '') })),
    vach(m),
    el('span', { class: 'ds-mui', text: '›' }));
}

// Khối "Có trong khoá học" ở trang một thuốc của Danh mục. Tự nạp dữ liệu nếu chưa có.
export function khoiTrongKhoaHoc(sku, di) {
  const boc = el('div', {});
  const ve = () => {
    const ds = KH.theoSku.get(sku);
    if (!ds?.length) return;
    const boCo = [...new Set(ds.map(m => KH.boTheoK.get(m.bo).ten))];
    const m = ds[0];
    boc.append(el('h2', { class: 'khu-de', text: '🎓 Có trong khoá học', style: 'margin-top:18px' }),
      el('p', { class: 'the-chu', text: 'Nằm trong: ' + boCo.join(' · ') + ' — nhóm ' + tenNhom(m) }),
      theMuc(m, di, { tieuDeBam: true }));
  };
  if (KH) ve(); else napKhoaHoc().then(ve).catch(() => { /* chỉ thiếu khối này */ });
  return boc;
}

// Thẻ tóm tắt cho Trang chủ
export function theTrangChu(di) {
  const the = el('a', { class: 'on-the lt-tc', href: '#/kh', onclick: (e) => { e.preventDefault(); di('#/kh'); } });
  const ve = () => {
    the.innerHTML = '';
    if (!KH) {
      the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '🎓 Khoá học' })),
        el('h3', { class: 'on-ten', text: 'Bộ data HV · 700 · 1500 · 3000' }),
        el('div', { class: 'on-phu', text: 'Biệt dược tương đương theo nhóm, trắc nghiệm, tình huống cắt liều.' }),
        el('div', { class: 'on-goi', text: 'Mở khoá học →' }));
      return;
    }
    const b = boDangHoc();
    const han = dsDenHan().length;
    const thuoc = b.muc.filter(daThuoc).length;
    const moi = mucMoi(b);
    the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: han ? `🎓 ${han} thẻ khoá học tới hạn ôn` : '🎓 Khoá học' })),
      el('h3', { class: 'on-ten', text: moi.length ? `${b.ten}: học tiếp ${KH.nhom[moi[0].nhom]}` : `${b.ten}: đã học hết` }),
      el('div', { class: 'on-phu', text: `Đã thuộc ${soVN(thuoc)}/${soVN(b.muc.length)} mục (${pt(thuoc, b.muc.length)}).` }),
      thanh(thuoc, b.muc.length),
      el('div', { class: 'on-goi', text: 'Vào học →' }));
  };
  ve();
  if (!KH) napKhoaHoc().then(() => { if (the.isConnected) ve(); }).catch(() => { /* giữ thẻ mặc định */ });
  return the;
}

// ---------------------------------------------------------------------------
// ĐỊNH TUYẾN '#/kh/...'   ctx: { veDau, nutQuayLai, di, veLai }
export function trangKhoaHoc(p, ctx) {
  datMau(MAU);
  if (!KH) {
    ctx.veDau('Khoá học', p.length ? ctx.nutQuayLai('#/kh') : null);
    const boc = el('div', { class: 'trang trang-vao' });
    if (_loiNap) {
      boc.append(trong('📡', 'Chưa nạp được dữ liệu khoá học', chuLoi(_loiNap)),
        el('div', { class: 'the-nut' }, el('button', { class: 'nut nut-chinh', text: 'Thử lại', onclick: () => { _loiNap = null; ctx.veLai(); } })));
      return boc;
    }
    boc.append(trong('🎓', 'Đang nạp khoá học…', 'Lần đầu mất vài giây, sau đó dùng được cả khi không có mạng.'));
    const hash = location.hash;
    napKhoaHoc().then(() => { if (location.hash === hash) ctx.veLai(); }, () => { if (location.hash === hash) ctx.veLai(); });
    return boc;
  }
  const [a, b, c, d] = p;
  if (!a) return trangChinh(ctx);
  if (a === 'b' && c === 'n') return trangNhom(ctx, b, +d);
  if (a === 'b') return trangBo(ctx, b);
  if (a === 'hoc') return trangHocMoi(ctx, b);
  if (a === 'the') return trangThe(ctx, b, c, d);
  if (a === 'tn') return trangTracNghiem(ctx, b, c, d);
  if (a === 'm') return trangMotMuc(ctx, +b);
  if (a === 'th') return b !== undefined ? trangTinhHuong(ctx, +b) : trangDsTinhHuong(ctx);
  if (a === 'lich') return trangLich(ctx);
  return trangKhong(ctx);
}

// ---------------------------------------------------------------------------
// TRANG CHÍNH
function trangChinh(ctx) {
  const { di } = ctx;
  ctx.veDau('Khoá học', null, el('button', { class: 'dau-nut', onclick: () => di('#/kh/lich'), text: 'Lịch học' }));
  const boc = el('div', { class: 'trang trang-vao' });
  const b = boDangHoc();

  // Chọn bộ
  boc.append(el('div', { class: 'loc-hang' }, ...KH.bo.map(x => el('button', {
    class: 'loc-nut' + (x === b ? ' dang' : ''),
    onclick: () => { chonBo(x.k); ctx.veLai(); }, text: x.ten,
  }))));

  const hoc = b.muc.filter(daHoc).length, thuoc = b.muc.filter(daThuoc).length;
  const soSp = new Set(b.muc.flatMap(m => m.sp)).size;
  boc.append(el('section', { class: 'lt-tong' },
    el('div', { class: 'lt-tong-so' }, pt(thuoc, b.muc.length)),
    el('div', { class: 'lt-tong-chu', text: `${b.ten}: đã thuộc ${soVN(thuoc)}/${soVN(b.muc.length)} mục` }),
    thanh(thuoc, b.muc.length),
    el('div', { class: 'lt-tong-phu', text: `${b.mo} ${nhomCuaBo(b).size} nhóm · ${soVN(soSp)} biệt dược · đã học qua ${soVN(hoc)} mục.` })));

  // Việc hôm nay
  const moi = mucMoi(b), han = dsDenHan(), quen = dsHayQuen();
  boc.append(el('h2', { class: 'khu-de', text: 'Hôm nay' }));
  boc.append(el('a', {
    class: 'on-the', href: '#/kh/hoc/' + b.k, onclick: (e) => { e.preventDefault(); if (moi.length) di('#/kh/hoc/' + b.k); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '① Học mục mới' })),
    el('h3', { class: 'on-ten', text: moi.length ? `${moi.length} mục · ${[...new Set(moi.map(m => KH.nhom[m.nhom]))].slice(0, 3).join(', ')}` : `Đã học hết ${b.ten} 🎉` }),
    el('div', { class: 'on-phu', text: moi.length ? 'Đọc từng thẻ (hoạt chất, hàm lượng, biệt dược tương đương), rồi tự kiểm tra.' : 'Chuyển sang bộ lớn hơn, hoặc ôn và làm trắc nghiệm.' }),
    moi.length ? el('div', { class: 'on-goi', text: 'Học ngay →' }) : null));
  boc.append(el('a', {
    class: 'on-the', href: '#/kh/the/all/han', onclick: (e) => { e.preventDefault(); di('#/kh/the/all/han'); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '② Ôn thẻ tới hạn' })),
    el('h3', { class: 'on-ten', text: han.length ? `${han.length} thẻ tới hạn (mọi bộ)` : 'Không có thẻ nào tới hạn' }),
    el('div', { class: 'on-phu', text: 'Nhớ thì giãn 1 → 3 → 7 → 14 → 30 ngày, quên thì gặp lại sau 10 phút.' }),
    han.length ? el('div', { class: 'on-goi', text: 'Ôn ngay →' }) : null));
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/kh/tn/' + b.k + '/hoc'), text: '📝 Trắc nghiệm phần đã học' }),
    el('button', { class: 'nut', onclick: () => di('#/kh/tn/' + b.k + '/tat'), text: `📝 Trắc nghiệm cả ${b.ten}` }),
    quen.length ? el('button', { class: 'nut', onclick: () => di('#/kh/the/all/quen'), text: `😵 ${quen.length} thẻ hay quên` }) : null));

  // Tình huống + lịch
  boc.append(el('h2', { class: 'khu-de', text: 'Thực hành', style: 'margin-top:18px' }));
  const dsTh = el('div', { class: 'ds' });
  const daLam = KH.tinhHuong.filter((_, i) => ketQuaTh(i)?.lan).length;
  dsTh.append(hangMuc('💬', `Tình huống cắt liều (${KH.tinhHuong.length})`, `Đọc đề, tự trả lời, app chấm theo từ khoá · đã làm ${daLam}/${KH.tinhHuong.length}`, '#/kh/th', di));
  dsTh.append(hangMuc('🗓️', 'Lịch khoá học', `${KH.lich.reduce((s, d) => s + d.bai.length, 0)} bài giảng · ${KH.qtbh.length} tình huống QTBH`, '#/kh/lich', di));
  boc.append(dsTh);

  // Nhóm của bộ
  boc.append(el('h2', { class: 'khu-de', text: `Các nhóm trong ${b.ten}`, style: 'margin-top:18px' }));
  boc.append(dsNhom(b, di));
  boc.append(el('p', { class: 'ct-meta', text: `Dữ liệu: ${KH.nguon}. 🔥 = bán chạy · Brandname = biệt dược gốc · viền đỏ/xanh = kê đơn/không kê đơn (theo danh mục Long Châu).` }));
  return boc;
}

function dsNhom(b, di) {
  const boc = el('div', {});
  let ds = null, tuanTruoc;
  for (const [n, ms] of nhomCuaBo(b)) {
    const t = b.k === 'hv' ? KH.tuan.get(n) : undefined;
    if (b.k === 'hv' && t !== tuanTruoc) {
      boc.append(el('div', { class: 'the-nhan kh-tuan', text: t ? `Tuần ${t}` : 'Ngoài lịch tuần' }));
      ds = null; tuanTruoc = t;
    }
    if (!ds) { ds = el('div', { class: 'ds' }); boc.append(ds); }
    const hoc = ms.filter(daHoc).length, thuoc = ms.filter(daThuoc).length;
    ds.append(hangMuc(hoc === ms.length ? (thuoc === ms.length ? '✅' : '📗') : hoc ? '📖' : '📕',
      KH.nhom[n], `${ms.length} mục · ${new Set(ms.flatMap(m => m.sp)).size} biệt dược · thuộc ${thuoc}`,
      `#/kh/b/${b.k}/n/${n}`, di, thanh(thuoc, ms.length, 'nho')));
  }
  return boc;
}

// ---------------------------------------------------------------------------
// MỘT BỘ (vào từ link cũ / tra cứu) -> chọn bộ rồi về trang chính
function trangBo(ctx, k) {
  if (KH.boTheoK.has(k)) chonBo(k);
  return trangChinh(ctx);
}

// ---------------------------------------------------------------------------
// MỘT NHÓM trong một bộ
function trangNhom(ctx, k, n) {
  const { di } = ctx;
  const b = KH.boTheoK.get(k);
  const ms = b ? b.muc.filter(m => m.nhom === n) : [];
  if (!ms.length) return trangKhong(ctx);
  ctx.veDau(KH.nhom[n], ctx.nutQuayLai('#/kh'), el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di(`#/kh/the/${k}/n/${n}`), text: '🧠 Tự kiểm tra',
  }));
  const boc = el('div', { class: 'trang trang-vao' });
  const thuoc = ms.filter(daThuoc).length;
  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: KH.nhom[n] }),
    el('div', { class: 'nhom-so', text: `${b.ten}${KH.tuan.get(n) && k === 'hv' ? ' · tuần ' + KH.tuan.get(n) : ''} · ${ms.length} mục · ${new Set(ms.flatMap(m => m.sp)).size} biệt dược · đã thuộc ${thuoc}` })));
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di(`#/kh/the/${k}/n/${n}`), text: '🧠 Thẻ lật cả nhóm' }),
    el('button', { class: 'nut', onclick: () => di(`#/kh/tn/${k}/n/${n}`), text: '📝 Trắc nghiệm nhóm' })));
  let pnTruoc = null;
  for (const m of ms) {
    if (m.pn !== pnTruoc && KH.pn[m.pn] !== KH.nhom[n]) {
      boc.append(el('h2', { class: 'khu-de', text: KH.pn[m.pn], style: 'margin-top:14px' }));
    }
    pnTruoc = m.pn;
    boc.append(theMuc(m, di, { tieuDeBam: true }));
  }
  return boc;
}

// ---------------------------------------------------------------------------
// HỌC MỤC MỚI: đọc N thẻ rồi tự kiểm tra
function trangHocMoi(ctx, k) {
  const { di } = ctx;
  const b = KH.boTheoK.get(k);
  if (!b) return trangKhong(ctx);
  const ms = mucMoi(b);
  ctx.veDau('Học mới', ctx.nutQuayLai('#/kh'), ms.length ? el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di(`#/kh/the/${k}/moi`), text: '🧠 Tự kiểm tra',
  }) : null);
  const boc = el('div', { class: 'trang trang-vao' });
  if (!ms.length) { boc.append(trong('🎉', `Đã học hết ${b.ten}`, 'Ôn thẻ tới hạn hoặc chuyển sang bộ lớn hơn.')); return boc; }
  boc.append(el('p', { class: 'the-chu', text: `${ms.length} mục tiếp theo của ${b.ten}. Đọc kỹ: hoạt chất, hàm lượng, dạng và các biệt dược tương đương (thay được cho nhau khi hết hàng). Xong bấm "Tự kiểm tra".` }));
  let nhomTruoc = null;
  for (const m of ms) {
    if (m.nhom !== nhomTruoc) { boc.append(el('h2', { class: 'khu-de', text: tenNhom(m), style: 'margin-top:14px' })); nhomTruoc = m.nhom; }
    boc.append(theMuc(m, di, { tieuDeBam: true }));
  }
  boc.append(el('div', { class: 'the-nut', style: 'margin-top:16px' },
    el('button', { class: 'nut nut-chinh', onclick: () => di(`#/kh/the/${k}/moi`), text: `🧠 Tự kiểm tra ${ms.length} thẻ này` })));
  return boc;
}

// ---------------------------------------------------------------------------
// THẺ LẬT
// k: khoá bộ hoặc 'all' · kieu: moi | han | quen | n (x = số nhóm)
function trangThe(ctx, k, kieu, x) {
  const { di } = ctx;
  const b = k === 'all' ? null : KH.boTheoK.get(k);
  if (k !== 'all' && !b) return trangKhong(ctx);
  const nguon = kieu === 'moi' ? mucMoi(b)
    : kieu === 'han' ? dsDenHan(b)
    : kieu === 'quen' ? dsHayQuen(b)
    : kieu === 'n' ? b.muc.filter(m => m.nhom === +x) : [];
  const quayVe = kieu === 'n' ? `#/kh/b/${k}/n/${x}` : kieu === 'moi' ? `#/kh/hoc/${k}` : '#/kh';
  const tieuDe = { moi: 'Tự kiểm tra', han: 'Ôn thẻ tới hạn', quen: 'Thẻ hay quên', n: KH.nhom[+x] || 'Thẻ lật' }[kieu] || 'Thẻ lật';
  ctx.veDau(tieuDe, ctx.nutQuayLai(quayVe));
  const boc = el('div', { class: 'trang trang-vao' });
  const khung = el('div', { class: 'on-khung' });
  const chieuCua = (m) => {
    if (!m.dc || !m.sp.length) return 'bd';
    if (!spKhongLo(m).length) return 'hc';     // mọi tên thuốc đều lộ tên hoạt chất
    const c = CAU_HINH.KH_CHIEU_THE || 'tron';
    return c === 'tron' ? (Math.random() < 0.5 ? 'bd' : 'hc') : c;
  };
  const chonBd = (m) => { const ds = spKhongLo(m).length ? spKhongLo(m) : m.sp; return ds[Math.random() * ds.length | 0]; };
  let bo = xaoMang([...nguon]).map(m => ({ m, chieu: chieuCua(m), bd: chonBd(m) }));
  let viTri = 0, nho = 0, quen = 0, lat = false, dangGhi = false;
  const quenLai = [];

  const ve = () => {
    khung.innerHTML = '';
    if (!bo.length) {
      khung.append(trong('🌱', kieu === 'han' ? 'Không có thẻ nào tới hạn' : 'Không có thẻ nào', 'Học mục mới hoặc quay lại sau.'),
        el('div', { class: 'on-nut' }, el('button', { class: 'nut nut-chinh', onclick: () => di('#/kh'), text: 'Về Khoá học' })));
      return;
    }
    if (viTri >= bo.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: quen ? '💪' : '🎉' }),
        el('h3', { text: 'Xong lượt này' }),
        el('p', { class: 'the-chu', text: `Nhớ ${nho} · quên ${quen} trên ${bo.length} thẻ.` }),
        quen ? el('p', { class: 'the-chu', text: 'Thẻ quên sẽ gặp lại sau 10 phút. Muốn ôn luôn thì bấm dưới.' }) : null,
        el('div', { class: 'on-nut' },
          quen ? el('button', { class: 'nut', onclick: () => { bo = xaoMang([...quenLai]); quenLai.length = 0; viTri = 0; nho = 0; quen = 0; lat = false; ve(); }, text: `Ôn lại ${quen} thẻ quên` }) : null,
          el('button', { class: 'nut nut-chinh', onclick: () => di(quayVe), text: 'Xong' }))));
      return;
    }
    const { m, chieu, bd } = bo[viTri];
    const d = td(m)?.lan ? td(m).mucDo || 0 : 0;
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', text: '●'.repeat(d) + '○'.repeat(NHAC_LAI.length - 1 - d) })));
    const the = el('div', { class: 'the-lat lt-lat', onclick: () => { if (!lat) { lat = true; ve(); } } });
    if (chieu === 'bd') {
      the.append(el('div', { class: 'the-nhan', text: 'Biệt dược · ' + KH.nhom[m.nhom] }), el('h2', { class: 'the-hoi', text: bd ? bd.ten : m.tieuDe }));
      if (!lat) the.append(el('div', { class: 'lt-goi-y', text: m.dc ? 'Tự nói ra: hoạt chất · hàm lượng · dạng · biệt dược tương đương' : 'Tự nói ra: thuốc này dùng để làm gì, thuộc nhóm nào' }));
    } else {
      the.append(el('div', { class: 'the-nhan', text: 'Hoạt chất · ' + KH.nhom[m.nhom] }),
        el('h2', { class: 'the-hoi', text: m.dc + (m.ham ? ' ' + m.ham : '') }),
        m.dang ? el('div', { class: 'lt-hg', text: m.dang }) : null);
      if (!lat) the.append(el('div', { class: 'lt-goi-y', text: `Kể tên ${m.sp.length > 1 ? m.sp.length + ' biệt dược' : 'biệt dược'} có ở Long Châu` }));
    }
    if (!lat) the.append(el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }));
    else {
      the.style.cursor = 'default';
      the.append(el('div', { class: 'lt-sau' },
        chieu === 'bd' && m.dc ? el('div', { class: 'kh-dap', text: `${m.dc}${m.ham ? ' ' + m.ham : ''}` }) : null,
        el('div', { class: 'lt-dong' }, nhanRx(m.rx)),
        ...noiDungMuc(m, null)));
    }
    khung.append(the);
    if (lat) {
      const tra = async (ok) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          await ghiNho(m, ok);
          if (ok) nho++; else { quen++; quenLai.push(bo[viTri]); }
          viTri++; lat = false; ve(); window.scrollTo(0, 0);
        } finally { dangGhi = false; }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa nhớ', onclick: () => tra(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã nhớ', onclick: () => tra(true) })));
      const moi = Math.min(NHAC_LAI.length - 1, (td(m)?.mucDo || 0) + 1);
      khung.append(el('div', { class: 'on-hen', text: `Nhớ → gặp lại sau ${TEN_HAN[moi]} · Quên → sau ${TEN_HAN[0]}` }));
    }
  };
  boc.append(khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// TRẮC NGHIỆM — 6 kiểu câu, phương án nhiễu lấy từ CÙNG NHÓM cho khó đúng kiểu ở quầy:
//   biệt dược → hoạt chất · biệt dược → hàm lượng · hết hàng thì thay bằng gì
//   hoạt chất → nhóm · Brandname hay Generic · kê đơn hay không
// Trả lời đúng/sai được ghi vào cùng lịch ôn với thẻ lật.
function laySo(s) { return (String(s).match(/\d+(?:[.,]\d+)?/g) || []); }

function khacNhau(ds, khoa = (x) => boDau(x)) {
  const da = new Set();
  return ds.filter(x => { const k = khoa(x); if (!k || da.has(k)) return false; da.add(k); return true; });
}

// Tên biệt dược có ghi sẵn tên hoạt chất ("A.T Desloratadin 2.5mg", "Levothyrox",
// "Verospiron") thì hỏi "chứa chất gì" là lộ đáp án. So 6 chữ đầu của từ chính trong
// tên hoạt chất, ở bất kỳ đâu trong tên thuốc — cách viết đuôi hay lệch (-in/-ine).
function lo(m, s) {
  const goc = boDau(m.dc).split(/[^a-z]+/).find(w => w.length >= 5);
  return !!goc && s.khoa.includes(goc.slice(0, 6));
}
const spKhongLo = (m) => m.dc ? m.sp.filter(s => !lo(m, s)) : m.sp;

function taoCau(m, kieu, pool) {
  const cungNhom = pool.filter(y => y !== m && y.nhom === m.nhom);
  const khacNhom = pool.filter(y => y.nhom !== m.nhom);
  const lua = (dung, nhieu) => xaoMang([{ chu: dung, dung: true }, ...nhieu.map(chu => ({ chu }))]);
  const kin = spKhongLo(m);
  const bd = kin.length ? kin[Math.random() * kin.length | 0] : m.sp[Math.random() * m.sp.length | 0];
  if (kieu === 'hc') {
    if (!m.dc || !kin.length) return null;
    const nhieu = khacNhau([...xaoMang(cungNhom), ...xaoMang(khacNhom)].map(y => y.dc).filter(Boolean))
      .filter(t => boDau(t) !== boDau(m.dc)).slice(0, 3);
    if (nhieu.length < 3) return null;
    return { loai: 'Biệt dược → hoạt chất', hoi: bd.ten, de: 'Chứa hoạt chất gì?', m, lua: lua(m.dc, nhieu) };
  }
  if (kieu === 'ham') {
    if (!m.dc || !m.ham || !bd) return null;
    // Tên đã ghi sẵn con số hàm lượng thì câu hỏi thành đố chữ — bỏ
    if (laySo(m.ham).some(so => bd.ten.includes(so))) return null;
    const cungChat = pool.filter(y => y !== m && boDau(y.dc) === boDau(m.dc)).map(y => y.ham);
    const nhieu = khacNhau([...xaoMang(cungChat), ...xaoMang(cungNhom.map(y => y.ham))].filter(Boolean))
      .filter(t => boDau(t) !== boDau(m.ham)).slice(0, 3);
    if (nhieu.length < 2) return null;
    return { loai: 'Biệt dược → hàm lượng', hoi: bd.ten, de: `Hàm lượng ${m.dc} trong thuốc này là bao nhiêu?`, m, lua: lua(m.ham, nhieu) };
  }
  if (kieu === 'thay') {
    if (m.sp.length < 2) return null;
    const [a, dung] = xaoMang([...m.sp]);
    const cungChat = (y) => m.dc && boDau(y.dc) === boDau(m.dc);
    // Bẫy: cùng hoạt chất nhưng KHÁC hàm lượng — thay nhầm là sai liều. Cùng chất cùng hàm
    // lượng mà chỉ khác cách ghi dạng ("Viên nang" / "Viên nang cứng") thì có khi chính là
    // thuốc thay được, nên không bao giờ lấy làm phương án sai.
    const bay = pool.filter(y => y !== m && cungChat(y) && boDau(y.ham) !== boDau(m.ham)).flatMap(y => y.sp);
    const khac = (ds) => ds.filter(y => y !== m && !cungChat(y)).flatMap(y => y.sp);
    const cuaM = new Set(m.sp.flatMap(s => [s.khoa, s.ma].filter(Boolean)));
    const nhieu = khacNhau([...xaoMang(bay), ...xaoMang(khac(cungNhom)), ...xaoMang(khac(khacNhom)).slice(0, 20)], s => s.khoa)
      .filter(s => !cuaM.has(s.khoa) && !cuaM.has(s.ma)).slice(0, 3).map(s => s.ten);
    if (nhieu.length < 3) return null;
    return { loai: 'Thay thế tương đương', hoi: a.ten, de: 'Khách cần thuốc này nhưng hết hàng. Thuốc nào thay được (cùng hoạt chất, hàm lượng, dạng)?', m, lua: lua(dung.ten, nhieu) };
  }
  if (kieu === 'nhom') {
    if (!m.dc || KH.nhom[m.nhom] === 'Khác') return null;
    const dung = KH.nhom[m.nhom];
    // Hoạt chất có mặt ở nhiều nhóm (corticoid, kháng sinh nhỏ mắt…) thì loại các nhóm đó khỏi phương án sai
    const cungChat = new Set(KH.muc.filter(y => boDau(y.dc) === boDau(m.dc)).map(y => KH.nhom[y.nhom]));
    const nhieu = khacNhau(xaoMang(khacNhom.map(y => KH.nhom[y.nhom]))).filter(t => !cungChat.has(t) && t !== 'Khác').slice(0, 3);
    if (nhieu.length < 3) return null;
    return { loai: 'Hoạt chất → nhóm', hoi: m.dc, de: 'Thuộc nhóm nào?', m, lua: lua(dung, nhieu) };
  }
  if (kieu === 'loai') {
    const s = xaoMang(m.sp.filter(y => y.loai === 0 || y.loai === 1))[0];
    if (!s) return null;
    return { loai: 'Brandname hay Generic', hoi: s.ten, de: 'Đây là biệt dược gốc (Brandname) hay thuốc Generic?', m,
      lua: [{ chu: 'Brandname (biệt dược gốc)', dung: s.loai === 1 }, { chu: 'Generic', dung: s.loai === 0 }] };
  }
  if (kieu === 'rx') {
    if (m.rx !== 0 && m.rx !== 1) return null;
    return { loai: 'Kê đơn hay không', hoi: bd ? bd.ten : m.tieuDe, de: 'Thuốc này bán theo đơn hay không cần đơn?', m,
      lua: [{ chu: '℞ Kê đơn', dung: m.rx === 1 }, { chu: 'Không kê đơn', dung: m.rx === 0 }] };
  }
  return null;
}

// Câu 4 phương án là chính. Câu 2 phương án (Brandname? kê đơn?) đoán mò đúng 50%, nên
// giữ ở khoảng 1/5 đề — kể cả khi bộ có nhiều sản phẩm nhóm "Khác" (dầu gió, trà…) vốn chỉ
// hỏi được kiểu 2 phương án. Nhóm quá nhỏ không đủ câu 4 phương án thì mới bù bằng câu 2.
const KIEU_4 = ['thay', 'hc', 'ham', 'nhom'];
const KIEU_2 = ['loai', 'rx'];
const TI_LE_2 = 0.2;

function taoDe(dsMuc, pool, soCau) {
  const bon = [], hai = [];
  const daHoi = new Map();          // mục -> các kiểu đã hỏi, để một mục không bị hỏi lặp một kiểu
  const thu = (m, kieu) => {
    const da = daHoi.get(m) || new Set();
    for (const k of xaoMang(kieu.filter(k => !da.has(k)))) {
      const q = taoCau(m, k, pool);
      if (q) { da.add(k); daHoi.set(m, da); return q; }
    }
    return null;
  };
  // Nhóm nhỏ (vài mục) thì đi thêm vòng nữa, hỏi mỗi mục một kiểu khác
  for (let vong = 0; vong < 4 && bon.length + hai.length < soCau; vong++) {
    for (const m of xaoMang([...dsMuc])) {
      if (bon.length >= soCau && hai.length >= soCau) break;
      if (Math.random() < TI_LE_2 && hai.length < soCau) { const q = thu(m, KIEU_2); if (q) { hai.push(q); continue; } }
      const q4 = bon.length < soCau ? thu(m, KIEU_4) : null;
      if (q4) { bon.push(q4); continue; }
      const q2 = hai.length < soCau ? thu(m, KIEU_2) : null;
      if (q2) hai.push(q2);
    }
  }
  const so2 = Math.min(hai.length, Math.max(soCau - bon.length, Math.round(soCau * TI_LE_2)));
  return xaoMang([...bon.slice(0, soCau - so2), ...hai.slice(0, so2)]);
}

// k: khoá bộ · kieu: tat (cả bộ) | hoc (phần đã học) | n (x = số nhóm)
function trangTracNghiem(ctx, k, kieu, x) {
  const { di } = ctx;
  const b = KH.boTheoK.get(k);
  if (!b) return trangKhong(ctx);
  const dsMuc = kieu === 'n' ? b.muc.filter(m => m.nhom === +x) : kieu === 'hoc' ? b.muc.filter(daHoc) : b.muc;
  const quayVe = kieu === 'n' ? `#/kh/b/${k}/n/${x}` : '#/kh';
  ctx.veDau('Trắc nghiệm', ctx.nutQuayLai(quayVe));
  const boc = el('div', { class: 'trang trang-vao' });
  if (!dsMuc.length) {
    boc.append(trong('📝', 'Chưa có mục nào để hỏi', kieu === 'hoc' ? 'Học vài mục mới trước, rồi quay lại làm trắc nghiệm phần đã học.' : null),
      el('div', { class: 'the-nut' }, el('button', { class: 'nut nut-chinh', onclick: () => di(quayVe), text: 'Quay lại' })));
    return boc;
  }
  const soCau = CAU_HINH.KH_SO_CAU || 15;
  const khung = el('div', { class: 'on-khung' });
  let de = taoDe(dsMuc, b.muc, soCau), viTri = 0, dung = 0, chon = null, sai = [], dangGhi = false;

  const ve = () => {
    khung.innerHTML = '';
    if (!de.length) { khung.append(trong('📝', 'Không tạo được câu hỏi', 'Nhóm này quá ít mục để có phương án nhiễu. Thử làm cả bộ.')); return; }
    if (viTri >= de.length) {
      const diem = Math.round(100 * dung / de.length);
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: diem >= 80 ? '🏆' : '💪' }),
        el('h3', { text: `${diem}% — đúng ${dung}/${de.length} câu` }),
        el('p', { class: 'the-chu', text: sai.length ? 'Các mục trả lời sai đã được đưa về lịch ôn 10 phút. Xem lại bên dưới.' : 'Không sai câu nào.' })));
      if (sai.length) {
        khung.append(el('h2', { class: 'khu-de', text: 'Câu sai — xem lại', style: 'margin-top:10px' }));
        for (const m of [...new Set(sai)]) khung.append(theMuc(m, di, { tieuDeBam: true }));
      }
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', onclick: () => di(quayVe), text: 'Xong' }),
        el('button', { class: 'nut nut-chinh', onclick: () => { de = taoDe(dsMuc, b.muc, soCau); viTri = 0; dung = 0; chon = null; sai = []; ve(); }, text: 'Làm lượt khác' })));
      return;
    }
    const q = de[viTri];
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + de.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / de.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', text: 'đúng ' + dung })));
    khung.append(el('div', { class: 'the-lat dm-cau' },
      el('div', { class: 'the-nhan', text: q.loai }),
      el('h2', { class: 'the-hoi the-hoi-nho', text: q.hoi }),
      el('div', { class: 'dm-de', text: q.de })));
    const luaBoc = el('div', { class: 'dm-lua-boc' });
    q.lua.forEach((l, i) => {
      let lop = 'dm-lua';
      if (chon !== null) lop += l.dung ? ' dung' : i === chon ? ' sai' : ' mo';
      luaBoc.append(el('button', {
        class: lop, disabled: chon !== null ? '' : null,
        onclick: async () => {
          if (chon !== null || dangGhi) return;
          chon = i;
          if (l.dung) dung++; else sai.push(q.m);
          ve();
          dangGhi = true;
          try { await ghiNho(q.m, l.dung); } catch (_) { /* chỉ mất phần ghi lịch ôn */ } finally { dangGhi = false; }
        },
      }, el('span', { class: 'dm-lua-chu', text: 'ABCD'[i] }), el('span', { text: l.chu })));
    });
    khung.append(luaBoc);
    if (chon !== null) {
      khung.append(el('div', { style: 'margin-top:14px' }, theMuc(q.m, null)));
      khung.append(el('div', { class: 'on-nut' }, el('button', {
        class: 'nut nut-chinh', text: viTri + 1 < de.length ? 'Câu tiếp →' : 'Xem kết quả',
        onclick: () => { viTri++; chon = null; ve(); window.scrollTo(0, 0); },
      })));
    }
  };
  boc.append(el('p', { class: 'the-chu', text: `${b.ten}${kieu === 'n' ? ' · ' + KH.nhom[+x] : kieu === 'hoc' ? ' · phần đã học' : ''}. Phương án sai lấy từ cùng nhóm — đọc kỹ hàm lượng và dạng bào chế.` }), khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// MỘT MỤC
function trangMotMuc(ctx, i) {
  const { di } = ctx;
  const m = KH.muc[i];
  if (!m) return trangKhong(ctx);
  ctx.veDau('Khoá học', ctx.nutQuayLai());
  const boc = el('div', { class: 'trang trang-vao' }, theMuc(m, di));
  const cacBo = KH.theoKhoa.get(m.khoa) || [m];
  boc.append(el('div', { class: 'chip-boc', style: 'margin:4px 0 10px' }, ...cacBo.map(x => el('a', {
    class: 'chip chip-lk', href: `#/kh/b/${x.bo}/n/${x.nhom}`,
    onclick: (e) => { e.preventDefault(); di(`#/kh/b/${x.bo}/n/${x.nhom}`); },
  }, KH.boTheoK.get(x.bo).ten + ' · ' + KH.nhom[x.nhom], el('span', { class: 'chip-mui', text: '›' })))));
  const t = td(m);
  if (t?.lan) {
    boc.append(el('p', { class: 'ct-meta', text: `Đã gặp ${t.lan} lần · quên ${t.quen || 0} lần · ` +
      ((t.honLai || 0) <= Date.now() ? 'đang tới hạn ôn' : 'gặp lại ' + new Date(t.honLai).toLocaleDateString('vi-VN')) }));
  }
  // Các biệt dược có trong danh mục: giá, công dụng, kê đơn — bấm vào xem chi tiết
  const coDm = m.sp.filter(s => s.coDm);
  if (coDm.length) {
    const noi = el('div', {}, el('p', { class: 'the-chu', text: 'Đang nạp danh mục…' }));
    boc.append(el('h2', { class: 'khu-de', text: 'Trong danh mục Long Châu', style: 'margin-top:16px' }), noi);
    napDanhMuc().then(() => {
      noi.innerHTML = '';
      noi.append(el('div', { class: 'ds' }, ...coDm.map(s => thuocTheoSku(s.ma)).filter(Boolean).map(t => hangThuoc(t, di))));
    }).catch(e => { noi.innerHTML = ''; noi.append(el('p', { class: 'the-chu canh-bao', text: 'Chưa nạp được danh mục: ' + chuLoi(e) })); });
  }
  return boc;
}

// ---------------------------------------------------------------------------
// TÌNH HUỐNG CẮT LIỀU
// Chấm bằng từ khoá của giảng viên: một từ khoá tính là "có" khi phần lớn các chữ
// quan trọng của nó xuất hiện trong câu trả lời (gõ không dấu cũng được).
const TU_BO = new Set(['va', 'voi', 'cac', 'nhung', 'khi', 'can', 'de', 'cho', 'bang', 'the', 'co', 'khong', 'nhieu', 'hang']);
function khopTuKhoa(tuKhoa, traLoi) {
  const tl = ' ' + boDau(traLoi).replace(/[^a-z0-9%]+/g, ' ') + ' ';
  return tuKhoa.map(k => {
    const tu = boDau(k).split(/[^a-z0-9%]+/).filter(w => w.length > 1 && !TU_BO.has(w));
    if (!tu.length) return { k, co: false };
    const co = tu.filter(w => tl.includes(' ' + w) || tl.includes(w + ' ')).length;
    return { k, co: co / tu.length >= 0.6 };
  });
}

function trangDsTinhHuong(ctx) {
  const { di } = ctx;
  ctx.veDau('Tình huống', ctx.nutQuayLai('#/kh'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('p', { class: 'the-chu', text: 'Đọc đề như khách đang đứng ở quầy. Gõ câu trả lời (chẩn đoán + thuốc bạn cắt + lời khuyên), rồi bấm Chấm: app so với từ khoá của giảng viên và hiện đáp án mẫu.' }));
  const ds = el('div', { class: 'ds' });
  KH.tinhHuong.forEach((t, i) => {
    const kq = ketQuaTh(i);
    ds.append(hangMuc(kq?.lan ? (kq.diem >= 80 ? '✅' : '📝') : '💬', `Tình huống ${i + 1} · ${t.loai}`,
      t.de.slice(0, 90) + (t.de.length > 90 ? '…' : '') + (kq?.lan ? ` · cao nhất ${kq.diem}%` : ''), '#/kh/th/' + i, di));
  });
  boc.append(ds);
  if (KH.chuDe.length) {
    boc.append(el('h2', { class: 'khu-de', text: 'Chủ đề cắt liều trong khoá', style: 'margin-top:18px' }));
    boc.append(el('div', { class: 'ds' }, ...KH.chuDe.map(c => el('div', { class: 'ds-hang' },
      el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: '🩺' }),
      el('span', { class: 'ds-chu' }, el('span', { class: 'ds-ten', text: c.benh }), el('span', { class: 'ds-phu', text: [c.dt, c.ghiChu].filter(Boolean).join(' · ') }))))));
  }
  if (KH.cachLam) {
    boc.append(el('section', { class: 'ct-khoi', style: 'margin-top:12px' }, el('h2', { class: 'ct-de', text: 'Cách làm một tình huống' }),
      el('div', { class: 'ct-chu kh-nhieu-dong', text: KH.cachLam })));
  }
  return boc;
}

function trangTinhHuong(ctx, i) {
  const { di } = ctx;
  const t = KH.tinhHuong[i];
  if (!t) return trangKhong(ctx);
  ctx.veDau(`Tình huống ${i + 1}/${KH.tinhHuong.length}`, ctx.nutQuayLai('#/kh/th'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('div', { class: 'the-lat dm-cau' },
    el('div', { class: 'the-nhan', text: [t.loai, t.level].filter(Boolean).join(' · ') }),
    el('p', { class: 'dm-hoi-dai', text: t.de }),
    ...t.cau.map(c => el('div', { class: 'dm-de', text: c }))));
  const o = el('textarea', { class: 'o-nhap kh-tra-loi', rows: '6', placeholder: 'Câu trả lời của bạn: chẩn đoán, thuốc cắt, lời khuyên…' });
  const ketQua = el('div', {});
  const cham = async () => {
    ketQua.innerHTML = '';
    const tl = o.value.trim();
    if (tl) {
      const kq = khopTuKhoa(t.tuKhoa, tl);
      const co = kq.filter(x => x.co).length;
      const diem = Math.round(100 * co / Math.max(1, kq.length));
      ketQua.append(el('section', { class: 'ct-khoi', style: 'margin-top:12px' },
        el('h2', { class: 'ct-de', text: `Từ khoá: ${co}/${kq.length} (${diem}%)` }),
        el('div', { class: 'chip-boc' }, ...kq.map(x => el('span', { class: 'chip kh-tk' + (x.co ? ' co' : ''), text: (x.co ? '✓ ' : '✗ ') + x.k }))),
        el('p', { class: 'the-chu', style: 'margin-top:8px', text: 'Chấm tự động theo từ khoá của giảng viên — đọc đáp án bên dưới để tự đánh giá phần còn lại.' })));
      try {
        await suaTienDoMuc('khth:' + i, cu => ({ mucDo: 0, honLai: 0, ...(cu || {}), lan: (cu?.lan || 0) + 1, lanCuoi: Date.now(), diem: Math.max(diem, cu?.diem || 0) }));
      } catch (_) { /* chỉ mất phần ghi điểm */ }
    }
    ketQua.append(el('section', { class: 'ct-khoi', style: 'margin-top:12px' },
      el('h2', { class: 'ct-de', text: 'Đáp án mẫu' }),
      el('div', { class: 'kh-dap', text: t.benh }),
      el('ul', { class: 'lt-ul' }, ...t.loiKhuyen.map(d => el('li', { text: d }))),
      tl ? null : el('div', { class: 'chip-boc', style: 'margin-top:8px' }, ...t.tuKhoa.map(k => el('span', { class: 'chip', text: k })))));
  };
  boc.append(o, el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: cham, text: '✓ Chấm & xem đáp án' })), ketQua);
  boc.append(el('div', { class: 'on-nut', style: 'margin-top:18px' },
    i > 0 ? el('button', { class: 'nut', onclick: () => di('#/kh/th/' + (i - 1)), text: '← Trước' }) : null,
    i + 1 < KH.tinhHuong.length ? el('button', { class: 'nut', onclick: () => di('#/kh/th/' + (i + 1)), text: 'Tiếp →' }) : null));
  return boc;
}

// ---------------------------------------------------------------------------
// LỊCH KHOÁ HỌC + TỔNG QUAN
function trangLich(ctx) {
  const { di } = ctx;
  ctx.veDau('Lịch khoá học', ctx.nutQuayLai('#/kh'));
  const boc = el('div', { class: 'trang trang-vao' });
  const khoi = (de, ...noi) => el('section', { class: 'ct-khoi', style: 'margin-top:12px' }, el('h2', { class: 'ct-de', text: de }), ...noi);
  const bang = (ds) => el('div', { class: 'dm-bang' }, ...ds.map(([k, v]) => el('div', { class: 'dm-dong' }, el('span', { class: 'dm-nhan', text: k }), el('span', { text: v }))));

  boc.append(khoi('Khoá học gồm', bang(KH.tongQuan)));
  boc.append(khoi('Dữ liệu theo cấp', bang(KH.cap)));

  // Bài giảng nối sang nhóm cùng tên trong Bộ HV (nếu có) để mở ra học luôn
  const hv = KH.boTheoK.get('hv');
  const nhomHv = [...nhomCuaBo(hv).keys()];
  const timNhom = (ten) => {
    const k = boDau(ten).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    return nhomHv.find(n => { const b = boDau(KH.nhom[n]); return k.length && k.every(w => b.includes(w)); });
  };
  for (const d of KH.lich) {
    const ds = el('div', { class: 'ds' });
    for (const [ten, tg] of d.bai) {
      const n = timNhom(ten);
      ds.append(n !== undefined
        ? hangMuc('📘', ten, [tg, 'mở nhóm ' + KH.nhom[n]].filter(Boolean).join(' · '), `#/kh/b/hv/n/${n}`, di)
        : el('div', { class: 'ds-hang' }, el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: '📄' }),
          el('span', { class: 'ds-chu' }, el('span', { class: 'ds-ten', text: ten }), tg ? el('span', { class: 'ds-phu', text: tg }) : null)));
    }
    boc.append(el('h2', { class: 'khu-de', text: d.ten, style: 'margin-top:18px' }), ds);
  }
  if (KH.qtbh.length) {
    boc.append(khoi('Tình huống QTBH — tự chuẩn bị câu trả lời',
      el('ul', { class: 'lt-ul' }, ...KH.qtbh.map(q => el('li', { text: q })))));
  }
  boc.append(el('p', { class: 'ct-meta', text: `Nguồn: ${KH.nguon}. Tài liệu học nội bộ khoá học — đối chiếu tờ hướng dẫn sử dụng khi tư vấn thật.` }));
  return boc;
}

function trangKhong(ctx) {
  ctx.veDau('Không tìm thấy', ctx.nutQuayLai('#/kh'));
  return el('div', { class: 'trang' }, trong('🔎', 'Không có mục này trong khoá học', null));
}
