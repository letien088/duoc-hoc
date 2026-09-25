// Lớp nói chuyện với Google Drive.
//
// Quyền xin là 'drive.file' — mức HẸP NHẤT mà Google có: app chỉ đọc/ghi/xoá
// được đúng những file do chính nó tạo ra. Ảnh, tài liệu sẵn có trong Drive
// của bạn thì Google không trả về, coi như không tồn tại đối với app này.
// Đây là giới hạn ở phía máy chủ Google, không phải lời hứa của code.
//
// File này chỉ làm việc vận chuyển. Logic gộp dữ liệu nằm ở js/dongbo.js.
import { CAU_HINH } from './config.js';

const QUYEN = 'https://www.googleapis.com/auth/drive.file';
const GIS = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const API_TAI = 'https://www.googleapis.com/upload/drive/v3';

let _token = null;          // chỉ giữ trong bộ nhớ, không ghi xuống máy
let _hetHan = 0;
let _tokenClient = null;
let _dangXinToken = null;    // gộp các lời gọi cùng lúc làm một
let _dangTaoThuMuc = null;
let _dangTaoThuMucAnh = null;
let _email = null;
let _thuMucId = null;
let _thuMucAnhId = null;

// --- Nạp thư viện đăng nhập của Google -------------------------------------
let _dangNap = null;
function napGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_dangNap) return _dangNap;
  _dangNap = new Promise((ok, loi) => {
    const s = document.createElement('script');
    s.src = GIS;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { _dangNap = null; loi(new Error('Không tải được thư viện đăng nhập của Google. Kiểm tra mạng.')); };
    document.head.append(s);
  });
  return _dangNap;
}

function conHan() {
  return !!_token && Date.now() < _hetHan - 60000;   // trừ hao 1 phút
}

async function layToken(imLang = true) {
  if (conHan()) return _token;
  if (!CAU_HINH.GOOGLE_CLIENT_ID) throw new Error('Chưa khai báo mã Client ID của Google.');
  // Nhiều lệnh gọi cùng lúc (đẩy ảnh song song chẳng hạn) mà mỗi lệnh tự xin
  // token thì Google sẽ bật ra mấy cửa sổ đăng nhập chồng lên nhau.
  if (_dangXinToken) return _dangXinToken;
  _dangXinToken = xinToken(imLang).finally(() => { _dangXinToken = null; });
  return _dangXinToken;
}

async function xinToken(imLang) {
  await napGIS();

  return new Promise((ok, loi) => {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CAU_HINH.GOOGLE_CLIENT_ID,
      scope: QUYEN,
      callback: (kq) => {
        if (kq.error) { loi(new Error(moTaLoi(kq.error))); return; }
        _token = kq.access_token;
        _hetHan = Date.now() + (Number(kq.expires_in) || 3600) * 1000;
        ok(_token);
      },
      error_callback: (e) => loi(new Error(moTaLoi(e?.type || 'khong_ro'))),
    });
    // prompt rỗng = thử lấy lặng lẽ, không hiện cửa sổ nào nếu đã đồng ý trước đó
    _tokenClient.requestAccessToken({ prompt: imLang ? '' : 'consent' });
  });
}

function moTaLoi(ma) {
  const b = {
    popup_closed: 'Bạn đã đóng cửa sổ đăng nhập.',
    popup_failed_to_open: 'Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên rồi thử lại.',
    access_denied: 'Bạn chưa cho phép app dùng Drive.',
    interaction_required: 'Cần đăng nhập lại.',
    consent_required: 'Cần đăng nhập lại.',
    login_required: 'Cần đăng nhập lại.',
  };
  return b[ma] || ('Google báo lỗi: ' + ma);
}

// --- Gọi API ---------------------------------------------------------------
async function goi(duong, tuyChon = {}, imLang = true) {
  const tk = await layToken(imLang);
  const res = await fetch(duong, {
    ...tuyChon,
    headers: { Authorization: 'Bearer ' + tk, ...(tuyChon.headers || {}) },
  });
  if (res.status === 401) {          // token hết hạn giữa chừng
    _token = null; _hetHan = 0;
    const tk2 = await layToken(true);
    return fetch(duong, {
      ...tuyChon,
      headers: { Authorization: 'Bearer ' + tk2, ...(tuyChon.headers || {}) },
    });
  }
  return res;
}

async function goiJson(duong, tuyChon, imLang) {
  const res = await goi(duong, tuyChon, imLang);
  if (!res.ok) {
    let chiTiet = '';
    try { chiTiet = (await res.json())?.error?.message || ''; } catch (_) { /* bỏ qua */ }
    throw new Error(`Drive trả lỗi ${res.status}${chiTiet ? ': ' + chiTiet : ''}`);
  }
  return res.status === 204 ? null : res.json();
}

const thoat = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function timThuMuc(ten, chaId) {
  const q = `name='${thoat(ten)}' and mimeType='application/vnd.google-apps.folder'`
    + ` and trashed=false and '${chaId || 'root'}' in parents`;
  const kq = await goiJson(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
  return kq.files?.[0]?.id || null;
}

async function taoThuMuc(ten, chaId) {
  const kq = await goiJson(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: ten,
      mimeType: 'application/vnd.google-apps.folder',
      ...(chaId ? { parents: [chaId] } : {}),
    }),
  });
  return kq.id;
}

