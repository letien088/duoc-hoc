// Vẽ trang xem chi tiết một bản ghi (chế độ đọc).
import { SCHEMA, NHOM_DOI_TUONG, O_LIEU, O_THUOC_BUOC } from './config.js';
import { el, esc, escNhieuDong, coChu, ngayGio, boDau } from './util.js';
import { layMot, bietDuocCua, phacDoDungDuocChat, phacDoCuaBenh } from './store.js';
import { veAnh } from './img.js';
import {
  tinhTheoCan, coTheTinh, canNangDaLuu, luuCanNang, quyDoi, coTheChia, nhanXetQuyDoi,
  tinhCrCl, mucThan, dongUngVoi, creatininVoLy, nhanNguong, soiTran,
} from './lieu.js';
import { soiPhacDo } from './canhbao.js';

const di = (h) => { location.hash = h; };

// Cả trang chi tiết dùng CHUNG một cân nặng: bảng liều và máy tính CrCl đều
// hỏi nó. Hai ô rời nhau thì người dùng gõ 60 chỗ này, 55 chỗ kia, rồi đọc kết
// quả của hai người bệnh khác nhau nằm cạnh nhau.
let _oCanNang = [];
function nhoOCan(o) { _oCanNang.push(o); }
function lanToaCan(kg, nguon) {
  for (const o of _oCanNang) {
    if (o === nguon) continue;
    const moi = kg === null ? '' : String(kg);
    if (o.value !== moi) { o.value = moi; o.dispatchEvent(new Event('input')); }
  }
}

export function veChiTiet(loai, r) {
  const S = SCHEMA[loai];
  _oCanNang = [];                 // trang mới thì quên các ô của trang cũ
  const boc = el('div', { class: 'ct' });

  const phu = S.phu(r);
  boc.append(el('div', {
    class: 'ct-dinh',
    // khai báo 2 lần: máy nào không hiểu color-mix thì vẫn còn màu đặc để dùng
    style: 'background:var(--acc);background:linear-gradient(140deg, var(--acc), color-mix(in srgb, var(--acc) 62%, #000))',
  },
    el('div', { class: 'ct-dinh-icon', text: S.icon }),
    el('h1', { class: 'ct-ten', text: r.ten || '(chưa đặt tên)' }),
    phu ? el('div', { class: 'ct-phu', text: phu }) : null));

  if (loai === 'phacdo') {
    const cb = veCanhBao(r);
    if (cb) boc.append(cb);
  }

  for (const f of S.fields) {
    if (f.k === 'ten') continue;
    const v = r[f.k];
    if (!coChu(v)) continue;
    const kh = veKhoi(loai, f, v, r);
    if (kh) boc.append(kh);
  }

  // --- Liên kết ngược: thứ không nằm trong bản ghi nhưng trỏ tới nó --------
  if (loai === 'duocchat') {
    boc.append(dsLienKet('Biệt dược chứa dược chất này', bietDuocCua(r.id), 'bietduoc',
      'Chưa có biệt dược nào. Thêm ở mục Biệt dược rồi chọn dược chất này.'));
    boc.append(dsLienKet('Xuất hiện trong phác đồ', phacDoDungDuocChat(r.id), 'phacdo', null));
  }
  if (loai === 'benh') {
    boc.append(dsLienKet('Phác đồ điều trị', phacDoCuaBenh(r.id), 'phacdo',
      'Chưa có phác đồ. Thêm ở mục Phác đồ rồi chọn bệnh này.'));
  }
  if (loai === 'bietduoc' && !(r.duocChatIds || []).length) {
    // Biệt dược không nối với dược chất thì chỉ là một cái tên trơ trọi:
    // không tra được liều, không xuất hiện trong phác đồ nào. Phải nói ra.
    boc.append(el('section', { class: 'ct-khoi' },
      tieuDe('Chứa dược chất'),
      el('div', { class: 'ct-trong', text: 'Chưa nối với dược chất nào. Bấm Sửa rồi chọn dược chất để tra được liều dùng và thấy thuốc này nằm trong những phác đồ nào.' })));
  }

  boc.append(el('div', { class: 'ct-meta' },
    r.taoLuc ? 'Tạo ' + ngayGio(r.taoLuc) : '',
    r.capNhat && r.capNhat !== r.taoLuc ? ' · Sửa ' + ngayGio(r.capNhat) : ''));

  return boc;
}

