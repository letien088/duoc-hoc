// Khung app: thanh trên, thanh tab dưới, định tuyến theo #hash.
import { CAU_HINH, SCHEMA, LOAI } from './config.js';
import { el, esc, bao, hoi, hoan, ngayGio, kichThuoc, datMau } from './util.js';
import { doDungLuong } from './db.js';
import {
  napTatCa, danhSach, layMot, luu, xoa, tim, demTatCa, vuaSua, duyet, donRac,
  xuatSaoLuu, nhapSaoLuu, xoaToanBo, saoLuuGanNhat,
} from './store.js';
import { veForm } from './form.js';
import { veChiTiet } from './view.js';
import { trangOnTap, napTienDo, thongKe, xoaTienDoTrongBoNho } from './ontap.js';
import {
  dongBoNgay, doiChieu, dangNhap as dangNhapDrive, dangXuat as dangXuatDrive,
  trangThai as trangThaiDongBo, khiTrangThaiDoi, napTrangThai, batTuDong,
  khoXa, layVaCham, xoaVaCham,
} from './dongbo.js';

const $than = document.getElementById('than');
const $dau  = document.getElementById('dau');
const $tab  = document.getElementById('tab');

const di = (h) => { location.hash = h; };
const nhoCuon = {};      // nhớ chỗ đang cuộn dở của từng trang danh sách

const TAB = [
  { h: '#/nha',    icon: '🏠', ten: 'Trang chủ' },
  { h: '#/tim',    icon: '🔍', ten: 'Tra cứu' },
  { h: '#/ontap',  icon: '🧠', ten: 'Ôn tập' },
  { h: '#/caidat', icon: '⚙️', ten: 'Cài đặt' },
];

// ---------------------------------------------------------------------------
// Thanh trên
function veDau(tieuDe, trai, phai) {
  $dau.classList.remove('an');
  $dau.innerHTML = '';
  $dau.append(
    el('div', { class: 'dau-ben dau-trai' }, trai || ''),
    el('div', { class: 'dau-ten', text: tieuDe }),
    el('div', { class: 'dau-ben dau-phai' }, phai || ''),
  );
}

function nutQuayLai(dich) {
  return el('button', {
    class: 'dau-nut', onclick: () => dich ? di(dich) : history.back(),
    html: '‹ <span>Quay lại</span>',
  });
}

// ---------------------------------------------------------------------------
// Thanh tab dưới
function veTab() {
  $tab.innerHTML = '';
  const nay = location.hash || CAU_HINH.TRANG_MAC_DINH;
  // Trang danh sách / chi tiết của 4 loại đều thuộc về tab Trang chủ
  const thuocNha = LOAI.some(l => nay.startsWith('#/' + l));
  for (const m of TAB) {
    const dang = nay === m.h || nay.startsWith(m.h + '/') || (m.h === '#/nha' && thuocNha);
    $tab.append(el('a', {
      class: 'tab-mot' + (dang ? ' dang' : ''), href: m.h,
      onclick: (e) => { e.preventDefault(); di(m.h); },
    },
      el('span', { class: 'tab-icon', text: m.icon }),
      el('span', { class: 'tab-ten', text: m.ten })));
  }
}

