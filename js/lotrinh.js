// Lộ trình học — đúng lộ trình của tài liệu "Nhận biết thuốc Long Châu" (PDF),
// dựng từ CÙNG dữ liệu: data/lotrinh.json sinh bởi nhathuoclongchau/lam_tai_lieu.py.
//
//   Chặng 0  đuôi tên → nhóm (nhìn tên đoán nhóm)
//   Chặng 1–4  1.000 hoạt chất xếp theo độ phổ biến, 50 bài × 20 hoạt chất
//   + nhánh dược liệu, phối hợp hay gặp
//
// Đơn vị học là HOẠT CHẤT (không phải từng hộp thuốc): thuộc 1 hoạt chất là
// nhận ra mọi thuốc chứa nó. Tiến độ ghi vào bản ghi tiến độ ôn tập với khoá
// 'lt:<tên hoạt chất bỏ dấu>' — nên đi theo sao lưu và đồng bộ Drive, và không
// lệch khi dữ liệu được sinh lại (không dùng số thứ tự làm khoá).
import { CAU_HINH } from './config.js';
import { el, boDau, datMau, chuLoi } from './util.js';
import { LICH_ON, tienDoMuc, suaTienDoMuc, xaoMang } from './ontap.js';
import { napDanhMuc, hangThuoc, thuocTheoSku } from './danhmuc.js';

const MAU = '#c2410c';
const TEP = 'data/lotrinh.json';
const { NHAC_LAI, TEN_HAN, MUC_THUOC } = LICH_ON;

let LT = null;
let _dangNap = null;
let _loiNap = null;

export function daNapLT() { return !!LT; }

// Cho tab Tra cứu: tìm hoạt chất trong lộ trình theo tên / cách viết khác (gõ không dấu cũng ra)
export function timHcLT(q) {
  if (!LT) return [];
  const k = boDau(q).trim();
  if (!k) return [];
  const ra = [];
  for (const x of LT.hc) {
    const ten = boDau(x.ten);
    const khac = x.khac.map(boDau);
    if (ten === k || khac.includes(k)) ra.push({ x, hang: 0 });
    else if (ten.startsWith(k) || khac.some(s => s.startsWith(k))) ra.push({ x, hang: 1 });
    else if (ten.includes(k) || khac.some(s => s.includes(k))) ra.push({ x, hang: 2 });
  }
  return ra.sort((a, b) => a.hang - b.hang || b.x.so - a.x.so).map(r => r.x);
}

// Một dòng hoạt chất trong danh sách (Tra cứu)
export function hangHcLT(x, di) {
  const dich = '#/lt/h/' + x.i;
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: '🎯' }),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: x.ten + (x.hang ? '  #' + x.hang : '') }),
      el('span', { class: 'ds-phu' }, nhanRx(x), (x.duoi ? x.duoi[1] : x.nhom[1]) + ' · ' + x.so + ' thuốc')),
    vach(x),
    el('span', { class: 'ds-mui', text: '›' }));
}

export function napLoTrinh() {
  if (LT) return Promise.resolve(LT);
  if (_dangNap) return _dangNap;
  _loiNap = null;
  _dangNap = fetch(TEP)
    .then(r => { if (!r.ok) throw new Error('Không tải được lộ trình (HTTP ' + r.status + ').'); return r.json(); })
    .then(g => {
      g.hc.forEach((x, i) => { x.i = i; x.khoa = 'lt:' + boDau(x.ten); });
      // bài -> chặng, để trang bài biết mình thuộc chặng nào
      g.baiTheoSo = new Map();
      for (const c of g.chang) for (const b of c.bai) g.baiTheoSo.set(b.so, { b, c });
      LT = g; _dangNap = null; return g;
    })
    .catch(e => { _dangNap = null; _loiNap = e; throw e; });
  return _dangNap;
}

// ---------------------------------------------------------------------------
// TIẾN ĐỘ
const td = (x) => tienDoMuc(x.khoa);
const daHoc = (x) => (td(x)?.lan || 0) > 0;
const daThuoc = (x) => daHoc(x) && (td(x).mucDo || 0) >= MUC_THUOC;
const denHan = (x) => daHoc(x) && (td(x).honLai || 0) <= Date.now();

async function ghiNho(x, nho) {
  // Cùng luật với trang Ôn tập: nhớ thì lên một mức, quên thì về mức 0 (gặp lại sau 10 phút)
  return suaTienDoMuc(x.khoa, cu => {
    const mucDo = nho ? Math.min(NHAC_LAI.length - 1, (cu?.mucDo || 0) + 1) : 0;
    return { ...(cu || {}), mucDo, lan: (cu?.lan || 0) + 1, lanCuoi: Date.now(), honLai: Date.now() + NHAC_LAI[mucDo] };
  });
}

const hcCua = (b) => b.hc.map(i => LT.hc[i]);
const baiXong = (b) => hcCua(b).every(daHoc);

function baiKeTiep() {
  for (const c of LT.chang) for (const b of c.bai) if (!baiXong(b)) return { b, c };
  return null;
}

function dsDenHan() { return LT.hc.filter(denHan); }

// "Bạn đã nhận ra X% thuốc": một thuốc tính là nhận ra khi MỌI hoạt chất của nó
// đều đã thuộc — đếm thật trên 5.819 thuốc, không ước lượng.
function phuSong(dieuKien) {
  const ok = LT.hc.map(dieuKien);
  let n = 0;
  for (const s of LT.sp) if (s.every(i => i >= 0 && ok[i])) n++;
  return n;
}

function ketQuaKT(so) { return tienDoMuc('ltkt:' + so); }