function tieuDe(t) { return el('h2', { class: 'ct-de', text: t }); }

function veKhoi(loai, f, v, r) {
  // Nhóm dược lý bấm được: học dược lý là học THEO NHÓM, cùng nhóm thì cùng cơ
  // chế, cùng phổ, cùng kiểu tác dụng phụ. Bấm vào là ra cả nhóm.
  if (loai === 'duocchat' && f.k === 'nhom') {
    return el('section', { class: 'ct-khoi' }, tieuDe(f.l),
      el('a', {
        class: 'chip chip-nhom', href: '#/nhom/' + encodeURIComponent(v),
        onclick: (e) => { e.preventDefault(); di('#/nhom/' + encodeURIComponent(v)); },
      }, v, el('span', { class: 'chip-mui', text: '›' })));
  }

  switch (f.t) {
    case 'text':
    case 'textarea':
      return el('section', { class: 'ct-khoi', 'data-o': f.k }, tieuDe(f.l),
        el('div', { class: 'ct-chu', html: escNhieuDong(v) }));

    case 'chips':
      return el('section', { class: 'ct-khoi' }, tieuDe(f.l),
        el('div', { class: 'chip-boc' }, ...v.map(c => el('span', { class: 'chip', text: c }))));

    case 'anh':
      return el('section', { class: 'ct-khoi' }, tieuDe(f.l), veLuoiAnh(v));

    case 'lieu':
      return veLieu(f, v, r);

    case 'than':
      return veThan(f, v, r);

    case 'lienket': {
      const ids = f.don ? (v ? [v] : []) : v;
      const ds = ids.map(i => ({ id: i, ...(layMot(f.toi, i) || { ten: '(đã xoá)' }) }));
      return dsLienKet(f.l, ds, f.toi, null);
    }

    case 'buoc':
      return veBuoc(f, v);

    default:
      return null;
  }
}

function veLuoiAnh(ids) {
  // Chỉ có 1 ảnh thì cho nó to hẳn ra, đỡ phí chỗ và nhìn rõ chữ trên vỏ hộp
  const luoi = el('div', { class: 'anh-luoi' + (ids.length === 1 ? ' anh-luoi-mot' : '') });
  for (const aid of ids) {
    const im = el('img', { class: 'anh-o', alt: 'ảnh hộp thuốc', loading: 'lazy' });
    veAnh(im, aid);
    im.addEventListener('click', () => phongTo(im.src));
    luoi.append(el('div', { class: 'anh-khung' }, im));
  }
  return luoi;
}

function phongTo(src) {
  if (!src) return;
  const dong = () => { window.removeEventListener('hashchange', dong); lop.remove(); };
  const lop = el('div', { class: 'anh-lop', onclick: dong },
    el('img', { src, alt: 'ảnh phóng to' }));
  window.addEventListener('hashchange', dong);   // đổi trang thì tự đóng
  document.body.append(lop);
}

// Gọi đúng tên đơn vị theo dạng bào chế: "1,5 viên" chứ không phải "1,5 đơn vị"
function donViDem(dangBaoChe) {
  // So khớp theo TỪNG TỪ. Khớp kiểu chuỗi con thì "dung dịch uống" bị đọc
  // thành thuốc dạng "ống" — đúng cái bẫy đã gặp ở hàm coTheChia.
  const tu = new Set(boDau(dangBaoChe).split(/[^a-z0-9]+/).filter(Boolean));
  if (tu.has('goi')) return 'gói';
  if (tu.has('vien')) return 'viên';
  if (tu.has('ong')) return 'ống';
  if (tu.has('lo') || tu.has('chai') || tu.has('tui')) return 'lọ';
  if (tu.has('nhat') || tu.has('xit')) return 'nhát';
  if (tu.has('mieng') || tu.has('dan')) return 'miếng';
  return 'đơn vị';
}

