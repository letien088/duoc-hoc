// Danh mục thuốc tham khảo — CHỈ ĐỌC, đi kèm app dưới dạng tệp tĩnh
// data/danhmuc.json (sinh từ nhathuoclongchau.com.vn bằng công cụ ở thư mục
// nhathuoclongchau/). Không nằm trong IndexedDB và không đồng bộ Drive: vài
// nghìn thuốc mà đổ vào sổ tay thì lẫn hết vào ghi chép của chính bạn, và mỗi
// lần đồng bộ phải đẩy lên cả mấy MB.
//
// Thứ DUY NHẤT của danh mục được lưu là dấu ★ và tiến độ trắc nghiệm, ghi vào
// bản ghi tiến độ ôn tập (khoá 'dm:<mã>') qua cửa trong ontap.js — nhờ vậy
// sao lưu / khôi phục / đồng bộ Drive tự mang theo.
//
// Muốn chép một thuốc sang sổ tay thì bấm "Chép vào Biệt dược": app mở form
// điền sẵn, bạn sửa rồi Lưu như mọi biệt dược khác.
import { CAU_HINH } from './config.js';
import { el, boDau, hoan, datMau, bao, chepChu, giaiMaUrl, chuLoi } from './util.js';
import { danhSach } from './store.js';
import { LICH_ON, tienDoMuc, tatCaTienDo, suaTienDoMuc, xaoMang } from './ontap.js';
import { khoiTrongKhoaHoc } from './khoahoc.js';
import { daNapHT, thuocHT, dayAnh, napHocThuoc } from './hocthuoc.js';

const MAU = '#0e8f8a';
const TEP = 'data/danhmuc.json';
const { NHAC_LAI, TEN_HAN, MUC_THUOC } = LICH_ON;

let DM = null;            // danh mục đã nạp
let _dangNap = null;
let _loiNap = null;

// ---------------------------------------------------------------------------
// NẠP DỮ LIỆU
export function daNap() { return !!DM; }

// Cho tab Lộ trình: lấy một thuốc trong danh mục theo mã SKU (null nếu chưa nạp / không có)
export function thuocTheoSku(sku) { return DM ? DM.theoSku.get(sku) || null : null; }

export function napDanhMuc() {
  if (DM) return Promise.resolve(DM);
  if (_dangNap) return _dangNap;
  _loiNap = null;
  _dangNap = fetch(TEP)
    .then(r => {
      if (!r.ok) throw new Error('Không tải được danh mục (HTTP ' + r.status + ').');
      return r.json();
    })
    .then(goi => { DM = dung(goi); _dangNap = null; return DM; })
    .catch(e => { _dangNap = null; _loiNap = e; throw e; });
  return _dangNap;
}

// Tệp lưu dạng mảng cho nhẹ; dựng lại thành đối tượng + các chỉ mục tra nhanh
function dung(goi) {
  const cot = goi.cot;
  const ds = goi.t.map((hang, i) => {
    const t = { i };
    cot.forEach((k, j) => { t[k] = hang[j]; });
    t.hc = t.hc || [];
    t.khoaTen = boDau(t.ten + ' ' + t.tenWeb + ' ' + t.hang);
    t.khoaHc = boDau(t.hoatChat);
    t.khoaCd = boDau(t.congDung);
    t.boHc = t.hc.slice().sort((a, b) => a - b).join(',');   // bộ hoạt chất, để so "cùng thành phần"
    return t;
  });
  const theoSku = new Map(ds.map(t => [t.sku, t]));
  const theoHc = goi.hc.map(() => []);
  const theoCon = new Map();
  for (const t of ds) {
    for (const h of t.hc) theoHc[h].push(t);
    const k = t.nhom + '/' + t.con;
    if (!theoCon.has(k)) theoCon.set(k, []);
    theoCon.get(k).push(t);
  }
  const sapTen = (a, b) => a.tenWeb.localeCompare(b.tenWeb, 'vi');
  for (const v of theoCon.values()) v.sort(sapTen);
  for (const v of theoHc) v.sort(sapTen);
  return {
    ngay: goi.ngay, nguon: goi.nguon, web: goi.web,
    nhom: goi.nhom, hc: goi.hc, khoaHcTen: goi.hc.map(boDau),
    ds, theoSku, theoHc, theoCon,
  };
}

// ---------------------------------------------------------------------------
// TÌM KIẾM — gõ không dấu, nhiều từ thì phải khớp đủ mọi từ.
// Xếp hạng: tên bắt đầu bằng từ khoá > có trong tên > có trong hoạt chất >
// chỉ có trong công dụng. Tìm "ho" mà thuốc ho nằm sau thuốc "bảo vệ hô hấp"
// thì vô dụng.
// Chuỗi trông như mã SKU: "00039516", "C052300000457" (1 chữ cái + dãy số), ít nhất 4 số.
// Chỉ khi đó mới so theo mã — gõ "paracetamol 500" thì vẫn tìm theo tên như thường.
export function laMaSku(q) { return /^[a-z]?\d{4,}$/i.test(String(q).trim()); }

export function timDM(q, gioiHan = Infinity) {
  if (!DM) return [];
  const tu = boDau(q).split(/\s+/).filter(Boolean);
  if (!tu.length) return [];
  const ma = laMaSku(q) ? String(q).trim().toLowerCase() : null;
  const ra = [];
  for (const t of DM.ds) {
    if (ma) {
      // khớp đúng mã xếp đầu, rồi tới mã chứa dãy số vừa gõ
      const s = t.sku.toLowerCase();
      if (s === ma) { ra.push({ t, hang: -2 }); continue; }
      if (s.includes(ma)) { ra.push({ t, hang: -1 }); continue; }
    }
    let hang = 0;
    for (const w of tu) {
      if (t.khoaTen.includes(w)) continue;
      if (t.khoaHc.includes(w)) { hang = Math.max(hang, 2); continue; }
      if (t.khoaCd.includes(w)) { hang = 3; continue; }
      hang = -1; break;
    }
    if (hang < 0) continue;
    if (hang === 0) hang = t.khoaTen.startsWith(tu[0]) ? 0 : 1;
    ra.push({ t, hang });
  }
  ra.sort((a, b) => a.hang - b.hang || a.t.tenWeb.length - b.t.tenWeb.length);
  return ra.slice(0, gioiHan).map(x => x.t);
}

// ---------------------------------------------------------------------------
// TIẾN ĐỘ + DẤU SAO (khoá 'dm:<sku>' trong bản ghi tiến độ ôn tập)
const khoa = (sku) => 'dm:' + sku;
function td(sku) { return tienDoMuc(khoa(sku)); }
function daHoc(sku) { const x = td(sku); return !!x && (x.lan || 0) > 0; }
function daThuocDM(sku) { const x = td(sku); return !!x && (x.lan || 0) > 0 && (x.mucDo || 0) >= MUC_THUOC; }
function denHanDM(sku) { const x = td(sku); return !!x && (x.lan || 0) > 0 && (x.honLai || 0) <= Date.now(); }
function coSao(sku) { return !!td(sku)?.sao; }

async function doiSao(sku) {
  // mucDo luôn là số: bản ghi thiếu nó bị ontap.chuanHoa coi là định dạng cũ
  const x = await suaTienDoMuc(khoa(sku), cu => ({
    mucDo: 0, lan: 0, honLai: 0, ...(cu || {}), sao: !cu?.sao, lanCuoi: Date.now(),
  }));
  return x.sao;
}