// ---------------------------------------------------------------------------
// HIỂN THỊ DÙNG CHUNG
const pt = (n, tong) => (100 * n / tong).toFixed(1).replace('.', ',') + '%';
const soVN = (n) => Number(n).toLocaleString('vi-VN');

function nhanRx(x) {
  if (x.rx >= 90) return el('span', { class: 'dm-rx', text: 'Kê đơn' });
  if (x.rx <= 10) return el('span', { class: 'dm-otc', text: 'Không kê đơn' });
  return el('span', { class: 'dm-mix', text: `Tuỳ sản phẩm (${x.rx}% kê đơn)` });
}
const loaiRx = (x) => x.rx >= 90 ? 'rx' : x.rx <= 10 ? 'otc' : 'mix';
const chuRx = (x) => x.rx >= 90 ? 'Kê đơn' : x.rx <= 10 ? 'Không kê đơn' : `Tuỳ sản phẩm (${x.rx}% kê đơn)`;

// Nội dung 5 ý của một thẻ (không gồm tên) — dùng cho trang bài và mặt sau thẻ lật
function noiDungThe(x, di) {
  const dong = (nhan, ...con) => el('div', { class: 'lt-dong' }, el('span', { class: 'lt-k', text: nhan }), ...con);
  return [
    x.duoi ? dong('Nhóm dược lý: ', el('b', { class: 'lt-duoi' + (x.duoi[1].includes('BẪY') ? ' bay' : ''), text: x.duoi[0] }), ' → ' + x.duoi[1]) : null,
    dong('Long Châu xếp: ', x.nhom[0] + ' › ' + x.nhom[1] + (x.dang.length ? ' · ' : ''),
      x.dang.length ? el('span', { class: 'lt-k', text: 'Dạng: ' }) : null, x.dang.join(', ')),
    x.phoi && x.diCung.length ? el('div', { class: 'lt-dong lt-phoi' }, el('span', { class: 'lt-k', text: 'Chỉ gặp trong thuốc phối hợp' }), ', hay đi cùng: ' + x.diCung.join(', ')) : null,
    x.bd.length ? dong('Biệt dược: ', ...x.bd.flatMap(([t, h], j) => [j ? ' · ' : '', t, el('span', { class: 'lt-hg', text: ` (${h})` })])) : null,
    x.cd ? dong('Công dụng: ', x.cd, el('span', { class: 'lt-hg', text: ' — mô tả ' + x.cdTu })) : null,
    di ? el('a', {
      class: 'lt-xem', href: '#/lt/h/' + x.i,
      onclick: (e) => { e.preventDefault(); di('#/lt/h/' + x.i); },
      text: `Xem ${x.so} thuốc chứa ${x.ten} ›`,
    }) : null,
  ].filter(Boolean);
}

function vach(x) {
  const t = td(x);
  if (!t?.lan) return null;
  const m = t.mucDo || 0;
  return el('span', { class: 'lt-vach', title: 'Mức thuộc', text: '●'.repeat(m) + '○'.repeat(NHAC_LAI.length - 1 - m) });
}

function theHc(x, di) {
  return el('div', { class: 'lt-the ' + loaiRx(x) },
    el('div', { class: 'lt-dau' },
      x.hang ? el('span', { class: 'lt-hang', text: '#' + x.hang }) : null,
      el('b', { class: 'lt-ten', text: x.ten }), nhanRx(x),
      el('span', { class: 'lt-so', text: x.so + ' thuốc' }), vach(x)),
    x.khac.length ? el('div', { class: 'lt-hg', text: 'Cũng ghi là: ' + x.khac.join(', ') }) : null,
    ...noiDungThe(x, di));
}

function thanh(n, tong, lop = '') {
  return el('div', { class: 'lt-thanh ' + lop }, el('i', { style: `width:${(100 * n / Math.max(1, tong)).toFixed(1)}%` }));
}

function trong(icon, tieuDe, chu) {
  return el('div', { class: 'trong' }, el('div', { class: 'trong-icon', text: icon }), el('h3', { text: tieuDe }), chu ? el('p', { text: chu }) : null);
}

// ---------------------------------------------------------------------------
// ĐỊNH TUYẾN '#/lt/...'
// ctx: { veDau, nutQuayLai, di, veLai }
export function trangLoTrinh(p, ctx) {
  datMau(MAU);
  if (!LT) {
    ctx.veDau('Lộ trình', p.length ? ctx.nutQuayLai('#/lt') : null);
    const boc = el('div', { class: 'trang trang-vao' });
    if (_loiNap) {
      boc.append(trong('📡', 'Chưa nạp được lộ trình', chuLoi(_loiNap)),
        el('div', { class: 'the-nut' }, el('button', { class: 'nut nut-chinh', text: 'Thử lại', onclick: () => { _loiNap = null; ctx.veLai(); } })));
      return boc;
    }
    boc.append(trong('🎯', 'Đang nạp lộ trình…', 'Lần đầu mất vài giây, sau đó dùng được cả khi không có mạng.'));
    const hash = location.hash;
    napLoTrinh().then(() => { if (location.hash === hash) ctx.veLai(); }, () => { if (location.hash === hash) ctx.veLai(); });
    return boc;
  }
  const [a, b, c] = p;
  if (!a) return trangHomNay(ctx);
  if (a === 'c') return trangChang(ctx, +b);
  if (a === 'b') return trangBai(ctx, +b);
  if (a === 'on') return trangThe(ctx, b === 'b' ? { bai: +c } : b === 'dl' ? { dl: true } : {});
  if (a === 'kt') return trangKiemTra(ctx, +b);
  if (a === 'h') return trangMotHc(ctx, +b);
  if (a === 'duoi') return trangDuoi(ctx);
  if (a === 'dl') return trangDuocLieu(ctx);
  if (a === 'phoi') return trangPhoi(ctx);
  if (a === 'cach') return trangCach(ctx);
  return trangHomNay(ctx);
}

