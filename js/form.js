// Sinh form nhập liệu từ SCHEMA trong js/config.js.
// Thêm một ô thông tin mới = thêm 1 dòng vào SCHEMA, file này không phải sửa.
import { SCHEMA, NHOM_DOI_TUONG, O_LIEU, O_THUOC_BUOC, CAU_HINH } from './config.js';
import { el, esc, bao, hoi, id as taoId, boDau } from './util.js';
import { danhSach, goiY, layMot, tim, timTrungTen } from './store.js';
import { nenVaLuu, veAnh, xoaAnh } from './img.js';

export function veForm(loai, banDau, luuXong, huy) {
  const S = SCHEMA[loai];
  const ban = JSON.parse(JSON.stringify(banDau || {}));
  const doc = [];   // hàm đọc giá trị từng ô khi bấm Lưu
  // Kho ảnh chỉ được đụng vào SAU KHI lưu xong. Rời trang giữa chừng thì hoàn
  // tác, để không xoá oan ảnh của bản ghi cũ và không bỏ lại ảnh rác.
  const moc = { sauLuu: [], sauHuy: [] };

  const than = el('div', { class: 'form' });

  for (const f of S.fields) {
    const o = veO(loai, f, ban, doc, moc);
    if (o) than.append(o);
  }

  let daLuu = false;
  const roiTrang = () => {
    window.removeEventListener('hashchange', roiTrang);
    if (!daLuu) for (const fn of moc.sauHuy) { try { fn(); } catch (e) { console.error(e); } }
  };
  window.addEventListener('hashchange', roiTrang);

  // Chốt chặn bấm hai lần: lưu còn đang chạy thì mọi cú bấm sau bị bỏ qua.
  // Không có nó, bấm Lưu hai cái liên tiếp sẽ tạo ra HAI bản ghi giống hệt.
  let dangLuu = false;

  const luu = async () => {
    if (dangLuu) return;
    dangLuu = true;
    try {
      const ra = { ...ban };
      for (const d of doc) d(ra);

      const thieu = S.fields.filter(f => f.bat && !String(ra[f.k] || '').trim());
      if (thieu.length) { bao('Chưa nhập: ' + thieu.map(f => f.l).join(', '), 'loi'); return; }

      // Nhắc khi trùng tên — nhắc thôi, không cấm. Có những thứ trùng tên thật.
      const trung = timTrungTen(loai, ra.ten, ra.id);
      if (trung) {
        const tiep = await hoi(
          'Đã có ' + S.tenSo + ' tên này',
          '"' + trung.ten + '" đã nằm trong sổ tay rồi. Vẫn thêm một mục nữa?',
          'Vẫn thêm', false);      // thêm mục không phải việc phá huỷ -> không tô đỏ
        if (!tiep) return;
      }

      daLuu = true;
      try {
        await luuXong(ra);
      } catch (e) {
        daLuu = false;
        bao('Không lưu được: ' + e.message, 'loi');
        return;
      }
      for (const fn of moc.sauLuu) { try { await fn(); } catch (e) { console.error(e); } }
    } finally {
      dangLuu = false;
    }
  };

  const thanhNut = el('div', { class: 'form-nut' },
    el('button', { class: 'nut', onclick: huy, text: 'Huỷ' }),
    el('button', { class: 'nut nut-chinh', onclick: luu, text: 'Lưu' }),
  );

  const boc = el('div', {}, than, thanhNut);
  boc.luuNgay = luu;      // để thanh trên cũng gọi được lệnh Lưu
  return boc;
}

// ---------------------------------------------------------------------------
function nhan(f) {
  return el('label', { class: 'o-nhan', html: esc(f.l) + (f.bat ? ' <span class="bat">*</span>' : '') });
}

function veO(loai, f, ban, doc, moc) {
  switch (f.t) {
    case 'text':     return oText(loai, f, ban, doc);
    case 'textarea': return oTextArea(f, ban, doc);
    case 'chips':    return oChips(loai, f, ban, doc);
    case 'lieu':     return oLieu(f, ban, doc);
    case 'lienket':  return oLienKet(f, ban, doc);
    case 'anh':      return oAnh(f, ban, doc, moc);
    case 'buoc':     return oBuoc(f, ban, doc);
    default:         return null;
  }
}