async function ghiKetQua(sku, dung) {
  return suaTienDoMuc(khoa(sku), cu => {
    // Cùng luật với trang Ôn tập: đúng thì lên một mức (lần đầu đúng → 1 ngày), sai về mức 0
    const mucDo = dung ? Math.min(NHAC_LAI.length - 1, (cu?.mucDo || 0) + 1) : 0;
    return {
      ...(cu || {}), mucDo, lan: (cu?.lan || 0) + 1,
      lanCuoi: Date.now(), honLai: Date.now() + NHAC_LAI[mucDo],
    };
  });
}

function thongKeDS(ds) {
  let hoc = 0, thuoc = 0, han = 0;
  for (const t of ds) {
    if (!daHoc(t.sku)) continue;
    hoc++;
    if (daThuocDM(t.sku)) thuoc++;
    if (denHanDM(t.sku)) han++;
  }
  return { tong: ds.length, hoc, thuoc, han };
}

// --- Kê đơn / Không kê đơn ------------------------------------------------
// t.keDon: 1 = kê đơn, 0 = không kê đơn, null = web không gắn loại.
// Bộ lọc nhớ lựa chọn giữa các trang (và giữa các lần mở app, trên máy này) —
// đang ôn nhóm OTC mà mỗi lần sang trang lại phải bấm lọc lại thì rất phiền.
const KHOA_LOC_RX = 'duoc_hoc_dm_loc_rx';
let locRx = (() => {
  try { const v = localStorage.getItem(KHOA_LOC_RX); return v === '1' ? 1 : v === '0' ? 0 : null; } catch (_) { return null; }
})();
function datLocRx(v) {
  locRx = v;
  try { v === null ? localStorage.removeItem(KHOA_LOC_RX) : localStorage.setItem(KHOA_LOC_RX, String(v)); } catch (_) { /* bỏ qua */ }
}
const quaLocRx = (ds) => locRx === null ? ds : ds.filter(t => t.keDon === locRx);
const demRx = (ds, v) => ds.reduce((s, t) => s + (t.keDon === v ? 1 : 0), 0);

function hangLocRx(ds, khiDoi) {
  const boc = el('div', { class: 'loc-hang' });
  const ve = () => {
    boc.innerHTML = '';
    for (const [v, ten] of [[null, 'Tất cả'], [1, '℞ Kê đơn'], [0, 'Không kê đơn']]) {
      boc.append(el('button', {
        class: 'loc-nut' + (locRx === v ? ' dang' : ''),
        text: ten + (ds && v !== null ? ' · ' + demRx(ds, v) : ''),
        onclick: () => { datLocRx(v); ve(); khiDoi(); },
      }));
    }
  };
  ve();
  return boc;
}

function nhanRx(t) {
  if (t.keDon === 1) return el('span', { class: 'dm-rx', text: 'Kê đơn' });
  if (t.keDon === 0) return el('span', { class: 'dm-otc', text: 'Không kê đơn' });
  return null;
}

function dsSao() {
  const ra = [];
  for (const [k, v] of Object.entries(tatCaTienDo())) {
    if (!v?.sao || !k.startsWith('dm:')) continue;
    const t = DM.theoSku.get(k.slice(3));
    if (t) ra.push(t);
  }
  return ra.sort((a, b) => a.tenWeb.localeCompare(b.tenWeb, 'vi'));
}

// ---------------------------------------------------------------------------
// TIỆN ÍCH HIỂN THỊ
const dinhGia = (n) => n ? Number(n).toLocaleString('vi-VN') + 'đ' : '';

function dsTrongNhom(n, c) {
  if (c !== undefined && c !== null) return DM.theoCon.get(n + '/' + c) || [];
  return DM.ds.filter(t => t.nhom === n);
}

function tenNhom(n) { return DM.nhom[n]?.ten || '(Chưa phân nhóm)'; }
function tenCon(n, c) { return DM.nhom[n]?.con[c] || '(Không có nhóm con)'; }

// "FUCAGI 500MG AGIMEXPHARM" -> "Fucagi 500mg Agimexpharm"
function tenGon(t) {
  return (t.ten || t.tenWeb).toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

function vachMuc(sku) {
  const x = td(sku);
  if (!x?.lan) return '';
  const m = x.mucDo || 0;
  return '●'.repeat(m) + '○'.repeat(NHAC_LAI.length - 1 - m);
}

export function hangThuoc(t, di) {
  const phu = [t.hoatChat, t.dang].filter(Boolean).join(' · ');
  const vach = vachMuc(t.sku);
  return el('a', {
    class: 'ds-hang', href: '#/dm/t/' + t.sku,
    onclick: (e) => { e.preventDefault(); di('#/dm/t/' + t.sku); },
  },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: '💊' }),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: (coSao(t.sku) ? '★ ' : '') + t.tenWeb }),
      el('span', { class: 'ds-phu' }, nhanRx(t), phu || '—'),
      vach ? el('span', { class: 'dm-vach', text: vach }) : null),
    el('span', { class: 'ds-mui', text: '›' }));
}

function hangLink(icon, ten, phu, dich, di, phai) {
  return el('a', {
    class: 'ds-hang', href: dich,
    onclick: (e) => { e.preventDefault(); di(dich); },
  },
    el('span', { class: 'ds-icon', style: `background:${MAU}1f`, text: icon }),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: ten }),
      phu ? el('span', { class: 'ds-phu', text: phu }) : null),
    phai || null,
    el('span', { class: 'ds-mui', text: '›' }));
}

function thanhTien(tk) {
  const pt = tk.tong ? tk.thuoc / tk.tong * 100 : 0;
  return el('span', { class: 'dm-tien', title: `Đã thuộc ${tk.thuoc}/${tk.tong}` },
    el('i', { style: `width:${pt.toFixed(1)}%` }));
}

// Danh sách dài vẽ theo đợt, như các trang danh sách khác của app
function dsTheoDot(ds, veHang) {
  const boc = el('div', {});
  let toiDa = CAU_HINH.VE_MOI_DOT;
  const ve = () => {
    boc.innerHTML = '';
    const khung = el('div', { class: 'ds' });
    for (const x of ds.slice(0, toiDa)) khung.append(veHang(x));
    boc.append(khung);
    const conLai = ds.length - Math.min(ds.length, toiDa);
    if (conLai > 0) {
      boc.append(el('div', { class: 'them-boc' }, el('button', {
        class: 'nut nut-them',
        onclick: () => {
          toiDa += CAU_HINH.VE_MOI_DOT;
          const y = window.scrollY; ve(); requestAnimationFrame(() => window.scrollTo(0, y));
        },
        text: `Hiện thêm — còn ${conLai} mục`,
      })));
    }
  };
  ve();
  return boc;
}

function oTimKiem(goiY, khiGo, giaTri = '') {
  const o = el('input', {
    class: 'o-tim', type: 'search', placeholder: goiY, value: giaTri,
    autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off',
  });
  o.addEventListener('input', hoan(() => khiGo(o.value.trim()), 130));
  return { o, boc: el('div', { class: 'tim-boc' }, el('span', { class: 'tim-kinh', text: '🔍' }), o) };
}