// ---------------------------------------------------------------------------
// TRANG CHỦ
function trangNha() {
  veDau(CAU_HINH.TEN_APP, null, el('button', {
    class: 'dau-nut', onclick: () => di('#/tim'), text: '🔍', 'aria-label': 'Tra cứu',
  }));
  datMau('#2f6fed');

  const boc = el('div', { class: 'trang trang-vao' });
  const dem = demTatCa();
  const tong = LOAI.reduce((s, l) => s + dem[l], 0);
  const tk = thongKe();

  const gio = new Date().getHours();
  const chao = gio < 11 ? 'Chào buổi sáng' : gio < 14 ? 'Chào buổi trưa'
             : gio < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  boc.append(el('div', { class: 'hero' },
    el('div', { class: 'hero-chao', text: chao }),
    el('h1', { class: 'hero-ten', text: tong ? 'Hôm nay học gì?' : 'Bắt đầu sổ tay của bạn' })));

  if (khoXa().sanSang()) boc.append(chiBaoDongBo());

  // --- Dải số liệu
  boc.append(el('div', { class: 'dai' },
    el('div', { class: 'dai-o' },
      el('div', { class: 'dai-num', text: String(tong) }),
      el('div', { class: 'dai-ten', text: 'Mục đã ghi' })),
    el('div', { class: 'dai-o' },
      el('div', { class: 'dai-num', text: String(tk.thuoc) }),
      el('div', { class: 'dai-ten', text: 'Đã thuộc' })),
    el('div', { class: 'dai-o' },
      el('div', { class: 'dai-num', text: tk.tong ? Math.round(tk.thuoc / tk.tong * 100) + '%' : '—' }),
      el('div', { class: 'dai-ten', text: 'Tiến độ' }))));

  // --- Thẻ ôn nhanh: một mục ngẫu nhiên chưa thuộc
  const ungVien = [...duyet('duocchat')].filter(r => r.tacDung || r.chiDinh || r.coChe);
  if (ungVien.length) {
    const r = ungVien[Math.random() * ungVien.length | 0];
    boc.append(el('a', {
      class: 'on-the', href: '#/ontap',
      onclick: (e) => { e.preventDefault(); di('#/ontap'); },
    },
      el('div', { class: 'on-dau' }, el('span', { class: 'on-huy', text: '🧠 Ôn nhanh' })),
      el('h3', { class: 'on-ten', text: r.ten }),
      el('div', { class: 'on-phu', text: r.nhom || 'Bạn còn nhớ tác dụng của thuốc này không?' }),
      el('div', { class: 'on-goi', text: 'Bắt đầu ôn tập →' })));
  }

  // --- Bốn thẻ mục
  boc.append(el('h2', { class: 'khu-de', text: 'Sổ tay' }));
  const luoi = el('div', { class: 'muc-luoi' });
  for (const l of LOAI) {
    const S = SCHEMA[l];
    luoi.append(el('a', {
      class: 'muc-the', href: '#/' + l,
      style: `background:linear-gradient(145deg, ${S.mau}, ${troi(S.mau, -26)})`,
      onclick: (e) => { e.preventDefault(); di('#/' + l); },
    },
      el('div', { class: 'muc-icon', text: S.icon }),
      el('div', {},
        el('div', { class: 'muc-ten', text: S.ten }),
        el('div', { class: 'muc-so', text: dem[l] ? dem[l] + ' mục' : 'Chưa có gì' }))));
  }
  boc.append(luoi);

  // --- Vừa cập nhật
  const moi = vuaSua(5);
  if (moi.length) {
    boc.append(el('h2', { class: 'khu-de', text: 'Vừa cập nhật' }));
    const ds = el('div', { class: 'ds' });
    for (const m of moi) ds.append(hangDS(m.loai, m.r));
    boc.append(ds);
  }

  if (!tong) {
    boc.append(el('div', { class: 'trong' },
      el('div', { class: 'trong-icon', text: '💊' }),
      el('h3', { text: 'Sổ tay còn trống' }),
      el('p', { text: 'Bắt đầu bằng một dược chất bạn đang học. Sau đó thêm biệt dược của nó, rồi nối vào phác đồ điều trị.' }),
      el('button', {
        class: 'nut nut-chinh', onclick: () => di('#/duocchat/moi'),
        text: '＋ Thêm dược chất đầu tiên',
      })));
  }

  return boc;
}

// Dòng chỉ báo đồng bộ. App KHÔNG BAO GIỜ hiện dấu tích khi chưa đẩy lên thật.
function chiBaoDongBo() {
  const t = trangThaiDongBo();
  const bang = {
    chuaNoi:  { i: '\u25cb', c: 'Chưa đăng nhập Google', k: 'db-cho' },
    dangChay: { i: '\u27f3', c: 'Đang đồng bộ…', k: 'db-chay' },
    xong:     { i: '\u2713', c: 'Đã đồng bộ ' + ngayGio(t.luc), k: 'db-xong' },
    choMang:  { i: '\u23f3', c: t.coDoi ? 'Có thay đổi chưa đẩy lên' : 'Đang chờ mạng', k: 'db-cho' },
    loi:      { i: '\u26a0\ufe0f', c: t.loi || 'Đồng bộ lỗi', k: 'db-loi' },
  };
  const m = bang[t.ma] || bang.chuaNoi;
  return el('a', {
    class: 'db-chi ' + m.k, id: 'db-chi', href: '#/caidat',
    onclick: (e) => { e.preventDefault(); di('#/caidat'); },
  },
    el('span', { class: 'db-icon', text: m.i }),
    el('span', { class: 'db-chu', text: m.c }),
    el('span', { class: 'db-mui', text: '\u203a' }));
}