// --- Ô chữ 1 dòng ----------------------------------------------------------
function oText(loai, f, ban, doc) {
  const dlId = f.goiY ? 'dl-' + loai + '-' + f.k : null;
  const inp = el('input', {
    class: 'o-nhap', type: 'text', value: ban[f.k] || '',
    placeholder: f.ph || '', list: dlId,
    autocapitalize: 'sentences', autocomplete: 'off', spellcheck: 'false',
  });
  doc.push(ra => { ra[f.k] = inp.value.trim(); });

  const con = [nhan(f), inp];
  if (dlId) {
    const dl = el('datalist', { id: dlId });
    for (const v of goiY(loai, f.k)) dl.append(el('option', { value: v }));
    con.push(dl);
  }
  return el('div', { class: 'o' }, ...con);
}

// --- Ô chữ nhiều dòng, tự cao dần theo nội dung -----------------------------
function oTextArea(f, ban, doc) {
  const ta = el('textarea', {
    class: 'o-nhap o-dai', rows: 3, placeholder: f.ph || '',
    autocapitalize: 'sentences', spellcheck: 'false',
  });
  ta.value = ban[f.k] || '';
  const cao = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };
  ta.addEventListener('input', cao);
  setTimeout(cao, 0);
  doc.push(ra => { ra[f.k] = ta.value.trim(); });
  return el('div', { class: 'o' }, nhan(f), ta);
}

// --- Ô nhãn (nhiều thẻ nhỏ) ------------------------------------------------
function oChips(loai, f, ban, doc) {
  let ds = Array.isArray(ban[f.k]) ? [...ban[f.k]] : [];
  const boc = el('div', { class: 'chip-boc' });
  const inp = el('input', {
    class: 'o-nhap', type: 'text', placeholder: 'Gõ rồi Enter để thêm',
    list: 'dl-chip-' + loai + '-' + f.k, autocapitalize: 'none', autocomplete: 'off',
  });
  const ve = () => {
    boc.innerHTML = '';
    ds.forEach((c, i) => boc.append(el('span', { class: 'chip' }, c,
      el('button', { class: 'chip-x', type: 'button', 'aria-label': 'Bỏ nhãn ' + c,
        onclick: () => { ds.splice(i, 1); ve(); }, text: '×' }))));
  };
  const them = () => {
    const v = inp.value.trim();
    if (v && !ds.includes(v)) ds.push(v);
    inp.value = ''; ve();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); them(); }
  });
  inp.addEventListener('blur', them);
  ve();
  doc.push(ra => { ra[f.k] = ds; });

  const dl = el('datalist', { id: 'dl-chip-' + loai + '-' + f.k });
  for (const v of goiY(loai, f.k)) dl.append(el('option', { value: v }));
  return el('div', { class: 'o' }, nhan(f), boc, inp, dl);
}

// --- Ô liều dùng: 5 thẻ gập cho 5 nhóm đối tượng ---------------------------
function oLieu(f, ban, doc) {
  const gt = ban[f.k] || {};
  const boc = el('div', { class: 'lieu-boc' });
  const tatCa = {};

  for (const nh of NHOM_DOI_TUONG) {
    const cu = gt[nh.k] || {};
    const oCon = {};
    const noiDung = el('div', { class: 'lieu-than' });
    for (const ol of O_LIEU) {
      const i = el('input', {
        class: 'o-nhap', type: 'text', value: cu[ol.k] || '',
        placeholder: ol.ph, autocapitalize: 'none', autocomplete: 'off',
      });
      oCon[ol.k] = i;
      noiDung.append(el('div', { class: 'o o-nho' },
        el('label', { class: 'o-nhan', text: ol.ten }), i));
    }
    tatCa[nh.k] = oCon;

    const coSan = Object.values(cu).some(v => String(v || '').trim());
    const the = el('details', coSan ? { open: '' } : {},
      el('summary', { class: 'lieu-dau' },
        el('span', { class: 'lieu-icon', text: nh.icon }),
        el('span', { text: nh.ten }),
        coSan ? el('span', { class: 'lieu-cham' }) : null,
      ),
      noiDung,
    );
    boc.append(the);
  }

  doc.push(ra => {
    const kq = {};
    for (const nh of NHOM_DOI_TUONG) {
      const m = {};
      let co = false;
      for (const ol of O_LIEU) {
        const v = tatCa[nh.k][ol.k].value.trim();
        if (v) co = true;
        m[ol.k] = v;
      }
      if (co) kq[nh.k] = m;
    }
    ra[f.k] = kq;
  });

  return el('div', { class: 'o' }, nhan(f), boc);
}