function trong(icon, tieuDe, chu) {
  return el('div', { class: 'trong' },
    el('div', { class: 'trong-icon', text: icon }),
    el('h3', { text: tieuDe }),
    chu ? el('p', { text: chu }) : null);
}

// ---------------------------------------------------------------------------
// ĐỊNH TUYẾN CỦA MỤC DANH MỤC. p = các đoạn sau '#/dm'
// ctx: { veDau, nutQuayLai, di, moNhap, veLai } — app.js cung cấp
export function trangDanhMuc(p, ctx) {
  datMau(MAU);
  if (!DM) {
    ctx.veDau('Danh mục thuốc', p.length ? ctx.nutQuayLai('#/dm') : null);
    const boc = el('div', { class: 'trang trang-vao' });
    if (_loiNap) {
      boc.append(trong('📡', 'Chưa nạp được danh mục', chuLoi(_loiNap)),
        el('div', { class: 'the-nut' }, el('button', {
          class: 'nut nut-chinh', text: 'Thử lại', onclick: () => { _loiNap = null; ctx.veLai(); },
        })));
      return boc;
    }
    boc.append(trong('📚', 'Đang nạp danh mục…', 'Lần đầu mất vài giây. Sau đó app giữ sẵn trong máy, không cần mạng.'));
    const hash = location.hash;
    napDanhMuc().then(() => { if (location.hash === hash) ctx.veLai(); },
      () => { if (location.hash === hash) ctx.veLai(); });
    return boc;
  }

  const [a, b, c] = p;
  if (!a)              return trangChinh(ctx, '');
  if (a === 'tim')     return trangChinh(ctx, giaiMaUrl(b));
  if (a === 'nhom')    return c !== undefined ? trangCon(ctx, +b, +c) : trangNhom(ctx, +b);
  if (a === 'hc')      return b !== undefined ? trangHoatChat(ctx, +b) : trangDsHoatChat(ctx);
  if (a === 'hcten')   return trangTheoTen(ctx, giaiMaUrl(b));
  if (a === 't')       return trangThuoc(ctx, b);
  if (a === 'sao')     return trangSao(ctx);
  if (a === 'on')      return trangTracNghiem(ctx, p.slice(1));
  return trangChinh(ctx, '');
}

// ---------------------------------------------------------------------------
// TRANG CHÍNH: tìm kiếm + cây nhóm + tiến độ
function trangChinh(ctx, qBanDau) {
  const { di } = ctx;
  ctx.veDau('Danh mục thuốc', null, el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di('#/dm/on'), text: '🧠 Kiểm tra',
  }));
  const boc = el('div', { class: 'trang trang-vao' });
  const noi = el('div', {});
  const coBan = el('div', {});

  let qNay = qBanDau;
  const veKQ = (q) => {
    qNay = q;
    noi.innerHTML = '';
    coBan.style.display = q ? 'none' : '';
    if (!q) return;
    const tatCa = timDM(q);
    const kq = quaLocRx(tatCa);
    noi.append(hangLocRx(tatCa, () => veKQ(qNay)));
    if (!kq.length) { noi.append(trong('🤔', 'Không tìm thấy', `Không thuốc nào khớp "${q}"${locRx === null ? '' : ' trong bộ lọc đang chọn'}. Gõ không dấu cũng được.`)); return; }
    noi.append(el('div', { class: 'khu-de', text: kq.length + ' thuốc' }), dsTheoDot(kq, t => hangThuoc(t, di)));
  };
  const { o, boc: timBoc } = oTimKiem('Tên thuốc, hoạt chất, công dụng, mã SKU…', (q) => {
    history.replaceState(null, '', q ? '#/dm/tim/' + encodeURIComponent(q) : '#/dm');
    veKQ(q);
  }, qBanDau);

  // --- Tiến độ chung
  const tk = thongKeDS(DM.ds);
  coBan.append(el('div', { class: 'dai' },
    el('div', { class: 'dai-o' }, el('div', { class: 'dai-num', text: DM.ds.length.toLocaleString('vi-VN') }), el('div', { class: 'dai-ten', text: 'Thuốc' })),
    el('div', { class: 'dai-o' }, el('div', { class: 'dai-num', text: String(tk.hoc) }), el('div', { class: 'dai-ten', text: 'Đã gặp' })),
    el('div', { class: 'dai-o' }, el('div', { class: 'dai-num', text: String(tk.thuoc) }), el('div', { class: 'dai-ten', text: 'Đã thuộc' }))));
  coBan.append(el('p', { class: 'dm-ghi' },
    el('span', { class: 'dm-rx', text: demRx(DM.ds, 1).toLocaleString('vi-VN') + ' kê đơn' }),
    el('span', { class: 'dm-otc', text: demRx(DM.ds, 0).toLocaleString('vi-VN') + ' không kê đơn' })));

  coBan.append(el('a', {
    class: 'on-the', href: '#/dm/on', onclick: (e) => { e.preventDefault(); di('#/dm/on'); },
  },
    el('div', { class: 'on-dau' }, el('span', {
      class: 'on-huy', text: tk.han ? `🧠 ${tk.han} thuốc tới hạn ôn lại` : '🧠 Trắc nghiệm',
    })),
    el('h3', { class: 'on-ten', text: tk.hoc ? 'Ôn tiếp danh mục' : 'Kiểm tra kiến thức thuốc' }),
    el('div', { class: 'on-phu', text: 'Thuốc → hoạt chất · Thuốc → nhóm · Công dụng → thuốc · Kê đơn hay không. Sai thì gặp lại sớm, đúng thì giãn lịch.' }),
    el('div', { class: 'on-goi', text: 'Bắt đầu →' })));

  const soSao = dsSao().length;
  coBan.append(el('div', { class: 'loc-hang' },
    el('button', { class: 'loc-nut', onclick: () => di('#/dm/hc'), text: '🧪 Tra theo hoạt chất (' + DM.hc.length + ')' }),
    el('button', { class: 'loc-nut', onclick: () => di('#/dm/sao'), text: '★ Đã đánh dấu (' + soSao + ')' })));

  // --- Cây nhóm
  coBan.append(el('h2', { class: 'khu-de', text: 'Nhóm thuốc' }));
  const ds = el('div', { class: 'ds' });
  DM.nhom.forEach((nh, n) => {
    const thuoc = dsTrongNhom(n);
    if (!thuoc.length) return;
    const t = thongKeDS(thuoc);
    ds.append(hangLink('📂', nh.ten,
      `${thuoc.length} thuốc · ${demRx(thuoc, 1)} kê đơn` + (t.hoc ? ` · thuộc ${t.thuoc}` : ''),
      '#/dm/nhom/' + n, di, thanhTien(t)));
  });
  coBan.append(ds);

  coBan.append(el('p', { class: 'ct-meta', text:
    `Nguồn: ${DM.nguon} · lấy ngày ${DM.ngay}. Tài liệu học tham khảo — không thay tờ hướng dẫn sử dụng, Dược thư hay chỉ định của bác sĩ.` }));

  boc.append(timBoc, noi, coBan);
  veKQ(qBanDau);
  if (qBanDau) setTimeout(() => o.focus(), 60);
  return boc;
}

