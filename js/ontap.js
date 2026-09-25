// Ôn tập bằng thẻ lật, dựng từ chính dữ liệu bạn đã nhập.
//
// Hai điều làm nên khác biệt giữa "lật cho vui" và "học thuộc thật":
//   1. LỊCH NHẮC LẠI — thuộc rồi vẫn phải gặp lại sau 1 ngày, 3 ngày, 1 tuần,
//      2 tuần, 1 tháng. Trả lời sai thì quay về từ đầu.
//   2. CHIỀU NGƯỢC — nhìn cơ chế/chỉ định mà đoán ra tên thuốc. Chiều này khó
//      hơn và sát với lúc đi lâm sàng hơn: bạn gặp bệnh cảnh chứ không gặp sẵn
//      cái tên.
//
// Tiến độ lưu trong kho 'meta' (một bản ghi duy nhất), không đụng vào nội dung
// dược chất / bệnh nên xuất sao lưu vẫn gọn.
import { SCHEMA, NHOM_DOI_TUONG, O_LIEU } from './config.js';
import { db } from './db.js';
import { el, coChu, datMau, boDau } from './util.js';
import { danhSach, duyet, goiY, layMot } from './store.js';

const KHOA = 'tienDoOnTap';

// Khoảng cách nhắc lại theo từng mức. Mức 0 = vừa gặp lần đầu, hoặc vừa trả lời sai.
const NHAC_LAI = [
  10 * 60 * 1000,        // 10 phút
  24 * 3600 * 1000,      // 1 ngày
  3 * 24 * 3600 * 1000,  // 3 ngày
  7 * 24 * 3600 * 1000,  // 1 tuần
  14 * 24 * 3600 * 1000, // 2 tuần
  30 * 24 * 3600 * 1000, // 1 tháng
];
const TEN_HAN = ['10 phút', '1 ngày', '3 ngày', '1 tuần', '2 tuần', '1 tháng'];
const MUC_THUOC = 2;     // từ mức này trở lên thì tính là đã thuộc

// --- Tiến độ ---------------------------------------------------------------
let _tienDo = null;

export function xoaTienDoTrongBoNho() { _tienDo = {}; }

export async function napTienDo() {
  const m = await db.lay('meta', KHOA);
  _tienDo = chuanHoa(m?.giaTri || {});
  return _tienDo;
}

// Bản cũ chỉ có {dung, lan, lanCuoi}. Đổi sang mức + hạn nhắc lại, giữ nguyên
// công sức đã bỏ ra chứ không bắt học lại từ đầu.
function chuanHoa(cu) {
  const ra = {};
  for (const [k, v] of Object.entries(cu || {})) {
    if (!v) continue;
    if (typeof v.mucDo === 'number') { ra[k] = v; continue; }
    const mucDo = Math.min(NHAC_LAI.length - 1, v.dung || 0);
    ra[k] = {
      mucDo,
      lan: v.lan || 0,
      lanCuoi: v.lanCuoi || 0,
      honLai: (v.lanCuoi || 0) + NHAC_LAI[mucDo],
    };
  }
  return ra;
}

function tienDo() { return _tienDo || {}; }
async function ghiTienDo() { await db.ghi('meta', { id: KHOA, giaTri: _tienDo }); }

export function daThuoc(loai, i) {
  const t = tienDo()[loai + ':' + i];
  return !!t && (t.mucDo || 0) >= MUC_THUOC;
}

function denHan(loai, i) {
  const t = tienDo()[loai + ':' + i];
  if (!t) return true;                       // chưa gặp lần nào
  return (t.honLai || 0) <= Date.now();
}

async function ghiNhan(loai, i, dung) {
  const k = loai + ':' + i;
  const cu = tienDo()[k] || { mucDo: 0, lan: 0 };
  const mucDo = dung
    ? Math.min(NHAC_LAI.length - 1, (cu.mucDo || 0) + 1)
    : 0;                                     // sai một lần là về lại từ đầu
  _tienDo[k] = {
    mucDo,
    lan: (cu.lan || 0) + 1,
    lanCuoi: Date.now(),
    honLai: Date.now() + NHAC_LAI[mucDo],
  };
  await ghiTienDo();
}

