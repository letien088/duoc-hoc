// Kho dữ liệu trong bộ nhớ + tìm kiếm + sao lưu.
// Toàn bộ bản ghi được nạp 1 lần lúc mở app rồi giữ trong RAM, nên cuộn danh
// sách và gõ tìm kiếm không phải chờ đĩa. Mọi thay đổi ghi xuống IndexedDB ngay.
import { LOAI, SCHEMA, CAU_HINH } from './config.js';
import { db, TAT_CA_KHO } from './db.js';
import { boDau, id as taoId, coChu } from './util.js';
import { xoaAnh, quenAnh, quenTatCaAnh } from './img.js';

export const KHO = {};          // KHO.duocchat = Map(id -> bản ghi)
const BLOB = new Map();         // 'loai:id' -> chuỗi đã bỏ dấu để tìm kiếm
const nghe = new Set();         // các hàm cần gọi lại khi dữ liệu đổi

for (const l of LOAI) KHO[l] = new Map();

export function khiDoi(fn) { nghe.add(fn); return () => nghe.delete(fn); }
function baoDoi() { for (const fn of nghe) { try { fn(); } catch (e) { console.error(e); } } }

// --- Nạp toàn bộ dữ liệu ---------------------------------------------------
export async function napTatCa() {
  for (const l of LOAI) {
    const ds = await db.layTatCa(l);
    KHO[l].clear();
    for (const r of ds) { KHO[l].set(r.id, r); datBlob(l, r); }
  }
}

// Gom mọi chữ của một bản ghi thành 1 chuỗi không dấu để tìm kiếm
function datBlob(loai, r) {
  const phan = [];
  // Bỏ qua mọi ô có tên kết thúc bằng Id/Ids: đó là mã nội bộ, không phải chữ
  // để tìm. Nuốt cả mã vào thì gõ vài ký tự có thể trùng mã, ra kết quả vô lý.
  const laMa = (khoa) => typeof khoa === 'string' && /Ids?$/.test(khoa);
  const dao = (v, khoa) => {
    if (v == null || laMa(khoa)) return;
    if (Array.isArray(v)) { for (const x of v) dao(x, khoa); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) dao(x, k); return; }
    if (typeof v === 'string') phan.push(v);
  };
  for (const f of SCHEMA[loai].fields) {
    if (f.t === 'lienket' || f.t === 'anh') continue;   // id không phải chữ để tìm
    dao(r[f.k], f.k);
  }
  BLOB.set(loai + ':' + r.id, boDau(phan.join(' \n ')));
}

// --- Đọc -------------------------------------------------------------------
export function danhSach(loai) {
  return [...KHO[loai].values()].sort((a, b) =>
    (a.ten || '').localeCompare(b.ten || '', 'vi', { sensitivity: 'base' }));
}
export function layMot(loai, i) { return KHO[loai].get(i) || null; }

// --- Ghi -------------------------------------------------------------------
export async function luu(loai, ban) {
  const moi = !ban.id;
  const r = { ...ban };
  if (moi) { r.id = taoId(); r.taoLuc = Date.now(); }
  r.capNhat = Date.now();
  await db.ghi(loai, r);
  KHO[loai].set(r.id, r);
  datBlob(loai, r);
  baoDoi();
  return r;
}

// --- Sổ ghi dấu xoá --------------------------------------------------------
// Xoá một mục không chỉ là bỏ nó đi, mà còn phải GHI LẠI rằng nó đã bị xoá.
// Nếu không, lần đồng bộ sau Drive chỉ thấy "máy này thiếu một mục" và sẽ gửi
// trả lại — đúng cái mục bạn vừa cố tình xoá.
export async function ghiDauXoa(loai, banGhiId) {
  await db.ghi('daXoa', {
    id: loai + ':' + banGhiId,
    loai,
    banGhiId,
    xoaLuc: Date.now(),
  });
}

export function layDauXoa() { return db.layTatCa('daXoa'); }

// Chính sổ ghi dấu cũng phải tự dọn, nếu không nó thành thứ rác mới.
// Quá hạn này thì mọi thiết bị đã đồng bộ xong từ lâu.
export async function donDauXoaCu(soNgay = CAU_HINH.GIU_DAU_XOA_NGAY) {
  const han = Date.now() - soNgay * 86400000;
  const ds = await db.layTatCa('daXoa');
  const cu = ds.filter(x => (x.xoaLuc || 0) < han).map(x => x.id);
  await db.xoaHangLoat('daXoa', cu);
  return cu.length;
}