function veChiBaoDongBo() {
  const cu = document.getElementById('db-chi');
  if (cu && khoXa().sanSang()) cu.replaceWith(chiBaoDongBo());
}

// Làm tối / sáng một mã màu #rrggbb đi bao nhiêu phần trăm
function troi(hex, pt) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * pt / 100)));
  return '#' + [k(n >> 16 & 255), k(n >> 8 & 255), k(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// TRA CỨU — tìm trong cả 4 loại cùng lúc
function trangTim() {
  veDau('Tra cứu', null, null);
  datMau('#2f6fed');

  const boc = el('div', { class: 'trang trang-vao' });
  let locLoai = null;

  const oTim = el('input', {
    class: 'o-tim', type: 'search', placeholder: 'Tên thuốc, bệnh, hoạt chất…',
    autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off',
  });
  const locHang = el('div', { class: 'loc-hang' });
  const ketQua = el('div', {});

  const veLoc = () => {
    locHang.innerHTML = '';
    locHang.append(el('button', {
      class: 'loc-nut' + (locLoai === null ? ' dang' : ''),
      onclick: () => { locLoai = null; veLoc(); veKetQua(); }, text: 'Tất cả',
    }));
    for (const l of LOAI) {
      locHang.append(el('button', {
        class: 'loc-nut' + (locLoai === l ? ' dang' : ''),
        onclick: () => { locLoai = l; veLoc(); veKetQua(); },
        text: SCHEMA[l].icon + ' ' + SCHEMA[l].ten,
      }));
    }
  };

  const veKetQua = () => {
    const q = oTim.value.trim();
    ketQua.innerHTML = '';
    if (q.length < CAU_HINH.TIM_TOI_THIEU) {
      ketQua.append(el('div', { class: 'trong' },
        el('div', { class: 'trong-icon', text: '🔍' }),
        el('h3', { text: 'Tìm mọi thứ trong sổ tay' }),
        el('p', { text: 'Gõ không dấu cũng ra. Tìm được cả trong phần tác dụng, chỉ định, liều dùng chứ không riêng tên.' })));
      return;
    }
    const kq = tim(q, locLoai, null);
    if (!kq.length) {
      ketQua.append(el('div', { class: 'trong' },
        el('div', { class: 'trong-icon', text: '🤔' }),
        el('h3', { text: 'Không tìm thấy' }),
        el('p', { text: `Chưa có mục nào khớp với "${q}".` })));
      return;
    }
    const ds = el('div', { class: 'ds' });
    for (const x of kq.slice(0, CAU_HINH.VE_MOI_DOT)) ds.append(hangDS(x.loai, x.r));
    const conLai = kq.length - Math.min(kq.length, CAU_HINH.VE_MOI_DOT);
    ketQua.append(
      el('div', { class: 'khu-de', text: conLai
        ? `${kq.length} kết quả — đang hiện ${CAU_HINH.VE_MOI_DOT} mục hợp nhất`
        : `${kq.length} kết quả` }),
      ds);
    if (conLai) {
      ketQua.append(el('div', { class: 'them-boc' },
        el('div', { class: 'the-chu', text: 'Gõ thêm chữ để thu hẹp lại.' })));
    }
  };

  oTim.addEventListener('input', hoan(veKetQua, 110));
  veLoc();
  veKetQua();

  boc.append(
    el('div', { class: 'tim-boc' }, el('span', { class: 'tim-kinh', text: '🔍' }), oTim),
    locHang, ketQua);
  setTimeout(() => oTim.focus(), 60);
  return boc;
}

// ---------------------------------------------------------------------------
// DANH SÁCH một loại
function trangDanhSach(loai) {
  const S = SCHEMA[loai];
  datMau(S.mau);
  veDau(S.ten, nutQuayLai('#/nha'), el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di('#/' + loai + '/moi'), text: '＋ Thêm',
  }));

  const boc = el('div', { class: 'trang trang-vao' });
  const oTim = el('input', {
    class: 'o-tim', type: 'search', placeholder: 'Tìm trong ' + S.ten.toLowerCase() + '…',
    autocomplete: 'off', autocapitalize: 'none',
  });
  const noi = el('div', {});

  let hienToiDa = CAU_HINH.VE_MOI_DOT;

  const veDS = (chuoi) => {
    noi.innerHTML = '';
    const loc = chuoi ? tim(chuoi, loai, null).map(x => x.r) : danhSach(loai);
    if (!loc.length) {
      noi.append(el('div', { class: 'trong' },
        el('div', { class: 'trong-icon', text: S.icon }),
        el('h3', { text: chuoi ? 'Không tìm thấy' : 'Chưa có ' + S.tenSo + ' nào' }),
        el('p', { text: chuoi ? 'Thử từ khoá khác xem sao.' : goiYBatDau(loai) }),
        chuoi ? null : el('button', {
          class: 'nut nut-chinh', onclick: () => di('#/' + loai + '/moi'),
          text: '＋ Thêm ' + S.tenSo,
        })));
      return;
    }
    // Chỉ vẽ một đợt. Màn hình chỉ hiện được chừng 10 hàng, dựng sẵn 2000 hàng
    // là bắt máy làm việc thừa và ngốn bộ nhớ.
    const phanVe = loc.slice(0, hienToiDa);
    const conLai = loc.length - phanVe.length;

    if (chuoi) {
      noi.append(el('div', { class: 'khu-de', text: loc.length + ' kết quả' }));
    }

    // Không tìm thì chia theo chữ cái đầu cho dễ lướt
    if (!chuoi && phanVe.length > 12) {
      let chuCai = '';
      let ds = null;
      for (const r of phanVe) {
        const c = (r.ten || '#').trim().charAt(0).toUpperCase();
        if (c !== chuCai) {
          chuCai = c;
          noi.append(el('div', { class: 'ds-chu-cai', text: chuCai }));
          ds = el('div', { class: 'ds' });
          noi.append(ds);
        }
        ds.append(hangDS(loai, r));
      }
    } else {
      const ds = el('div', { class: 'ds' });
      for (const r of phanVe) ds.append(hangDS(loai, r));
      noi.append(ds);
    }

    if (conLai > 0) {
      noi.append(el('div', { class: 'them-boc' },
        el('button', {
          class: 'nut nut-them',
          onclick: () => {
            hienToiDa += CAU_HINH.VE_MOI_DOT;
            const y = window.scrollY;
            veDS(chuoi);
            requestAnimationFrame(() => window.scrollTo(0, y));
          },
          text: `Hiện thêm — còn ${conLai} mục`,
        })));
    }
  };

  oTim.addEventListener('input', hoan(() => {
    hienToiDa = CAU_HINH.VE_MOI_DOT;      // tìm từ khoá mới thì đếm lại từ đầu
    veDS(oTim.value.trim());
  }, 110));
  veDS('');
  boc.append(el('div', { class: 'tim-boc' },
    el('span', { class: 'tim-kinh', text: '🔍' }), oTim), noi);
  return boc;
}

