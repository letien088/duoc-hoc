// Học thuốc — tab 💊: học thuộc mọi thuốc phải nhớ để mở toa ra là biết ngay
//   - đó là thuốc gì (hoạt chất, hàm lượng, nhóm), dùng để làm gì,
//   - hộp thuốc trông thế nào (ảnh thật của Nhà thuốc Long Châu).
//
// Thuốc phải học = thuốc trong 100 toa thật (data/toa.json, sinh bằng tools/xuat_toa.py)
//                + bộ học viên = Bộ HV + Bộ 700 (data_hoc_vien.xlsx -> data/khoahoc.json).
// Dữ liệu từng thuốc lấy từ web Long Châu bằng tools/lay_thuoc.py:
//   data/thuoc.json    chỉ mục gọn (nạp một lần)
//   data/ct/<mã>.json  chi tiết (chỉ định, liều, chống chỉ định…) — nạp khi mở thẻ thuốc
//   img/sp/<mã>_<n>.webp  ảnh hộp đã nén (~6-15 KB)
//
// Tiến độ ghi vào bản ghi tiến độ ôn tập (khoá 'ht:<mã>'), nên đi theo sao lưu và
// đồng bộ Drive như mọi phần khác. Thuốc của toa nào dùng chung tiến độ với chính nó
// ở bộ học viên: học Concor Cor trong toa thì sang Bộ HV đã tính là đã học.
import { CAU_HINH } from './config.js';
import { el, boDau, datMau, chuLoi, bao } from './util.js';
import { LICH_ON, tienDoMuc, suaTienDoMuc, xaoMang } from './ontap.js';
import { napKhoaHoc, daNapKH, spCuaBo, nhomKhTheoSku, khoiTrongKhoaHoc } from './khoahoc.js';

const MAU = '#be185d';
const TEP_THUOC = 'data/thuoc.json';
const TEP_TOA = 'data/toa.json';
const KHOA_NGUON = 'duoc_hoc_ht_nguon';      // đang học nguồn nào — tiện ích riêng từng máy
const KHOA_DA_TAI = 'duoc_hoc_ht_da_tai';    // lần cuối tải sẵn để học không cần mạng
const { NHAC_LAI, TEN_HAN, MUC_THUOC } = LICH_ON;

// Các nguồn thuốc phải học, theo thứ tự học
const NGUON = [
  { k: 'toa', ten: '100 toa', mo: 'Thuốc trong 100 toa thật' },
  { k: 'hv', ten: 'Bộ HV', mo: 'Bộ data học viên (Excel)' },
  { k: '700', ten: 'Bộ 700', mo: 'Bộ 700 trong file học viên' },
  { k: 'tat', ten: 'Tất cả', mo: 'Toa + Bộ HV + Bộ 700' },
];

let HT = null;
let _dangNap = null;
let _loiNap = null;

export function daNapHT() { return !!HT; }
export function thuocHT(sku) { return HT ? HT.theoSku.get(sku) || null : null; }

// ---------------------------------------------------------------------------
// NẠP
export function napHocThuoc() {
  if (HT) return Promise.resolve(HT);
  if (_dangNap) return _dangNap;
  _loiNap = null;
  const lay = (tep) => fetch(tep).then(r => {
    if (!r.ok) throw new Error('Không tải được ' + tep + ' (HTTP ' + r.status + ').');
    return r.json();
  });
  // Khoá học cần để biết thuốc nào thuộc Bộ HV / 700; hỏng thì vẫn học được phần toa
  _dangNap = Promise.all([lay(TEP_THUOC), lay(TEP_TOA), napKhoaHoc().catch(() => null)])
    .then(([t, toa]) => { HT = dung(t, toa); _dangNap = null; return HT; })
    .catch(e => { _dangNap = null; _loiNap = e; throw e; });
  return _dangNap;
}

