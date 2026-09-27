// Lớp truy cập IndexedDB. Không chứa núm chỉnh — núm nằm ở js/config.js
import { LOAI } from './config.js';

const TEN_DB = 'duoc_hoc';
const BAN_DB = 2;   // 2: thêm kho daXoa + dongbo cho việc đồng bộ Drive

// Ngoài 4 loại bản ghi còn các kho phụ:
//   anh    — lưu ảnh riêng để bản ghi biệt dược luôn nhẹ, mở danh sách nhanh
//   meta   — cấu hình lặt vặt (lần sao lưu gần nhất, tiến độ ôn tập...)
//   daXoa  — SỔ GHI DẤU XOÁ. Không có nó, máy khác (hoặc Drive) sẽ "hồi sinh"
//            lại đúng những mục bạn vừa xoá, vì chúng chỉ thấy "bên kia thiếu
//            một mục" chứ không biết là thiếu do bị xoá hay do chưa có.
//   dongbo — trạng thái đồng bộ: lần cuối, mã đối chiếu, hàng chờ
const KHO_PHU = ['anh', 'meta', 'daXoa', 'dongbo'];

let _db = null;
let _dangMo = null;

export function moDB() {
  if (_db) return Promise.resolve(_db);
  if (_dangMo) return _dangMo;            // nhiều lời gọi cùng lúc chỉ mở 1 lần
  _dangMo = new Promise((ok, loi) => {
    // Chốt chặn treo: nếu một tab khác (hay chính app mở ở Safari) đang giữ kho
    // dữ liệu bản cũ, lệnh mở có thể nằm im MÃI MÃI mà không báo lỗi gì. Không
    // có đồng hồ đếm này thì người dùng ngồi nhìn màn hình chờ vô hạn.
    let xong = false;
    const dongHo = setTimeout(() => {
      if (xong) return;
      _dangMo = null;
      loi(new Error('Mở kho dữ liệu quá lâu. Có thể app đang mở ở một tab Safari khác — '
        + 'đóng hết các tab đó rồi thử lại.'));
    }, 12000);
    const hoanTat = (fn) => (...a) => { xong = true; clearTimeout(dongHo); return fn(...a); };

    const rq = indexedDB.open(TEN_DB, BAN_DB);
    rq.onupgradeneeded = (e) => {
      clearTimeout(dongHo);      // đang nâng cấp thật, đừng hối
      const db = e.target.result;
      for (const l of LOAI) {
        if (!db.objectStoreNames.contains(l)) {
          const kho = db.createObjectStore(l, { keyPath: 'id' });
          kho.createIndex('capNhat', 'capNhat');
          kho.createIndex('taoLuc', 'taoLuc');
        }
      }
      for (const k of KHO_PHU) {
        if (!db.objectStoreNames.contains(k)) {
          db.createObjectStore(k, { keyPath: 'id' });
        }
      }
    };
    rq.onsuccess = hoanTat(() => {
      _db = rq.result;
      _db.onversionchange = () => { _db.close(); _db = null; _dangMo = null; };
      // Safari đôi khi đóng kết nối khi app nằm nền lâu; mở lại ở lần dùng sau
      _db.onclose = () => { _db = null; _dangMo = null; };
      _dangMo = null;
      ok(_db);
    });
    rq.onerror = hoanTat(() => { _dangMo = null; loi(rq.error || new Error('Không mở được kho dữ liệu trong máy.')); });
    rq.onblocked = hoanTat(() => {
      _dangMo = null;
      loi(new Error('Kho dữ liệu đang bị một tab khác giữ. Đóng hết các tab Safari '
        + 'đang mở app này rồi thử lại.'));
    });
  });
  return _dangMo;
}