export async function xoa(loai, i) {
  // Dọn luôn các liên kết trỏ tới bản ghi này để không còn "thuốc ma"
  if (loai === 'duocchat') {
    for (const bd of KHO.bietduoc.values()) {
      if (bd.duocChatIds?.includes(i)) {
        await luu('bietduoc', { ...bd, duocChatIds: bd.duocChatIds.filter(x => x !== i) });
      }
    }
    for (const pd of KHO.phacdo.values()) {
      let doi = false;
      const buoc = (pd.buoc || []).map(b => ({
        ...b,
        thuoc: (b.thuoc || []).map(t => {
          if (t.duocChatId !== i) return t;
          doi = true;
          return { ...t, duocChatId: '', tenTuDo: t.tenTuDo || (KHO.duocchat.get(i)?.ten || '') };
        }),
      }));
      if (doi) await luu('phacdo', { ...pd, buoc });
    }
  }
  if (loai === 'benh') {
    for (const pd of KHO.phacdo.values()) {
      if (pd.benhId === i) await luu('phacdo', { ...pd, benhId: '' });
    }
  }
  if (loai === 'bietduoc') {
    const bd = KHO.bietduoc.get(i);
    // dùng xoaAnh chứ không db.xoa, để objectURL đang giữ ảnh cũng được nhả ra
    for (const a of bd?.anh || []) {
      await xoaAnh(a);
      await ghiDauXoa('anh', a);     // để Drive cũng xoá file ảnh đó theo
    }
  }
  await db.xoa(loai, i);
  await ghiDauXoa(loai, i);
  KHO[loai].delete(i);
  BLOB.delete(loai + ':' + i);
  baoDoi();
}

// --- Nhận thay đổi từ nơi khác (Drive / máy khác) --------------------------
// Khác luu() ở chỗ GIỮ NGUYÊN capNhat. Nếu đóng dấu thời gian mới thì bản ghi
// vừa nhận về sẽ trông như vừa được sửa, rồi bị đẩy ngược lên — hai bên thi
// nhau cập nhật một bản ghi không ai đụng tới.
export async function apDungTuXa(loai, ds) {
  if (!ds.length) return 0;
  await db.ghiHangLoat(loai, ds);
  for (const r of ds) { KHO[loai].set(r.id, r); datBlob(loai, r); }
  baoDoi();
  return ds.length;
}

// Xoá theo lệnh từ nơi khác. Không ghi dấu xoá mới — dấu đã có sẵn bên kia,
// ghi thêm chỉ làm sổ phình ra vô ích.
export async function xoaTuXa(loai, i) {
  if (loai === 'anh') { await xoaAnh(i); return; }
  if (!KHO[loai]) return;
  await db.xoa(loai, i);
  KHO[loai].delete(i);
  BLOB.delete(loai + ':' + i);
  baoDoi();
}

// Ảnh đang thực sự được dùng — để biết ảnh nào đáng đẩy lên Drive
export function anhDangDung() {
  const t = new Set();
  for (const bd of KHO.bietduoc.values()) for (const a of bd.anh || []) t.add(a);
  return t;
}

// --- Tìm kiếm --------------------------------------------------------------
// Gõ không dấu vẫn ra. Mỗi từ trong câu tìm đều phải xuất hiện trong bản ghi.
// gioiHan = null nghĩa là trả về HẾT. Trang danh sách cần biết tổng số thật
// để còn nói "còn bao nhiêu nữa", chứ không được lặng lẽ cắt bớt.
export function tim(chuoi, chiLoai = null, gioiHan = CAU_HINH.TIM_KET_QUA_TOI_DA) {
  const tu = boDau(chuoi).split(/\s+/).filter(Boolean);
  if (!tu.length) return [];
  const ra = [];
  for (const loai of (chiLoai ? [chiLoai] : LOAI)) {
    for (const r of KHO[loai].values()) {
      const b = BLOB.get(loai + ':' + r.id) || '';
      if (!tu.every(t => b.includes(t))) continue;
      const ten = boDau(r.ten || '');
      // xếp hạng: khớp đầu tên > trong tên > chỉ có trong phần thân
      const diem = ten.startsWith(tu[0]) ? 0 : ten.includes(tu[0]) ? 1 : 2;
      ra.push({ loai, r, diem });
    }
  }
  ra.sort((a, b) => a.diem - b.diem || (a.r.ten || '').localeCompare(b.r.ten || '', 'vi'));
  return gioiHan ? ra.slice(0, gioiHan) : ra;
}