function goiYBatDau(loai) {
  return {
    duocchat: 'Đây là nền của mọi thứ. Thêm một hoạt chất bạn đang học, điền tác dụng và liều theo từng đối tượng.',
    bietduoc: 'Là tên thương mại bán ngoài hiệu thuốc. Chụp luôn ảnh vỏ hộp để sau nhìn là nhận ra.',
    benh: 'Thêm bệnh trước, rồi mới dựng phác đồ điều trị cho nó.',
    phacdo: 'Phác đồ gắn với một bệnh và gọi tên các dược chất đã có. Nên thêm bệnh và dược chất trước.',
  }[loai] || '';
}

function hangDS(loai, r) {
  const S = SCHEMA[loai];
  return el('a', {
    class: 'ds-hang', href: '#/' + loai + '/' + r.id,
    onclick: (e) => {
      e.preventDefault();
      nhoCuon[location.hash] = window.scrollY;
      di('#/' + loai + '/' + r.id);
    },
  },
    el('span', { class: 'ds-icon', style: `background:${S.mau}1f`, text: S.icon }),
    el('span', { class: 'ds-chu' },
      el('span', { class: 'ds-ten', text: r.ten || '(chưa đặt tên)' }),
      el('span', { class: 'ds-phu', text: S.phu(r) || '' })),
    el('span', { class: 'ds-mui', text: '›' }));
}

// ---------------------------------------------------------------------------
// CHI TIẾT
function trangChiTiet(loai, i) {
  const r = layMot(loai, i);
  if (!r) return trangKhong(loai);
  const S = SCHEMA[loai];
  datMau(S.mau);

  veDau(S.ten, nutQuayLai('#/' + loai), el('button', {
    class: 'dau-nut dau-nut-chinh', onclick: () => di('#/' + loai + '/' + i + '/sua'), text: 'Sửa',
  }));

  const boc = el('div', { class: 'trang trang-vao' }, veChiTiet(loai, r));
  boc.append(el('div', { class: 'ct-xoa' },
    el('button', {
      class: 'nut nut-nguy-vien',
      onclick: async () => {
        if (!(await hoi('Xoá ' + S.tenSo + ' này?',
          '"' + (r.ten || '') + '" sẽ bị xoá khỏi máy. Không khôi phục lại được.'))) return;
        await xoa(loai, i);
        bao('Đã xoá.');
        di('#/' + loai);
      },
      text: 'Xoá ' + S.tenSo,
    })));
  return boc;
}