// "ASPIRIN 81 MEKOPHAR 10X10" -> "Aspirin 81 Mekophar 10x10"
function tenDep(s) {
  if (!s || s !== s.toUpperCase()) return s || '';
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

function dung(g, toa) {
  const theoSku = new Map();
  for (const t of g.t) {
    t.ten = tenDep(t.t);
    t.khoa = boDau([t.t, t.w, t.h, t.b].join(' '));
    t.vaiTro = t.c || t.n || '';
    theoSku.set(t.s, t);
  }
  const mat = new Map((g.mat || []).map(x => [x.s, x.ly]));

  // Toa: mỗi dòng biết thuốc đại diện để hiện ảnh (đúng biệt dược > cùng tên khác hàm lượng > thay thế)
  const dongTheoSku = new Map();          // mã -> các dòng toa nhắc tới
  for (const t of toa.toa) {
    t.thuoc.forEach((d, i) => {
      d.toa = t; d.i = i;
      d.dai = d.sku || d.gan || d.thay[0] || null;
      for (const s of [d.sku, d.gan, ...d.thay].filter(Boolean)) {
        if (!dongTheoSku.has(s)) dongTheoSku.set(s, []);
        dongTheoSku.get(s).push(d);
      }
    });
  }
  // Thuốc của toa phải học: biệt dược toa ghi + bản cùng tên + 1 thuốc thay thế đại diện cho dòng
  // chỉ ghi hoạt chất / Long Châu không bán. Các thuốc thay thế khác vẫn xem được, nhưng không bắt học.
  const toaSku = [];
  const da = new Set();
  for (const t of toa.toa) {
    for (const d of t.thuoc) {
      for (const s of [d.sku, d.gan, d.sku || d.gan ? null : d.thay[0]]) {
        if (s && theoSku.has(s) && !da.has(s)) { da.add(s); toaSku.push(s); }
      }
    }
  }
  return { ...g, theoSku, mat, toa: toa.toa, toaTheoId: new Map(toa.toa.map(t => [t.id, t])), dongTheoSku, toaSku, tenToa: toa.sp };
}

// Mã SP theo nguồn, đúng thứ tự học, chỉ những mã có dữ liệu
function skuCuaNguon(k) {
  if (k === 'toa') return HT.toaSku;
  if (k === 'hv' || k === '700') return daNapKH() ? spCuaBo(k).filter(s => HT.theoSku.has(s)) : [];
  const da = new Set();
  return [...HT.toaSku, ...skuCuaNguon('hv'), ...skuCuaNguon('700')].filter(s => !da.has(s) && da.add(s));
}
const thuocCuaNguon = (k) => skuCuaNguon(k).map(s => HT.theoSku.get(s));

function nguonDangHoc() {
  let k = null;
  try { k = localStorage.getItem(KHOA_NGUON); } catch (_) { /* chế độ riêng tư */ }
  return NGUON.find(n => n.k === k) || NGUON[0];
}
function chonNguon(k) { try { localStorage.setItem(KHOA_NGUON, k); } catch (_) { /* bỏ qua */ } }

// ---------------------------------------------------------------------------
// TIẾN ĐỘ — khoá 'ht:<mã>', cùng luật nhắc lại với Ôn tập / Khoá học
const td = (t) => tienDoMuc('ht:' + t.s);
const daHoc = (t) => (td(t)?.lan || 0) > 0;
const daThuoc = (t) => daHoc(t) && (td(t).mucDo || 0) >= MUC_THUOC;
const denHan = (t) => daHoc(t) && (td(t).honLai || 0) <= Date.now();
const hayQuen = (t) => (td(t)?.quen || 0) >= 2 && (td(t)?.mucDo || 0) < MUC_THUOC;

async function ghiNho(t, nho) {
  return suaTienDoMuc('ht:' + t.s, cu => {
    const mucDo = nho ? Math.min(NHAC_LAI.length - 1, (cu?.mucDo || 0) + 1) : 0;
    return {
      ...(cu || {}), mucDo, lan: (cu?.lan || 0) + 1, quen: (cu?.quen || 0) + (nho ? 0 : 1),
      lanCuoi: Date.now(), honLai: Date.now() + NHAC_LAI[mucDo],
    };
  });
}

const soMoiLuot = () => CAU_HINH.HT_MOI_MOI_LUOT || 10;
const mucMoi = (k) => thuocCuaNguon(k).filter(t => !daHoc(t)).slice(0, soMoiLuot());
const dsDenHan = (k) => thuocCuaNguon(k).filter(denHan);
const dsHayQuen = (k) => thuocCuaNguon(k).filter(hayQuen).sort((a, b) => (td(b).quen || 0) - (td(a).quen || 0));

// Toa đã đọc thạo: mọi thuốc đại diện của toa đều đã thuộc
function tienDoToa(t) {
  const ds = [...new Set(t.thuoc.map(d => d.dai).filter(s => s && HT.theoSku.has(s)))].map(s => HT.theoSku.get(s));
  return { tong: ds.length, thuoc: ds.filter(daThuoc).length, hoc: ds.filter(daHoc).length };
}

// ---------------------------------------------------------------------------
// HIỂN THỊ DÙNG CHUNG
const soVN = (n) => Number(n).toLocaleString('vi-VN');
const pt = (n, tong) => tong ? Math.round(100 * n / tong) + '%' : '—';
const duongAnh = (s, n = 1) => `img/sp/${s}_${n}.webp`;

function thanh(n, tong, lop = '') {
  return el('div', { class: 'lt-thanh ' + lop }, el('i', { style: `width:${(100 * n / Math.max(1, tong)).toFixed(1)}%` }));
}

function trong(icon, tieuDe, chu) {
  return el('div', { class: 'trong' }, el('div', { class: 'trong-icon', text: icon }), el('h3', { text: tieuDe }), chu ? el('p', { text: chu }) : null);
}

function vach(t) {
  const x = td(t);
  if (!x?.lan) return null;
  const d = x.mucDo || 0;
  return el('span', { class: 'lt-vach', title: 'Mức thuộc', text: '●'.repeat(d) + '○'.repeat(NHAC_LAI.length - 1 - d) });
}

function nhanRx(rx) {
  if (rx === 1) return el('span', { class: 'dm-rx', text: 'Kê đơn' });
  if (rx === 0) return el('span', { class: 'dm-otc', text: 'Không kê đơn' });
  return null;
}

// Ảnh nhỏ cho danh sách. Không có ảnh thì hiện biểu tượng — không để ô trống.
export function anhNho(sku, lop = 'ht-nho') {
  const t = HT && HT.theoSku.get(sku);
  if (HT && !(t && t.a)) return el('span', { class: lop + ' ht-nho-trong', text: '💊' });
  const im = el('img', { class: lop, src: duongAnh(sku), alt: '', loading: 'lazy', decoding: 'async' });
  im.addEventListener('error', () => im.replaceWith(el('span', { class: lop + ' ht-nho-trong', text: '💊' })), { once: true });
  return im;
}

function phongTo(src) {
  const dong = () => { window.removeEventListener('hashchange', dong); lop.remove(); };
  const lop = el('div', { class: 'anh-lop', onclick: dong }, el('img', { src, alt: 'ảnh hộp thuốc phóng to' }));
  window.addEventListener('hashchange', dong);
  document.body.append(lop);
}

// Dải ảnh vuốt ngang: ảnh 1 mặt trước hộp, ảnh 2-3 mặt sau / vỉ / lọ. Chạm để phóng to.
// phongTo = false: dùng ở mặt trước thẻ lật — chạm vào ảnh là lật thẻ, không phóng to
export function dayAnh(sku, { nho = false, phongTo: choPhong = true } = {}) {
  const t = HT && HT.theoSku.get(sku);
  const so = t ? t.a : 0;
  if (!so) return el('div', { class: 'ht-anh-trong', text: '📦 Chưa có ảnh hộp thuốc này' });
  const day = el('div', { class: 'ht-day' + (nho ? ' nho' : '') });
  const cham = el('div', { class: 'ht-cham' });
  const boc = el('div', { class: 'ht-anh-boc' }, day, cham);
  // Số chấm luôn bằng số ảnh còn hiện; ảnh nào tải hỏng (mất mạng, chưa tải sẵn) thì bỏ cả ảnh lẫn chấm,
  // hỏng hết thì nói rõ thay vì để một dải trống
  const veCham = () => {
    const con = day.children.length;
    if (!con) {
      boc.replaceWith(el('div', { class: 'ht-anh-trong', text: '📡 Chưa tải được ảnh hộp — cần mạng (hoặc bấm "Tải sẵn tất cả" ở trang Học thuốc để học không cần mạng)' }));
      return;
    }
    const i = Math.round(day.scrollLeft / Math.max(1, day.clientWidth));
    cham.replaceChildren(...(con > 1 ? Array.from({ length: con }, (_, j) => el('i', { class: j === i ? 'dang' : '' })) : []));
  };
  for (let n = 1; n <= so; n++) {
    const src = duongAnh(sku, n);
    const im = el('img', { class: 'ht-anh', src, alt: `ảnh ${n} — ${t.ten}`, loading: n === 1 ? 'eager' : 'lazy', decoding: 'async' });
    if (choPhong) im.addEventListener('click', (e) => { e.stopPropagation(); phongTo(src); });
    else im.style.cursor = 'pointer';
    im.addEventListener('error', () => { im.closest('.ht-o')?.remove(); veCham(); }, { once: true });
    day.append(el('div', { class: 'ht-o' }, im));
  }
  veCham();
  day.addEventListener('scroll', () => {
    const i = Math.round(day.scrollLeft / Math.max(1, day.clientWidth));
    [...cham.children].forEach((c, j) => c.classList.toggle('dang', j === i));
  }, { passive: true });
  return boc;
}

function hangThuoc(t, di, phu) {
  const dich = '#/ht/t/' + t.s;
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    anhNho(t.s),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: t.ten }),
      el('span', { class: 'ds-phu' }, nhanRx(t.rx), phu || [t.h, t.d].filter(Boolean).join(' · ') || '—')),
    vach(t),
    el('span', { class: 'ds-mui', text: '›' }));
}

function hangMuc(icon, ten, phu, dich, di, phai) {
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: icon }),
    el('span', { class: 'ds-chu' }, el('span', { class: 'ds-ten', text: ten }), phu ? el('span', { class: 'ds-phu', text: phu }) : null),
    phai || null,
    el('span', { class: 'ds-mui', text: '›' }));
}

function chonNguonHang(nguon, khiDoi) {
  return el('div', { class: 'loc-hang' }, ...NGUON.map(n => el('button', {
    class: 'loc-nut' + (n === nguon ? ' dang' : ''),
    onclick: () => { chonNguon(n.k); khiDoi(); },
    text: n.ten + ' · ' + soVN(skuCuaNguon(n.k).length),
  })));
}

// Tóm tắt một thuốc: tên, hoạt chất, dạng, nhóm, công dụng — dùng cho thẻ học và đáp án thẻ lật
function tomTat(t, di, { anTen = false } = {}) {
  const dong = (nhan, ...con) => el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: nhan }), ...con);
  const nhomKH = nhomKhTheoSku(t.s);
  return [
    anTen ? null : el('div', { class: 'lt-dau' },
      di ? el('a', { class: 'lt-ten ht-lk', href: '#/ht/t/' + t.s, onclick: (e) => { e.preventDefault(); di('#/ht/t/' + t.s); }, text: t.ten })
        : el('b', { class: 'lt-ten', text: t.ten }),
      nhanRx(t.rx), vach(t)),
    t.h ? dong('Hoạt chất: ', el('b', { text: t.h })) : null,
    t.d || t.q ? dong('Dạng: ', [t.d, t.q].filter(Boolean).join(' · ')) : null,
    dong('Nhóm: ', [nhomKH, t.vaiTro].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ') || '—'),
    t.cd ? dong('Công dụng: ', t.cd) : null,
    t.b || t.x ? dong('Hãng: ', [t.b, t.x].filter(Boolean).join(' · ')) : null,
  ].filter(Boolean);
}

function theHoc(t, di) {
  return el('div', { class: 'lt-the ht-the ' + (t.rx === 1 ? 'rx' : t.rx === 0 ? 'otc' : '') },
    dayAnh(t.s), ...tomTat(t, di));
}

// ---------------------------------------------------------------------------
// TRA CỨU (tab 🔍)
export function timHT(q) {
  if (!HT) return [];
  const tu = boDau(q).split(/\s+/).filter(Boolean);
  if (!tu.length) return [];
  const ra = [];
  for (const t of HT.t) {
    if (/^\d{4,}$/.test(q.trim()) ? !t.s.includes(q.trim()) : !tu.every(w => t.khoa.includes(w))) continue;
    ra.push({ t, hang: t.khoa.startsWith(tu[0]) ? 0 : 1 });
  }
  return ra.sort((a, b) => a.hang - b.hang).map(x => x.t);
}
export function hangHT(t, di) { return hangThuoc(t, di); }

