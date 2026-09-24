// Tiện ích dùng chung. Không chứa núm chỉnh — núm nằm ở js/config.js

// --- Bỏ dấu tiếng Việt để tìm kiếm không cần gõ dấu ------------------------
// "Kháng sinh" -> "khang sinh", gõ "khang" vẫn ra.
export function boDau(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Tách một chuỗi thành các từ khoá để đánh chỉ mục
export function tachTu(s) {
  return boDau(s).split(/[^a-z0-9]+/).filter(t => t.length > 0);
}

export function id() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Giữ xuống dòng của textarea khi hiển thị
export function escNhieuDong(s) {
  return esc(s).replace(/\n/g, '<br>');
}

export function el(tag, props = {}, ...con) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  }
  for (const c of con.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function hoan(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function ngayGio(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function coChu(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(coChu);
  return String(v).trim() !== '';
}

export function kichThuoc(byte) {
  if (!byte) return '0 B';
  const dv = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(byte) / Math.log(1024));
  return (byte / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + dv[i];
}

// --- Thông báo nổi ---------------------------------------------------------
let oThongBao = null;
export function bao(text, loai = 'ok') {
  if (!oThongBao) {
    oThongBao = el('div', { class: 'toast-wrap' });
    document.body.append(oThongBao);
  }
  const t = el('div', { class: `toast toast-${loai}`, text });
  oThongBao.append(t);
  setTimeout(() => { t.classList.add('di'); setTimeout(() => t.remove(), 300); }, 2600);
}

// --- Hộp xác nhận ----------------------------------------------------------
// nguyHiem = true -> nút xác nhận màu đỏ (xoá, huỷ bỏ thứ gì đó).
// nguyHiem = false -> màu xanh như nút chính. Đỏ phải để dành cho việc phá huỷ,
// dùng bừa thì người dùng hết sợ màu đỏ.
export function hoi(tieuDe, loi, nhanOk = 'Xoá', nguyHiem = true) {
  return new Promise(resolve => {
    const dong = (kq) => {
      window.removeEventListener('hashchange', roiTrang);
      lop.remove();
      resolve(kq);
    };
    // Đổi trang trong lúc hộp đang mở thì coi như bấm Huỷ. Không có dòng này,
    // lớp phủ sẽ ở lại che kín màn hình và app trông như bị treo.
    const roiTrang = () => dong(false);
    window.addEventListener('hashchange', roiTrang);

    const lop = el('div', { class: 'modal-lop', onclick: e => { if (e.target === lop) dong(false); } },
      el('div', { class: 'modal' },
        el('h3', { text: tieuDe }),
        loi ? el('p', { text: loi }) : null,
        el('div', { class: 'modal-nut' },
          el('button', { class: 'nut', onclick: () => dong(false), text: 'Huỷ' }),
          el('button', {
            class: 'nut ' + (nguyHiem ? 'nut-nguy' : 'nut-chinh'),
            onclick: () => dong(true), text: nhanOk,
          }),
        ),
      ),
    );
    document.body.append(lop);
  });
}

// --- Màu nhận dạng của trang -----------------------------------------------
// Đặt ở một chỗ duy nhất vì cả khung app lẫn trang Ôn tập đều cần đổi.
// '20' ở cuối là độ mờ 12,5% — nền nhạt phải bám theo màu chính, nếu để cố
// định thì trang Bệnh (cam) vẫn hiện mấy mảng nền xanh lạc lõng.
export function datMau(mau) {
  const m = mau || '#2f6fed';
  const goc = document.documentElement;
  goc.style.setProperty('--acc', m);
  goc.style.setProperty('--acc-nen', m + '20');
  const meta = document.querySelector('meta[name="theme-color"]:not([media*="dark"])');
  if (meta) meta.setAttribute('content', m);
}