function veLieu(f, v, r) {
  const boc = el('div', { class: 'lieu-xem' });
  const oTinh = [];        // các ô cần tính lại khi đổi cân nặng
  const oTran = [];        // các dòng đối chiếu liều trần

  for (const nh of NHOM_DOI_TUONG) {
    const m = v[nh.k];
    if (!coChu(m)) continue;
    const hang = [];
    for (const ol of O_LIEU) {
      if (!coChu(m[ol.k])) continue;
      const oGiaTri = el('span', { class: 'lieu-gt', html: escNhieuDong(m[ol.k]) });
      const oRa = el('span', { class: 'lieu-tinh' });
      const oQuy = el('div', { class: 'lieu-quy' });
      oTinh.push({ chuoi: m[ol.k], o: oRa, quy: ol.k === 'lieu' ? oQuy : null });
      hang.push(el('div', { class: 'lieu-hang' },
        el('span', { class: 'lieu-nhan', text: ol.ten }),
        el('span', { class: 'lieu-coc' }, oGiaTri, oRa, oQuy)));
    }
    // Dòng đối chiếu trần: chỉ dựng khi ô này ghi cả liều lẫn liều tối đa.
    // Ba con số để rời nhau không trả lời được câu "cả ngày như vậy có quá
    // không?" — mà đó mới là câu phải trả lời trước khi phát thuốc.
    const oSoi = coChu(m.lieu) && coChu(m.toiDa)
      ? el('div', { class: 'lieu-tran', hidden: true }) : null;
    if (oSoi) oTran.push({ m, o: oSoi });

    boc.append(el('div', { class: 'lieu-the' },
      el('div', { class: 'lieu-the-dau' },
        el('span', { class: 'lieu-icon', text: nh.icon }),
        el('span', { text: nh.ten })),
      ...hang, oSoi));
  }
  if (!boc.children.length) return null;

  const khoi = el('section', { class: 'ct-khoi', 'data-o': 'lieu' }, tieuDe(f.l));

  const soiLaiTran = (kg) => {
    for (const t of oTran) {
      const s = soiTran({ lieu: t.m.lieu, khoangCach: t.m.khoangCach,
                          toiDa: t.m.toiDa, kg });
      t.o.className = 'lieu-tran' + (s ? ' lieu-tran-' + s.muc : '');
      t.o.textContent = s ? s.chu : '';
      t.o.hidden = !s;
    }
  };

  // --- Ô cân nặng: chỉ hiện khi trong bảng liều thật sự có dạng mg/kg ------
  if (coTheTinh(v)) {
    // KHÔNG dùng type="number". Bàn phím số trên iPhone tiếng Việt hiện dấu
    // PHẨY, mà ô number lại nuốt mất dấu phẩy: gõ "3,2" cho trẻ sơ sinh 3,2 kg
    // thì ô nhận "32" và app tính liều cho 32 kg — sai gấp 10 lần, không báo gì.
    // Dùng ô chữ + bàn phím số, rồi tự đọc cả dấu phẩy lẫn dấu chấm.
    const oCan = el('input', {
      class: 'can-o', type: 'text', inputmode: 'decimal',
      autocomplete: 'off', placeholder: '—', 'aria-label': 'Cân nặng người bệnh',
    });
    const oNhac = el('span', { class: 'can-nhac' });

    // Dọn ngay trên ô luôn, không chỉ dọn lúc tính. Nếu ô hiện "-5" mà app tính
    // cho 5 kg thì cái người dùng NHÌN THẤY khác cái app DÙNG — với một máy
    // tính liều thuốc, lệch như vậy là không chấp nhận được.
    const donO = () => {
      const goc = String(oCan.value);
      let sach = goc.replace(/[^\d.,]/g, '');
      const i = sach.search(/[.,]/);
      if (i !== -1) {                       // chỉ giữ dấu thập phân đầu tiên
        sach = sach.slice(0, i + 1) + sach.slice(i + 1).replace(/[.,]/g, '');
      }
      if (sach !== goc) oCan.value = sach;
      return sach;
    };

    const docCan = () => {
      const so = parseFloat(donO().replace(',', '.'));
      return isFinite(so) && so > 0 ? so : null;
    };

    // Tra một lần thôi. Trước đây quét lại toàn bộ biệt dược sau MỖI phím gõ.
    const bd = r ? bietDuocCua(r.id) : [];

    const tinhLai = () => {
      const kg = docCan();
      let dem = 0;
      for (const t of oTinh) {
        const kq = kg ? tinhTheoCan(t.chuoi, kg) : null;
        if (kq) { t.o.textContent = '= ' + kq.chu; t.o.hidden = false; dem++; }
        else { t.o.textContent = ''; t.o.hidden = true; }

        if (!t.quy) continue;
        t.quy.innerHTML = '';
        if (!kq) continue;
        // Bước cuối cùng của việc kê thuốc: mấy viên, mấy gói?
        for (const b of bd.slice(0, 4)) {
          const qd = quyDoi(kq, b.hamLuong, donViDem(b.dangBaoChe));
          if (!qd) continue;
          const nhac = nhanXetQuyDoi(qd, coTheChia(b.dangBaoChe));
          t.quy.append(el('div', { class: 'lieu-quy-mot' + (nhac ? ' lieu-quy-canh' : '') },
            el('span', { class: 'lieu-quy-so', text: '≈ ' + qd.chu }),
            el('span', { class: 'lieu-quy-ten', text: b.ten + (b.hamLuong ? ' · ' + b.hamLuong : '') }),
            nhac ? el('span', { class: 'lieu-quy-nhac', text: nhac }) : null));
        }
      }
      soiLaiTran(kg);
      // Lưới an toàn: cân nặng vô lý thì nhắc, vì một dấu phẩy gõ nhầm là
      // liều lệch cả chục lần.
      const voLy = kg !== null && (kg < 0.4 || kg > 250);
      oNhac.classList.toggle('can-canh', voLy);
      oNhac.textContent = !kg ? ''
        : voLy ? '⚠️ kiểm tra lại cân nặng'
        : dem ? `đã tính ${dem} dòng`
        : 'bảng liều này không theo cân nặng';
      luuCanNang(kg);
    };

    oCan.addEventListener('input', () => { tinhLai(); lanToaCan(docCan(), oCan); });
    nhoOCan(oCan);
    const daLuu = canNangDaLuu();
    if (daLuu) oCan.value = String(daLuu);
    setTimeout(tinhLai, 0);

    khoi.append(el('div', { class: 'can-boc' },
      el('label', { class: 'can-nhan', text: 'Cân nặng' }),
      oCan,
      el('span', { class: 'can-dv', text: 'kg' }),
      oNhac));
  }

  soiLaiTran(canNangDaLuu() || null);
  khoi.append(boc);
  return khoi;
}