// Thẻ tóm tắt cho Trang chủ: hôm nay làm gì
export function theTrangChu(di) {
  const the = el('a', { class: 'on-the lt-tc', href: '#/lt', onclick: (e) => { e.preventDefault(); di('#/lt'); } });
  const ve = () => {
    the.innerHTML = '';
    if (!LT) {
      the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '🎯 Lộ trình học' })),
        el('h3', { class: 'on-ten', text: '1.000 hoạt chất · 50 bài' }),
        el('div', { class: 'on-phu', text: 'Học theo đúng thứ tự phổ biến để nhận ra ~90% thuốc Long Châu.' }),
        el('div', { class: 'on-goi', text: 'Mở lộ trình →' }));
      return;
    }
    const tiep = baiKeTiep();
    const han = dsDenHan().length;
    const thuoc = phuSong(daThuoc);
    the.append(el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: han ? `🎯 ${han} thẻ tới hạn ôn` : '🎯 Lộ trình học' })),
      el('h3', { class: 'on-ten', text: tiep ? `Hôm nay: Bài ${tiep.b.so} · ${tiep.b.ten}` : 'Đã học hết 50 bài' }),
      el('div', { class: 'on-phu', text: `Đã nhận ra ${pt(thuoc, LT.tong)} thuốc Long Châu (${soVN(thuoc)}/${soVN(LT.tong)}).` }),
      thanh(thuoc, LT.tong),
      el('div', { class: 'on-goi', text: 'Vào học →' }));
  };
  ve();
  if (!LT) napLoTrinh().then(() => { if (the.isConnected) ve(); }).catch(() => { /* giữ thẻ mặc định */ });
  return the;
}

// ---------------------------------------------------------------------------
// HÔM NAY
function trangHomNay(ctx) {
  const { di } = ctx;
  ctx.veDau('Lộ trình', null, el('button', { class: 'dau-nut', onclick: () => di('#/lt/cach'), text: 'Cách học' }));
  const boc = el('div', { class: 'trang trang-vao' });

  const hoc = phuSong(daHoc), thuoc = phuSong(daThuoc);
  const soHoc = LT.hc.filter(daHoc).length, soThuoc = LT.hc.filter(daThuoc).length;
  boc.append(el('section', { class: 'lt-tong' },
    el('div', { class: 'lt-tong-so' }, pt(thuoc, LT.tong)),
    el('div', { class: 'lt-tong-chu', text: `thuốc Long Châu bạn đã nhận ra (${soVN(thuoc)}/${soVN(LT.tong)})` }),
    thanh(thuoc, LT.tong),
    el('div', { class: 'lt-tong-phu', text: `Đã thuộc ${soThuoc} · đã học qua ${soHoc} / ${LT.hc.length} hoạt chất · nếu thuộc hết phần đã học: ${pt(hoc, LT.tong)}` })));

  // Việc hôm nay
  const tiep = baiKeTiep();
  const han = dsDenHan();
  boc.append(el('h2', { class: 'khu-de', text: 'Hôm nay' }));
  const viec = el('div', { class: 'lt-viec' });
  viec.append(el('a', {
    class: 'on-the', href: tiep ? '#/lt/b/' + tiep.b.so : '#/lt',
    onclick: (e) => { e.preventDefault(); if (tiep) di('#/lt/b/' + tiep.b.so); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '① Học bài mới' })),
    el('h3', { class: 'on-ten', text: tiep ? `Bài ${tiep.b.so} · ${tiep.b.ten}` : 'Đã học hết 50 bài 🎉' }),
    el('div', { class: 'on-phu', text: tiep ? `Chặng ${tiep.c.so} · ${tiep.b.hc.length} hoạt chất. Đọc từng thẻ, rồi bấm "Tự kiểm tra bài này".` : 'Chuyển sang ôn lại theo lịch và làm bài kiểm tra cuối chặng.' }),
    el('div', { class: 'on-goi', text: tiep ? 'Học ngay →' : '' })));
  viec.append(el('a', {
    class: 'on-the', href: '#/lt/on', onclick: (e) => { e.preventDefault(); di('#/lt/on'); },
  },
    el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '② Ôn thẻ tới hạn' })),
    el('h3', { class: 'on-ten', text: han.length ? `${han.length} thẻ tới hạn` : 'Không có thẻ nào tới hạn' }),
    el('div', { class: 'on-phu', text: han.length ? 'Trộn lẫn mọi nhóm. Che thẻ, tự nhớ lại, rồi tự chấm.' : 'Lịch ôn tự tính: nhớ thì giãn 1 → 3 → 7 → 14 → 30 ngày, quên thì gặp lại sau 10 phút.' }),
    el('div', { class: 'on-goi', text: han.length ? 'Ôn ngay →' : '' })));
  boc.append(viec);

  // Chặng
  boc.append(el('h2', { class: 'khu-de', text: 'Các chặng', style: 'margin-top:18px' }));
  const ds = el('div', { class: 'ds' });
  ds.append(hangMuc('🔤', 'Chặng 0 — Đuôi tên', `Nhìn tên đoán nhóm · giúp đoán nhóm của ${soVN(LT.coDuoi)} thuốc`, '#/lt/duoi', di));
  for (const c of LT.chang) {
    const hcC = c.bai.flatMap(hcCua);
    const hocC = hcC.filter(daHoc).length, thuocC = hcC.filter(daThuoc).length;
    const kt = ketQuaKT(c.so);
    ds.append(hangMuc(kt?.dat ? '✅' : '📘', `Chặng ${c.so} — hoạt chất #${c.tu}–${c.den}`,
      `${c.bai.length} bài · đã học ${hocC}/${hcC.length} · thuộc ${thuocC}` + (kt?.lan ? ` · kiểm tra ${kt.diem}%` : ''),
      '#/lt/c/' + c.so, di, thanh(thuocC, hcC.length, 'nho')));
  }
  ds.append(hangMuc('🌿', 'Nhánh dược liệu', `${LT.duocLieu.length} vị hay gặp nhất`, '#/lt/dl', di));
  ds.append(hangMuc('🔗', 'Phối hợp hay gặp', `${LT.phoi.length} cặp / bộ hoạt chất`, '#/lt/phoi', di));
  boc.append(ds);
  boc.append(el('p', { class: 'ct-meta', text: `Dữ liệu Long Châu ngày ${LT.ngay} · cùng nội dung với tài liệu PDF "Nhận biết thuốc Long Châu".` }));
  return boc;
}