// Thẻ tóm tắt cho Trang chủ
export function theTrangChu(di) {
  const the = el('a', { class: 'on-the lt-tc', href: '#/ht', onclick: (e) => { e.preventDefault(); di('#/ht'); } });
  const ve = () => {
    the.innerHTML = '';
    if (!HT) {
      the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '💊 Học thuốc' })),
        el('h3', { class: 'on-ten', text: '100 toa thật + Bộ HV + Bộ 700' }),
        el('div', { class: 'on-phu', text: 'Nhìn hộp nhớ tên, đọc toa biết thuốc gì, dùng để làm gì.' }),
        el('div', { class: 'on-goi', text: 'Vào học →' }));
      return;
    }
    const tat = thuocCuaNguon('tat');
    const thuoc = tat.filter(daThuoc).length, han = tat.filter(denHan).length;
    const n = nguonDangHoc();
    const moi = mucMoi(n.k);
    the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: han ? `💊 ${han} thuốc tới hạn ôn` : '💊 Học thuốc' })),
      el('h3', { class: 'on-ten', text: moi.length ? `${n.ten}: học tiếp ${moi.length} thuốc` : `${n.ten}: đã học hết` }),
      el('div', { class: 'on-phu', text: `Đã thuộc ${soVN(thuoc)}/${soVN(tat.length)} thuốc (${pt(thuoc, tat.length)}).` }),
      thanh(thuoc, tat.length),
      el('div', { class: 'on-goi', text: 'Vào học →' }));
  };
  ve();
  if (!HT) napHocThuoc().then(() => { if (the.isConnected) ve(); }).catch(() => { /* giữ thẻ mặc định */ });
  return the;
}

// ---------------------------------------------------------------------------
// ĐỊNH TUYẾN '#/ht/...'   ctx: { veDau, nutQuayLai, di, veLai }
export function trangHocThuoc(p, ctx) {
  datMau(MAU);
  if (!HT) {
    ctx.veDau('Học thuốc', p.length ? ctx.nutQuayLai('#/ht') : null);
    const boc = el('div', { class: 'trang trang-vao' });
    if (_loiNap) {
      boc.append(trong('📡', 'Chưa nạp được dữ liệu học thuốc', chuLoi(_loiNap)),
        el('div', { class: 'the-nut' }, el('button', { class: 'nut nut-chinh', text: 'Thử lại', onclick: () => { _loiNap = null; ctx.veLai(); } })));
      return boc;
    }
    boc.append(trong('💊', 'Đang nạp danh sách thuốc…', 'Lần đầu mất vài giây, sau đó dùng được cả khi không có mạng.'));
    const hash = location.hash;
    napHocThuoc().then(() => { if (location.hash === hash) ctx.veLai(); }, () => { if (location.hash === hash) ctx.veLai(); });
    return boc;
  }
  const [a, b, c] = p;
  if (!a) return trangChinh(ctx);
  if (a === 't') return trangThuoc(ctx, b);
  if (a === 'toa') return b ? trangMotToa(ctx, b) : trangDsToa(ctx);
  if (a === 'doc') return trangDocToa(ctx, b);
  if (a === 'hoc') return trangHocMoi(ctx, b);
  if (a === 'the') return trangThe(ctx, b, c);
  if (a === 'tn') return trangTracNghiem(ctx, b);
  if (a === 'ds') return trangDanhSach(ctx, b);
  return trangKhong(ctx);
}

// ---------------------------------------------------------------------------
// TRANG CHÍNH
function trangChinh(ctx) {
  const { di } = ctx;
  ctx.veDau('Học thuốc', null, el('button', { class: 'dau-nut', onclick: () => di('#/ht/toa'), text: '📋 Toa' }));
  const boc = el('div', { class: 'trang trang-vao' });
  const n = nguonDangHoc();
  const ds = thuocCuaNguon(n.k);

  boc.append(chonNguonHang(n, ctx.veLai));
  if ((n.k === 'hv' || n.k === '700') && !daNapKH()) {
    boc.append(el('p', { class: 'the-chu canh-bao', text: 'Chưa nạp được dữ liệu khoá học nên chưa biết thuốc nào thuộc bộ này. Mở tab 🎓 Khoá học một lần khi có mạng.' }));
  }

  const hoc = ds.filter(daHoc).length, thuoc = ds.filter(daThuoc).length;
  const coAnh = ds.filter(t => t.a).length;
  boc.append(el('section', { class: 'lt-tong' },
    el('div', { class: 'lt-tong-so' }, pt(thuoc, ds.length)),
    el('div', { class: 'lt-tong-chu', text: `${n.ten}: đã thuộc ${soVN(thuoc)}/${soVN(ds.length)} thuốc` }),
    thanh(thuoc, ds.length),
    el('div', { class: 'lt-tong-phu', text: `${n.mo}. Đã học qua ${soVN(hoc)} · có ảnh hộp ${soVN(coAnh)}/${soVN(ds.length)}.` })));

  // Việc hôm nay
  const moi = mucMoi(n.k), han = dsDenHan('tat'), quen = dsHayQuen('tat');
  boc.append(el('h2', { class: 'khu-de', text: 'Hôm nay' }));
  boc.append(el('a', {
    class: 'on-the', href: '#/ht/hoc/' + n.k, onclick: (e) => { e.preventDefault(); if (moi.length) di('#/ht/hoc/' + n.k); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '① Học thuốc mới' })),
    el('h3', { class: 'on-ten', text: moi.length ? `${moi.length} thuốc: ${moi.slice(0, 3).map(t => t.ten.split(' ')[0]).join(', ')}…` : `Đã học hết ${n.ten} 🎉` }),
    el('div', { class: 'on-phu', text: moi.length ? 'Xem ảnh hộp, đọc hoạt chất và công dụng, rồi tự kiểm tra bằng thẻ lật.' : 'Chọn nguồn khác ở hàng nút trên, hoặc ôn và làm trắc nghiệm.' }),
    moi.length ? el('div', { class: 'on-goi', text: 'Học ngay →' }) : null));
  boc.append(el('a', {
    class: 'on-the', href: '#/ht/the/han/tat', onclick: (e) => { e.preventDefault(); di('#/ht/the/han/tat'); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '② Ôn thẻ tới hạn' })),
    el('h3', { class: 'on-ten', text: han.length ? `${han.length} thuốc tới hạn (mọi nguồn)` : 'Không có thuốc nào tới hạn' }),
    el('div', { class: 'on-phu', text: 'Nhớ thì giãn 1 → 3 → 7 → 14 → 30 ngày, quên thì gặp lại sau 10 phút.' }),
    han.length ? el('div', { class: 'on-goi', text: 'Ôn ngay →' }) : null));
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/ht/tn/' + n.k), text: '📝 Trắc nghiệm' }),
    el('button', { class: 'nut', onclick: () => di('#/ht/the/anh/' + n.k), text: '🖼️ Nhìn hộp đoán thuốc' }),
    quen.length ? el('button', { class: 'nut', onclick: () => di('#/ht/the/quen/tat'), text: `😵 ${quen.length} thuốc hay quên` }) : null));

  // Toa + danh sách
  boc.append(el('h2', { class: 'khu-de', text: 'Đọc toa thật', style: 'margin-top:18px' }));
  const toaThuoc = HT.toa.filter(t => { const x = tienDoToa(t); return x.tong && x.thuoc === x.tong; }).length;
  boc.append(el('div', { class: 'ds' },
    hangMuc('📋', `100 toa thuốc · đọc thạo ${toaThuoc}/${HT.toa.length}`, 'Mở từng toa: thuốc gì, để làm gì, hộp ra sao; Long Châu không bán thì thay bằng gì', '#/ht/toa', di),
    hangMuc('📚', `Danh sách ${n.ten} (${soVN(ds.length)} thuốc)`, 'Tra nhanh, xem ảnh hộp, lọc theo nhóm', '#/ht/ds/' + n.k, di)));

  boc.append(theTaiSan());
  boc.append(el('p', { class: 'ct-meta', text: `Ảnh và thông tin thuốc: ${HT.nguon}, lấy ngày ${HT.ngay}. Tham khảo khi học — không thay tờ hướng dẫn sử dụng và chỉ định của bác sĩ.` }));
  return boc;
}