// Bảng hiệu chỉnh liều theo chức năng thận, kèm máy tính CrCl.
//
// Đây là phần lõi của dược lâm sàng và là chỗ hay sai nhất khi kê thuốc cho
// người cao tuổi. Có bảng mà không tính được CrCl thì vẫn phải bấm máy tính
// tay — nên hai thứ phải đi cùng nhau.
function veThan(f, ds, r) {
  if (!Array.isArray(ds) || !ds.length) return null;

  const khoi = el('section', { class: 'ct-khoi', 'data-o': 'lieuThan' }, tieuDe(f.l));
  const hangEl = [];

  const bang = el('div', { class: 'than-xem' });
  ds.forEach((d, i) => {
    const { nhan, daDoi } = nhanNguong(d.tu, d.den);
    const h = el('div', { class: 'than-xem-hang' },
      el('div', { class: 'than-xem-nguong' }, nhan,
        el('span', { class: 'than-xem-dv', text: ' mL/phút' })),
      el('div', { class: 'than-xem-lieu', text: d.lieu || '—' }),
      daDoi ? el('div', { class: 'than-xem-dao',
        text: `⚠️ Bạn ghi ${String(d.tu).trim()} → ${String(d.den).trim()}. App đọc theo chiều ${nhan}. Vào Sửa để đổi lại cho khớp.` }) : null,
      coChu(d.ghiChu) ? el('div', { class: 'than-xem-ghi', text: d.ghiChu }) : null);
    hangEl.push(h);
    bang.append(h);
  });

  // --- Máy tính CrCl
  const oTuoi = el('input', { class: 'o-nhap crcl-o', type: 'text', inputmode: 'decimal',
    placeholder: 'tuổi', autocomplete: 'off', 'aria-label': 'Tuổi' });
  const oCan = el('input', { class: 'o-nhap crcl-o', type: 'text', inputmode: 'decimal',
    placeholder: 'kg', autocomplete: 'off', 'aria-label': 'Cân nặng' });
  const oCre = el('input', { class: 'o-nhap crcl-o crcl-o-rong', type: 'text', inputmode: 'decimal',
    placeholder: 'creatinin', autocomplete: 'off', 'aria-label': 'Creatinin huyết thanh' });
  const oDonVi = el('select', { class: 'crcl-chon', 'aria-label': 'Đơn vị creatinin' },
    el('option', { value: 'umol' }, 'µmol/L'),
    el('option', { value: 'mgdl' }, 'mg/dL'));
  const oGioi = el('select', { class: 'crcl-chon', 'aria-label': 'Giới tính' },
    el('option', { value: 'nam' }, 'Nam'),
    el('option', { value: 'nu' }, 'Nữ'));
  const oKq = el('div', { class: 'crcl-kq' });

  const canDaLuu = canNangDaLuu();
  if (canDaLuu) oCan.value = String(canDaLuu);
  nhoOCan(oCan);

  const tinh = () => {
    const kg = parseFloat(String(oCan.value).replace(',', '.'));
    if (isFinite(kg) && kg > 0) luuCanNang(kg);

    const crcl = tinhCrCl({
      tuoi: oTuoi.value, canNang: oCan.value, gioiTinh: oGioi.value,
      creatinin: oCre.value, donViCre: oDonVi.value,
    });
    hangEl.forEach(h => h.classList.remove('than-dang'));
    if (crcl === null) {
      oKq.classList.remove('crcl-co');
      // Nói rõ vì sao chưa ra kết quả, thay vì im lặng để người dùng tự đoán
      const voLy = creatininVoLy(oCre.value, oDonVi.value);
      oKq.textContent = voLy
        ? '⚠️ Creatinin ngoài khoảng hợp lý — kiểm tra lại số và đơn vị (µmol/L hay mg/dL).'
        : '';
      oKq.classList.toggle('crcl-canh', voLy);
      return;
    }
    oKq.classList.remove('crcl-canh');
    const i = dongUngVoi(ds, crcl);
    if (i >= 0) hangEl[i].classList.add('than-dang');
    oKq.classList.add('crcl-co');
    oKq.innerHTML = `CrCl ≈ <b>${String(crcl).replace('.', ',')} mL/phút</b> · ${esc(mucThan(crcl))}`
      + (i >= 0 ? ' — mức tương ứng đã tô sáng bên dưới' : ' — bảng chưa có mức nào ứng với con số này');
  };

  oTuoi.addEventListener('input', tinh);
  oCre.addEventListener('input', tinh);
  oCan.addEventListener('input', () => {
    tinh();
    const kg = parseFloat(String(oCan.value).replace(',', '.'));
    lanToaCan(isFinite(kg) && kg > 0 ? kg : null, oCan);
  });
  for (const o of [oDonVi, oGioi]) o.addEventListener('change', tinh);

  // Mỗi ô một nhãn cố định. Gợi ý mờ biến mất ngay khi gõ, mà "75" với "55"
  // đứng cạnh nhau thì không ai biết đâu là tuổi đâu là cân nặng — với công cụ
  // tính liều thì nhầm chỗ đó là nhầm liều.
  const oNhan = (nhan, ...con) =>
    el('div', { class: 'crcl-o-boc' }, el('label', { class: 'crcl-nhan', text: nhan }), ...con);

  khoi.append(
    el('div', { class: 'crcl-boc' },
      el('div', { class: 'crcl-de', text: 'Tính CrCl (Cockcroft-Gault)' }),
      el('div', { class: 'crcl-hang' },
        oNhan('Tuổi', oTuoi), oNhan('Cân nặng', oCan), oNhan('Giới', oGioi)),
      el('div', { class: 'crcl-hang' },
        oNhan('Creatinin huyết thanh', oCre), oNhan('Đơn vị', oDonVi)),
      oKq),
    bang,
    el('div', { class: 'than-chan', text: 'Cockcroft-Gault dùng để hiệu chỉnh liều. Khác với eGFR dùng phân giai đoạn bệnh thận mạn — hai công thức không thay thế nhau. Người béo phì cần dùng cân nặng hiệu chỉnh.' }));

  setTimeout(tinh, 0);
  return khoi;
}