function trangKhong(loai) {
  veDau('Không tìm thấy', nutQuayLai('#/' + (loai || 'nha')));
  return el('div', { class: 'trang' },
    el('div', { class: 'trong' },
      el('div', { class: 'trong-icon', text: '🔎' }),
      el('h3', { text: 'Bản ghi này không còn' })));
}

// ---------------------------------------------------------------------------
// THÊM / SỬA
function trangSua(loai, i) {
  const S = SCHEMA[loai];
  const moi = !i;
  const r = moi ? {} : layMot(loai, i);
  if (!moi && !r) return trangKhong(loai);
  datMau(S.mau);

  const ve = () => (moi ? '#/' + loai : '#/' + loai + '/' + i);

  const form = veForm(loai, r,
    async (duLieu) => {
      const daLuu = await luu(loai, duLieu);
      bao(moi ? 'Đã thêm ' + S.tenSo + '.' : 'Đã lưu.');
      di('#/' + loai + '/' + daLuu.id);
    },
    () => di(ve()),
  );

  veDau(moi ? 'Thêm ' + S.tenSo : 'Sửa ' + S.tenSo,
    nutQuayLai(ve()),
    el('button', { class: 'dau-nut dau-nut-chinh', onclick: () => form.luuNgay(), text: 'Lưu' }));

  return el('div', { class: 'trang trang-vao' }, form);
}