function hangMuc(icon, ten, phu, dich, di, phai) {
  return el('a', { class: 'ds-hang', href: dich, onclick: (e) => { e.preventDefault(); di(dich); } },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: icon }),
    el('span', { class: 'ds-chu' }, el('span', { class: 'ds-ten', text: ten }), phu ? el('span', { class: 'ds-phu', text: phu }) : null),
    phai || null,
    el('span', { class: 'ds-mui', text: '›' }));
}

// ---------------------------------------------------------------------------
// CHẶNG
function trangChang(ctx, so) {
  const { di } = ctx;
  const c = LT.chang.find(x => x.so === so);
  if (!c) return trangKhong(ctx);
  ctx.veDau('Chặng ' + so, ctx.nutQuayLai('#/lt'));
  const boc = el('div', { class: 'trang trang-vao' });
  const luy = LT.chang.filter(x => x.so <= so).reduce((s, x) => s + x.bai.reduce((t, b) => t + b.hc.length, 0), 0);
  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: `Chặng ${so} — hoạt chất #${c.tu}–${c.den}` }),
    el('div', { class: 'nhom-so', text: `Học xong (cộng dồn ${luy} hoạt chất): nhận ra trọn vẹn ${soVN(c.phu)}/${soVN(LT.tong)} thuốc = ${pt(c.phu, LT.tong)}` })));
  const kt = ketQuaKT(so);
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/lt/kt/' + so), text: '📝 Kiểm tra cuối chặng' })));
  if (kt?.lan) {
    boc.append(el('p', { class: 'the-chu', text: `Lần kiểm tra gần nhất: ${kt.diem}% — ${kt.dat ? 'ĐẠT, sang chặng mới được.' : 'chưa đạt 80%, ôn lại các bài có câu sai.'} (đã làm ${kt.lan} lần)` }));
  }
  const ds = el('div', { class: 'ds', style: 'margin-top:14px' });
  for (const b of c.bai) {
    const hs = hcCua(b);
    const hocB = hs.filter(daHoc).length, thuocB = hs.filter(daThuoc).length;
    ds.append(hangMuc(hocB === hs.length ? (thuocB === hs.length ? '✅' : '📗') : hocB ? '📖' : '📕',
      `Bài ${b.so} · ${b.ten}`, `đã học ${hocB}/${hs.length} · thuộc ${thuocB}`, '#/lt/b/' + b.so, di, thanh(thuocB, hs.length, 'nho')));
  }
  boc.append(ds);
  return boc;
}

// ---------------------------------------------------------------------------
// BÀI: đọc 20 thẻ rồi tự kiểm tra
function trangBai(ctx, so) {
  const { di } = ctx;
  const g = LT.baiTheoSo.get(so);
  if (!g) return trangKhong(ctx);
  const { b, c } = g;
  ctx.veDau('Bài ' + so, ctx.nutQuayLai('#/lt/c/' + c.so), el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di('#/lt/on/b/' + so), text: '🧠 Tự kiểm tra',
  }));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: `Bài ${so} · ${b.ten}` }),
    el('div', { class: 'nhom-so', text: `Chặng ${c.so} · ${b.hc.length} hoạt chất. Đọc từng thẻ và cố hiểu vì sao; xong bấm "Tự kiểm tra bài này".` })));
  let nhomTruoc = null;
  for (const x of hcCua(b)) {
    if (x.nhom[0] !== nhomTruoc) {
      boc.append(el('h2', { class: 'khu-de', text: x.nhom[0], style: 'margin-top:14px' }));
      nhomTruoc = x.nhom[0];
    }
    boc.append(theHc(x, di));
  }
  const sau = LT.baiTheoSo.get(so + 1);
  boc.append(el('div', { class: 'the-nut', style: 'margin-top:16px' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/lt/on/b/' + so), text: '🧠 Tự kiểm tra bài này' }),
    sau ? el('button', { class: 'nut', onclick: () => di('#/lt/b/' + (so + 1)), text: `Bài ${so + 1} →` }) : null));
  return boc;
}