// Một thẻ đang tới hạn, để trang chủ nói đúng thứ sắp phải ôn. Trang chủ vốn
// lấy ngẫu nhiên một dược chất bất kỳ rồi đặt cạnh con số "n thẻ tới hạn" —
// cái tên đó có thể đã thuộc từ lâu, hoặc chẳng thuộc loại nào đang tới hạn,
// mà đặt cạnh con số thì người đọc tin nó là thẻ tiếp theo.
export function theDenHan() {
  const du = [];
  for (const loai of LOAI_ON) {
    for (const r of duyet(loai)) {
      if (!cacMuc(loai, r).length) continue;
      if (denHan(loai, r.id)) du.push({ loai, r });
    }
  }
  if (!du.length) return null;
  return du[Math.random() * du.length | 0];
}

export function thongKe() {
  let tong = 0, thuoc = 0, denHanSo = 0;
  for (const loai of LOAI_ON) {
    for (const r of duyet(loai)) {
      // Chỉ đếm những mục THỰC SỰ thành thẻ được. Đếm cả mục rỗng thì trang chủ
      // báo "5 thẻ tới hạn" mà vào Ôn tập chỉ thấy 2 thẻ.
      if (!cacMuc(loai, r).length) continue;
      tong++;
      if (daThuoc(loai, r.id)) thuoc++;
      if (denHan(loai, r.id)) denHanSo++;
    }
  }
  return { tong, thuoc, denHan: denHanSo };
}

// Ba loại ôn được. Biệt dược có mặt ở đây vì ở quầy thuốc thứ bạn nhìn thấy
// là CÁI HỘP, không phải tên INN: "Efferalgan là paracetamol" là việc tra
// ngược làm hằng ngày, và chỉ học được bằng cách lặp lại.
const LOAI_ON = ['duocchat', 'bietduoc', 'benh'];

// --- Nội dung hai mặt thẻ --------------------------------------------------
function cacMuc(loai, r) {
  const ra = [];
  const them = (de, chu) => { if (coChu(chu)) ra.push({ de, chu: String(chu) }); };

  if (loai === 'duocchat') {
    them('Nhóm dược lý', r.nhom);
    them('Tác dụng', r.tacDung || r.coChe);
    them('Chỉ định', r.chiDinh);
    them('Chống chỉ định', r.chongChiDinh);
    const nl = r.lieu?.nguoiLon;
    if (coChu(nl)) {
      them('Liều người lớn',
        O_LIEU.filter(o => coChu(nl[o.k])).map(o => o.ten + ': ' + nl[o.k]).join(' · '));
    }
    for (const nh of NHOM_DOI_TUONG) {
      if (nh.k === 'nguoiLon') continue;
      const m = r.lieu?.[nh.k];
      if (!coChu(m)) continue;
      them(nh.icon + ' ' + nh.ten,
        O_LIEU.filter(o => coChu(m[o.k])).map(o => o.ten + ': ' + m[o.k]).join(' · '));
    }
    them('Phân loại nguy cơ thai kỳ', r.thaiKy);
    if (Array.isArray(r.lieuThan) && r.lieuThan.length) {
      them('Hiệu chỉnh theo chức năng thận', r.lieuThan.map(d => {
        const tu = String(d.tu ?? '').trim();
        const den = String(d.den ?? '').trim();
        const nguong = tu && den ? `${tu}–${den}` : tu ? `≥${tu}` : den ? `<${den}` : 'mọi mức';
        return `CrCl ${nguong}: ${d.lieu || '—'}`;
      }).join(' · '));
    }
    them('Tác dụng phụ', r.tacDungPhu);
  } else if (loai === 'bietduoc') {
    // Mặt quan trọng nhất của một biệt dược là nó chứa dược chất gì. Nhóm dược
    // lý đi kèm luôn, để chiều ngược còn manh mối suy ra chứ không phải học vẹt.
    const dc = (r.duocChatIds || []).map(i => layMot('duocchat', i)).filter(Boolean);
    // Biệt dược chưa nối với dược chất nào thì không làm nên thẻ: lật ra chỉ
    // thấy "hàm lượng 100 mg", không dạy được gì mà vẫn chiếm lượt ôn.
    if (!dc.length) return ra;
    them('Chứa dược chất', dc.map(x => x.ten).join(' + '));
    them('Nhóm dược lý', [...new Set(dc.map(x => x.nhom).filter(Boolean))].join(' · '));
    them('Hàm lượng', r.hamLuong);
    them('Dạng bào chế', r.dangBaoChe);
    them('Hãng sản xuất', r.hang);
    them('Quy cách', r.quyCach);
  } else if (loai === 'benh') {
    them('Chuyên khoa', r.chuyenKhoa);
    them('Định nghĩa', r.moTa);
    them('Nguyên nhân', r.nguyenNhan);
    them('Triệu chứng', r.trieuChung);
    them('Cận lâm sàng', r.canLamSang);
  }
  return ra;
}