// ---------------------------------------------------------------------------
// NHÓM CẤP 2 → danh sách nhóm con
function trangNhom(ctx, n) {
  const { di } = ctx;
  if (!DM.nhom[n]) return trangKhong(ctx);
  ctx.veDau(tenNhom(n), ctx.nutQuayLai('#/dm'));
  const boc = el('div', { class: 'trang trang-vao' });
  const tatCa = dsTrongNhom(n);
  const tk = thongKeDS(tatCa);

  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: tenNhom(n) }),
    el('div', { class: 'nhom-so', text: `${tatCa.length} thuốc (${demRx(tatCa, 1)} kê đơn · ${demRx(tatCa, 0)} không kê đơn) · đã thuộc ${tk.thuoc}` })));
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/dm/on/' + n), text: '🧠 Kiểm tra cả nhóm' })));

  boc.append(el('h2', { class: 'khu-de', text: 'Nhóm con', style: 'margin-top:16px' }));
  const ds = el('div', { class: 'ds' });
  DM.nhom[n].con.forEach((ten, c) => {
    const thuoc = dsTrongNhom(n, c);
    if (!thuoc.length) return;
    const t = thongKeDS(thuoc);
    ds.append(hangLink('📁', ten, `${thuoc.length} thuốc · ${demRx(thuoc, 1)} kê đơn` + (t.hoc ? ` · thuộc ${t.thuoc}` : ''),
      `#/dm/nhom/${n}/${c}`, di, thanhTien(t)));
  });
  boc.append(ds);

  // Hoạt chất hay gặp nhất trong nhóm — đọc lướt là biết nhóm này xoay quanh chất gì
  const dem = new Map();
  for (const t of tatCa) for (const h of t.hc) dem.set(h, (dem.get(h) || 0) + 1);
  const top = [...dem].sort((x, y) => y[1] - x[1]).slice(0, 24);
  if (top.length) {
    boc.append(el('h2', { class: 'khu-de', text: 'Hoạt chất hay gặp trong nhóm', style: 'margin-top:18px' }),
      el('div', { class: 'chip-boc' }, ...top.map(([h, so]) => el('a', {
        class: 'chip chip-lk', href: '#/dm/hc/' + h,
        onclick: (e) => { e.preventDefault(); di('#/dm/hc/' + h); },
      }, DM.hc[h] + ' · ' + so))));
  }
  return boc;
}

// NHÓM CON → danh sách thuốc
function trangCon(ctx, n, c) {
  const { di } = ctx;
  const ds = dsTrongNhom(n, c);
  ctx.veDau(tenCon(n, c), ctx.nutQuayLai('#/dm/nhom/' + n));
  const boc = el('div', { class: 'trang trang-vao' });
  const tk = thongKeDS(ds);
  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: tenCon(n, c) }),
    el('div', { class: 'nhom-so', text: `${tenNhom(n)} · ${ds.length} thuốc · đã thuộc ${tk.thuoc}` })));
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di(`#/dm/on/${n}/${c}`), text: '🧠 Kiểm tra nhóm này' })));

  const noi = el('div', {});
  let qNay = '';
  const ve = (q) => {
    qNay = q;
    noi.innerHTML = '';
    const loc = quaLocRx(q ? ds.filter(t => { const k = boDau(q); return t.khoaTen.includes(k) || t.khoaHc.includes(k) || t.khoaCd.includes(k); }) : ds);
    if (!loc.length) { noi.append(trong('🤔', 'Không tìm thấy', null)); return; }
    noi.append(dsTheoDot(loc, t => hangThuoc(t, di)));
  };
  const { boc: timBoc } = oTimKiem('Lọc trong nhóm…', ve);
  boc.append(el('div', { style: 'margin-top:14px' }, timBoc), hangLocRx(ds, () => ve(qNay)), noi);
  ve('');
  return boc;
}

// ---------------------------------------------------------------------------
// HOẠT CHẤT
function trangDsHoatChat(ctx) {
  const { di } = ctx;
  ctx.veDau('Theo hoạt chất', ctx.nutQuayLai('#/dm'));
  const boc = el('div', { class: 'trang trang-vao' });
  const tatCa = DM.hc.map((ten, h) => ({ h, ten, so: DM.theoHc[h].length }))
    .filter(x => x.so)
    .sort((x, y) => x.ten.localeCompare(y.ten, 'vi'));
  const noi = el('div', {});
  let sapTheo = 'ten';
  const locHang = el('div', { class: 'loc-hang' });
  const veLoc = (q) => {
    locHang.innerHTML = '';
    for (const [k, nhan] of [['ten', 'A → Z'], ['so', 'Nhiều biệt dược nhất']]) {
      locHang.append(el('button', {
        class: 'loc-nut' + (sapTheo === k ? ' dang' : ''), text: nhan,
        onclick: () => { sapTheo = k; veLoc(q); ve(q); },
      }));
    }
  };
  const ve = (q) => {
    noi.innerHTML = '';
    const k = boDau(q);
    let ds = k ? tatCa.filter(x => DM.khoaHcTen[x.h].includes(k)) : tatCa;
    if (sapTheo === 'so') ds = [...ds].sort((x, y) => y.so - x.so);
    if (!ds.length) { noi.append(trong('🧪', 'Không có hoạt chất này', null)); return; }
    noi.append(el('div', { class: 'khu-de', text: ds.length + ' hoạt chất' }),
      dsTheoDot(ds, x => hangLink('🧪', x.ten, x.so + ' biệt dược', '#/dm/hc/' + x.h, di)));
  };
  let qNay = '';
  const { boc: timBoc } = oTimKiem('Tìm hoạt chất…', (q) => { qNay = q; ve(q); });
  veLoc(qNay);
  boc.append(timBoc, locHang, noi);
  ve('');
  return boc;
}

function trangTheoTen(ctx, ten) {
  const k = boDau(ten);
  const h = DM.khoaHcTen.indexOf(k);
  if (h >= 0) return trangHoatChat(ctx, h);
  // Không trùng khít thì thả vào ô tìm kiếm cho người dùng tự chọn
  return trangChinh(ctx, ten);
}