// ---------------------------------------------------------------------------
// THẺ LẬT: tự kiểm tra một bài / nhánh dược liệu, hoặc ôn các thẻ tới hạn (trộn mọi nhóm)
// nguon: { bai: số bài } · { dl: true } · {} = thẻ tới hạn
function trangThe(ctx, nguon) {
  const { di } = ctx;
  const g = nguon.bai ? LT.baiTheoSo.get(nguon.bai) : null;
  if (nguon.bai && !g) return trangKhong(ctx);
  const quayVe = g ? '#/lt/b/' + nguon.bai : nguon.dl ? '#/lt/dl' : '#/lt';
  const soBai = g ? nguon.bai : null;
  ctx.veDau(g ? 'Tự kiểm tra bài ' + nguon.bai : nguon.dl ? 'Tự kiểm tra dược liệu' : 'Ôn thẻ tới hạn', ctx.nutQuayLai(quayVe));
  const boc = el('div', { class: 'trang trang-vao' });
  const khung = el('div', { class: 'on-khung' });
  let bo = xaoMang(g ? [...hcCua(g.b)] : nguon.dl ? LT.duocLieu.map(i => LT.hc[i]) : dsDenHan());
  let viTri = 0, nho = 0, quen = 0, lat = false, dangGhi = false;
  const quen_lai = [];

  const ve = () => {
    khung.innerHTML = '';
    if (!bo.length) {
      khung.append(trong('🌱', 'Không có thẻ nào tới hạn', 'Đúng lịch gặp lại mới nhớ lâu. Học bài mới hoặc quay lại sau.'),
        el('div', { class: 'on-nut' }, el('button', { class: 'nut nut-chinh', onclick: () => di('#/lt'), text: 'Về Lộ trình' })));
      return;
    }
    if (viTri >= bo.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: quen ? '💪' : '🎉' }),
        el('h3', { text: 'Xong lượt này' }),
        el('p', { class: 'the-chu', text: `Nhớ ${nho} · quên ${quen} trên ${bo.length} thẻ.` }),
        quen ? el('p', { class: 'the-chu', text: 'Thẻ quên sẽ gặp lại sau 10 phút. Muốn ôn luôn thì bấm dưới.' }) : null,
        el('div', { class: 'on-nut' },
          quen ? el('button', { class: 'nut', onclick: () => { bo = xaoMang([...quen_lai]); quen_lai.length = 0; viTri = 0; nho = 0; quen = 0; lat = false; ve(); }, text: `Ôn lại ${quen} thẻ quên` }) : null,
          el('button', { class: 'nut nut-chinh', onclick: () => di(quayVe), text: soBai ? 'Về bài' : nguon.dl ? 'Về dược liệu' : 'Về Lộ trình' }))));
      return;
    }
    const x = bo[viTri];
    const m = td(x)?.lan ? td(x).mucDo || 0 : 0;
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', text: '●'.repeat(m) + '○'.repeat(NHAC_LAI.length - 1 - m) })));
    const the = el('div', { class: 'the-lat lt-lat', onclick: () => { if (!lat) { lat = true; ve(); } } });
    // Lọc ô trống trước khi append: append(null) của trình duyệt in ra chữ "null" trên thẻ
    the.append(...[el('div', { class: 'the-nhan', text: 'Hoạt chất' + (x.hang ? ' #' + x.hang : '') }),
      el('h2', { class: 'the-hoi', text: x.ten }),
      x.khac.length ? el('div', { class: 'lt-hg', text: 'Cũng ghi là: ' + x.khac.join(', ') }) : null].filter(Boolean));
    if (!lat) {
      the.append(el('div', { class: 'lt-goi-y', text: 'Tự nói ra: nhóm · công dụng · kê đơn hay không · dạng bào chế · 1 biệt dược' }),
        el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }));
    } else {
      the.style.cursor = 'default';
      the.append(el('div', { class: 'lt-sau' }, el('div', { class: 'lt-dong' }, nhanRx(x), el('span', { class: 'lt-so', text: x.so + ' thuốc' })),
        ...noiDungThe(x, null)));
    }
    khung.append(the);
    if (lat) {
      const tra = async (ok) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          await ghiNho(x, ok);
          if (ok) nho++; else { quen++; quen_lai.push(x); }
          viTri++; lat = false; ve(); window.scrollTo(0, 0);
        } finally { dangGhi = false; }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa nhớ', onclick: () => tra(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã nhớ', onclick: () => tra(true) })));
      const moi = Math.min(NHAC_LAI.length - 1, (td(x)?.mucDo || 0) + 1);
      khung.append(el('div', { class: 'on-hen', text: `Nhớ → gặp lại sau ${TEN_HAN[moi]} · Quên → sau ${TEN_HAN[0]}` }));
    }
  };
  boc.append(khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// KIỂM TRA CUỐI CHẶNG — trắc nghiệm trộn 3 phần như tài liệu:
//   A biệt dược → hoạt chất · B hoạt chất → nhóm · C hoạt chất → kê đơn hay không
const DAT = 0.8;

function taoDe(c) {
  const hs = c.bai.flatMap(hcCua);
  const n = Math.round(CAU_HINH.LT_SO_CAU_KIEM_TRA / 3);
  const cau = [];
  // A — tên biệt dược không chứa tên hoạt chất, mỗi hoạt chất 1 câu
  const da = new Set();
  for (const [ten, hang, i] of xaoMang([...c.ktA])) {
    if (da.has(i)) continue;
    da.add(i);
    const x = LT.hc[i];
    const nhieu = xaoMang(hs.filter(y => y !== x && y.nhom[0] === x.nhom[0])).concat(xaoMang(hs.filter(y => y.nhom[0] !== x.nhom[0])))
      .filter((y, j, arr) => arr.findIndex(z => z.ten === y.ten) === j).slice(0, 3);
    if (nhieu.length < 3) continue;
    cau.push({ loai: 'Biệt dược → hoạt chất', hoi: `${ten} (${hang})`, de: 'Chứa hoạt chất gì?', x,
      lua: xaoMang([{ chu: x.ten, dung: true }, ...nhieu.map(y => ({ chu: y.ten }))]) });
    if (cau.length >= n) break;
  }
  // B — hoạt chất → nhóm (nhóm dược lý theo đuôi nếu có, không thì nhóm con của Long Châu)
  const nhomCua = (y) => y.duoi ? y.duoi[1] : y.nhom[1];
  const moiNhom = [...new Set(hs.map(nhomCua))];
  for (const x of xaoMang([...hs]).slice(0, n * 3)) {
    const dung = nhomCua(x);
    const nhieu = xaoMang(moiNhom.filter(t => t !== dung && !t.startsWith('('))).slice(0, 3);
    if (nhieu.length < 3 || dung.startsWith('(')) continue;
    cau.push({ loai: 'Hoạt chất → nhóm', hoi: x.ten, de: 'Thuộc nhóm nào?', x,
      lua: xaoMang([{ chu: dung, dung: true }, ...nhieu.map(t => ({ chu: t }))]) });
    if (cau.filter(q => q.loai === 'Hoạt chất → nhóm').length >= n) break;
  }
  // C — kê đơn hay không (chỉ hỏi chất rõ ràng: ≥ 90% hoặc ≤ 10% sản phẩm kê đơn)
  for (const x of xaoMang(hs.filter(y => y.rx >= 90 || y.rx <= 10)).slice(0, n)) {
    cau.push({ loai: 'Kê đơn hay không', hoi: x.ten, de: 'Thuốc chứa hoạt chất này thường là…', x,
      lua: [{ chu: '℞ Kê đơn', dung: x.rx >= 90 }, { chu: 'Không kê đơn', dung: x.rx <= 10 }] });
  }
  return xaoMang(cau);
}

function trangKiemTra(ctx, so) {
  const { di } = ctx;
  const c = LT.chang.find(x => x.so === so);
  if (!c) return trangKhong(ctx);
  ctx.veDau('Kiểm tra chặng ' + so, ctx.nutQuayLai('#/lt/c/' + so));
  const boc = el('div', { class: 'trang trang-vao' });
  const khung = el('div', { class: 'on-khung' });
  let de = taoDe(c), viTri = 0, dung = 0, chon = null, sai = [];

  const ve = () => {
    khung.innerHTML = '';
    if (viTri >= de.length) {
      const diem = Math.round(100 * dung / de.length);
      const dat = diem >= DAT * 100;
      suaTienDoMuc('ltkt:' + so, cu => ({ mucDo: 0, honLai: 0, ...(cu || {}), lan: (cu?.lan || 0) + 1, lanCuoi: Date.now(), diem, dat: dat || !!cu?.dat }))
        .catch(() => { /* chỉ mất phần ghi điểm */ });
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: dat ? '🏆' : '💪' }),
        el('h3', { text: `${diem}% — ${dat ? 'ĐẠT' : 'chưa đạt 80%'}` }),
        el('p', { class: 'the-chu', text: `Đúng ${dung}/${de.length} câu. ${dat ? 'Sang chặng tiếp theo được rồi.' : 'Ôn lại các hoạt chất dưới đây rồi làm lại.'}` })));
      if (sai.length) {
        khung.append(el('h2', { class: 'khu-de', text: 'Câu sai — ôn lại', style: 'margin-top:10px' }));
        for (const x of [...new Set(sai)]) khung.append(theHc(x, di));
      }
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', onclick: () => di('#/lt/c/' + so), text: 'Về chặng' }),
        el('button', { class: 'nut nut-chinh', onclick: () => { de = taoDe(c); viTri = 0; dung = 0; chon = null; sai = []; ve(); }, text: 'Làm đề khác' })));
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
        onclick: () => {
          if (chon !== null) return;
          chon = i;
          if (l.dung) dung++; else sai.push(q.x);
          ve();
        },
      }, el('span', { class: 'dm-lua-chu', text: 'ABCD'[i] }), el('span', { text: l.chu })));
    });
    khung.append(luaBoc);
    if (chon !== null) {
      khung.append(theHc(q.x, null));
      khung.append(el('div', { class: 'on-nut' }, el('button', {
        class: 'nut nut-chinh', text: viTri + 1 < de.length ? 'Câu tiếp →' : 'Xem kết quả',
        onclick: () => { viTri++; chon = null; ve(); window.scrollTo(0, 0); },
      })));
    }
  };
  boc.append(el('p', { class: 'the-chu', text: `${de.length} câu trộn 3 phần như tài liệu. Đạt từ 80% thì sang chặng mới. Không nhìn lại bài khi làm.` }), khung);
  ve();
  return boc;
}

