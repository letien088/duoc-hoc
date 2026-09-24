// Ôn tập bằng thẻ lật, dựng từ chính dữ liệu bạn đã nhập.
// Tiến độ thuộc bài lưu trong kho 'meta' (một bản ghi duy nhất), không đụng
// vào nội dung dược chất / bệnh nên xuất sao lưu vẫn gọn.
import { SCHEMA, NHOM_DOI_TUONG, O_LIEU } from './config.js';
import { db } from './db.js';
import { el, coChu, datMau } from './util.js';
import { danhSach, duyet } from './store.js';

const KHOA = 'tienDoOnTap';

// --- Tiến độ ---------------------------------------------------------------
let _tienDo = null;

export function xoaTienDoTrongBoNho() { _tienDo = {}; }

export async function napTienDo() {
  const m = await db.lay('meta', KHOA);
  _tienDo = m?.giaTri || {};
  return _tienDo;
}

function tienDo() { return _tienDo || {}; }

async function ghiTienDo() {
  await db.ghi('meta', { id: KHOA, giaTri: _tienDo });
}

export function daThuoc(loai, i) {
  const t = tienDo()[loai + ':' + i];
  return !!t && t.dung >= 2;      // trả lời đúng 2 lần liên tiếp thì coi là thuộc
}

async function ghiNhan(loai, i, dung) {
  const k = loai + ':' + i;
  const cu = tienDo()[k] || { dung: 0, lan: 0 };
  _tienDo[k] = {
    dung: dung ? cu.dung + 1 : 0,       // sai một lần là đếm lại từ đầu
    lan: cu.lan + 1,
    lanCuoi: Date.now(),
  };
  await ghiTienDo();
}

// Đếm để hiện trên trang chủ
export function thongKe() {
  let tong = 0, thuoc = 0;
  for (const loai of ['duocchat', 'benh']) {
    for (const r of duyet(loai)) {
      tong++;
      if (daThuoc(loai, r.id)) thuoc++;
    }
  }
  return { tong, thuoc };
}

// --- Dựng nội dung mặt sau của thẻ ----------------------------------------
// Lấy những ô có chữ, theo thứ tự ưu tiên cho việc học.
function matSau(loai, r) {
  const ra = [];
  const them = (de, chu) => { if (coChu(chu)) ra.push({ de, chu: String(chu) }); };

  if (loai === 'duocchat') {
    them('Nhóm dược lý', r.nhom);
    them('Tác dụng', r.tacDung || r.coChe);
    them('Chỉ định', r.chiDinh);
    them('Chống chỉ định', r.chongChiDinh);
    const nl = r.lieu?.nguoiLon;
    if (coChu(nl)) {
      const phan = O_LIEU.filter(o => coChu(nl[o.k])).map(o => o.ten + ': ' + nl[o.k]);
      them('Liều người lớn', phan.join(' · '));
    }
    for (const nh of NHOM_DOI_TUONG) {
      if (nh.k === 'nguoiLon') continue;
      const m = r.lieu?.[nh.k];
      if (!coChu(m)) continue;
      const phan = O_LIEU.filter(o => coChu(m[o.k])).map(o => o.ten + ': ' + m[o.k]);
      them(nh.icon + ' ' + nh.ten, phan.join(' · '));
    }
    them('Tác dụng phụ', r.tacDungPhu);
  } else if (loai === 'benh') {
    them('Chuyên khoa', r.chuyenKhoa);
    them('Định nghĩa', r.moTa);
    them('Nguyên nhân', r.nguyenNhan);
    them('Triệu chứng', r.trieuChung);
    them('Cận lâm sàng', r.canLamSang);
  }
  return ra;
}

// --- Dựng bộ thẻ -----------------------------------------------------------
// Ưu tiên thẻ chưa thuộc, xếp trước; thẻ đã thuộc vẫn đưa vào cuối để không quên.
function taoBo(loai) {
  const ds = danhSach(loai).filter(r => matSau(loai, r).length > 0);
  const chua = [], roi = [];
  for (const r of ds) (daThuoc(loai, r.id) ? roi : chua).push(r);
  const xao = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return [...xao(chua), ...xao(roi)];
}