// Tải sẵn ảnh + chi tiết để học khi không có mạng. Service worker giữ lại mọi thứ đã tải.
function theTaiSan() {
  const the = el('section', { class: 'the', style: 'margin-top:16px' },
    el('h2', { class: 'the-de', text: '📥 Học không cần mạng' }));
  // Tải MỌI thuốc có dữ liệu, kể cả thuốc thay thế hiện trong trang toa (không thuộc bộ phải học):
  // chỉ tải bộ phải học thì mất mạng bấm vào thuốc thay thế sẽ trống ảnh và chi tiết
  const tat = HT.t;
  const soTep = tat.reduce((s, t) => s + 1 + (t.a || 0), 0);
  const da = trangThaiTaiSan();
  const chu = el('p', { class: 'the-chu' + (da && !da.du ? ' canh-bao' : ''), text: !da
    ? `Ảnh hộp và chi tiết chỉ tải khi bạn mở tới. Tải sẵn một lần (${soVN(soTep)} tệp, khoảng ${Math.round(soTep * 9 / 1024)} MB) để học được cả lúc không có mạng.`
    : da.du ? `Đã tải sẵn lúc ${da.luc}. Ảnh và chi tiết thuốc mở được cả khi mất mạng.`
    : `Dữ liệu thuốc đã được cập nhật sau lần tải sẵn lúc ${da.luc}. Bấm để tải phần mới — phần đã có không tải lại.` });
  const nut = el('button', { class: 'nut' + (da && !da.du ? ' nut-chinh' : ''), text: da ? '⟳ Tải phần còn thiếu' : '⬇ Tải sẵn tất cả' });
  nut.addEventListener('click', async () => {
    nut.disabled = true;
    const urls = [];
    for (const t of tat) {
      urls.push('data/ct/' + t.s + '.json');
      for (let n = 1; n <= (t.a || 0); n++) urls.push(duongAnh(t.s, n));
    }
    let xong = 0, loi = 0;
    const song = Math.max(1, CAU_HINH.HT_TAI_SONG_SONG || 4);
    let i = 0;
    const chay = async () => {
      while (i < urls.length) {
        const u = urls[i++];
        try { const r = await fetch(u); if (!r.ok) loi++; else await r.arrayBuffer(); } catch (_) { loi++; }
        xong++;
        if (xong % 25 === 0 || xong === urls.length) chu.textContent = `Đang tải ${soVN(xong)}/${soVN(urls.length)}…`;
      }
    };
    await Promise.all(Array.from({ length: song }, chay));
    const luc = new Date().toLocaleString('vi-VN');
    if (!loi) { try { localStorage.setItem(KHOA_DA_TAI, JSON.stringify({ luc, ngay: HT.ngay, so: urls.length })); } catch (_) { /* bỏ qua */ } }
    chu.textContent = loi
      ? `Tải được ${soVN(xong - loi)}/${soVN(urls.length)} tệp, ${soVN(loi)} tệp lỗi (mạng chập chờn). Bấm lại để tải nốt.`
      : `Xong ${soVN(urls.length)} tệp lúc ${luc}. Giờ học được cả khi không có mạng.`;
    nut.disabled = false;
    nut.textContent = '⟳ Tải phần còn thiếu';
    chu.classList.toggle('canh-bao', !!loi);
    bao(loi ? 'Còn tệp chưa tải được.' : 'Đã tải sẵn để học không cần mạng.', loi ? 'loi' : 'ok');
  });
  the.append(chu, el('div', { class: 'the-nut' }, nut));
  return the;
}