function trangHoatChat(ctx, h) {
  const { di } = ctx;
  const ten = DM.hc[h];
  if (ten === undefined) return trangKhong(ctx);
  const ds = DM.theoHc[h];
  ctx.veDau('Hoạt chất', ctx.nutQuayLai('#/dm/hc'));
  const boc = el('div', { class: 'trang trang-vao' });

  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: ten }),
    el('div', { class: 'nhom-so', text: `${ds.length} biệt dược trong danh mục · ${demRx(ds, 1)} kê đơn · ${demRx(ds, 0)} không kê đơn` })));

  // Nối sang sổ tay: đã có dược chất này thì mở ra, chưa có thì tạo sẵn
  const cuaToi = danhSach('duocchat').find(r => boDau(r.ten) === boDau(ten) || boDau(r.tenKhac) === boDau(ten));
  const nhomHay = demNhieuNhat(ds.map(t => tenCon(t.nhom, t.con)));
  boc.append(el('div', { class: 'the-nut' },
    cuaToi
      ? el('button', { class: 'nut', onclick: () => di('#/duocchat/' + cuaToi.id), text: '📒 Mở trong sổ tay' })
      : el('button', {
        class: 'nut', text: '＋ Thêm vào sổ tay dược chất',
        onclick: () => ctx.moNhap('duocchat', { ten, nhom: nhomHay || '', nguon: 'Danh mục ' + DM.nguon }),
      })));

  // Phân bố theo nhóm: cùng một chất mà nằm ở mấy nhóm khác nhau là điều đáng học
  const theoNhom = new Map();
  for (const t of ds) {
    const k = tenNhom(t.nhom) + ' › ' + tenCon(t.nhom, t.con);
    theoNhom.set(k, (theoNhom.get(k) || 0) + 1);
  }
  boc.append(el('section', { class: 'ct-khoi', style: 'margin-top:14px' },
    el('h2', { class: 'ct-de', text: 'Có mặt trong nhóm' }),
    el('div', { class: 'chip-boc' }, ...[...theoNhom].sort((x, y) => y[1] - x[1])
      .map(([k, so]) => el('span', { class: 'chip', text: k + ' · ' + so })))));

  // Dạng bào chế
  const dang = new Map();
  for (const t of ds) if (t.dang) dang.set(t.dang, (dang.get(t.dang) || 0) + 1);
  if (dang.size) {
    boc.append(el('section', { class: 'ct-khoi' },
      el('h2', { class: 'ct-de', text: 'Dạng bào chế' }),
      el('div', { class: 'chip-boc' }, ...[...dang].sort((x, y) => y[1] - x[1])
        .map(([k, so]) => el('span', { class: 'chip', text: k + ' · ' + so })))));
  }

  const noi = el('div', {});
  const veDS = () => {
    noi.innerHTML = '';
    const loc = quaLocRx(ds);
    noi.append(loc.length ? dsTheoDot(loc, t => hangThuoc(t, di)) : trong('💊', 'Không có biệt dược nào trong bộ lọc này', null));
  };
  boc.append(el('h2', { class: 'khu-de', text: 'Biệt dược chứa ' + ten, style: 'margin-top:16px' }),
    hangLocRx(ds, veDS), noi);
  veDS();
  return boc;
}

function demNhieuNhat(ds) {
  const m = new Map();
  for (const x of ds) if (x) m.set(x, (m.get(x) || 0) + 1);
  let tot = null, so = 0;
  for (const [k, v] of m) if (v > so) { tot = k; so = v; }
  return tot;
}

// ---------------------------------------------------------------------------
// CHI TIẾT MỘT THUỐC
function trangThuoc(ctx, sku) {
  const { di } = ctx;
  const t = DM.theoSku.get(sku);
  if (!t) return trangKhong(ctx);
  ctx.veDau('Thuốc', ctx.nutQuayLai());
  const boc = el('div', { class: 'trang trang-vao' });
  const ct = el('div', { class: 'ct' });

  ct.append(el('div', {
    class: 'ct-dinh',
    style: 'background:var(--acc);background:linear-gradient(140deg, var(--acc), color-mix(in srgb, var(--acc) 62%, #000))',
  },
    el('div', { class: 'ct-dinh-icon', text: '💊' }),
    el('h1', { class: 'ct-ten', text: t.tenWeb }),
    el('div', { class: 'ct-phu', text: [t.ten, t.quyCach].filter(Boolean).join(' · ') })));

  // Ảnh hộp thuốc + lối sang thẻ học — chỉ có với thuốc nằm trong dữ liệu Học thuốc (toa + Bộ HV + 700)
  const oAnh = el('div', {});
  const veAnh = () => {
    if (!thuocHT(t.sku)) return;
    oAnh.append(dayAnh(t.sku), el('div', { class: 'cc-hang', style: 'margin:8px 0 12px' }, el('button', {
      class: 'cc-nut', onclick: () => di('#/ht/t/' + t.sku), text: '💊 Mở thẻ học thuốc này',
    })));
  };
  if (daNapHT()) veAnh(); else napHocThuoc().then(() => { if (oAnh.isConnected) veAnh(); }).catch(() => { /* chỉ thiếu ảnh */ });
  ct.append(oAnh);

  const khoi = (de, noiDung) => el('section', { class: 'ct-khoi' }, el('h2', { class: 'ct-de', text: de }), noiDung);
  const chu = (s) => el('div', { class: 'ct-chu', text: s });

  if (t.keDon === 1 || t.keDon === 0) {
    ct.append(el('div', { class: 'dm-loai ' + (t.keDon ? 'rx' : 'otc') },
      el('b', { text: t.keDon ? '℞ Thuốc kê đơn' : '✓ Thuốc không kê đơn' }),
      el('span', { text: t.keDon ? 'Chỉ bán khi có đơn của bác sĩ.' : 'Mua được không cần đơn, nên có tư vấn của dược sĩ.' })));
  }

  if (t.hoatChat) {
    ct.append(khoi('Hoạt chất', el('div', {},
      chu(t.hoatChat),
      t.hc.length ? el('div', { class: 'chip-boc', style: 'margin-top:8px' }, ...t.hc.map(h => el('a', {
        class: 'chip chip-lk', href: '#/dm/hc/' + h,
        onclick: (e) => { e.preventDefault(); di('#/dm/hc/' + h); },
      }, DM.hc[h], el('span', { class: 'chip-mui', text: '›' })))) : null)));
  }
  if (t.congDung) ct.append(khoi('Công dụng', chu(t.congDung)));

  ct.append(khoi('Phân loại', el('div', { class: 'chip-boc' },
    el('a', { class: 'chip chip-lk', href: '#/dm/nhom/' + t.nhom, onclick: (e) => { e.preventDefault(); di('#/dm/nhom/' + t.nhom); } }, tenNhom(t.nhom)),
    el('a', { class: 'chip chip-lk', href: `#/dm/nhom/${t.nhom}/${t.con}`, onclick: (e) => { e.preventDefault(); di(`#/dm/nhom/${t.nhom}/${t.con}`); } }, tenCon(t.nhom, t.con)))));

  const bang = [
    ['Loại thuốc', t.keDon === 1 ? 'Kê đơn' : t.keDon === 0 ? 'Không kê đơn' : ''],
    ['Dạng bào chế', t.dang], ['Quy cách', t.quyCach], ['Thương hiệu', t.hang],
    ['Xuất xứ', t.xuatXu], ['Giá tham khảo', t.gia ? dinhGia(t.gia) + (t.donVi ? ' / ' + t.donVi : '') : ''],
    ['Mã SKU', t.sku],
  ].filter(([, v]) => v);
  ct.append(khoi('Thông tin sản phẩm', el('div', { class: 'dm-bang' },
    ...bang.map(([k, v]) => el('div', { class: 'dm-dong' },
      el('span', { class: 'dm-nhan', text: k }),
      k === 'Mã SKU' ? nutChepMa(t.sku) : el('span', { text: String(v) }))))));
  boc.append(ct);

  // --- Công cụ
  const mucHt = td(t.sku);
  const nutSao = el('button', {
    class: 'cc-nut' + (coSao(t.sku) ? ' cc-dang' : ''),
    text: (coSao(t.sku) ? '★' : '☆') + ' Đánh dấu',
    onclick: async () => {
      const sao = await doiSao(t.sku);
      nutSao.className = 'cc-nut' + (sao ? ' cc-dang' : '');
      nutSao.textContent = (sao ? '★' : '☆') + ' Đánh dấu';
      bao(sao ? 'Đã đánh dấu để ôn kỹ.' : 'Đã bỏ đánh dấu.');
    },
  });
  boc.append(el('div', { class: 'cc-hang' },
    nutSao,
    el('button', { class: 'cc-nut', onclick: () => ctx.moNhap('bietduoc', banBietDuoc(t)), text: '📦 Chép vào Biệt dược' }),
    DM.web && t.slug ? el('a', { class: 'cc-nut', href: DM.web + t.slug, target: '_blank', rel: 'noopener', text: '🌐 Xem trên web' }) : null));
  if (mucHt?.lan) {
    boc.append(el('p', { class: 'ct-meta', text:
      `Trắc nghiệm: ${mucHt.lan} lần · mức ${vachMuc(t.sku)} · ` +
      ((mucHt.honLai || 0) <= Date.now() ? 'đang tới hạn ôn' : 'gặp lại sau ' + conLai(mucHt.honLai)) }));
  }

  // --- Thuốc này có trong bộ data của khoá học không (nhóm, biệt dược tương đương theo giảng viên)
  boc.append(khoiTrongKhoaHoc(t.sku, di));

  // --- Cùng thành phần: cùng bộ hoạt chất, khác hãng — "biệt dược tương đương"
  if (t.boHc) {
    const cung = DM.ds.filter(x => x !== t && x.boHc === t.boHc);
    if (cung.length) {
      boc.append(el('h2', { class: 'khu-de', text: `Cùng thành phần (${cung.length})`, style: 'margin-top:18px' }),
        dsTheoDot(cung, x => hangThuoc(x, di)));
    }
  }
  // --- Cùng nhóm con, khác thành phần: để so sánh các lựa chọn cho cùng một vấn đề
  const khac = dsTrongNhom(t.nhom, t.con).filter(x => x !== t && x.boHc !== t.boHc);
  if (khac.length) {
    const vai = xaoMang([...khac]).slice(0, 8);
    boc.append(el('h2', { class: 'khu-de', text: `Cùng nhóm "${tenCon(t.nhom, t.con)}", khác thành phần`, style: 'margin-top:18px' }),
      el('div', { class: 'ds' }, ...vai.map(x => hangThuoc(x, di))),
      khac.length > vai.length ? el('div', { class: 'them-boc' }, el('button', {
        class: 'nut nut-them', onclick: () => di(`#/dm/nhom/${t.nhom}/${t.con}`),
        text: `Xem cả ${khac.length + 1} thuốc trong nhóm →`,
      })) : null);
  }
  return boc;
}