// Che tên trong phần gợi ý. Không che thì chiều ngược thành cho không đáp án:
// "Vancomycin là kháng sinh glycopeptid…" đọc câu đầu là xong.
function cheTen(chu, ten) {
  if (!ten || ten.length < 4) return chu;
  const k = boDau(ten);
  return String(chu).split(/(\s+)/).map(tu => {
    const sach = boDau(tu.replace(/[^\p{L}\p{N}]/gu, ''));
    const trung = sach.length >= 4 && (sach === k || k.includes(sach) || sach.includes(k));
    return trung ? '▮'.repeat(Math.max(3, sach.length)) : tu;
  }).join('');
}

// --- Dựng bộ thẻ -----------------------------------------------------------

// Fisher-Yates. Dùng cho cả thứ tự thẻ lẫn thứ tự manh mối, nên để ra ngoài.
export function xaoMang(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// loai có thể là 'tron': gộp cả ba loại vào một lượt rồi xáo chung. Ôn từng
// loại riêng thì thứ tự các loại vẫn cố định — hết dược chất mới sang bệnh —
// mà lúc đi lâm sàng thì bệnh, thuốc, hộp thuốc đến lẫn lộn chứ không xếp hàng.
// Mỗi thẻ mang theo loại của chính nó để còn ghi tiến độ đúng chỗ.
function taoBo(loai, chieu, nhomChon, chiSao) {
  const cacLoai = loai === 'tron' ? LOAI_ON : [loai];
  const du = [];
  for (const l of cacLoai) {
    for (const r of danhSach(l)) {
      if (chiSao && !r.sao) continue;
      // Chỉ dược chất mới có nhóm dược lý. Áp bộ lọc này cho bệnh thì mọi bản
      // ghi đều bị loại, màn hình báo "chưa đủ dữ liệu" trong khi dữ liệu còn nguyên.
      if (l === 'duocchat' && nhomChon && boDau(r.nhom) !== boDau(nhomChon)) continue;
      // Chiều ngược cần ít nhất 2 mục gợi ý, một mục thì đoán bằng niềm tin
      const n = cacMuc(l, r).length;
      if (chieu === 'xuoi' ? n > 0 : n >= 2) du.push({ loai: l, r });
    }
  }
  return {
    denLuot: xaoMang(du.filter(x => denHan(x.loai, x.r.id))),
    tatCa: xaoMang([...du]),
    tong: du.length,
  };
}

// --- Vẽ trang --------------------------------------------------------------
export function trangOnTap(loaiChon = 'duocchat') {
  const boc = el('div', { class: 'trang trang-vao' });
  let loai = loaiChon;
  let chieu = 'xuoi';
  let nhomChon = null;      // ôn gọn trong một nhóm dược lý, tiện lúc ôn thi
  let chiSao = false;       // chỉ ôn những thẻ đã đánh dấu
  let bo = [], tong = 0, viTri = 0, dungSo = 0, saiSo = 0, daLat = false, onSom = false;
  let dangGhi = false;

  const chonLoai = el('div', { class: 'loc-hang' });
  const chonChieu = el('div', { class: 'loc-hang' });
  const chonNhom = el('div', { class: 'on-nhom' });
  const khung = el('div', { class: 'on-khung' });

  const veNut = () => {
    chonLoai.innerHTML = '';
    for (const l of LOAI_ON) {
      chonLoai.append(el('button', {
        class: 'loc-nut' + (l === loai ? ' dang' : ''),
        onclick: () => { loai = l; nhomChon = null; batDau(); },
        text: SCHEMA[l].icon + ' ' + SCHEMA[l].ten,
      }));
    }
    chonLoai.append(el('button', {
      class: 'loc-nut' + (loai === 'tron' ? ' dang' : ''),
      onclick: () => { loai = 'tron'; nhomChon = null; batDau(); },
      text: '🔀 Trộn mọi loại',
    }));
    chonChieu.innerHTML = '';
    for (const [k, ten] of [['xuoi', 'Tên → thông tin'], ['nguoc', 'Thông tin → tên']]) {
      chonChieu.append(el('button', {
        class: 'loc-nut' + (k === chieu ? ' dang' : ''),
        onclick: () => { chieu = k; batDau(); },
        text: ten,
      }));
    }
    // Ôn riêng những thẻ đã đánh dấu — trước kỳ thi chỉ cần chừng đó
    chonChieu.append(el('button', {
      class: 'loc-nut' + (chiSao ? ' dang' : ''),
      onclick: () => { chiSao = !chiSao; batDau(); },
      text: (chiSao ? '★' : '☆') + ' Đã đánh dấu',
    }));

    // Ôn gọn trong một nhóm — trước kỳ thi người ta ôn theo nhóm, không ôn tràn
    chonNhom.innerHTML = '';
    const nhom = loai === 'duocchat' ? goiY('duocchat', 'nhom') : [];
    if (nhom.length >= 2) {
      const chon = el('select', { class: 'on-chon-nhom', 'aria-label': 'Giới hạn nhóm dược lý' },
        el('option', { value: '' }, 'Mọi nhóm dược lý'),
        ...nhom.map(n => el('option', n === nhomChon ? { value: n, selected: '' } : { value: n }, n)));
      chon.addEventListener('change', () => { nhomChon = chon.value || null; batDau(); });
      chonNhom.append(chon);
    }
  };

  const batDau = (som = false) => {
    const t = taoBo(loai, chieu, nhomChon, chiSao);
    onSom = som;
    bo = som ? t.tatCa : t.denLuot;
    tong = t.tong;
    viTri = 0; dungSo = 0; saiSo = 0; daLat = false;
    // Phải xoá dấu này, không thì bộ thẻ mới mở ở vị trí 0 mà dấu cũ cũng là 0
    // nên manh mối không được dựng lại: "Đây là bệnh nào?" kèm manh mối của
    // một dược chất ở lượt trước.
    goiYTai = -1;
    veNut();
    ve();
  };

  const hanKeTiep = (mucDo) => {
    const moi = Math.min(NHAC_LAI.length - 1, mucDo + 1);
    return `Đúng → gặp lại sau ${TEN_HAN[moi]} · Sai → gặp lại sau ${TEN_HAN[0]}`;
  };

  // Thứ tự manh mối được xáo MỘT lần cho mỗi thẻ rồi giữ, không xáo lại mỗi
  // lần vẽ — nếu không thì chạm vào thẻ là các dòng nhảy chỗ.
  let goiYXao = null;
  let goiYTai = -1;

  const ve = () => {
    khung.innerHTML = '';
    const S = SCHEMA[loai] || null;              // 'tron' không phải một loại trong SCHEMA
    datMau((S || SCHEMA.duocchat).mau);

    if (!tong) {
      khung.append(el('div', { class: 'trong' },
        el('div', { class: 'trong-icon', text: '🧠' }),
        el('h3', { text: 'Chưa đủ dữ liệu để ôn' }),
        el('p', {
          text: chiSao
            ? 'Chưa đánh dấu mục nào. Mở một ' + (S ? S.tenSo : 'mục') + ' rồi bấm "☆ Đánh dấu" để gom vào đây.'
            : chieu === 'nguoc'
            ? 'Chiều này cần mỗi mục có ít nhất hai phần thông tin (tác dụng, chỉ định, liều…).'
            : 'Thêm vài ' + (S ? S.tenSo : 'mục') + ' có nội dung rồi quay lại đây.',
        })));
      return;
    }

    if (!bo.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: '🌱' }),
        el('h3', { text: 'Chưa tới hạn ôn lại' }),
        el('p', { class: 'the-chu', text: `Cả ${tong} thẻ đều đã ôn và chưa tới lịch. Cứ để nghỉ — đúng lịch gặp lại mới nhớ lâu.` }),
        el('div', { class: 'on-nut' },
          el('button', { class: 'nut', onclick: () => batDau(true), text: 'Vẫn muốn ôn sớm' }))));
      return;
    }

    if (viTri >= bo.length) {
      khung.append(el('div', { class: 'on-xong' },
        el('div', { class: 'on-xong-icon', text: dungSo >= saiSo ? '🎉' : '💪' }),
        el('h3', { text: 'Xong lượt này' }),
        el('p', { class: 'the-chu', text: `Nhớ ${dungSo} · cần ôn lại ${saiSo} trên ${bo.length} thẻ.` }),
        el('p', { class: 'the-chu', text: 'Thẻ trả lời đúng hẹn gặp lại xa hơn, thẻ sai quay về ôn sớm.' }),
        el('div', { class: 'on-nut' },
          el('button', { class: 'nut nut-chinh', onclick: () => batDau(true), text: 'Ôn tiếp lượt nữa' }))));
      return;
    }

    const { loai: lt, r } = bo[viTri];
    const St = SCHEMA[lt];
    datMau(St.mau);              // trộn thì màu đổi theo thẻ, nhìn là biết đang ôn gì
    const muc = cacMuc(lt, r);
    const mucDo = tienDo()[lt + ':' + r.id]?.mucDo || 0;
    if (goiYTai !== viTri) { goiYXao = xaoMang([...muc]); goiYTai = viTri; }

    khung.append(el('div', { class: 'on-tien' },
      el('span', { text: (viTri + 1) + '/' + bo.length }),
      el('div', { class: 'on-thanh' }, el('i', { style: `width:${(viTri / bo.length * 100).toFixed(1)}%` })),
      el('span', {
        class: 'on-muc', title: 'Mức thuộc bài',
        text: '●'.repeat(mucDo) + '○'.repeat(NHAC_LAI.length - 1 - mucDo),
      })));

    const the = el('div', { class: 'the-lat', onclick: () => { if (!daLat) { daLat = true; ve(); } } });

    if (!daLat) {
      if (chieu === 'xuoi') {
        the.append(
          el('div', { class: 'the-nhan', text: St.ten + (onSom ? ' · ôn sớm' : '') }),
          el('h2', { class: 'the-hoi', text: r.ten }),
          el('div', { class: 'the-goi', text: 'Chạm để xem đáp án' }));
      } else {
        const noi = el('div', { class: 'the-dap' });
        // Manh mối cũng phải xáo. Giữ nguyên thứ tự schema thì thẻ nào cũng mở
        // đầu bằng "Nhóm dược lý" — người học nhớ cái khuôn chứ không đọc nội
        // dung, mà chiều ngược sinh ra chính là để đọc nội dung.
        for (const m of goiYXao.slice(0, 4)) {
          noi.append(el('div', { class: 'the-dap-muc' },
            el('div', { class: 'the-dap-de', text: m.de }),
            el('div', { class: 'the-dap-chu', text: cheTen(m.chu, r.ten) })));
        }
        the.style.justifyContent = 'flex-start';
        // Lọc bỏ ô trống trước khi gắn: append thẳng giá trị rỗng thì trình duyệt
        // biến nó thành chữ "null" hiện ngay trên mặt thẻ.
        the.append(...[
          el('h2', { class: 'the-hoi-nguoc', text: 'Đây là ' + St.tenSo + ' nào?' }),
          onSom ? el('div', { class: 'the-nhan', text: 'ôn sớm' }) : null,
          noi,
          el('div', { class: 'the-goi', text: 'Chạm để xem tên' }),
        ].filter(Boolean));
      }
      khung.append(the);
    } else {
      the.style.justifyContent = 'flex-start';
      the.style.cursor = 'default';
      the.append(chieu === 'nguoc'
        ? el('h2', { class: 'the-hoi the-hoi-nho', text: r.ten })
        : el('div', { class: 'the-nhan', text: r.ten }));
      const noi = el('div', { class: 'the-dap' });
      for (const m of muc) {
        noi.append(el('div', { class: 'the-dap-muc' },
          el('div', { class: 'the-dap-de', text: m.de }),
          el('div', { class: 'the-dap-chu', text: m.chu })));
      }
      the.append(noi);
      khung.append(the);

      const traLoi = async (dung) => {
        if (dangGhi) return;
        dangGhi = true;
        try {
          await ghiNhan(lt, r.id, dung);
          if (dung) dungSo++; else saiSo++;
          viTri++; daLat = false;
          ve();
        } finally { dangGhi = false; }
      };
      khung.append(el('div', { class: 'on-nut' },
        el('button', { class: 'nut', text: '↺ Chưa thuộc', onclick: () => traLoi(false) }),
        el('button', { class: 'nut nut-chinh', text: '✓ Đã thuộc', onclick: () => traLoi(true) })));
      khung.append(el('div', { class: 'on-hen', text: hanKeTiep(mucDo) }));
    }
  };

  boc.append(chonLoai, chonChieu, chonNhom, khung);
  batDau();
  return boc;
}