// --- Ô liên kết tới bản ghi khác -------------------------------------------
function oLienKet(f, ban, doc) {
  const don = !!f.don;
  let chon = don
    ? (ban[f.k] ? [ban[f.k]] : [])
    : (Array.isArray(ban[f.k]) ? [...ban[f.k]] : []);

  const boc = el('div', { class: 'chip-boc' });
  const timO = el('input', {
    class: 'o-nhap', type: 'text',
    placeholder: 'Gõ để tìm ' + SCHEMA[f.toi].tenSo + '…',
    autocomplete: 'off', autocapitalize: 'none',
  });
  const ketQua = el('div', { class: 'lk-ketqua' });

  const ve = () => {
    boc.innerHTML = '';
    for (const i of chon) {
      const r = layMot(f.toi, i);
      boc.append(el('span', { class: 'chip chip-lk' }, r ? r.ten : '(đã xoá)',
        el('button', {
          class: 'chip-x', type: 'button', text: '×',
          onclick: () => { chon = chon.filter(x => x !== i); ve(); },
        })));
    }
  };

  const veKetQua = () => {
    const q = timO.value.trim();
    ketQua.innerHTML = '';
    if (!q) return;
    // Dùng lại chỉ mục tìm kiếm đã dựng sẵn trong store: gõ không dấu vẫn ra,
    // và không phải sắp xếp lại cả nghìn bản ghi sau mỗi phím gõ.
    const ds = tim(q, f.toi)
      .map(x => x.r)
      .filter(r => !chon.includes(r.id))
      .slice(0, 8);
    for (const r of ds) {
      ketQua.append(el('button', {
        class: 'lk-mot', type: 'button', text: r.ten,
        onclick: () => {
          if (don) chon = [r.id]; else chon.push(r.id);
          timO.value = ''; ketQua.innerHTML = ''; ve();
        },
      }));
    }
    if (!ds.length) {
      ketQua.append(el('div', { class: 'lk-trong', text: 'Không có. Tạo ở mục ' + SCHEMA[f.toi].ten + ' trước.' }));
    }
  };

  timO.addEventListener('input', veKetQua);
  ve();
  doc.push(ra => { ra[f.k] = don ? (chon[0] || '') : chon; });

  return el('div', { class: 'o' }, nhan(f), boc, timO, ketQua);
}

// --- Ô ảnh -----------------------------------------------------------------
function oAnh(f, ban, doc, moc) {
  let ds = Array.isArray(ban[f.k]) ? [...ban[f.k]] : [];
  const themMoi = [];   // ảnh vừa thêm trong lần sửa này
  const xoaDi = [];     // ảnh vừa gỡ ra trong lần sửa này
  const luoi = el('div', { class: 'anh-luoi' });

  // Lưu xong mới thật sự xoá ảnh đã gỡ
  moc.sauLuu.push(async () => { for (const i of xoaDi) await xoaAnh(i); });
  // Rời trang mà chưa lưu: dọn ảnh vừa thêm, ảnh đã gỡ giữ nguyên trong máy
  moc.sauHuy.push(async () => { for (const i of themMoi) await xoaAnh(i); });

  const ve = () => {
    luoi.innerHTML = '';
    ds.forEach((aid, i) => {
      const im = el('img', { class: 'anh-o', alt: 'ảnh thuốc' });
      veAnh(im, aid);
      luoi.append(el('div', { class: 'anh-khung' }, im,
        el('button', {
          class: 'anh-x', type: 'button', text: '×', 'aria-label': 'Gỡ ảnh này',
          onclick: async () => {
            if (!(await hoi('Gỡ ảnh này?', 'Ảnh chỉ mất hẳn sau khi bạn bấm Lưu.', 'Gỡ'))) return;
            xoaDi.push(aid);
            ds.splice(i, 1); ve();
          },
        })));
    });
  };

  // capture="environment" -> iPhone mở thẳng camera sau.
  // Bỏ capture thì iOS cho chọn giữa Thư viện ảnh và Chụp ảnh.
  const chon = el('input', { type: 'file', accept: 'image/*', multiple: '', style: 'display:none' });
  const may  = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });

  const nhan_ = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const file of files) {
      if (ds.length >= CAU_HINH.ANH_TOI_DA_MOI_BD) {
        bao(`Tối đa ${CAU_HINH.ANH_TOI_DA_MOI_BD} ảnh mỗi biệt dược.`, 'loi');
        break;
      }
      try {
        const a = await nenVaLuu(file);
        ds.push(a.id);
        themMoi.push(a.id);
        ve();
      } catch (err) { bao('Lỗi ảnh: ' + err.message, 'loi'); }
    }
  };
  chon.addEventListener('change', nhan_);
  may.addEventListener('change', nhan_);

  doc.push(ra => { ra[f.k] = ds; });
  ve();

  return el('div', { class: 'o' }, nhan(f), luoi,
    el('div', { class: 'anh-nut' },
      el('button', { class: 'nut', type: 'button', onclick: () => may.click(), text: '📷 Chụp ảnh' }),
      el('button', { class: 'nut', type: 'button', onclick: () => chon.click(), text: '🖼 Chọn từ thư viện' }),
      chon, may,
    ));
}