// ---------------------------------------------------------------------------
// CÀI ĐẶT
function trangCaiDat() {
  veDau('Cài đặt');
  datMau('#2f6fed');
  const boc = el('div', { class: 'trang trang-vao' });
  const dem = demTatCa();

  boc.append(el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: 'Dữ liệu đang có' }),
    el('div', { class: 'so-luoi' },
      ...LOAI.map(l => el('div', { class: 'so-o' },
        el('div', { class: 'so-icon', text: SCHEMA[l].icon }),
        el('div', { class: 'so-num', text: String(dem[l]) }),
        el('div', { class: 'so-ten', text: SCHEMA[l].ten }))))));

  // Dung lượng: đo thật trên máy đang chạy
  const oDung = el('div', { class: 'the-chu', text: 'Đang đo…' });
  doDungLuong().then(d => {
    if (!d) { oDung.textContent = 'Máy không cho đọc số liệu dung lượng.'; return; }
    const pt = d.hanMuc ? (d.daDung / d.hanMuc * 100) : 0;
    oDung.innerHTML = `App đang dùng <b>${kichThuoc(d.daDung)}</b>`
      + (d.hanMuc ? ` trên hạn mức <b>${kichThuoc(d.hanMuc)}</b> (${pt.toFixed(1)}%)` : '');
  });
  const oGiu = el('div', { class: 'the-chu', text: 'Đang kiểm tra…' });
  (navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null))
    .then(da => {
      if (da === null) { oGiu.textContent = 'Máy không cho biết trạng thái này.'; return; }
      oGiu.textContent = da
        ? '🔒 Máy đã hứa giữ lại dữ liệu, không tự dọn khi thiếu chỗ.'
        : '⚠️ Máy CHƯA hứa giữ dữ liệu. Nếu iPhone đầy bộ nhớ, hệ điều hành có thể dọn mất. Hãy xuất file sao lưu thường xuyên hơn.';
      if (!da) oGiu.classList.add('canh-bao');
    })
    .catch(() => { oGiu.textContent = 'Máy không cho biết trạng thái này.'; });

  boc.append(el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: 'Dung lượng trên máy này' }), oDung, oGiu));

  // Sao lưu
  const oLanCuoi = el('div', { class: 'the-chu' });
  saoLuuGanNhat().then(t => {
    oLanCuoi.textContent = t ? 'Lần sao lưu gần nhất: ' + ngayGio(t) : 'Chưa sao lưu lần nào.';
    if (!t || (Date.now() - t) / 86400000 > CAU_HINH.NHAC_SAO_LUU_SAU_NGAY) {
      oLanCuoi.classList.add('canh-bao');
    }
  });

  const nhapFile = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  nhapFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const kq = await nhapSaoLuu(JSON.parse(await f.text()));
      await napTienDo();      // tiến độ ôn tập vừa được khôi phục theo
      bao(`Xong: thêm ${kq.them}, cập nhật ${kq.capNhat}, bỏ qua ${kq.boQua}, ảnh ${kq.anh}.`);
      dinhTuyen();
    } catch (err) {
      bao('Không đọc được file: ' + err.message, 'loi');
    }
  });

  boc.append(el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: 'Sao lưu & khôi phục' }),
    oLanCuoi,
    el('p', { class: 'the-chu the-nhac', text: 'Dữ liệu chỉ nằm trong máy này. Gỡ app khỏi màn hình chính là mất sạch. Nên xuất file định kỳ rồi cất vào iCloud Drive hoặc Google Drive.' }),
    el('div', { class: 'the-nut' },
      el('button', { class: 'nut nut-chinh', onclick: () => xuatFile(true), text: '⬇ Xuất kèm ảnh' }),
      el('button', { class: 'nut', onclick: () => xuatFile(false), text: '⬇ Xuất riêng chữ' }),
      el('button', { class: 'nut', onclick: () => nhapFile.click(), text: '⬆ Khôi phục' }),
      nhapFile)));

  boc.append(theDrive());

  boc.append(el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: 'Dọn rác' }),
    el('p', { class: 'the-chu', text: 'Quét những ảnh không còn biệt dược nào dùng tới rồi xoá hẳn khỏi máy, lấy lại dung lượng.' }),
    el('div', { class: 'the-nut' },
      el('button', {
        class: 'nut',
        onclick: async (e) => {
          const nut = e.currentTarget;
          nut.disabled = true; nut.textContent = 'Đang quét…';
          try {
            const kq = await donRac();
            bao(kq.soAnh
              ? `Đã xoá ${kq.soAnh} ảnh thừa, lấy lại ${kichThuoc(kq.byte)}.`
              : 'Không có gì để dọn. Sạch rồi.');
            dinhTuyen();
          } catch (err) {
            bao('Lỗi khi dọn: ' + err.message, 'loi');
            nut.disabled = false; nut.textContent = '🧹 Dọn rác ngay';
          }
        },
        text: '🧹 Dọn rác ngay', 'aria-label': 'Dọn rác ngay',
      }))));

  boc.append(el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: 'Về app' }),
    el('div', { class: 'the-chu', html: `${esc(CAU_HINH.TEN_APP)} · phiên bản ${esc(CAU_HINH.PHIEN_BAN)}` }),
    CAU_HINH.NHAC_MIEN_TRU ? el('p', { class: 'the-chu', text: 'App học tập cá nhân. Nội dung do chính bạn nhập vào, không phải tài liệu tra cứu lâm sàng — luôn đối chiếu nguồn gốc trước khi áp dụng.' }) : null,
    el('div', { class: 'the-nut' },
      el('button', {
        class: 'nut nut-nguy-vien',
        onclick: async () => {
          if (!(await hoi('Xoá toàn bộ dữ liệu?',
            'Mọi dược chất, biệt dược, bệnh, phác đồ và ảnh sẽ bị xoá khỏi máy. Nên xuất file sao lưu trước.', 'Xoá hết'))) return;
          await xoaToanBo();
          xoaTienDoTrongBoNho();
          bao('Đã xoá toàn bộ.');
          dinhTuyen();
        },
        text: 'Xoá toàn bộ dữ liệu',
      }))));

  return boc;
}