// --- Vẽ trang --------------------------------------------------------------
export function trangOnTap(loaiChon = 'duocchat') {
  const boc = el('div', { class: 'trang trang-vao' });
  let loai = loaiChon;
  let bo = [], viTri = 0, dungSo = 0, saiSo = 0, daLat = false;

  const khung = el('div', { class: 'on-khung' });

  const chonLoai = el('div', { class: 'loc-hang' },
    ...['duocchat', 'benh'].map(l => el('button', {
      class: 'loc-nut' + (l === loai ? ' dang' : ''),
      onclick: () => { loai = l; batDau(); },
      text: SCHEMA[l].icon + ' ' + SCHEMA[l].ten,
    })));

  // Chốt chặn bấm hai lần: một cú bấm đang ghi tiến độ thì cú sau bị bỏ qua.
  // Không có nó, bấm nhanh hai cái sẽ nhảy qua mất một thẻ chưa kịp xem.
  let dangGhi = false;

  const batDau = () => {
    bo = taoBo(loai);
    viTri = 0; dungSo = 0; saiSo = 0; daLat = false;
    [...chonLoai.children].forEach((b, i) => {
      b.classList.toggle('dang', ['duocchat', 'benh'][i] === loai);
    });
    ve();
  };

  const ve = () => {
    khung.innerHTML = '';
    const S = SCHEMA[loai];
    datMau(S.mau);   // đổi màu cho cả thanh trên, thanh tab và các mảng nền nhạt

    if (!bo.length) {
      khung.append(el('div', { class: 'trong' },
        el('div', { class: 'trong-icon', text: '🧠' }),
        el('h3', { text: 'Chưa đủ dữ liệu để ôn' }),
        el('p', { text: 'Thêm vài ' + S.tenSo + ' có nội dung (tác dụng, chỉ định, liều…) rồi quay lại đây.' })));
      return;
    }

    if (viTri >= bo.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: dungSo >= saiSo ? '🎉' : '💪' }),
        el('h3', { text: 'Xong một lượt' }),
        el('p', { class: 'the-chu', text: `Thuộc ${dungSo} · Cần ôn lại ${saiSo} trên tổng ${bo.length} thẻ.` }),
        el('div', { class: 'on-nut' },
          el('button', { class: 'nut nut-chinh', onclick: batDau, text: 'Ôn lượt nữa' }))));
      return;
    }

    const r = bo[viTri];
    const sau = matSau(loai, r);

    // --- Thanh tiến độ
    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', { text: '✓ ' + dungSo })));

    // --- Mặt thẻ
    const the = el('div', { class: 'the-lat', onclick: () => { if (!daLat) { daLat = true; ve(); } } });
    if (!daLat) {
      the.append(
        el('div', { class: 'the-nhan', text: S.ten }),
        el('h2', { class: 'the-hoi', text: r.ten }),
        el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }),
      );
      khung.append(the);
    } else {
      const noi = el('div', { class: 'the-dap' });
      for (const m of sau) {
        noi.append(el('div', { class: 'the-dap-muc' },
          el('div', { class: 'the-dap-de', text: m.de }),
          el('div', { class: 'the-dap-chu', text: m.chu })));
      }
      the.style.justifyContent = 'flex-start';
      the.style.cursor = 'default';
      the.append(el('div', { class: 'the-nhan', text: r.ten }), noi);
      khung.append(the);
      const traLoi = async (dung) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          await ghiNhan(loai, r.id, dung);
          if (dung) dungSo++; else saiSo++;
          viTri++; daLat = false;
          ve();
        } finally {
          dangGhi = false;
        }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa thuộc', onclick: () => traLoi(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã thuộc', onclick: () => traLoi(true) })));
    }
  };

  boc.append(chonLoai, khung);
  batDau();
  return boc;
}