function veBuoc(f, ds) {
  const boc = el('div', { class: 'buoc-xem' });
  ds.forEach((b, i) => {
    const thuoc = el('div', {});
    for (const t of b.thuoc || []) {
      const dc = t.duocChatId ? layMot('duocchat', t.duocChatId) : null;
      const ten = dc ? dc.ten : ((t.tenTuDo || '').trim() || '(chưa đặt tên thuốc)');
      const dong = [];
      for (const ot of O_THUOC_BUOC) {
        if (coChu(t[ot.k])) dong.push(ot.ten + ': ' + t[ot.k]);
      }
      const tenEl = dc
        ? el('a', {
            class: 'thuoc-ten thuoc-lk', href: '#/duocchat/' + dc.id,
            onclick: (e) => { e.preventDefault(); di('#/duocchat/' + dc.id); }, text: ten,
          })
        : el('span', { class: 'thuoc-ten', text: ten });
      thuoc.append(el('div', { class: 'thuoc-xem' }, tenEl,
        dong.length ? el('div', { class: 'thuoc-chi', text: dong.join(' · ') }) : null));
    }
    boc.append(el('div', { class: 'buoc-xem-mot' },
      el('div', { class: 'buoc-xem-dau' },
        el('span', { class: 'buoc-so', text: 'Bước ' + (i + 1) }),
        b.ten ? el('span', { class: 'buoc-ten', text: b.ten }) : null),
      thuoc,
      coChu(b.ghiChu) ? el('div', { class: 'ct-chu buoc-ghi', html: escNhieuDong(b.ghiChu) }) : null));
  });
  if (!boc.children.length) return null;
  return el('section', { class: 'ct-khoi' }, tieuDe(f.l), boc);
}