// --- Tra ngược liên kết ----------------------------------------------------
export function bietDuocCua(duocChatId) {
  return [...KHO.bietduoc.values()]
    .filter(b => (b.duocChatIds || []).includes(duocChatId))
    .sort((a, b) => (a.ten || '').localeCompare(b.ten || '', 'vi'));
}

export function phacDoDungDuocChat(duocChatId) {
  return [...KHO.phacdo.values()].filter(p =>
    (p.buoc || []).some(b => (b.thuoc || []).some(t => t.duocChatId === duocChatId)));
}

export function phacDoCuaBenh(benhId) {
  return [...KHO.phacdo.values()]
    .filter(p => p.benhId === benhId)
    .sort((a, b) => (a.ten || '').localeCompare(b.ten || '', 'vi'));
}

// Gom các giá trị đã từng nhập của một ô, để gợi ý lần nhập sau
export function goiY(loai, khoaO) {
  const set = new Set();
  for (const r of KHO[loai].values()) {
    const v = r[khoaO];
    if (Array.isArray(v)) v.forEach(x => coChu(x) && set.add(String(x).trim()));
    else if (coChu(v)) set.add(String(v).trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

// Các mục vừa sửa gần đây nhất, không phải sắp xếp theo tên trước cho phí
export function vuaSua(soLuong = 5) {
  const ra = [];
  for (const l of LOAI) for (const r of KHO[l].values()) ra.push({ loai: l, r });
  ra.sort((a, b) => (b.r.capNhat || 0) - (a.r.capNhat || 0));
  return ra.slice(0, soLuong);
}

// Duyệt không sắp xếp — dùng cho chỗ chỉ cần đếm hoặc lọc
export function duyet(loai) { return KHO[loai].values(); }

// Tìm bản ghi cùng loại đã mang đúng cái tên này (không phân biệt dấu, hoa thường)
export function timTrungTen(loai, ten, boQuaId) {
  const k = boDau(ten || '');
  if (!k) return null;
  for (const r of KHO[loai].values()) {
    if (r.id === boQuaId) continue;
    if (boDau(r.ten) === k) return r;
  }
  return null;
}

// Nhân bản một bản ghi. Bốn thế hệ cephalosporin giống nhau tới 80% nội
// dung — gõ lại từ đầu bốn lần là việc vô ích nhất trong cả quá trình học.
//
// Hàm này KHÔNG ghi vào kho. Nó chỉ dựng bản nháp rồi trả về, để trang sửa
// mở lên với nội dung điền sẵn và người dùng tự bấm Lưu. Bản cũ ghi thẳng
// vào kho ngay lúc bấm nút, nên bấm nhầm rồi thoát ra là có một bản rác nằm
// lại mà không ai biết — bấm bốn lần thì bốn bản trùng tên y hệt, cũng không
// lần nào đi qua chỗ nhắc trùng tên vì chỗ đó nằm trong nút Lưu của form.
export function nhanBan(loai, i) {
  const goc = KHO[loai].get(i);
  if (!goc) return null;
  const ban = JSON.parse(JSON.stringify(goc));
  delete ban.id;
  delete ban.taoLuc;
  delete ban.capNhat;
  ban.ten = (goc.ten || '') + ' (bản sao)';
  delete ban.sao;                          // dấu sao là thứ bạn CHỌN, không thừa kế
  if (loai === 'bietduoc') ban.anh = [];   // ảnh không nhân bản, tránh đếm hai lần
  return ban;
}

// Đánh dấu để ôn kỹ. Có thuốc thi hay ra, có thuốc chỉ đọc cho biết.
export async function doiDauSao(loai, i) {
  const r = KHO[loai].get(i);
  if (!r) return null;
  return luu(loai, { ...r, sao: !r.sao });
}

export function demTatCa() {
  const d = {};
  for (const l of LOAI) d[l] = KHO[l].size;
  return d;
}

// --- Sao lưu / khôi phục ---------------------------------------------------
function blobSangChuoi(b) {
  return new Promise((ok, loi) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = () => loi(fr.error);
    fr.readAsDataURL(b);
  });
}

function chuoiSangBlob(dataUrl) {
  const [dau, b64] = dataUrl.split(',');
  const mime = (dau.match(/:(.*?);/) || [, 'image/jpeg'])[1];
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

// Trả về thẳng một Blob, KHÔNG dựng một chuỗi JSON khổng lồ trong RAM.
// Trước đây gom hết ảnh thành base64 rồi JSON.stringify một phát: 300 ảnh là
// ~60MB chuỗi, nhân thêm vài lần khi sao chép — đủ để Safari trên iPhone giết
// tab. Nay đọc từng ảnh một rồi đẩy ngay thành một mảnh của Blob.
export async function xuatSaoLuu(kemAnh = true) {
  const phan = [];
  phan.push('{"app":"duoc_hoc"'
    + ',"phienBan":' + JSON.stringify(CAU_HINH.PHIEN_BAN)
    + ',"xuatLuc":' + JSON.stringify(new Date().toISOString())
    + ',"kemAnh":' + (kemAnh ? 'true' : 'false')
    + ',"duLieu":{');

  const khoi = [];
  for (const l of LOAI) khoi.push(JSON.stringify(l) + ':' + JSON.stringify([...KHO[l].values()]));
  // Kèm cả kho 'meta' để tiến độ ôn tập không mất khi khôi phục sang máy khác
  khoi.push('"meta":' + JSON.stringify(await db.layTatCa('meta')));
  khoi.push('"daXoa":' + JSON.stringify(await db.layTatCa('daXoa')));
  phan.push(khoi.join(','));

  if (kemAnh) {
    phan.push(',"anh":[');
    const khoa = await db.layKhoa('anh');
    let dauTien = true;
    for (const k of khoa) {
      const a = await db.lay('anh', k);
      if (!a?.blob) continue;
      const chuoi = await blobSangChuoi(a.blob);
      phan.push((dauTien ? '' : ',')
        + JSON.stringify({ id: a.id, taoLuc: a.taoLuc, data: chuoi }));
      dauTien = false;
    }
    phan.push(']');
  }

  phan.push('}}');
  await db.ghi('meta', { id: 'saoLuuGanNhat', giaTri: Date.now() });
  return new Blob(phan, { type: 'application/json' });
}

// Quét ảnh không còn biệt dược nào dùng tới rồi xoá. Chạy tay ở Cài đặt, và
// sau này chạy kèm mỗi lần đồng bộ Drive.
export async function donRac() {
  const dangDung = new Set();
  for (const bd of KHO.bietduoc.values()) {
    for (const a of bd.anh || []) dangDung.add(a);
  }
  const khoa = await db.layKhoa('anh');
  const thua = khoa.filter(k => !dangDung.has(k));
  let byte = 0;
  for (const k of thua) {
    const a = await db.lay('anh', k);
    byte += a?.co || a?.blob?.size || 0;
    quenAnh(k);
    await ghiDauXoa('anh', k);       // Drive cũng phải bỏ ảnh này đi
  }
  await db.xoaHangLoat('anh', thua);
  return { soAnh: thua.length, byte };
}

// Gộp vào dữ liệu đang có. Trùng id thì bản MỚI HƠN thắng, nên khôi phục
// nhiều lần hoặc nhập nhầm file cũ đều không làm mất ghi chú vừa gõ.
export async function nhapSaoLuu(goi) {
  if (!goi || goi.app !== 'duoc_hoc' || !goi.duLieu) {
    throw new Error('File này không phải bản sao lưu của app.');
  }
  const ketQua = { them: 0, capNhat: 0, boQua: 0, anh: 0, tienDo: 0, hoiSinh: 0, noiLai: 0 };
  const daGoiVe = [];                      // 'loai:id' của những mục file mang về
  for (const l of LOAI) {
    const ds = goi.duLieu[l] || [];
    const canGhi = [];
    for (const r of ds) {
      if (!r || !r.id) continue;
      const cu = KHO[l].get(r.id);
      if (!cu) { canGhi.push(r); ketQua.them++; }
      else if ((r.capNhat || 0) > (cu.capNhat || 0)) { canGhi.push(r); ketQua.capNhat++; }
      else ketQua.boQua++;
    }
    if (canGhi.length) {
      await db.ghiHangLoat(l, canGhi);
      for (const r of canGhi) { KHO[l].set(r.id, r); datBlob(l, r); daGoiVe.push(l + ':' + r.id); }
    }
  }
  // Tiến độ ôn tập: gộp theo từng mục, lần ôn gần đây hơn thì thắng
  for (const m of goi.duLieu.meta || []) {
    if (!m?.id) continue;
    if (m.id === 'tienDoOnTap') {
      const cu = (await db.lay('meta', 'tienDoOnTap'))?.giaTri || {};
      const gop = { ...cu };
      for (const [k, v] of Object.entries(m.giaTri || {})) {
        if (!gop[k] || (v.lanCuoi || 0) > (gop[k].lanCuoi || 0)) gop[k] = v;
      }
      await db.ghi('meta', { id: 'tienDoOnTap', giaTri: gop });
      ketQua.tienDo = Object.keys(gop).length;
    } else if (!(await db.lay('meta', m.id))) {
      await db.ghi('meta', m);
    }
  }

  // Sổ ghi dấu xoá: gộp vào, dấu nào mới hơn thì giữ
  for (const x of goi.duLieu.daXoa || []) {
    if (!x?.id) continue;
    const cu = await db.lay('daXoa', x.id);
    if (!cu || (x.xoaLuc || 0) > (cu.xoaLuc || 0)) await db.ghi('daXoa', x);
  }

  // Mục nào vừa được file gọi về thì phải xoá luôn dấu xoá cũ của nó. Để lại
  // thì lần đồng bộ sau đọc đúng cái dấu đó rồi lặng lẽ xoá lại thứ vừa khôi
  // phục — người dùng thấy dữ liệu quay về rồi biến mất, không hiểu vì sao.
  // Phải làm SAU vòng gộp dấu xoá ở trên, không thì nó ghi đè lại ngay.
  for (const kh of daGoiVe) {
    if (await db.lay('daXoa', kh)) { await db.xoa('daXoa', kh); ketQua.hoiSinh++; }
  }

  // Lấy danh sách mã ảnh MỘT lần rồi tra trong bộ nhớ. Hỏi từng cái qua
  // db.lay sẽ đọc nguyên cả tấm ảnh lên chỉ để biết nó có tồn tại hay không.
  const anhDaCo = new Set(await db.layKhoa('anh'));
  for (const a of goi.duLieu.anh || []) {
    if (!a?.id || !a.data || anhDaCo.has(a.id)) continue;
    await db.ghi('anh', { id: a.id, taoLuc: a.taoLuc || Date.now(), blob: chuoiSangBlob(a.data) });
    anhDaCo.add(a.id);
    ketQua.anh++;
  }
  ketQua.noiLai = await noiLaiLienKet();
  baoDoi();
  return ketQua;
}

// Xoá một dược chất sẽ cắt nó khỏi mọi phác đồ, nhưng giữ lại cái tên dưới
// dạng chữ tự do (tenTuDo) đúng để còn biết đường lần lại. Gọi dược chất đó
// về từ file sao lưu mà phác đồ vẫn trỏ vào khoảng trống thì khôi phục mới
// xong một nửa: bước thuốc đó không tra được liều, không vào được bộ soi
// tương tác. Bản phác đồ nằm trong file thì cũ hơn bản đã bị cắt nên bị bỏ
// qua — không ai nối lại hộ. Nối ở đây, và chỉ nối khi tên khớp đúng.
async function noiLaiLienKet() {
  const theoTen = new Map();
  for (const r of KHO.duocchat.values()) {
    const k = boDau(r.ten);
    if (k) theoTen.set(k, r.id);
  }
  let noi = 0;
  for (const pd of [...KHO.phacdo.values()]) {
    let doi = false;
    const buoc = (pd.buoc || []).map(b => ({
      ...b,
      thuoc: (b.thuoc || []).map(t => {
        if (t.duocChatId || !t.tenTuDo) return t;
        const id = theoTen.get(boDau(t.tenTuDo));
        if (!id) return t;
        doi = true; noi++;
        return { ...t, duocChatId: id };
      }),
    }));
    if (doi) await luu('phacdo', { ...pd, buoc });
  }
  return noi;
}

export async function xoaToanBo() {
  for (const k of TAT_CA_KHO) await db.xoaSach(k);
  for (const l of LOAI) KHO[l].clear();
  BLOB.clear();
  quenTatCaAnh();      // nhả hết ảnh đang giữ trong bộ nhớ, không chỉ xoá ổ đĩa
  baoDoi();
}

export async function saoLuuGanNhat() {
  const m = await db.lay('meta', 'saoLuuGanNhat');
  return m?.giaTri || 0;
}