// --- Ô các bước điều trị (phác đồ) -----------------------------------------
function oBuoc(f, ban, doc) {
  let ds = Array.isArray(ban[f.k]) ? JSON.parse(JSON.stringify(ban[f.k])) : [];
  const boc = el('div', { class: 'buoc-boc' });

  // Dựng MỘT danh sách gợi ý tên dược chất rồi mọi ô thuốc dùng chung. Trước
  // đây mỗi ô tự dựng một bản riêng, phác đồ 10 thuốc là 10 bản sao.
  const dsDuocChat = danhSach('duocchat');
  const dlId = 'dl-thuoc-' + taoId();
  const dlChung = el('datalist', { id: dlId });
  for (const r of dsDuocChat) dlChung.append(el('option', { value: r.ten }));
  const theoTen = new Map(dsDuocChat.map(r => [boDau(r.ten), r]));

  const ve = () => {
    boc.innerHTML = '';
    ds.forEach((b, iB) => boc.append(veMotBuoc(b, iB)));
  };

  const veMotBuoc = (b, iB) => {
    const tenO = el('input', {
      class: 'o-nhap', type: 'text', value: b.ten || '',
      placeholder: 'VD: Điều trị ban đầu / Dòng 1', autocomplete: 'off',
    });
    tenO.addEventListener('input', () => { b.ten = tenO.value; });

    const ghiO = el('textarea', { class: 'o-nhap o-dai', rows: 2, placeholder: 'Ghi chú cho bước này' });
    ghiO.value = b.ghiChu || '';
    const caoGhi = () => { ghiO.style.height = 'auto'; ghiO.style.height = (ghiO.scrollHeight + 2) + 'px'; };
    ghiO.addEventListener('input', () => { b.ghiChu = ghiO.value; caoGhi(); });
    setTimeout(caoGhi, 0);

    const thuocBoc = el('div', { class: 'thuoc-boc' });
    b.thuoc = b.thuoc || [];

    const veThuoc = () => {
      thuocBoc.innerHTML = '';
      b.thuoc.forEach((t, iT) => thuocBoc.append(veMotThuoc(b, t, iT, veThuoc)));
    };
    veThuoc();

    return el('div', { class: 'buoc' },
      el('div', { class: 'buoc-dau' },
        el('span', { class: 'buoc-so', text: 'Bước ' + (iB + 1) }),
        el('div', { class: 'buoc-dieu' },
          iB > 0 ? el('button', {
            class: 'nut-nho', type: 'button', text: '↑',
            onclick: () => { [ds[iB - 1], ds[iB]] = [ds[iB], ds[iB - 1]]; ve(); },
          }) : null,
          iB < ds.length - 1 ? el('button', {
            class: 'nut-nho', type: 'button', text: '↓',
            onclick: () => { [ds[iB + 1], ds[iB]] = [ds[iB], ds[iB + 1]]; ve(); },
          }) : null,
          el('button', {
            class: 'nut-nho nut-nguy', type: 'button', text: 'Xoá bước',
            onclick: async () => {
              if (!(await hoi('Xoá bước này?', 'Các thuốc trong bước cũng mất.'))) return;
              ds.splice(iB, 1); ve();
            },
          }),
        ),
      ),
      el('div', { class: 'o o-nho' }, el('label', { class: 'o-nhan', text: 'Tên bước' }), tenO),
      el('div', { class: 'o o-nho' }, el('label', { class: 'o-nhan', text: 'Thuốc dùng trong bước' }), thuocBoc,
        el('button', {
          class: 'nut nut-them', type: 'button', text: '+ Thêm thuốc',
          onclick: () => { b.thuoc.push({ duocChatId: '', tenTuDo: '' }); veThuoc(); },
        })),
      el('div', { class: 'o o-nho' }, el('label', { class: 'o-nhan', text: 'Ghi chú' }), ghiO),
    );
  };

  const veMotThuoc = (b, t, iT, veLai) => {
    // Ô tên thuốc: gõ tự do, nhưng nếu trùng tên một dược chất đã có thì tự
    // nối liên kết, để trang phác đồ bấm được sang trang dược chất.
    const tenBanDau = t.duocChatId ? (layMot('duocchat', t.duocChatId)?.ten || t.tenTuDo || '') : (t.tenTuDo || '');
    const tenO = el('input', {
      class: 'o-nhap', type: 'text', value: tenBanDau, list: dlId,
      placeholder: 'Tên thuốc', autocomplete: 'off',
    });

    const noiLai = () => {
      const v = tenO.value.trim();
      const khop = theoTen.get(boDau(v));      // tra bảng, không quét cả danh sách
      if (khop) { t.duocChatId = khop.id; t.tenTuDo = ''; }
      else { t.duocChatId = ''; t.tenTuDo = v; }
      capNhatCoLienKet();
    };
    tenO.addEventListener('input', noiLai);
    tenO.addEventListener('change', noiLai);

    const co = el('span', { class: 'lk-co' });
    const capNhatCoLienKet = () => {
      co.textContent = t.duocChatId ? '🔗' : '';
      co.title = t.duocChatId ? 'Đã nối với dược chất trong app' : '';
    };
    capNhatCoLienKet();

    const oCon = el('div', { class: 'thuoc-o' });
    for (const ot of O_THUOC_BUOC) {
      const i = el('input', {
        class: 'o-nhap', type: 'text', value: t[ot.k] || '',
        placeholder: ot.ten + (ot.ph ? ' — ' + ot.ph : ''), autocomplete: 'off',
      });
      i.addEventListener('input', () => { t[ot.k] = i.value; });
      oCon.append(i);
    }

    return el('div', { class: 'thuoc' },
      el('div', { class: 'thuoc-dau' }, tenO, co,
        el('button', {
          class: 'nut-nho nut-nguy', type: 'button', text: '×',
          onclick: () => { b.thuoc.splice(iT, 1); veLai(); },
        })),
      oCon,
    );
  };

  ve();
  doc.push(ra => {
    // Giữ lại mọi dòng thuốc còn chữ. Trước đây dòng nào chưa có tên là bị vứt,
    // kể cả khi người dùng đã gõ xong liều và thời gian — mất mà không báo.
    const coChuGi = (t) => t.duocChatId
      || (t.tenTuDo || '').trim()
      || O_THUOC_BUOC.some(o => String(t[o.k] || '').trim());
    ra[f.k] = ds
      .map(b => ({
        ten: (b.ten || '').trim(),
        ghiChu: (b.ghiChu || '').trim(),
        thuoc: (b.thuoc || []).filter(coChuGi),
      }))
      .filter(b => b.ten || b.ghiChu || b.thuoc.length);
  });

  return el('div', { class: 'o' }, nhan(f), boc,
    el('button', {
      class: 'nut nut-them', type: 'button', text: '+ Thêm bước điều trị',
      onclick: () => { ds.push({ ten: '', ghiChu: '', thuoc: [] }); ve(); },
    }),
    dlChung);
}
