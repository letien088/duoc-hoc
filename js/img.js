// Chụp / chọn ảnh biệt dược rồi nén trước khi lưu.
// Ảnh gốc iPhone 14 Pro Max ~3-5 MB. Nén xuống còn khoảng 100-200 KB mà vẫn
// đọc rõ chữ trên vỏ hộp. Núm chỉnh kích cỡ & chất lượng ở js/config.js
import { CAU_HINH } from './config.js';
import { db } from './db.js';
import { id as taoId } from './util.js';

// Mỗi objectURL giữ nguyên cả tấm ảnh trong RAM. Xem qua vài trăm biệt dược
// mà không thu hồi là ăn hết bộ nhớ máy, nên giữ tối đa chừng này rồi nhả dần
// cái cũ nhất ra (Map giữ đúng thứ tự thêm vào nên lấy khoá đầu là cũ nhất).
const CACHE_TOI_DA = 60;
const cache = new Map();      // id ảnh -> objectURL
const dangDoc = new Map();    // id ảnh -> Promise, tránh đọc trùng cùng lúc

function nhoUrl(anhId, url) {
  cache.set(anhId, url);
  while (cache.size > CACHE_TOI_DA) {
    const cuNhat = cache.keys().next().value;
    if (cuNhat === anhId) break;
    URL.revokeObjectURL(cache.get(cuNhat));
    cache.delete(cuNhat);
  }
}

export async function nenVaLuu(file) {
  if (!file || !/^image\//.test(file.type || '')) {
    throw new Error('Tệp này không phải ảnh.');
  }
  const bitmap = await taoBitmap(file);
  const canh = CAU_HINH.ANH_CANH_TOI_DA;
  let w = bitmap.width, h = bitmap.height;
  if (!w || !h) throw new Error('Ảnh hỏng, không đọc được kích thước.');

  const ti = Math.min(1, canh / Math.max(w, h));
  w = Math.max(1, Math.round(w * ti));
  h = Math.max(1, Math.round(h * ti));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise(ok =>
    cv.toBlob(ok, 'image/jpeg', CAU_HINH.ANH_CHAT_LUONG));
  // Nhả canvas ngay, iOS giới hạn tổng diện tích canvas đang sống
  cv.width = cv.height = 0;
  if (!blob) throw new Error('Không nén được ảnh này.');

  const ban = { id: taoId(), taoLuc: Date.now(), blob, w, h, co: blob.size };
  await db.ghi('anh', ban);
  return ban;
}

// createImageBitmap xử lý sẵn xoay ảnh theo EXIF — ảnh chụp dọc bằng iPhone
// sẽ không bị nằm ngang.
async function taoBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) { /* rơi xuống cách dưới */ }
  }
  return new Promise((ok, loi) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); ok(im); };
    im.onerror = () => { URL.revokeObjectURL(url); loi(new Error('Không đọc được ảnh.')); };
    im.src = url;
  });
}

export function urlAnh(anhId) {
  if (cache.has(anhId)) return Promise.resolve(cache.get(anhId));
  if (dangDoc.has(anhId)) return dangDoc.get(anhId);

  const cho = db.lay('anh', anhId)
    .then(a => {
      if (!a?.blob) return null;
      // Trong lúc đang đọc có thể đã có lời gọi khác tạo url rồi
      if (cache.has(anhId)) return cache.get(anhId);
      const url = URL.createObjectURL(a.blob);
      nhoUrl(anhId, url);
      return url;
    })
    .catch(() => null)
    .finally(() => dangDoc.delete(anhId));

  dangDoc.set(anhId, cho);
  return cho;
}

export async function xoaAnh(anhId) {
  quenAnh(anhId);
  await db.xoa('anh', anhId);
}

// Chỉ nhả objectURL, không đụng tới dữ liệu
export function quenAnh(anhId) {
  const url = cache.get(anhId);
  if (url) { URL.revokeObjectURL(url); cache.delete(anhId); }
}

export function quenTatCaAnh() {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

// Gắn ảnh vào thẻ <img> sau khi đọc xong từ IndexedDB.
// Không tìm thấy ảnh (hay gặp khi khôi phục từ bản sao lưu "xuất riêng chữ")
// thì nói rõ ra, đừng để lại một ô vuông trống không ai hiểu vì sao.
export function veAnh(imgEl, anhId) {
  urlAnh(anhId).then(u => {
    if (u) { imgEl.src = u; return; }
    imgEl.classList.add('anh-mat');
    imgEl.alt = 'Ảnh không còn trong máy';
  });
}