// Mã SKU chạm là chép. Chép hỏng (trình duyệt chặn) thì chữ vẫn chọn trọn được
// bằng chạm giữ — user-select: all trong CSS.
function nutChepMa(sku) {
  let hen = null;
  const nut = el('button', {
    class: 'dm-chep', type: 'button', 'aria-label': 'Chép mã SKU ' + sku,
    onclick: async () => {
      const ok = await chepChu(sku);
      if (!ok) { bao('Không chép được. Chạm giữ vào mã để tự chọn và sao chép.', 'loi'); return; }
      // chép xong thì bỏ vệt tô chọn (user-select: all tô cả mã khi chạm)
      try { window.getSelection().removeAllRanges(); } catch (_) { /* bỏ qua */ }
      nut.classList.add('da');
      nut.lastChild.textContent = '✓ Đã chép';
      bao('Đã chép mã SKU ' + sku);
      clearTimeout(hen);
      hen = setTimeout(() => { nut.classList.remove('da'); nut.lastChild.textContent = '⧉ Chép'; }, 1800);
    },
  }, el('span', { class: 'dm-chep-ma', text: sku }), el('span', { class: 'dm-chep-nhan', text: '⧉ Chép' }));
  return nut;
}

function conLai(ts) {
  const ms = ts - Date.now();
  if (ms < 3600e3) return Math.max(1, Math.round(ms / 60e3)) + ' phút';
  if (ms < 86400e3) return Math.round(ms / 3600e3) + ' giờ';
  return Math.round(ms / 86400e3) + ' ngày';
}

// Bản nháp biệt dược điền sẵn từ danh mục. Nối luôn vào dược chất trong sổ
// tay nếu tên hoạt chất trùng khít — khỏi phải chọn tay từng cái.
function banBietDuoc(t) {
  const dc = danhSach('duocchat');
  const ids = [];
  for (const h of t.hc) {
    const k = DM.khoaHcTen[h];
    const r = dc.find(x => boDau(x.ten) === k || boDau(x.tenKhac) === k);
    if (r && !ids.includes(r.id)) ids.push(r.id);
  }
  return {
    ten: tenGon(t),
    anh: [],
    duocChatIds: ids,
    hamLuong: t.hoatChat || '',
    dangBaoChe: t.dang || '',
    hang: t.hang || '',
    quyCach: t.quyCach || '',
    gia: t.gia ? dinhGia(t.gia) + (t.donVi ? '/' + t.donVi.toLowerCase() : '') : '',
    ghiChu: [
      t.congDung ? 'Công dụng: ' + t.congDung : '',
      'Nguồn: ' + DM.nguon + (DM.web && t.slug ? ' — ' + DM.web + t.slug : '') + ' (lấy ngày ' + DM.ngay + ')',
    ].filter(Boolean).join('\n\n'),
    tags: [tenCon(t.nhom, t.con), t.keDon === 1 ? 'Kê đơn' : t.keDon === 0 ? 'Không kê đơn' : ''].filter(Boolean),
  };
}

function trangSao(ctx) {
  const { di } = ctx;
  ctx.veDau('Đã đánh dấu', ctx.nutQuayLai('#/dm'));
  const boc = el('div', { class: 'trang trang-vao' });
  const ds = dsSao();
  if (!ds.length) {
    boc.append(trong('★', 'Chưa đánh dấu thuốc nào', 'Mở một thuốc rồi bấm "☆ Đánh dấu" để gom những thuốc cần ôn kỹ vào đây.'));
    return boc;
  }
  boc.append(el('div', { class: 'the-nut' },
    el('button', { class: 'nut nut-chinh', onclick: () => di('#/dm/on/sao'), text: '🧠 Kiểm tra các thuốc đã đánh dấu' })),
  el('div', { class: 'khu-de', text: ds.length + ' thuốc', style: 'margin-top:14px' }),
  dsTheoDot(ds, t => hangThuoc(t, di)));
  return boc;
}

function trangKhong(ctx) {
  ctx.veDau('Không tìm thấy', ctx.nutQuayLai('#/dm'));
  return el('div', { class: 'trang' }, trong('🔎', 'Không có mục này trong danh mục', 'Có thể danh mục vừa được cập nhật.'));
}

// ---------------------------------------------------------------------------
// TRẮC NGHIỆM
//
// Ba kiểu câu, đều 4 lựa chọn, phương án nhiễu lấy từ CÙNG nhóm con để buộc
// phải phân biệt thật chứ không loại trừ bằng cảm giác:
//   hc   — Thuốc này chứa hoạt chất gì?
//   nhom — Thuốc này thuộc nhóm nào?
//   cd   — Đọc công dụng (đã che tên thuốc), chọn đúng thuốc.
// Lịch ôn lặp lại dùng chung thang với trang Ôn tập: sai về 10 phút, đúng thì
// giãn dần 1 ngày → 3 ngày → 1 tuần → 2 tuần → 1 tháng.
const KIEU = {
  tron: 'Trộn',
  hc: 'Thuốc → hoạt chất',
  nhom: 'Thuốc → nhóm',
  cd: 'Công dụng → thuốc',
  rx: 'Kê đơn hay không?',
};
const MOI_KIEU = ['hc', 'nhom', 'cd', 'rx'];

