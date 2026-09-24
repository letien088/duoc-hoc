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
    const rq = indexedDB.open(TEN_DB, BAN_DB);
    rq.onupgradeneeded = (e) => {
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
    rq.onsuccess = () => {
      _db = rq.result;
      _db.onversionchange = () => { _db.close(); _db = null; _dangMo = null; };
      // Safari đôi khi đóng kết nối khi app nằm nền lâu; mở lại ở lần dùng sau
      _db.onclose = () => { _db = null; _dangMo = null; };
      _dangMo = null;
      ok(_db);
    };
    rq.onerror = () => { _dangMo = null; loi(rq.error); };
    rq.onblocked = () => { _dangMo = null; loi(new Error('Kho dữ liệu đang bị tab khác giữ.')); };
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
    gd.onerror = () => loi(gd.error);
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

export const db = {
  layTatCa(kho)      { return chay(kho, 'readonly',  gd => gd.objectStore(kho).getAll()); },
  lay(kho, khoa)     { return chay(kho, 'readonly',  gd => gd.objectStore(kho).get(khoa)); },
  dem(kho)           { return chay(kho, 'readonly',  gd => gd.objectStore(kho).count()); },
  layKhoa(kho)       { return chay(kho, 'readonly',  gd => gd.objectStore(kho).getAllKeys()); },
  xoa(kho, khoa)     { return chay(kho, 'readwrite', gd => gd.objectStore(kho).delete(khoa)); },
  xoaSach(kho)       { return chay(kho, 'readwrite', gd => gd.objectStore(kho).clear()); },

  async ghi(kho, obj) {
    await chay(kho, 'readwrite', gd => gd.objectStore(kho).put(obj));
    return obj;
  },

  // Ghi nhiều bản ghi trong MỘT giao dịch — dùng khi nhập file sao lưu
  async ghiHangLoat(kho, ds) {
    if (!ds.length) return 0;
    await chay(kho, 'readwrite', gd => {
      const k = gd.objectStore(kho);
      for (const o of ds) k.put(o);
      return null;
    });
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