// ---------------------------------------------------------------------------
// MỘT HOẠT CHẤT + các thuốc chứa nó (lấy từ danh mục)
function trangMotHc(ctx, i) {
  const { di } = ctx;
  const x = LT.hc[i];
  if (!x) return trangKhong(ctx);
  ctx.veDau('Hoạt chất', ctx.nutQuayLai());
  const boc = el('div', { class: 'trang trang-vao' }, theHc(x, null));
  const noi = el('div', {}, el('p', { class: 'the-chu', text: 'Đang nạp danh mục…' }));
  boc.append(el('h2', { class: 'khu-de', text: `${x.so} thuốc chứa ${x.ten}`, style: 'margin-top:16px' }), noi);
  napDanhMuc().then(() => {
    noi.innerHTML = '';
    const ds = x.sku.map(thuocTheoSku).filter(Boolean);
    const khung = el('div', { class: 'ds' });
    for (const t of ds) khung.append(hangThuoc(t, di));
    noi.append(khung);
  }).catch(e => { noi.innerHTML = ''; noi.append(el('p', { class: 'the-chu canh-bao', text: 'Chưa nạp được danh mục: ' + chuLoi(e) })); });
  return boc;
}

// ---------------------------------------------------------------------------
// CHẶNG 0 — ĐUÔI TÊN
function trangDuoi(ctx) {
  ctx.veDau('Chặng 0 — Đuôi tên', ctx.nutQuayLai('#/lt'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('p', { class: 'the-chu', text: 'WHO đặt tên hoạt chất (tên INN) theo quy tắc: các thuốc cùng nhóm dùng chung một đoạn tên. Học các đuôi dưới đây trước — gặp hoạt chất lạ vẫn đoán được nhóm. Số thuốc và % kê đơn được đếm trên danh mục Long Châu.' }));
  const ds = el('div', { class: 'ds' });
  for (const [nhan, nhom, so, rx, vd] of LT.duoi) {
    ds.append(el('div', { class: 'ds-hang lt-duoi-hang' + (nhom.includes('BẪY') ? ' bay' : '') },
      el('span', { class: 'lt-duoi-nhan', text: nhan }),
      el('span', { class: 'ds-chu' },
        el('span', { class: 'ds-ten', text: nhom }),
        el('span', { class: 'ds-phu', text: `${so} thuốc · ${rx}% kê đơn · ${vd.join(', ')}` }))));
  }
  boc.append(ds);
  const muc = (tieuDe, ...dong) => el('section', { class: 'ct-khoi', style: 'margin-top:12px' },
    el('h2', { class: 'ct-de', text: tieuDe }), el('ul', { class: 'lt-ul' }, ...dong.map(d => el('li', { html: d }))));
  boc.append(
    muc('Bẫy phải nhớ',
      '<b>Nystatin</b> có đuôi <i>-statin</i> nhưng là <b>thuốc kháng nấm</b>, không phải thuốc hạ mỡ máu.',
      '<b>Domperidon</b> có đuôi <i>-peridon</i> nhưng là <b>thuốc chống nôn</b>, không phải thuốc chống loạn thần như Risperidon.',
      '<b>L-Tyrosin</b> có đuôi <i>-osin</i> nhưng là <b>axit amin</b>, không phải thuốc tiền liệt tuyến như Tamsulosin.',
      '<b>"-mycin" không phải một họ</b>: <i>-thromycin</i> (Azithro-, Clarithro-, Erythro-) là macrolid; Neo-, Tobra-, Genta-, Amikacin là aminosid; Clinda-, Linco- là lincosamid; Vancomycin là glycopeptid.',
      '<b>"-azol" có bốn nghĩa</b>: <i>-conazol / -trimazol</i> kháng nấm · <i>-nidazol</i> kỵ khí, đơn bào · <i>-bendazol</i> tẩy giun · <i>-prazol</i> dạ dày.'),
    muc('Kháng sinh: ghi nhớ thêm',
      'Kháng sinh dùng đường toàn thân gần như chắc chắn là <b>thuốc kê đơn</b> (penicillin, cephalosporin, macrolid, quinolon, tetracyclin: 100% kê đơn trong danh mục).',
      '<b>Amoxicillin + acid clavulanic</b> là cặp phối hợp phổ biến nhất: clavulanic (và các chất đuôi <i>-bactam</i>) giúp kháng sinh không bị men β-lactamase của vi khuẩn phá huỷ.',
      'Tên cephalosporin <b>không</b> cho biết thế hệ — học đại diện: thế hệ 1 Cefalexin, Cefadroxil · thế hệ 2 Cefuroxim, Cefaclor, Cefprozil · thế hệ 3 Cefixim, Cefdinir, Cefpodoxim, Ceftriaxon · thế hệ 4 Cefepim.',
      '<b>Aminosid</b> uống hấp thu rất kém, nên ngoài bệnh viện chủ yếu gặp dạng nhỏ mắt, nhỏ tai, bôi da.'),
    muc('Dạng bào chế cho biết dùng ở đâu',
      'Đuôi tên cho biết thuốc <b>tác động thế nào</b>; dạng bào chế cho biết <b>dùng cho chỗ nào</b>. Ketoconazol kem → nấm da; Ketoconazol viên → nấm toàn thân.',
      'Corticoid (-son, -solon) có mặt ở kem bôi, thuốc nhỏ mắt, xịt mũi, viên uống, thuốc tiêm — nên Long Châu xếp chúng rải ở nhiều nhóm.'));
  return boc;
}

// ---------------------------------------------------------------------------
// NHÁNH DƯỢC LIỆU
function trangDuocLieu(ctx) {
  const { di } = ctx;
  ctx.veDau('Nhánh dược liệu', ctx.nutQuayLai('#/lt'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('p', { class: 'the-chu', text: 'Thuốc đông dược thường phối hợp nhiều vị, nên đừng học từng vị như tân dược: nhớ vị đó hay có trong nhóm thuốc nào là đủ để nhận ra.' }),
    el('div', { class: 'the-nut' }, el('button', {
      class: 'nut nut-chinh', text: '🧠 Tự kiểm tra nhánh dược liệu',
      onclick: () => di('#/lt/on/dl'),
    })));
  const ds = el('div', { class: 'ds', style: 'margin-top:12px' });
  LT.duocLieu.forEach((i, j) => {
    const x = LT.hc[i];
    const nh = (LT.dlNhom[i] || []).map(([n, s]) => `${n} (${s})`).join('; ');
    ds.append(hangMuc('🌿', `${j + 1}. ${x.ten}`, `${x.so} thuốc · ${nh}`, '#/lt/h/' + i, di, vach(x)));
  });
  boc.append(ds);
  return boc;
}

// ---------------------------------------------------------------------------
// PHỐI HỢP HAY GẶP
function trangPhoi(ctx) {
  const { di } = ctx;
  ctx.veDau('Phối hợp hay gặp', ctx.nutQuayLai('#/lt'));
  const boc = el('div', { class: 'trang trang-vao' });
  boc.append(el('p', { class: 'the-chu', text: '27% thuốc có từ 2 hoạt chất trở lên. Học các phối hợp này như một "cặp" — ở quầy thuốc chúng đi cùng nhau.' }));
  const ds = el('div', { class: 'ds' });
  for (const [tens, so, nhom, vd, sku] of LT.phoi) {
    ds.append(hangMuc('🔗', tens.join(' + '), `${so} thuốc · ${nhom} · vd: ${vd}`, '#/dm/t/' + sku, di));
  }
  boc.append(ds);
  return boc;
}

// ---------------------------------------------------------------------------
// CÁCH HỌC
function trangCach(ctx) {
  ctx.veDau('Cách học', ctx.nutQuayLai('#/lt'));
  const boc = el('div', { class: 'trang trang-vao' });
  const bang = el('div', { class: 'dm-bang' });
  let luy = 0;
  for (const c of LT.chang) {
    luy += c.bai.reduce((s, b) => s + b.hc.length, 0);
    bang.append(el('div', { class: 'dm-dong' }, el('span', { class: 'dm-nhan', text: `Chặng ${c.so} (${luy} hc)` }),
      el('span', { text: `nhận ra ${soVN(c.phu)} thuốc = ${pt(c.phu, LT.tong)}` })));
  }
  const muc = (tieuDe, ...noi) => el('section', { class: 'ct-khoi', style: 'margin-top:12px' }, el('h2', { class: 'ct-de', text: tieuDe }), ...noi);
  const ul = (...ds) => el('ul', { class: 'lt-ul' }, ...ds.map(d => el('li', { html: d })));
  boc.append(
    muc('Học đến đâu nhận ra đến đó', el('p', { class: 'ct-chu', text: `Long Châu có ${soVN(LT.tong)} thuốc. Học theo đúng thứ tự trong lộ trình thì mỗi bài mang lại nhiều nhất. Một thuốc được tính là "nhận ra" khi mọi hoạt chất của nó đều đã thuộc — đếm thật trên danh mục:` }), bang),
    muc('Mỗi hoạt chất học đúng 5 ý', ul('<b>Nhóm dược lý</b> — nhận qua đuôi tên (nếu có).', '<b>Công dụng chính</b> — một câu.',
      '<b>Kê đơn hay không</b> — nhãn đỏ / xanh / vàng.', '<b>Dạng bào chế hay gặp</b>.', '<b>1–3 biệt dược</b> bán ở Long Châu.'),
      el('p', { class: 'ct-chu', text: 'Không học liều, chống chỉ định ở giai đoạn này. Mục tiêu trước hết là nhận ra; kiến thức sâu học sau, theo từng nhóm.' })),
    muc('Mỗi ngày làm 3 việc', ul(
      `<b>Học 1 bài mới</b> (${LT.soMoiBai} hoạt chất). Đọc từng thẻ, rồi bấm <b>Tự kiểm tra bài này</b>: nhìn tên, tự nói 5 ý, lật thẻ, tự chấm.`,
      '<b>Ôn các thẻ tới hạn</b> — app tự tính lịch: nhớ thì gặp lại sau 1 → 3 → 7 → 14 → 30 ngày, quên thì sau 10 phút. Chấm thật lòng: chấm "đã nhớ" khi chưa nhớ chỉ làm lịch ôn sai.',
      '<b>Hết mỗi chặng</b> làm <b>Kiểm tra cuối chặng</b>. Đạt từ 80% thì sang chặng mới; chưa đạt thì ôn lại các hoạt chất sai.')),
    muc('Vì sao học như vậy', ul(
      '<b>Tự nhớ lại hiệu quả hơn đọc lại</b> (hiệu ứng kiểm tra — Roediger &amp; Karpicke, 2006).',
      '<b>Ôn giãn cách nhớ lâu hơn ôn dồn</b> (phân tích tổng hợp của Cepeda và cộng sự, 2006).',
      '<b>Học mới theo nhóm, ôn thì trộn</b>: bài gom các thuốc cùng nhóm; phần ôn và bài kiểm tra trộn lẫn các nhóm để luyện phân biệt (Rohrer &amp; Taylor, 2007; Kornell &amp; Bjork, 2008).',
      '<b>Tự hỏi "vì sao"</b> khi gặp điều lạ (vì sao aminosid hay ở dạng nhỏ mắt? — vì uống không hấp thu).')),
    el('p', { class: 'ct-meta', text: 'Nội dung lấy từ dữ liệu bán lẻ công khai của Long Châu — tài liệu học tham khảo, không thay tờ hướng dẫn sử dụng, Dược thư Quốc gia hay chỉ định của bác sĩ, dược sĩ.' }));
  return boc;
}

function trangKhong(ctx) {
  ctx.veDau('Không tìm thấy', ctx.nutQuayLai('#/lt'));
  return el('div', { class: 'trang' }, trong('🔎', 'Không có mục này trong lộ trình', null));
}