const TU_CHUNG = new Set(boDau('thuoc vien nen nang hop goi chai lo tuyp ong vi siro dung dich kem gel bot xit nho mat mui tiem uong va cua cho tre em nguoi lon loai').split(' '));

// Tên thuốc lộ ra trong câu hỏi thì câu "chứa hoạt chất gì" thành đọc chữ
function tenLoHoatChat(t) {
  return t.hc.length > 0 && t.hc.every(h => DM.khoaHcTen[h].split(' ').every(w => t.khoaTen.includes(w)));
}

// '(Chưa có nhóm con)' là nhãn cho ô trống, không phải tên nhóm để hỏi
const laNhan = (ten) => ten.startsWith('(');

function coTheHoi(t, kieu) {
  if (kieu === 'hc')   return !!t.hoatChat && t.hc.length > 0 && !tenLoHoatChat(t);
  if (kieu === 'nhom') return !laNhan(tenCon(t.nhom, t.con));
  if (kieu === 'cd')   return (t.congDung || '').length >= 40 && dsTrongNhom(t.nhom, t.con).length >= 4;
  // Đang lọc chỉ kê đơn (hoặc chỉ không kê đơn) thì câu "kê đơn hay không" lộ đáp án
  if (kieu === 'rx')   return (t.keDon === 0 || t.keDon === 1) && locRx === null;
  return false;
}