// ---------------------------------------------------------------------------
// DANH SÁCH THUỐC của một nguồn — tìm + lọc theo nhóm
function trangDanhSach(ctx, k) {
  const { di } = ctx;
  const n = NGUON.find(x => x.k === k) || nguonDangHoc();
  ctx.veDau(n.ten, ctx.nutQuayLai('#/ht'));
  const boc = el('div', { class: 'trang trang-vao' });
  const ds = thuocCuaNguon(n.k);
  const o = el('input', { class: 'o-tim', type: 'search', placeholder: 'Tên thuốc, hoạt chất, hãng…', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off' });
  const nhom = [...new Set(ds.map(t => t.vaiTro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  let locNhom = null;
  const hangLoc = el('div', { class: 'loc-hang' });
  const kq = el('div', {});
  let toiDa = CAU_HINH.VE_MOI_DOT || 100;
  const ve = () => {
    const tu = boDau(o.value).split(/\s+/).filter(Boolean);
    const loc = ds.filter(t => (!locNhom || t.vaiTro === locNhom) && tu.every(w => t.khoa.includes(w)));
    kq.innerHTML = '';
    kq.append(el('div', { class: 'khu-de', text: `${soVN(loc.length)} thuốc` }));
    const khung = el('div', { class: 'ds' }, ...loc.slice(0, toiDa).map(t => hangThuoc(t, di)));
    kq.append(khung);
    if (loc.length > toiDa) {
      kq.append(el('div', { class: 'them-boc' }, el('button', {
        class: 'nut nut-them', text: `Hiện thêm — còn ${loc.length - toiDa} thuốc`,
        onclick: () => { toiDa += CAU_HINH.VE_MOI_DOT || 100; const y = window.scrollY; ve(); requestAnimationFrame(() => window.scrollTo(0, y)); },
      })));
    }
  };
  const veLoc = () => {
    hangLoc.innerHTML = '';
    hangLoc.append(el('button', { class: 'loc-nut' + (!locNhom ? ' dang' : ''), text: 'Mọi nhóm', onclick: () => { locNhom = null; veLoc(); ve(); } }),
      ...nhom.map(x => el('button', { class: 'loc-nut' + (locNhom === x ? ' dang' : ''), text: x, onclick: () => { locNhom = x; veLoc(); ve(); } })));
  };
  let hen;
  o.addEventListener('input', () => { clearTimeout(hen); hen = setTimeout(() => { toiDa = CAU_HINH.VE_MOI_DOT || 100; ve(); }, 120); });
  veLoc();
  ve();
  boc.append(el('div', { class: 'tim-boc' }, el('span', { class: 'tim-kinh', text: '🔍' }), o), hangLoc, kq);
  return boc;
}

// ---------------------------------------------------------------------------
// THẺ MỘT THUỐC
function trangThuoc(ctx, sku) {
  const { di } = ctx;
  const t = HT.theoSku.get(sku);
  ctx.veDau('Thuốc', ctx.nutQuayLai());
  const boc = el('div', { class: 'trang trang-vao' });
  if (!t) {
    const ten = HT.tenToa[sku]?.ten;
    boc.append(trong('🔎', ten ? tenDep(ten) : 'Không có thuốc này',
      HT.mat.has(sku) ? 'Web Long Châu đã gỡ sản phẩm này (' + HT.mat.get(sku) + ') nên không có ảnh và chi tiết.' : 'Thuốc này chưa có trong dữ liệu học thuốc.'));
    return boc;
  }
  boc.append(el('div', { class: 'lt-the ht-the ' + (t.rx === 1 ? 'rx' : t.rx === 0 ? 'otc' : '') },
    dayAnh(t.s),
    el('h1', { class: 'ht-ten', text: t.ten }),
    t.w ? el('div', { class: 'ht-web', text: t.w }) : null,
    ...tomTat(t, null, { anTen: true }),
    el('div', { class: 'lt-dong' }, nhanRx(t.rx), vach(t))));

  // Tiến độ + nút học
  const x = td(t);
  boc.append(el('div', { class: 'cc-hang' },
    el('button', { class: 'cc-nut', text: '✓ Đã nhớ thuốc này', onclick: async () => { await ghiNho(t, true); bao('Đã ghi: nhớ. Gặp lại sau ' + TEN_HAN[Math.min(NHAC_LAI.length - 1, (x?.mucDo || 0) + 1)] + '.'); ctx.veLai(); } }),
    el('button', { class: 'cc-nut', text: '↺ Chưa nhớ', onclick: async () => { await ghiNho(t, false); bao('Đã ghi: chưa nhớ. Gặp lại sau 10 phút.'); ctx.veLai(); } })));
  if (x?.lan) {
    boc.append(el('p', { class: 'ct-meta', text: `Đã gặp ${x.lan} lần · quên ${x.quen || 0} lần · ` +
      ((x.honLai || 0) <= Date.now() ? 'đang tới hạn ôn' : 'gặp lại ' + new Date(x.honLai).toLocaleDateString('vi-VN')) }));
  }

  // Có trong toa nào
  const dong = HT.dongTheoSku.get(t.s) || [];
  if (dong.length) {
    boc.append(el('h2', { class: 'khu-de', text: `📋 Có trong ${new Set(dong.map(d => d.toa.id)).size} toa`, style: 'margin-top:16px' }));
    const ds = el('div', { class: 'ds' });
    const da = new Set();
    for (const d of dong) {
      if (da.has(d.toa.id)) continue;
      da.add(d.toa.id);
      const vai = d.sku === t.s ? 'đúng thuốc toa ghi' : d.gan === t.s ? 'cùng tên, khác hàm lượng/dạng' : 'thuốc thay thế cho ' + d.ten;
      ds.append(hangMuc('📋', `${d.toa.khoa} — ${d.ten}`, `${vai} · ${d.toa.cd}`, '#/ht/toa/' + d.toa.id, di));
    }
    boc.append(ds);
  }

  // Chi tiết — nạp riêng từng thuốc
  const noi = el('div', {}, el('p', { class: 'the-chu', text: 'Đang nạp chỉ định, liều dùng…' }));
  boc.append(el('h2', { class: 'khu-de', text: 'Thông tin thuốc', style: 'margin-top:16px' }), noi);
  fetch('data/ct/' + t.s + '.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(ct => { noi.innerHTML = ''; noi.append(...veChiTiet(t, ct)); })
    .catch(e => { noi.innerHTML = ''; noi.append(el('p', { class: 'the-chu canh-bao', text: 'Chưa tải được chi tiết (' + chuLoi(e) + '). Cần mạng ở lần mở đầu tiên, hoặc bấm "Tải sẵn tất cả" ở trang Học thuốc.' })); });

  // Khoá học (Bộ HV / 700 / 1500 / 3000): biệt dược tương đương theo giảng viên
  boc.append(khoiTrongKhoaHoc(t.s, di));

  // Thuốc cùng hoạt chất trong dữ liệu học
  const cung = HT.t.filter(x2 => x2 !== t && x2.h && boDau(x2.h) === boDau(t.h));
  if (cung.length) {
    boc.append(el('h2', { class: 'khu-de', text: `Cùng hoạt chất & hàm lượng (${cung.length})`, style: 'margin-top:18px' }),
      el('div', { class: 'ds' }, ...cung.slice(0, 12).map(x2 => hangThuoc(x2, di))));
  }
  return boc;
}

// Các khối chữ của một mục: h (tiêu đề) · p · li · q/a (hỏi đáp) · cut (đã cắt bớt)
function veKhoi(ds, web) {
  const ra = [];
  let ul = null;
  for (const [loai, chu] of ds) {
    if (loai === 'li') {
      if (!ul) { ul = el('ul', { class: 'lt-ul' }); ra.push(ul); }
      ul.append(el('li', { text: chu }));
      continue;
    }
    ul = null;
    if (loai === 'h') ra.push(el('div', { class: 'ht-h', text: chu }));
    else if (loai === 'q') ra.push(el('div', { class: 'ht-q', text: '❓ ' + chu }));
    else if (loai === 'a') ra.push(el('div', { class: 'ct-chu ht-a', text: chu }));
    else if (loai === 'cut') ra.push(el('a', { class: 'lt-xem', href: web, target: '_blank', rel: 'noopener', text: 'Còn nữa — xem đầy đủ trên web Long Châu ›' }));
    else ra.push(el('div', { class: 'ct-chu', text: chu }));
  }
  return ra;
}

function veChiTiet(t, ct) {
  const web = HT.web + (ct.slug || '');
  const ra = [];
  const bang = [
    ['Nhóm dược lý', ct.nhomDL], ['Mã ATC', ct.atc], ['Hàm lượng tính cho', ct.hcCho],
    ['Nhà sản xuất', ct.nsx], ['Nước sản xuất', ct.nuoc], ['Xuất xứ thương hiệu', ct.xuatXu],
    ['Số đăng ký', ct.sdk], ['Đối tượng', (ct.doiTuong || []).join(', ')], ['Tuổi dùng', ct.tuoi],
    ['Hạn dùng', ct.hsd], ['Bảo quản', ct.baoQuan], ['Mã SKU', t.s],
  ].filter(([, v]) => v);
  ra.push(el('section', { class: 'ct-khoi' }, el('h2', { class: 'ct-de', text: 'Thông tin sản phẩm' }),
    el('div', { class: 'dm-bang' }, ...bang.map(([k, v]) => el('div', { class: 'dm-dong' }, el('span', { class: 'dm-nhan', text: k }), el('span', { text: String(v) }))))));
  // Mục quan trọng mở sẵn, còn lại gập lại cho đỡ dài
  const moSan = new Set(['cd', 'ld', 'ccd']);
  for (const m of ct.muc || []) {
    const chi = el('details', { class: 'ct-khoi ht-muc', open: moSan.has(m.k) ? '' : null },
      el('summary', { class: 'ct-de ht-tom', text: m.ten }), ...veKhoi(m.c, web));
    ra.push(chi);
  }
  ra.push(el('p', { class: 'ct-meta' }, `Nguồn: Nhà thuốc Long Châu (lấy ngày ${ct.luc || HT.ngay}) · `,
    el('a', { href: web, target: '_blank', rel: 'noopener', text: 'mở trang gốc' })));
  return ra;
}

// ---------------------------------------------------------------------------
// 100 TOA
function trangDsToa(ctx) {
  const { di } = ctx;
  ctx.veDau('100 toa thuốc', ctx.nutQuayLai('#/ht'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('p', { class: 'the-chu', text: 'Toa thật, đã bỏ thông tin người bệnh. Mở một toa để xem từng thuốc là gì, dùng để làm gì, hộp ra sao — hoặc bấm "Luyện đọc" để tự kiểm tra.' }));
  // Nhóm theo chuyên khoa (chữ đầu của ô khoa)
  const theoKhoa = new Map();
  for (const t of HT.toa) {
    const k = t.khoa.split(/[(+]/)[0].trim() || 'Khác';
    if (!theoKhoa.has(k)) theoKhoa.set(k, []);
    theoKhoa.get(k).push(t);
  }
  const ks = [...theoKhoa.keys()].sort((a, b) => theoKhoa.get(b).length - theoKhoa.get(a).length || a.localeCompare(b, 'vi'));
  for (const k of ks) {
    boc.append(el('h2', { class: 'khu-de', text: `${k} (${theoKhoa.get(k).length})`, style: 'margin-top:14px' }));
    boc.append(el('div', { class: 'ds' }, ...theoKhoa.get(k).map(t => {
      const x = tienDoToa(t);
      const icon = x.tong && x.thuoc === x.tong ? '✅' : x.hoc ? '📖' : '📋';
      return hangMuc(icon, t.cd.replace(/\s*\([A-Z]\d[^)]*\)/g, '').slice(0, 90),
        `${t.thuoc.length} thuốc · ${[t.tuoi && t.tuoi + ' tuổi', t.gioi].filter(Boolean).join(' · ')} · thuộc ${x.thuoc}/${x.tong}`,
        '#/ht/toa/' + t.id, di, thanh(x.thuoc, x.tong, 'nho'));
    })));
  }
  return boc;
}

function nhanDong(d) {
  if (d.kieu === 'bd') return el('span', { class: 'ht-nhan co', text: '✓ Long Châu có' });
  if (d.kieu === 'hc') return el('span', { class: 'ht-nhan hc', text: 'Toa ghi tên hoạt chất' });
  return el('span', { class: 'ht-nhan khong', text: '✗ Long Châu không bán' });
}

function dongToa(d, di) {
  const t = d.sku && HT.theoSku.get(d.sku);
  const g = d.gan && HT.theoSku.get(d.gan);
  const dai = d.dai && HT.theoSku.get(d.dai);
  const boc = el('div', { class: 'lt-the ht-dong ' + (dai?.rx === 1 ? 'rx' : dai?.rx === 0 ? 'otc' : '') });
  boc.append(el('div', { class: 'ht-dong-dau' },
    el('span', { class: 'ht-stt', text: String(d.i + 1) }),
    el('div', { class: 'ht-dong-chu' },
      el('b', { class: 'ht-dong-ten', text: d.ten }),
      el('div', { class: 'lt-hg', text: [d.hc, d.ham].filter(Boolean).join(' · ') }),
      el('div', { class: 'ht-dung', text: [d.sl, d.dung].filter(Boolean).join(' — ') })),
    // Ảnh ở góc chỉ khi Long Châu có đúng biệt dược đó (hoặc cùng tên khác hàm lượng): hiện hộp của
    // thuốc thay thế cạnh tên Midantin là dạy nhớ nhầm hộp
    t || g ? el('a', { href: '#/ht/t/' + (t || g).s, onclick: (e) => { e.preventDefault(); di('#/ht/t/' + (t || g).s); } }, anhNho((t || g).s, 'ht-vua')) : null));
  boc.append(el('div', { class: 'lt-dong' }, nhanDong(d), dai?.vaiTro ? el('span', { class: 'lt-hg', text: ' ' + dai.vaiTro }) : null));
  if (t) {
    boc.append(el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: 'Ở Long Châu: ' }),
      el('a', { class: 'ht-lk', href: '#/ht/t/' + t.s, onclick: (e) => { e.preventDefault(); di('#/ht/t/' + t.s); }, text: t.ten })));
    if (t.cd) boc.append(el('div', { class: 'lt-dong ht-cd', text: t.cd }));
  } else if (g) {
    boc.append(el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: 'Long Châu có bản khác hàm lượng/dạng: ' }),
      el('a', { class: 'ht-lk', href: '#/ht/t/' + g.s, onclick: (e) => { e.preventDefault(); di('#/ht/t/' + g.s); }, text: g.ten + (g.h ? ' (' + g.h + ')' : '') })));
  }
  const thay = d.thay.map(s => HT.theoSku.get(s)).filter(Boolean);
  if (thay.length) {
    boc.append(el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: d.kieu === 'bd' ? 'Cùng hoạt chất ở Long Châu:' : 'Thay bằng thuốc cùng hoạt chất ở Long Châu:' })),
      el('div', { class: 'ht-thay' }, ...thay.map(x => el('a', {
        class: 'ht-thay-mot', href: '#/ht/t/' + x.s, onclick: (e) => { e.preventDefault(); di('#/ht/t/' + x.s); },
      }, anhNho(x.s, 'ht-vua'), el('span', { text: x.ten }), el('span', { class: 'lt-hg', text: x.h })))));
  } else if (!t && !g) {
    boc.append(el('div', { class: 'lt-dong lt-hg', text: d.hc ? 'Long Châu không có thuốc cùng hoạt chất, hàm lượng và dạng này.' : 'Chữ viết tay khó đọc, không xác định được thuốc.' }));
  }
  return boc;
}

