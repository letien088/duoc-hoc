// Vẽ trang xem chi tiết một bản ghi (chế độ đọc).
import { SCHEMA, NHOM_DOI_TUONG, O_LIEU, O_THUOC_BUOC } from './config.js';
import { el, escNhieuDong, coChu, ngayGio } from './util.js';
import { layMot, bietDuocCua, phacDoDungDuocChat, phacDoCuaBenh } from './store.js';
import { veAnh } from './img.js';

const di = (h) => { location.hash = h; };

export function veChiTiet(loai, r) {
  const S = SCHEMA[loai];
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

  for (const f of S.fields) {
    if (f.k === 'ten') continue;
    const v = r[f.k];
    if (!coChu(v)) continue;
    const kh = veKhoi(f, v, r);
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

function veKhoi(f, v, r) {
  switch (f.t) {
    case 'text':
    case 'textarea':
      return el('section', { class: 'ct-khoi' }, tieuDe(f.l),
        el('div', { class: 'ct-chu', html: escNhieuDong(v) }));

    case 'chips':
      return el('section', { class: 'ct-khoi' }, tieuDe(f.l),
        el('div', { class: 'chip-boc' }, ...v.map(c => el('span', { class: 'chip', text: c }))));

    case 'anh':
      return el('section', { class: 'ct-khoi' }, tieuDe(f.l), veLuoiAnh(v));

    case 'lieu':
      return veLieu(f, v);

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

function veLieu(f, v) {
  const boc = el('div', { class: 'lieu-xem' });
  for (const nh of NHOM_DOI_TUONG) {
    const m = v[nh.k];
    if (!coChu(m)) continue;
    const hang = [];
    for (const ol of O_LIEU) {
      if (!coChu(m[ol.k])) continue;
      hang.push(el('div', { class: 'lieu-hang' },
        el('span', { class: 'lieu-nhan', text: ol.ten }),
        el('span', { class: 'lieu-gt', html: escNhieuDong(m[ol.k]) })));
    }
    boc.append(el('div', { class: 'lieu-the' },
      el('div', { class: 'lieu-the-dau' },
        el('span', { class: 'lieu-icon', text: nh.icon }),
        el('span', { text: nh.ten })),
      ...hang));
  }
  if (!boc.children.length) return null;
  return el('section', { class: 'ct-khoi' }, tieuDe(f.l), boc);
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