// Cụm "là sản phẩm của Công ty X" — tên hãng nằm luôn trong phương án trả lời,
// để nguyên thì đoán theo tên hãng chứ không theo công dụng. Mô tả trên web
// hay viết sai chính tả tên hãng ("Delobris"/"Delorbis") nên che theo tên
// riêng lẻ không đủ, phải che cả cụm. Cụm dừng ở dấu câu HOẶC ở từ nối sang ý
// khác ("có thành phần…", "dùng điều trị…") — không thì che luôn nửa câu
// công dụng phía sau.
const CUM_HANG = /(sản phẩm của|sản xuất bởi|nhà sản xuất|của (?:công ty|tập đoàn|hãng))\s+[^,.;(]+?(?=\s+(?:có|chứa|gồm|với|thành phần|dùng|được|là|giúp|điều trị|hỗ trợ|tại)\s|[,.;(]|$)/giu;

function cheTen(chuoi, t) {
  chuoi = chuoi.replace(CUM_HANG, '$1 ▢▢▢');
  const cam = new Set();
  for (const w of boDau(t.ten + ' ' + (t.hang || '')).split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !/^\d/.test(w) && !TU_CHUNG.has(w)) cam.add(w);
  }
  // Xét từng cụm chữ-số chứ không tách theo khoảng trắng: mô tả hay viết dính
  // gạch nối ("MaxxHepa-Urso", "Ostagi-D3") và tách theo khoảng trắng sẽ để lọt
  return chuoi.replace(/[\p{L}\p{N}]+/gu, tu => cam.has(boDau(tu)) ? '▢▢▢' : tu);
}

// Chọn tối đa k phần tử khác nhau theo khoá, ưu tiên nguồn đầu
function chonKhac(nguon, khoaFn, loaiKhoa, k) {
  const da = new Set(loaiKhoa);
  const ra = [];
  for (const ds of nguon) {
    for (const x of xaoMang([...ds])) {
      const kk = khoaFn(x);
      if (!kk || da.has(kk)) continue;
      da.add(kk); ra.push(x);
      if (ra.length >= k) return ra;
    }
  }
  return ra;
}

function taoCau(t, kieu) {
  const cungCon = dsTrongNhom(t.nhom, t.con);
  const cungNhom = dsTrongNhom(t.nhom);
  if (kieu === 'hc') {
    const nhieu = chonKhac([cungCon, cungNhom, DM.ds], x => x.hoatChat && x.boHc && x.boHc !== t.boHc ? boDau(x.hoatChat) : null, [boDau(t.hoatChat)], 3);
    if (nhieu.length < 3) return null;
    return {
      kieu, t, de: 'Chứa hoạt chất gì?', hoi: t.tenWeb,
      lua: xaoMang([{ chu: t.hoatChat, dung: true }, ...nhieu.map(x => ({ chu: x.hoatChat }))]),
    };
  }
  if (kieu === 'nhom') {
    const dung = tenCon(t.nhom, t.con);
    // Nhóm nhiễu không được chứa thuốc nào cùng thành phần — nếu không thì đáp án "sai" cũng đúng
    const choCo = new Set(DM.ds.filter(x => x.boHc && x.boHc === t.boHc).map(x => x.nhom + '/' + x.con));
    const anhEm = DM.nhom[t.nhom].con.map((_, c) => [t.nhom, c]);
    const khac = DM.nhom.flatMap((nh, n) => n === t.nhom ? [] : nh.con.map((_, c) => [n, c]));
    const nhieu = chonKhac([anhEm, khac], ([n, c]) => {
      const k = n + '/' + c;
      if (choCo.has(k) || !dsTrongNhom(n, c).length || laNhan(tenCon(n, c))) return null;
      return boDau(tenCon(n, c));
    }, [boDau(dung)], 3);
    if (nhieu.length < 3) return null;
    return {
      kieu, t, de: 'Thuộc nhóm nào?', hoi: t.tenWeb, phu: t.hoatChat ? 'Hoạt chất: ' + t.hoatChat : '',
      lua: xaoMang([{ chu: dung, dung: true }, ...nhieu.map(([n, c]) => ({ chu: tenCon(n, c) }))]),
    };
  }
  if (kieu === 'rx') {
    return {
      kieu, t, de: 'Thuốc kê đơn hay không kê đơn?', hoi: t.tenWeb,
      phu: [t.hoatChat ? 'Hoạt chất: ' + t.hoatChat : '', t.dang].filter(Boolean).join(' · '),
      lua: [{ chu: '℞ Kê đơn', dung: t.keDon === 1 }, { chu: 'Không kê đơn', dung: t.keDon === 0 }],
    };
  }
  if (kieu === 'cd') {
    const nhieu = chonKhac([cungCon, cungNhom], x => x.boHc !== t.boHc ? x.boHc || x.sku : null, [t.boHc || t.sku], 3);
    if (nhieu.length < 3) return null;
    return {
      kieu, t, de: 'Công dụng này là của thuốc nào?', hoi: cheTen(t.congDung, t), dai: true,
      lua: xaoMang([{ chu: tenGon(t), dung: true }, ...nhieu.map(x => ({ chu: tenGon(x) }))]),
    };
  }
  return null;
}

function trangTracNghiem(ctx, p) {
  const { di } = ctx;
  // Phạm vi: '' = toàn danh mục · 'sao' · n · n/c
  let pham, tenPham, quayVe;
  if (p[0] === 'sao') { pham = dsSao(); tenPham = 'Thuốc đã đánh dấu'; quayVe = '#/dm/sao'; }
  else if (p[1] !== undefined) { pham = dsTrongNhom(+p[0], +p[1]); tenPham = tenCon(+p[0], +p[1]); quayVe = `#/dm/nhom/${p[0]}/${p[1]}`; }
  else if (p[0] !== undefined) { pham = dsTrongNhom(+p[0]); tenPham = tenNhom(+p[0]); quayVe = '#/dm/nhom/' + p[0]; }
  else { pham = DM.ds; tenPham = 'Toàn bộ danh mục'; quayVe = '#/dm'; }
  ctx.veDau('Kiểm tra', ctx.nutQuayLai(quayVe));

  const boc = el('div', { class: 'trang trang-vao' });
  let kieu = 'tron';
  let bo = [], viTri = 0, dungSo = 0, saiSo = 0, cau = null, daChon = null, dangGhi = false, som = false;

  const chonKieu = el('div', { class: 'loc-hang' });
  const khung = el('div', { class: 'on-khung' });

  const veKieu = () => {
    chonKieu.innerHTML = '';
    for (const [k, ten] of Object.entries(KIEU)) {
      chonKieu.append(el('button', {
        class: 'loc-nut' + (k === kieu ? ' dang' : ''), text: ten,
        onclick: () => { kieu = k; batDau(); },
      }));
    }
  };

  const hopLe = (t) => kieu === 'tron' ? MOI_KIEU.some(k => coTheHoi(t, k)) : coTheHoi(t, kieu);

  const batDau = (onSom = false) => {
    som = onSom;
    const du = quaLocRx(pham).filter(hopLe);
    const han = xaoMang(du.filter(t => denHanDM(t.sku)));
    const moi = xaoMang(du.filter(t => !daHoc(t.sku)));
    const n = CAU_HINH.DM_SO_CAU;
    bo = onSom ? xaoMang([...du]).slice(0, n) : [...han, ...moi].slice(0, n);
    bo.tong = du.length;
    viTri = 0; dungSo = 0; saiSo = 0; cau = null; daChon = null;
    veKieu(); ve();
  };

  const layCau = () => {
    // Một thuốc có thể không dựng nổi câu kiểu đã chọn (thiếu phương án nhiễu) → bỏ qua sang thuốc sau
    while (viTri < bo.length) {
      const t = bo[viTri];
      const cacKieu = kieu === 'tron' ? xaoMang(MOI_KIEU.filter(k => coTheHoi(t, k))) : [kieu];
      for (const k of cacKieu) { const c = taoCau(t, k); if (c) return c; }
      bo.splice(viTri, 1);
    }
    return null;
  };

  const ve = () => {
    khung.innerHTML = '';
    if (!bo.tong) {
      khung.append(!pham.length && p[0] === 'sao'
        ? trong('★', 'Chưa đánh dấu thuốc nào', 'Mở một thuốc rồi bấm "☆ Đánh dấu" để gom những thuốc cần ôn kỹ vào đây.')
        : trong('🧠', 'Chưa đủ dữ liệu để hỏi', 'Phạm vi này không có thuốc nào dựng được câu hỏi kiểu đã chọn. Thử kiểu khác.'));
      return;
    }
    if (!bo.length && !som) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: '🌱' }),
        el('h3', { text: 'Chưa tới hạn ôn lại' }),
        el('p', { class: 'the-chu', text: `Mọi thuốc trong phạm vi này đều đã gặp và chưa tới lịch. Đúng lịch gặp lại mới nhớ lâu.` }),
        el('div', { class: 'on-nut' }, el('button', { class: 'nut', onclick: () => batDau(true), text: 'Vẫn muốn ôn sớm' }))));
      return;
    }
    if (!cau) cau = layCau();
    if (!cau) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: dungSo >= saiSo ? '🎉' : '💪' }),
        el('h3', { text: 'Xong lượt này' }),
        el('p', { class: 'the-chu', text: `Đúng ${dungSo} · sai ${saiSo}.` }),
        el('p', { class: 'the-chu', text: 'Câu sai sẽ quay lại sau 10 phút, câu đúng hẹn gặp lại xa hơn.' }),
        el('div', { class: 'on-nut' },
          el('button', { class: 'nut', onclick: () => di(quayVe), text: 'Về danh mục' }),
          el('button', { class: 'nut nut-chinh', onclick: () => batDau(), text: 'Lượt tiếp' }))));
      return;
    }

    const t = cau.t;
    const muc = td(t.sku)?.lan ? td(t.sku).mucDo || 0 : 0;
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', { class: 'on-muc', title: 'Mức thuộc bài', text: '●'.repeat(muc) + '○'.repeat(NHAC_LAI.length - 1 - muc) })));

    khung.append(el('div', { class: 'the-lat dm-cau' },
      el('div', { class: 'the-nhan', text: KIEU[cau.kieu] + ' · ' + tenPham + (som ? ' · ôn sớm' : '') }),
      el(cau.dai ? 'p' : 'h2', { class: cau.dai ? 'dm-hoi-dai' : 'the-hoi the-hoi-nho', text: cau.hoi }),
      cau.phu ? el('div', { class: 'the-chu', text: cau.phu }) : null,
      el('div', { class: 'dm-de', text: cau.de })));

    const luaBoc = el('div', { class: 'dm-lua-boc' });
    cau.lua.forEach((l, i) => {
      let lop = 'dm-lua';
      if (daChon !== null) {
        if (l.dung) lop += ' dung';
        else if (i === daChon) lop += ' sai';
        else lop += ' mo';
      }
      luaBoc.append(el('button', {
        class: lop, disabled: daChon !== null ? '' : null,
        onclick: () => chon(i),
      }, el('span', { class: 'dm-lua-chu', text: 'ABCD'[i] }), el('span', { text: l.chu })));
    });
    khung.append(luaBoc);

    if (daChon !== null) {
      const dung = cau.lua[daChon].dung;
      const moi = td(t.sku);
      khung.append(el('section', { class: 'ct-khoi dm-giai ' + (dung ? 'dung' : 'sai') },
        el('h2', { class: 'ct-de', text: dung ? '✓ Chính xác' : '✗ Chưa đúng' }),
        el('div', { class: 'ct-chu' }, el('b', { text: t.tenWeb })),
        t.hoatChat ? el('div', { class: 'ct-chu', text: 'Hoạt chất: ' + t.hoatChat }) : null,
        el('div', { class: 'ct-chu', text: 'Nhóm: ' + tenNhom(t.nhom) + ' › ' + tenCon(t.nhom, t.con) }),
        t.congDung ? el('div', { class: 'ct-chu dm-giai-cd', text: t.congDung }) : null,
        el('div', { class: 'on-hen', text: 'Gặp lại sau ' + TEN_HAN[moi?.mucDo || 0] })));
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', onclick: () => di('#/dm/t/' + t.sku), text: 'Xem chi tiết' }),
        el('button', {
          class: 'nut nut-chinh', text: 'Câu tiếp →',
          onclick: () => { viTri++; cau = null; daChon = null; ve(); window.scrollTo(0, 0); },
        })));
    }
  };

  const chon = async (i) => {
    if (daChon !== null || dangGhi) return;
    dangGhi = true;
    try {
      daChon = i;
      const dung = !!cau.lua[i].dung;
      if (dung) dungSo++; else saiSo++;
      await ghiKetQua(cau.t.sku, dung);
      ve();
    } finally { dangGhi = false; }
  };

  boc.append(el('div', { class: 'nhom-dau' },
    el('div', { class: 'nhom-ten', text: tenPham }),
    el('div', { class: 'nhom-so', text: `${pham.length} thuốc trong phạm vi · mỗi lượt ${CAU_HINH.DM_SO_CAU} câu` })),
  hangLocRx(pham, () => batDau()), chonKieu, khung);
  batDau();
  return boc;
}