function trangMotToa(ctx, id) {
  const { di } = ctx;
  const t = HT.toaTheoId.get(id);
  if (!t) return trangKhong(ctx);
  ctx.veDau('Toa ' + (HT.toa.indexOf(t) + 1) + '/' + HT.toa.length, ctx.nutQuayLai('#/ht/toa'),
    el('button', { class: 'dau-nut dau-nut-chinh', onclick: () => di('#/ht/doc/' + id), text: '🧠 Luyện đọc' }));
  const boc = el('div', { class: 'trang trang-vao' });
  const x = tienDoToa(t);
  boc.append(el('section', { class: 'ct-khoi ht-toa-dau' },
    el('h2', { class: 'ct-de', text: t.khoa }),
    el('div', { class: 'lt-hg', text: [t.tuoi && t.tuoi + ' tuổi', t.gioi].filter(Boolean).join(' · ') }),
    el('div', { class: 'ht-cdoan', text: t.cd }),
    el('div', { class: 'lt-hg', text: `${t.thuoc.length} thuốc · đã thuộc ${x.thuoc}/${x.tong}` }), thanh(x.thuoc, x.tong)));
  for (const d of t.thuoc) boc.append(dongToa(d, di));
  const i = HT.toa.indexOf(t);
  boc.append(el('div', { class: 'on-nut', style: 'margin-top:16px' },
    i > 0 ? el('button', { class: 'nut', onclick: () => di('#/ht/toa/' + HT.toa[i - 1].id), text: '← Toa trước' }) : null,
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/ht/doc/' + id), text: '🧠 Luyện đọc toa này' }),
    i + 1 < HT.toa.length ? el('button', { class: 'nut', onclick: () => di('#/ht/toa/' + HT.toa[i + 1].id), text: 'Toa sau →' }) : null));
  return boc;
}