// --- Thẻ Google Drive trong Cài đặt ---------------------------------------
function theDrive() {
  const kx = khoXa();
  const the = el('section', { class: 'the' },
    el('h2', { class: 'the-de', text: '\u2601\ufe0f Google Drive' }));

  if (!kx.sanSang()) {
    the.append(
      el('p', { class: 'the-chu', text: 'Chưa khai báo mã Client ID của Google nên chưa bật được đồng bộ. App vẫn chạy và lưu đủ dữ liệu trong máy.' }),
      el('p', { class: 'the-chu', text: 'Điền mã vào ô GOOGLE_CLIENT_ID ở đầu file js/config.js rồi đẩy lên lại.' }));
    return the;
  }

  const dong = el('div', { class: 'the-chu' });
  if (kx.daNoi()) {
    dong.innerHTML = 'Đã đăng nhập' + (kx.danhTinh() ? ' — <b>' + esc(kx.danhTinh()) + '</b>' : '');
  } else {
    dong.textContent = 'Chưa đăng nhập.';
  }
  the.append(dong);

  const oTrangThai = el('div', { class: 'the-chu' });
  const veTT = () => {
    const x = trangThaiDongBo();
    oTrangThai.classList.toggle('canh-bao', x.ma === 'loi');
    oTrangThai.textContent =
      x.ma === 'xong'     ? '\u2713 Hai bên đang khớp. Lần gần nhất: ' + ngayGio(x.luc)
    : x.ma === 'dangChay' ? '\u27f3 Đang đồng bộ…'
    : x.ma === 'choMang'  ? (x.coDoi ? '\u23f3 Có thay đổi chưa đẩy lên, đang chờ mạng.' : '\u23f3 Đang chờ mạng.')
    : x.ma === 'loi'      ? '\u26a0\ufe0f ' + (x.loi || 'Đồng bộ lỗi.')
    :                       'Chưa đồng bộ lần nào.';
  };
  veTT();
  the.append(oTrangThai);

  const oKetQua = el('div', { class: 'the-chu' });
  the.append(oKetQua);

  const nutDongBo = el('button', {
    class: 'nut nut-chinh', text: '\u27f3 Đồng bộ ngay',
    onclick: async (e) => {
      const n = e.currentTarget; n.disabled = true; n.textContent = 'Đang đồng bộ…';
      const r = await dongBoNgay({ imLang: true });
      bao(r.ok ? 'Đã đồng bộ xong.' : (r.loi || 'Chưa đồng bộ được.'), r.ok ? 'ok' : 'loi');
      dinhTuyen();
    },
  });

  const nutDoiChieu = el('button', {
    class: 'nut', text: '\ud83d\udd0d Đối chiếu ngay',
    onclick: async (e) => {
      const n = e.currentTarget; n.disabled = true; n.textContent = 'Đang đối chiếu…';
      try {
        const d = await doiChieu();
        oKetQua.innerHTML = d.khop
          ? '\u2713 <b>Giống hệt nhau</b>: ' + d.tongMay + ' mục, ' + d.anhMay + ' ảnh.'
          : '\u26a0\ufe0f <b>Lệch ' + d.soLech + ' chỗ</b> — máy ' + d.tongMay + ' mục / Drive '
            + d.tongXa + ' mục, ảnh ' + d.anhMay + '/' + d.anhXa
            + (d.lech.length ? '<br>' + d.lech.slice(0, 5).map(x =>
                '· ' + esc((SCHEMA[x.loai] && SCHEMA[x.loai].ten) || x.loai) + ': ' + esc(x.ly)).join('<br>') : '');
        oKetQua.classList.toggle('canh-bao', !d.khop);
      } catch (err) {
        oKetQua.textContent = 'Không đối chiếu được: ' + err.message;
        oKetQua.classList.add('canh-bao');
      }
      n.disabled = false; n.textContent = '\ud83d\udd0d Đối chiếu ngay';
    },
  });

  if (kx.daNoi()) {
    the.append(el('div', { class: 'the-nut' }, nutDongBo, nutDoiChieu,
      el('button', {
        class: 'nut', text: 'Đăng xuất',
        onclick: async () => {
          if (!(await hoi('Đăng xuất Google?', 'Dữ liệu trong máy vẫn còn nguyên. Chỉ ngừng đồng bộ lên Drive.', 'Đăng xuất'))) return;
          await dangXuatDrive();
          bao('Đã đăng xuất.');
          dinhTuyen();
        },
      })));
  } else {
    the.append(el('div', { class: 'the-nut' },
      el('button', {
        class: 'nut nut-chinh', text: 'Đăng nhập Google',
        onclick: async (e) => {
          const n = e.currentTarget; n.disabled = true; n.textContent = 'Đang mở Google…';
          try {
            await dangNhapDrive();
            bao('Đã đăng nhập và đồng bộ.');
          } catch (err) {
            bao(err.message || 'Không đăng nhập được.', 'loi');
          }
          dinhTuyen();
        },
      })));
    the.append(el('p', { class: 'the-chu', text: 'App chỉ đọc/ghi được đúng thư mục nó tạo ra trong Drive. Ảnh và tài liệu sẵn có của bạn nằm ngoài tầm với của nó.' }));
  }

  layVaCham().then(ds => {
    if (!ds.length) return;
    the.append(el('div', { class: 'the-nhac', style: 'margin-top:10px' },
      '\u26a0\ufe0f Có ' + ds.length + ' mục từng bị sửa ở hai nơi cùng lúc. Bản thua cuộc vẫn được giữ lại.'));
    the.append(el('div', { class: 'the-nut' },
      el('button', {
        class: 'nut', text: 'Xem bản bị thay',
        onclick: async () => {
          const chu = ds.slice(0, 8).map(v =>
            (SCHEMA[v.loai] && SCHEMA[v.loai].ten || v.loai) + ': "'
            + ((v.banThua && v.banThua.ten) || '') + '" (bản cũ) thay bằng "'
            + ((v.banThang && v.banThang.ten) || '') + '"').join('\n');
          const x = await hoi('Các mục từng va chạm', chu, 'Xoá ghi chép này', false);
          if (x) { await xoaVaCham(); dinhTuyen(); }
        },
      })));
  });

  return the;
}