// QUAN TRỌNG: mở kho XONG XUÔI rồi mới tạo giao dịch, và phát lệnh ngay trong
// cùng một nhịp. Nếu chèn `await` vào giữa lúc tạo giao dịch và lúc dùng nó,
// WebKit có thể đã đóng giao dịch lại và ném TransactionInactiveError.
async function chay(kho, cheDo, phat) {
  const dbi = await moDB();
  return new Promise((ok, loi) => {
    let gd;
    try {
      gd = dbi.transaction(kho, cheDo);
    } catch (e) {
      loi(e); return;
    }
    let ketQua;
    gd.oncomplete = () => ok(ketQua);
    // gd.error có thể là null (iOS, WebKit): phải thay bằng lỗi có chữ, không
    // thì nơi gọi đọc e.message là vỡ và người dùng không được báo gì.
    gd.onerror = () => loi(gd.error || new Error('Không ghi được dữ liệu vào máy — có thể bộ nhớ đã đầy hoặc trình duyệt đang chặn lưu trữ.'));
    gd.onabort = () => loi(gd.error || new Error('Giao dịch bị huỷ.'));
    try {
      const rq = phat(gd);
      if (rq) rq.onsuccess = () => { ketQua = rq.result; };
    } catch (e) {
      try { gd.abort(); } catch (_) { /* bỏ qua */ }
      loi(e);
    }
  });
}

// Một số bản WebKit không cất được Blob vào IndexedDB (báo lỗi rỗng). Ảnh là
// thứ duy nhất app lưu dạng Blob, nên riêng kho 'anh' có đường dự phòng: cất
// dạng ArrayBuffer, đọc ra thì dựng lại Blob — các file khác không phải biết.
async function sangBuf(o) {
  if (!(o && o.blob instanceof Blob)) return o;
  const { blob, ...con } = o;
  return { ...con, buf: await blob.arrayBuffer(), loaiBlob: blob.type || 'image/jpeg' };
}
function tuBuf(o) {
  if (!o || o.blob || !o.buf) return o;
  const { buf, loaiBlob, ...con } = o;
  return { ...con, blob: new Blob([buf], { type: loaiBlob || 'image/jpeg' }) };
}

export const db = {
  async layTatCa(kho) {
    const ds = await chay(kho, 'readonly', gd => gd.objectStore(kho).getAll());
    return kho === 'anh' ? (ds || []).map(tuBuf) : ds;
  },
  async lay(kho, khoa) {
    const r = await chay(kho, 'readonly', gd => gd.objectStore(kho).get(khoa));
    return kho === 'anh' ? tuBuf(r) : r;
  },
  dem(kho)           { return chay(kho, 'readonly',  gd => gd.objectStore(kho).count()); },
  layKhoa(kho)       { return chay(kho, 'readonly',  gd => gd.objectStore(kho).getAllKeys()); },
  xoa(kho, khoa)     { return chay(kho, 'readwrite', gd => gd.objectStore(kho).delete(khoa)); },
  xoaSach(kho)       { return chay(kho, 'readwrite', gd => gd.objectStore(kho).clear()); },

  async ghi(kho, obj) {
    try {
      await chay(kho, 'readwrite', gd => gd.objectStore(kho).put(obj));
    } catch (e) {
      if (kho !== 'anh' || !(obj && obj.blob instanceof Blob)) throw e;
      const ban = await sangBuf(obj);      // thử lại dạng ArrayBuffer
      await chay(kho, 'readwrite', gd => gd.objectStore(kho).put(ban));
    }
    return obj;
  },

  // Ghi nhiều bản ghi trong MỘT giao dịch — dùng khi nhập file sao lưu
  async ghiHangLoat(kho, ds) {
    if (!ds.length) return 0;
    const ghi = (danhSach) => chay(kho, 'readwrite', gd => {
      const k = gd.objectStore(kho);
      for (const o of danhSach) k.put(o);
      return null;
    });
    try {
      await ghi(ds);
    } catch (e) {
      if (kho !== 'anh') throw e;
      await ghi(await Promise.all(ds.map(sangBuf)));
    }
    return ds.length;
  },

  // Xoá nhiều khoá trong MỘT giao dịch — dùng khi dọn rác
  async xoaHangLoat(kho, khoa) {
    if (!khoa.length) return 0;
    await chay(kho, 'readwrite', gd => {
      const k = gd.objectStore(kho);
      for (const x of khoa) k.delete(x);
      return null;
    });
    return khoa.length;
  },
};

// Đo dung lượng thật trên chính máy đang chạy (không phải con số phỏng đoán)
export async function doDungLuong() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { daDung: e.usage || 0, hanMuc: e.quota || 0 };
  } catch (_) {
    return null;
  }
}

export const TAT_CA_KHO = [...LOAI, ...KHO_PHU];