// LUYỆN ĐỌC TOA: lần lượt từng dòng — thấy đúng chữ bác sĩ ghi, tự nói ra thuốc gì, để làm gì,
// rồi lật xem ảnh hộp + hoạt chất + công dụng. Nhớ / quên ghi vào lịch ôn của thuốc đại diện.
function trangDocToa(ctx, id) {
  const { di } = ctx;
  const t = HT.toaTheoId.get(id);
  if (!t) return trangKhong(ctx);
  ctx.veDau('Luyện đọc toa', ctx.nutQuayLai('#/ht/toa/' + id));
  const boc = el('div', { class: 'trang trang-vao' });
  const khung = el('div', { class: 'on-khung' });
  const ds = t.thuoc;
  let viTri = 0, lat = false, nho = 0, quen = 0, dangGhi = false;
  const ve = () => {
    khung.innerHTML = '';
    if (viTri >= ds.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: quen ? '💪' : '🎉' }),
        el('h3', { text: 'Đọc xong toa' }),
        el('p', { class: 'the-chu', text: `Nhớ ${nho} · quên ${quen} trên ${ds.length} thuốc. Thuốc quên sẽ gặp lại sau 10 phút.` }),
        el('div', { class: 'on-nut' },
          el('button', { class: 'nut', onclick: () => di('#/ht/toa/' + id), text: 'Xem lại toa' }),
          el('button', { class: 'nut nut-chinh', onclick: () => { const i = HT.toa.indexOf(t); di(i + 1 < HT.toa.length ? '#/ht/doc/' + HT.toa[i + 1].id : '#/ht/toa'); }, text: 'Toa tiếp →' }))));
      return;
    }
    const d = ds[viTri];
    const dai = d.dai && HT.theoSku.get(d.dai);
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + ds.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / ds.length * 100).toFixed(1)}%` })),
      dai ? el('span', { class: 'on-muc', text: vach(dai)?.textContent || '' }) : null));
    const the = el('div', { class: 'the-lat lt-lat', onclick: () => { if (!lat) { lat = true; ve(); } } },
      el('div', { class: 'the-nhan', text: t.khoa + ' · ' + t.cd.replace(/\s*\([A-Z]\d[^)]*\)/g, '').slice(0, 80) }),
      el('h2', { class: 'the-hoi the-hoi-nho', text: d.ten }),
      el('div', { class: 'lt-hg', text: [d.ham, d.sl].filter(Boolean).join(' · ') }),
      el('div', { class: 'ht-dung', text: d.dung }));
    if (!lat) {
      the.append(el('div', { class: 'lt-goi-y', text: 'Tự nói ra: hoạt chất gì · nhóm gì · trong toa này dùng để làm gì · hộp trông ra sao' }),
        el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }));
    } else {
      the.style.cursor = 'default';
      the.append(el('div', { class: 'lt-sau' },
        el('div', { class: 'lt-dong' }, nhanDong(d)),
        d.hc ? el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: 'Toa ghi hoạt chất: ' }), el('b', { text: [d.hc, d.ham].filter(Boolean).join(' ') })) : null,
        dai && !d.sku ? el('div', { class: 'lt-dong lt-k', text: d.gan ? 'Long Châu có bản khác hàm lượng / dạng:' : 'Ở Long Châu thay bằng thuốc cùng hoạt chất:' }) : null,
        dai ? dayAnh(dai.s, { nho: true }) : null,
        ...(dai ? tomTat(dai, di) : [el('div', { class: 'lt-dong', text: d.hc || 'Không xác định được thuốc.' })])));
    }
    khung.append(the);
    if (lat) {
      const tra = async (ok) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          if (dai) await ghiNho(dai, ok);
          if (ok) nho++; else quen++;
          viTri++; lat = false; ve(); window.scrollTo(0, 0);
        } finally { dangGhi = false; }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa nhớ', onclick: () => tra(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã nhớ', onclick: () => tra(true) })));
    }
  };
  boc.append(khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// HỌC MỚI: đọc N thẻ (ảnh hộp + tóm tắt) rồi tự kiểm tra
function trangHocMoi(ctx, k) {
  const { di } = ctx;
  const n = NGUON.find(x => x.k === k) || nguonDangHoc();
  const ds = mucMoi(n.k);
  ctx.veDau('Học mới', ctx.nutQuayLai('#/ht'), ds.length ? el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di('#/ht/the/moi/' + n.k), text: '🧠 Tự kiểm tra',
  }) : null);
  const boc = el('div', { class: 'trang trang-vao' });
  if (!ds.length) { boc.append(trong('🎉', `Đã học hết ${n.ten}`, 'Ôn thẻ tới hạn hoặc chọn nguồn khác.')); return boc; }
  boc.append(el('p', { class: 'the-chu', text: `${ds.length} thuốc tiếp theo của ${n.ten}. Nhìn kỹ hộp (màu, chữ to, hình vỉ), đọc hoạt chất và công dụng. Xong bấm "Tự kiểm tra".` }));
  for (const t of ds) boc.append(theHoc(t, di));
  boc.append(el('div', { class: 'the-nut', style: 'margin-top:16px' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/ht/the/moi/' + n.k), text: `🧠 Tự kiểm tra ${ds.length} thuốc này` })));
  return boc;
}

// Nhìn hộp đoán thuốc: ưu tiên thuốc đã học; mới học chưa tới 10 thuốc thì lấy cả nguồn
function anhDeDoan(k) {
  const coAnh = thuocCuaNguon(k).filter(t => t.a);
  const da = coAnh.filter(daHoc);
  return da.length >= 10 ? da : coAnh;
}

// ---------------------------------------------------------------------------
// THẺ LẬT
// kieu: moi | han | quen | anh (nhìn hộp đoán thuốc)
function trangThe(ctx, kieu, k) {
  const { di } = ctx;
  if (!['moi', 'han', 'quen', 'anh'].includes(kieu)) return trangKhong(ctx);
  const n = NGUON.find(x => x.k === k) || NGUON[3];
  const nguon = kieu === 'moi' ? mucMoi(n.k)
    : kieu === 'han' ? dsDenHan(n.k)
    : kieu === 'quen' ? dsHayQuen(n.k)
    : kieu === 'anh' ? anhDeDoan(n.k) : [];
  const tieuDe = { moi: 'Tự kiểm tra', han: 'Ôn thẻ tới hạn', quen: 'Thuốc hay quên', anh: 'Nhìn hộp đoán thuốc' }[kieu] || 'Thẻ lật';
  ctx.veDau(tieuDe, ctx.nutQuayLai(kieu === 'moi' ? '#/ht/hoc/' + n.k : '#/ht'));
  const boc = el('div', { class: 'trang trang-vao' });
  const khung = el('div', { class: 'on-khung' });
  // Chiều thẻ: 'anh' (nhìn hộp -> nói tên) · 'ten' (thấy tên -> nói hoạt chất + công dụng + hình dung hộp)
  const chieuCua = (t) => kieu === 'anh' ? 'anh' : !t.a ? 'ten'
    : (CAU_HINH.HT_CHIEU_THE || 'tron') === 'tron' ? (Math.random() < 0.5 ? 'anh' : 'ten') : CAU_HINH.HT_CHIEU_THE;
  let bo = xaoMang([...nguon]).slice(0, kieu === 'anh' ? (CAU_HINH.HT_SO_CAU || 15) : undefined).map(t => ({ t, chieu: chieuCua(t) }));
  let viTri = 0, nho = 0, quen = 0, lat = false, dangGhi = false;
  const quenLai = [];
  const ve = () => {
    khung.innerHTML = '';
    if (!bo.length) {
      khung.append(trong('🌱', kieu === 'han' ? 'Không có thuốc nào tới hạn' : kieu === 'anh' ? 'Chưa học thuốc nào có ảnh' : 'Không có thẻ nào', 'Học thuốc mới hoặc quay lại sau.'),
        el('div', { class: 'on-nut' }, el('button', { class: 'nut nut-chinh', onclick: () => di('#/ht'), text: 'Về Học thuốc' })));
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
          el('button', { class: 'nut nut-chinh', onclick: () => di('#/ht'), text: 'Xong' }))));
      return;
    }
    const { t, chieu } = bo[viTri];
    const d = td(t)?.lan ? td(t).mucDo || 0 : 0;
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', text: '●'.repeat(d) + '○'.repeat(NHAC_LAI.length - 1 - d) })));
    const the = el('div', { class: 'the-lat lt-lat', onclick: () => { if (!lat) { lat = true; ve(); } } });
    if (chieu === 'anh') {
      the.append(el('div', { class: 'the-nhan', text: 'Nhìn hộp · ' + (t.vaiTro || 'thuốc') }), dayAnh(t.s, { phongTo: lat }));
      if (!lat) the.append(el('div', { class: 'lt-goi-y', text: 'Tự nói ra: tên thuốc · hoạt chất · dùng để làm gì' }));
    } else {
      the.append(el('div', { class: 'the-nhan', text: 'Tên thuốc' }), el('h2', { class: 'the-hoi', text: t.ten }));
      if (!lat) the.append(el('div', { class: 'lt-goi-y', text: 'Tự nói ra: hoạt chất · nhóm · công dụng · hộp màu gì, trông ra sao' }));
    }
    if (!lat) the.append(el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }));
    else {
      the.style.cursor = 'default';
      the.append(el('div', { class: 'lt-sau' },
        chieu === 'ten' ? dayAnh(t.s, { nho: true }) : null,
        ...tomTat(t, null, { anTen: chieu === 'ten' })));
    }
    khung.append(the);
    if (lat) {
      const tra = async (ok) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          await ghiNho(t, ok);
          if (ok) nho++; else { quen++; quenLai.push(bo[viTri]); }
          viTri++; lat = false; ve(); window.scrollTo(0, 0);
        } finally { dangGhi = false; }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa nhớ', onclick: () => tra(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã nhớ', onclick: () => tra(true) })));
      const moi = Math.min(NHAC_LAI.length - 1, (td(t)?.mucDo || 0) + 1);
      khung.append(el('div', { class: 'on-hen', text: `Nhớ → gặp lại sau ${TEN_HAN[moi]} · Quên → sau ${TEN_HAN[0]}` }));
    }
  };
  boc.append(khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// TRẮC NGHIỆM — 6 kiểu câu. Phương án sai lấy từ CÙNG NHÓM cho khó đúng kiểu ở quầy.
//   nhìn hộp -> tên · tên -> chọn đúng hộp · tên -> hoạt chất · tên -> công dụng
//   trong toa này thuốc X dùng để làm gì · kê đơn hay không
// Đúng / sai ghi vào cùng lịch ôn với thẻ lật.
function cheTen(chu, t) {
  // Che tên thuốc và tên hãng trong câu công dụng, để câu hỏi không tự lộ đáp án
  let s = chu || '';
  const tu = [...new Set([...t.ten.split(/[\s-]+/), ...(t.td || '').split(/\s+/), ...(t.b || '').split(/\s+/)])]
    .filter(w => w.length >= 4 && !/^\d/.test(w) && !/^(thuốc|viên|dung|dịch|điều|giảm|chứa|công|dụng)$/i.test(w));
  for (const w of tu) s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '…');
  return s;
}

// Khoá "tên hiệu" của một thuốc: chữ đầu tiên có nghĩa của tên (bỏ chữ chung như Dầu, Siro, AT).
// Hai thuốc cùng tên hiệu (Uruso 200 / Uruso 300, Nexium Mups / Nexium gói) có hộp gần như y hệt,
// nên không bao giờ được đứng chung một câu hỏi nhìn hộp.
const CHU_CHUNG = new Set(['dau', 'thuoc', 'siro', 'vien', 'kem', 'gel', 'nuoc', 'tra', 'cao', 'bot', 'goi', 'at', 'sp', 'new', 'the']);
function khoaHieu(t) {
  const w = boDau(t.ten).split(/[^a-z0-9]+/).filter(Boolean);
  const i = w.findIndex(x => x.length >= 3 && !CHU_CHUNG.has(x));
  return i < 0 ? w.slice(0, 2).join(' ') : w.slice(0, i + 1).join(' ');
}
// Khoá hoạt chất không phụ thuộc thứ tự / cách ghi: "Clavulanic acid 125mg" = "Acid Clavulanic 125mg"
const khoaHc = (h) => boDau(h).split(/[^a-z0-9.]+/).filter(w => w && w !== 'acid').sort().join(' ');

function taoCau(t, kieu, pool) {
  const cungNhom = xaoMang(pool.filter(y => y !== t && y.vaiTro === t.vaiTro));
  const khacNhom = xaoMang(pool.filter(y => y.vaiTro !== t.vaiTro));
  const lua = (dung, nhieu) => xaoMang([{ ...dung, dung: true }, ...nhieu]);
  // Phương án sai: khoá (đã chuẩn hoá) khác đáp án và khác nhau từng đôi một
  const khac = (khoa, n = 3, loc = () => true) => {
    const da = new Set([khoa(t)]);
    const ra = [];
    for (const y of [...cungNhom, ...khacNhom]) {
      if (!loc(y)) continue;
      const v = khoa(y);
      if (!v || da.has(v)) continue;
      da.add(v); ra.push(y);
      if (ra.length >= n) break;
    }
    return ra;
  };
  if (kieu === 'anh-ten') {
    if (!t.a) return null;
    const n = khac(khoaHieu);
    if (n.length < 3) return null;
    return { loai: 'Nhìn hộp → tên thuốc', anh: t.s, de: 'Đây là thuốc nào?', t, lua: lua({ chu: t.ten }, n.map(y => ({ chu: y.ten }))) };
  }
  if (kieu === 'ten-anh') {
    if (!t.a) return null;
    const n = khac(khoaHieu, 3, y => y.a > 0);
    if (n.length < 3) return null;
    return { loai: 'Tên thuốc → hộp thuốc', hoi: t.ten, de: 'Hộp nào là thuốc này?', t, luoiAnh: true, lua: lua({ anh: t.s }, n.map(y => ({ anh: y.s }))) };
  }
  if (kieu === 'ten-hc') {
    if (!t.h) return null;
    // Tên đã ghi sẵn tên hoạt chất (Amlodipine Stella) thì hỏi hoạt chất là lộ đáp án
    const goc = boDau(t.h).split(/[^a-z]+/).find(w => w.length >= 5);
    if (goc && boDau(t.ten).includes(goc.slice(0, 6))) return null;
    const n = khac(y => khoaHc(y.h));
    if (n.length < 3) return null;
    return { loai: 'Tên thuốc → hoạt chất', hoi: t.ten, de: 'Chứa hoạt chất gì, hàm lượng bao nhiêu?', t, lua: lua({ chu: t.h }, n.map(y => ({ chu: y.h }))) };
  }
  if (kieu === 'ten-cd') {
    if (!t.cd || t.cd.length < 30) return null;
    // Phương án sai lấy ở NHÓM KHÁC: hai thuốc cùng nhóm thường có công dụng gần như nhau
    const n = khacNhom.filter(y => y.cd && y.cd.length >= 30 && boDau(y.cd) !== boDau(t.cd)).slice(0, 3);
    if (n.length < 3) return null;
    return { loai: 'Tên thuốc → công dụng', hoi: t.ten, de: 'Thuốc này dùng để làm gì?', t, lua: lua({ chu: cheTen(t.cd, t) }, n.map(y => ({ chu: cheTen(y.cd, y) }))) };
  }
  if (kieu === 'toa') {
    const dong = (HT.dongTheoSku.get(t.s) || []).filter(d => d.dai === t.s);
    if (!dong.length || !t.vaiTro) return null;
    const d = dong[Math.random() * dong.length | 0];
    // Phương án sai: vai trò của các thuốc khác trong CHÍNH toa đó, thiếu thì lấy nhóm bất kỳ
    const trongToa = d.toa.thuoc.map(x => HT.theoSku.get(x.dai)?.vaiTro).filter(v => v && v !== t.vaiTro);
    const nhom = [...new Set([...xaoMang(trongToa), ...xaoMang(pool.map(y => y.vaiTro)).filter(v => v && v !== t.vaiTro)])].slice(0, 3);
    if (nhom.length < 3) return null;
    return { loai: 'Đọc toa', hoi: d.ten + (d.ham ? ' — ' + d.ham : ''), dePhu: `${d.toa.khoa}: ${d.toa.cd.replace(/\s*\([A-Z]\d[^)]*\)/g, '').slice(0, 110)}`, de: 'Trong toa này, thuốc này thuộc nhóm nào?', t, lua: lua({ chu: t.vaiTro }, nhom.map(v => ({ chu: v }))) };
  }
  if (kieu === 'rx') {
    if (t.rx !== 0 && t.rx !== 1) return null;
    return { loai: 'Kê đơn hay không', hoi: t.ten, de: 'Thuốc này bán theo đơn hay không cần đơn?', t,
      lua: [{ chu: '℞ Kê đơn', dung: t.rx === 1 }, { chu: 'Không kê đơn', dung: t.rx === 0 }] };
  }
  return null;
}

const KIEU_CAU = ['anh-ten', 'ten-anh', 'ten-hc', 'ten-cd', 'toa', 'anh-ten', 'ten-anh'];

// Lần tải sẵn gần nhất: { luc, du } — du = đã tải đủ cho ĐÚNG bộ dữ liệu đang dùng (cùng ngày dữ liệu,
// cùng số tệp). Dữ liệu cập nhật (thêm thuốc) thì du = false để nhắc tải phần mới. null = chưa tải lần nào.
function trangThaiTaiSan() {
  let x = null;
  try { x = localStorage.getItem(KHOA_DA_TAI); } catch (_) { return null; }
  if (!x) return null;
  let o;
  try { o = JSON.parse(x); } catch (_) { o = null; }
  if (!o || typeof o !== 'object') return { luc: x, du: false };      // bản cũ chỉ lưu thời điểm
  const so = HT.t.reduce((s, t) => s + 1 + (t.a || 0), 0);
  return { luc: o.luc, du: o.ngay === HT.ngay && o.so === so };
}
const daTaiSan = () => !!trangThaiTaiSan()?.du;

function taoDe(ds, pool, soCau) {
  const de = [];
  // Mất mạng mà chưa "Tải sẵn tất cả" thì ảnh không hiện được: chỉ hỏi câu chữ
  const coAnh = navigator.onLine !== false || daTaiSan();
  const kieuCau = coAnh ? KIEU_CAU : KIEU_CAU.filter(k => !k.includes('anh'));
  for (const t of xaoMang([...ds])) {
    if (de.length >= soCau) break;
    // Câu 2 phương án (kê đơn?) đoán mò đúng 50% — chỉ chừng 1/8 đề
    const kieu = Math.random() < 0.12 ? ['rx'] : xaoMang([...kieuCau]);
    for (const k of kieu) {
      const q = taoCau(t, k, pool);
      if (q) { de.push(q); break; }
    }
  }
  return de;
}

// Ảnh một phương án; tải hỏng thì đổi thành tên thuốc để câu hỏi vẫn trả lời được
function anhLua(sku, i) {
  const im = el('img', { class: 'ht-lua-img', src: duongAnh(sku), alt: 'phương án ' + 'ABCD'[i], loading: 'eager' });
  im.addEventListener('error', () => im.replaceWith(el('span', { class: 'ht-lua-ten', text: HT.theoSku.get(sku)?.ten || sku })), { once: true });
  return im;
}

function trangTracNghiem(ctx, k) {
  const { di } = ctx;
  const n = NGUON.find(x => x.k === k) || nguonDangHoc();
  ctx.veDau('Trắc nghiệm', ctx.nutQuayLai('#/ht'));
  const boc = el('div', { class: 'trang trang-vao' });
  const tat = thuocCuaNguon(n.k);
  // Ưu tiên phần đã học; chưa học gì thì hỏi cả nguồn (vừa học vừa đoán)
  const daHocDs = tat.filter(daHoc);
  const dsHoi = daHocDs.length >= 8 ? daHocDs : tat;
  const pool = HT.t;
  const soCau = CAU_HINH.HT_SO_CAU || 15;
  const khung = el('div', { class: 'on-khung' });
  let de = taoDe(dsHoi, pool, soCau), viTri = 0, dung = 0, chon = null, sai = [], dangGhi = false;
  const ve = () => {
    khung.innerHTML = '';
    if (!de.length) { khung.append(trong('📝', 'Chưa tạo được câu hỏi', 'Học vài thuốc trước rồi quay lại.')); return; }
    if (viTri >= de.length) {
      const diem = Math.round(100 * dung / de.length);
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: diem >= 80 ? '🏆' : '💪' }),
        el('h3', { text: `${diem}% — đúng ${dung}/${de.length} câu` }),
        el('p', { class: 'the-chu', text: sai.length ? 'Các thuốc trả lời sai đã về lịch ôn 10 phút. Xem lại bên dưới.' : 'Không sai câu nào.' })));
      for (const t of [...new Set(sai)]) khung.append(theHoc(t, di));
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', onclick: () => di('#/ht'), text: 'Xong' }),
        el('button', { class: 'nut nut-chinh', onclick: () => { de = taoDe(dsHoi, pool, soCau); viTri = 0; dung = 0; chon = null; sai = []; ve(); window.scrollTo(0, 0); }, text: 'Làm lượt khác' })));
      return;
    }
    const q = de[viTri];
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + de.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / de.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', text: 'đúng ' + dung })));
    khung.append(el('div', { class: 'the-lat dm-cau', 'data-loai': q.loai, 'data-sku': q.t.s },
      el('div', { class: 'the-nhan', text: q.loai }),
      q.dePhu ? el('div', { class: 'lt-hg', text: q.dePhu }) : null,
      q.anh ? dayAnh(q.anh) : null,
      q.hoi ? el('h2', { class: 'the-hoi the-hoi-nho', text: q.hoi }) : null,
      el('div', { class: 'dm-de', text: q.de })));
    const luaBoc = el('div', { class: 'dm-lua-boc' + (q.luoiAnh ? ' ht-lua-anh' : '') });
    q.lua.forEach((l, i) => {
      let lop = 'dm-lua';
      if (chon !== null) lop += l.dung ? ' dung' : i === chon ? ' sai' : ' mo';
      luaBoc.append(el('button', {
        class: lop, disabled: chon !== null ? '' : null,
        onclick: async () => {
          if (chon !== null || dangGhi) return;
          chon = i;
          if (l.dung) dung++; else sai.push(q.t);
          ve();
          dangGhi = true;
          try { await ghiNho(q.t, !!l.dung); } catch (_) { /* chỉ mất phần ghi lịch ôn */ } finally { dangGhi = false; }
        },
      }, el('span', { class: 'dm-lua-chu', text: 'ABCD'[i] }),
        l.anh ? anhLua(l.anh, i) : el('span', { text: l.chu })));
    });
    khung.append(luaBoc);
    if (chon !== null) {
      khung.append(el('div', { style: 'margin-top:14px' }, theHoc(q.t, di)));
      khung.append(el('div', { class: 'on-nut' }, el('button', {
        class: 'nut nut-chinh', text: viTri + 1 < de.length ? 'Câu tiếp →' : 'Xem kết quả',
        onclick: () => { viTri++; chon = null; ve(); window.scrollTo(0, 0); },
      })));
    }
  };
  boc.append(el('p', { class: 'the-chu', text: `${n.ten}${dsHoi === daHocDs ? ' · phần đã học' : ''}. Có câu nhìn hộp đoán tên, chọn đúng hộp, đọc toa đoán nhóm.` }), khung);
  ve();
  return boc;
}

function trangKhong(ctx) {
  ctx.veDau('Không tìm thấy', ctx.nutQuayLai('#/ht'));
  return el('div', { class: 'trang' }, trong('🔎', 'Không có mục này', null));
}