// Gộp lời gọi trùng: hai lệnh cùng lúc mà mỗi lệnh tự tạo thư mục thì Drive
// sẽ có HAI thư mục cùng tên, dữ liệu chia đôi ra hai nơi mà không ai biết.
async function thuMuc() {
  if (_thuMucId) return _thuMucId;
  if (_dangTaoThuMuc) return _dangTaoThuMuc;
  _dangTaoThuMuc = (async () => {
    const id = (await timThuMuc(CAU_HINH.THU_MUC_DRIVE, null))
            || (await taoThuMuc(CAU_HINH.THU_MUC_DRIVE, null));
    _thuMucId = id;
    return id;
  })().finally(() => { _dangTaoThuMuc = null; });
  return _dangTaoThuMuc;
}

async function thuMucAnh() {
  if (_thuMucAnhId) return _thuMucAnhId;
  if (_dangTaoThuMucAnh) return _dangTaoThuMucAnh;
  _dangTaoThuMucAnh = (async () => {
    const cha = await thuMuc();
    const id = (await timThuMuc('anh', cha)) || (await taoThuMuc('anh', cha));
    _thuMucAnhId = id;
    return id;
  })().finally(() => { _dangTaoThuMucAnh = null; });
  return _dangTaoThuMucAnh;
}

async function timFile(ten, chaId) {
  const q = `name='${thoat(ten)}' and trashed=false and '${chaId}' in parents`;
  const kq = await goiJson(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,modifiedTime)&pageSize=10`);
  return kq.files?.[0] || null;
}

async function lietKeTatCa(chaId) {
  const ra = [];
  let trang = null;
  do {
    const q = `trashed=false and '${chaId}' in parents`;
    const u = `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)`
      + `&pageSize=1000${trang ? '&pageToken=' + trang : ''}`;
    const kq = await goiJson(u);
    ra.push(...(kq.files || []));
    trang = kq.nextPageToken;
  } while (trang);
  return ra;
}

// Tải lên bằng multipart: một lần gửi cả mô tả lẫn nội dung
async function taiLen(ten, chaId, blob, fileIdCu) {
  const moTa = { name: ten, ...(fileIdCu ? {} : { parents: [chaId] }) };
  const ranh = '----duochoc' + Math.random().toString(36).slice(2);
  const than = new Blob([
    `--${ranh}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(moTa),
    `\r\n--${ranh}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${ranh}--\r\n`,
  ]);
  const duong = fileIdCu
    ? `${API_TAI}/files/${fileIdCu}?uploadType=multipart&fields=id`
    : `${API_TAI}/files?uploadType=multipart&fields=id`;
  const kq = await goiJson(duong, {
    method: fileIdCu ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${ranh}` },
    body: than,
  });
  return kq.id;
}

async function taiVe(fileId) {
  const res = await goi(`${API}/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error('Không tải được file từ Drive (' + res.status + ')');
  return res.blob();
}

// ---------------------------------------------------------------------------
// Giao diện "kho xa" mà js/dongbo.js dùng. Bản giả lập trong lúc kiểm thử
// cũng cài đúng bộ hàm này, nên logic đồng bộ kiểm chứng được mà không cần
// đụng tới Google thật.
// ---------------------------------------------------------------------------
export const khoXaDrive = {
  ten: 'Google Drive',

  sanSang() { return !!CAU_HINH.GOOGLE_CLIENT_ID; },
  daNoi()   { return conHan(); },
  danhTinh() { return _email; },

  async noi(imLang = true) {
    await layToken(imLang);
    if (!_email) {
      try {
        const kq = await goiJson(`${API}/about?fields=user(emailAddress)`);
        _email = kq?.user?.emailAddress || null;
      } catch (_) { _email = null; }
    }
    return true;
  },

  async ngat() {
    const tk = _token;
    _token = null; _hetHan = 0; _email = null;
    _thuMucId = null; _thuMucAnhId = null;
    _dangXinToken = null; _dangTaoThuMuc = null; _dangTaoThuMucAnh = null;
    try {
      if (tk && window.google?.accounts?.oauth2) {
        window.google.accounts.oauth2.revoke(tk, () => {});
      }
    } catch (_) { /* bỏ qua */ }
  },

  async docJson(ten) {
    const f = await timFile(ten, await thuMuc());
    if (!f) return null;
    const b = await taiVe(f.id);
    return JSON.parse(await b.text());
  },

  async ghiJson(ten, obj) {
    const cha = await thuMuc();
    const cu = await timFile(ten, cha);
    const b = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    await taiLen(ten, cha, b, cu?.id);
  },

  async danhSachAnh() {
    const ds = await lietKeTatCa(await thuMucAnh());
    return ds.map(f => f.name.replace(/\.jpg$/i, ''));
  },

  async docAnh(anhId) {
    const f = await timFile(anhId + '.jpg', await thuMucAnh());
    if (!f) return null;
    return taiVe(f.id);
  },

  async ghiAnh(anhId, blob) {
    const cha = await thuMucAnh();
    const cu = await timFile(anhId + '.jpg', cha);
    await taiLen(anhId + '.jpg', cha, blob, cu?.id);
  },

  async xoaAnh(anhId) {
    const f = await timFile(anhId + '.jpg', await thuMucAnh());
    if (!f) return false;
    await goi(`${API}/files/${f.id}`, { method: 'DELETE' });
    return true;
  },
};