// Cảnh báo dựng từ chính ghi chép của bạn, đặt ngay đầu trang phác đồ
function veCanhBao(r) {
  const ds = soiPhacDo(r);
  if (!ds.length) return null;
  const boc = el('section', { class: 'cb-khoi' },
    el('div', { class: 'cb-de' }, '\u26a0\ufe0f Cần để ý — ' + ds.length + ' điểm'));
  for (const c of ds) {
    boc.append(el('div', { class: 'cb-mot' },
      el('div', { class: 'cb-dau' },
        el('a', {
          class: 'cb-ten', href: '#/duocchat/' + c.canhBao.id,
          onclick: (e) => { e.preventDefault(); di('#/duocchat/' + c.canhBao.id); },
          text: c.canhBao.ten,
        }),
        el('span', { class: 'cb-noi', text: ' + ' }),
        el('a', {
          class: 'cb-ten', href: '#/duocchat/' + c.lienQuan.id,
          onclick: (e) => { e.preventDefault(); di('#/duocchat/' + c.lienQuan.id); },
          text: c.lienQuan.ten,
        })),
      el('div', { class: 'cb-o', text: 'Bạn đã ghi ở mục "' + c.o + '" của ' + c.canhBao.ten + ':' }),
      el('div', { class: 'cb-trich', text: c.trich })));
  }
  boc.append(el('div', { class: 'cb-chan', text: 'Dựng từ chính ghi chép của bạn — không phải cơ sở dữ liệu tương tác thuốc.' }));
  return boc;
}

function dsLienKet(de, ds, loai, loiTrong) {
  if (!ds.length) {
    if (!loiTrong) return el('span');
    return el('section', { class: 'ct-khoi' }, tieuDe(de),
      el('div', { class: 'ct-trong', text: loiTrong }));
  }
  const boc = el('div', { class: 'lk-ds' });
  for (const r of ds) {
    const S = SCHEMA[loai];
    boc.append(el('a', {
      class: 'lk-hang', href: '#/' + loai + '/' + r.id,
      onclick: (e) => { e.preventDefault(); di('#/' + loai + '/' + r.id); },
    },
      el('span', { class: 'lk-icon', text: S.icon }),
      el('span', { class: 'lk-chu' },
        el('span', { class: 'lk-ten', text: r.ten || '(chưa đặt tên)' }),
        el('span', { class: 'lk-phu', text: S.phu(r) || '' })),
      el('span', { class: 'lk-mui', text: '›' })));
  }
  return el('section', { class: 'ct-khoi' }, tieuDe(de), boc);
}