async function xuatFile(kemAnh) {
  try {
    bao('Đang gói dữ liệu…');
    const blob = await xuatSaoLuu(kemAnh);
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const ten = `duoc-hoc-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: ten });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    bao('Đã xuất ' + kichThuoc(blob.size) + '. Chọn "Lưu vào Tệp".');
  } catch (e) {
    bao('Lỗi khi xuất: ' + e.message, 'loi');
  }
}

// ---------------------------------------------------------------------------
// Định tuyến
function dinhTuyen() {
  const h = location.hash || CAU_HINH.TRANG_MAC_DINH;
  const p = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Quét vét: không để lớp phủ nào sống sót qua lần đổi trang
  document.querySelectorAll('.modal-lop, .anh-lop').forEach(e => e.remove());
  $than.innerHTML = '';
  let noiDung;

  if (p[0] === 'nha' || !p.length) {
    noiDung = trangNha();
  } else if (p[0] === 'tim') {
    noiDung = trangTim();
  } else if (p[0] === 'ontap') {
    veDau('Ôn tập');
    noiDung = trangOnTap();      // trang này tự đổi màu theo loại đang ôn
  } else if (p[0] === 'caidat') {
    noiDung = trangCaiDat();
  } else if (LOAI.includes(p[0])) {
    const loai = p[0];
    if (!p[1])               noiDung = trangDanhSach(loai);
    else if (p[1] === 'moi') noiDung = trangSua(loai, null);
    else if (p[2] === 'sua') noiDung = trangSua(loai, p[1]);
    else                     noiDung = trangChiTiet(loai, p[1]);
  } else {
    location.replace(CAU_HINH.TRANG_MAC_DINH);
    return;
  }

  $than.append(noiDung);
  veTab();

  const cuon = (!p[1] && nhoCuon[h]) ? nhoCuon[h] : 0;
  requestAnimationFrame(() => window.scrollTo(0, cuon));
}

// Xin hệ điều hành đừng dọn kho dữ liệu khi máy thiếu chỗ. Không xin thì
// IndexedDB bị xếp vào diện "được phép xoá", và toàn bộ sổ tay nằm trong đó.
async function xinGiuDuLieu() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
async function khoiDong() {
  try {
    await napTatCa();
    await napTienDo();
  } catch (e) {
    $than.innerHTML = '<div class="trang"><div class="trong"><h3>Không mở được kho dữ liệu</h3><p>'
      + esc(e.message) + '</p></div></div>';
    return;
  }

  xinGiuDuLieu();
  await napTrangThai();
  batTuDong();
  // Mở app lên là kéo về bản mới nhất trên Drive, nếu đã đăng nhập từ trước
  if (khoXa().sanSang()) {
    dongBoNgay({ imLang: true }).catch(() => { /* lỗi đã nằm trong trạng thái */ });
  }
  khiTrangThaiDoi(veChiBaoDongBo);
  window.addEventListener('hashchange', dinhTuyen);
  dinhTuyen();

  if ('serviceWorker' in navigator) {
    // Khi bạn đẩy bản mới lên GitHub, bản cũ đang chạy trên iPhone sẽ tự nạp
    // lại đúng MỘT lần để nhận mã mới. Lần cài đầu tiên thì bỏ qua (chưa có
    // bản nào đang điều khiển), nếu không app sẽ nạp lại ngay lúc vừa mở.
    let daCoDieuKhien = !!navigator.serviceWorker.controller;
    let dangTaiLai = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!daCoDieuKhien || dangTaiLai) return;
      dangTaiLai = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => { /* vẫn chạy được khi không đăng ký được */ });
  }
}

khoiDong();
