// Tính liều theo cân nặng.
//
// Người học dược đứng trước bệnh nhi 14 kg, đọc "10–15 mg/kg/lần" rồi phải tự
// nhân tay. Đó là thao tác làm nhiều nhất trong ngày và cũng là chỗ dễ sai
// nhất. File này đọc hiểu chuỗi liều rồi tính hộ.
//
// Nguyên tắc: KHÔNG đoán. Chuỗi nào không chắc chắn hiểu đúng thì trả về null
// và app im lặng, chứ không hiện ra một con số có thể sai.

import { boDau } from './util.js';

const DON_VI = {
  mcg: 0.001, 'µg': 0.001, 'μg': 0.001,
  mg: 1,
  g: 1000,
  ui: null, iu: null,          // đơn vị quốc tế: nhân được nhưng không đổi sang mg
};

// "10–15", "10-15", "10 - 15", "10 đến 15", "0,5"
const SO = '\\d+(?:[.,]\\d+)?';
const MAU = new RegExp(
  '(' + SO + ')' +                                   // số đầu
  '(?:\\s*(?:–|—|-|đến|tới|~)\\s*(' + SO + '))?' +   // số thứ hai (nếu có khoảng)
  '\\s*(mcg|µg|μg|mg|g|mL|ml|mEq|mmol|UI|IU)' +                     // đơn vị
  '\\s*\\/\\s*kg',                                   // trên mỗi kg
  'gi');   // g: quét HẾT các đoạn mg/kg trong ô, không chỉ đoạn đầu

// Bản KHÔNG có cờ g, dành riêng cho việc hỏi "có khớp không".
// Biểu thức mang cờ g nhớ vị trí lần tìm trước, nên gọi .test() nhiều lần trên
// cùng một chuỗi sẽ trả về true/false xen kẽ — ô nhập cân nặng lúc có lúc không.
const MAU_HOI = new RegExp(MAU.source, 'i');

function soVN(s) { return parseFloat(String(s).replace(',', '.')); }

// Làm tròn gọn: số lớn thì bỏ phần lẻ, số nhỏ giữ 1-2 chữ số sau dấu phẩy
function gonSo(n) {
  if (!isFinite(n)) return '';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return (Math.round(n * 10) / 10).toString().replace('.', ',');
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

// Chọn thang đo cho dễ đọc: 1400 mg viết thành 1,4 g, 2000 mcg thành 2 mg.
// Cả khoảng dùng CHUNG một thang, chọn theo đầu trên, để hai số so được với nhau.
function thangDo(luongLonNhat, donVi) {
  const dv = donVi.toLowerCase();
  if (dv === 'mg' && luongLonNhat >= 1000) return { chia: 1000, dv: 'g' };
  if (dv === 'mcg' || dv === 'µg' || dv === 'μg') {
    return luongLonNhat >= 1000 ? { chia: 1000, dv: 'mg' } : { chia: 1, dv: 'mcg' };
  }
  return { chia: 1, dv: donVi };
}

// Một khoảng thì viết "210 – 280 mg", không phải "210 mg – 280 mg"
function vietKhoang(duoi, tren, donVi) {
  const t = thangDo(tren !== null ? tren : duoi, donVi);
  const a = gonSo(duoi / t.chia);
  if (tren === null) return a + ' ' + t.dv;
  return a + ' – ' + gonSo(tren / t.chia) + ' ' + t.dv;
}

/**
 * Đọc một chuỗi liều và tính ra lượng thật cho cân nặng đã cho.
 * Trả về null nếu chuỗi không phải dạng theo cân nặng, hoặc không chắc hiểu đúng.
 */
// Đọc phần đuôi ngay sau "/kg" để biết liều này tính cho mỗi lần, mỗi ngày,
// hay là TỐC ĐỘ TRUYỀN mỗi phút / mỗi giờ.
//
// Phần này quan trọng về an toàn: "0,1 mcg/kg/phút" là tốc độ truyền liên tục.
// Tính ra "7 mcg" trơ trọi thì người đọc rất dễ hiểu nhầm thành liều một lần.
function doiTuong(duoi_chuoi) {
  const d = duoi_chuoi.slice(0, 24);
  if (/^\s*\/\s*(ph\u00fat|phut|min)/i.test(d)) return '/ph\u00fat';
  if (/^\s*\/\s*(gi\u1edd|gio|h\b)/i.test(d)) return '/gi\u1edd';
  if (/^\s*\/\s*(l\u1ea7n|lan)/i.test(d)) return '/l\u1ea7n';
  if (/^\s*\/\s*(24\s*gi\u1edd|24\s*gio|24h|ng\u00e0y|ngay)/i.test(d)) return '/24 gi\u1edd';
  if (/\/\s*(ph\u00fat|phut)/i.test(d)) return '/ph\u00fat';
  if (/\/\s*(l\u1ea7n|lan)/i.test(d)) return '/l\u1ea7n';
  if (/\/\s*(24\s*gi\u1edd|24h|ng\u00e0y|ngay)/i.test(d)) return '/24 gi\u1edd';
  return '';
}

export function tinhTheoCan(chuoi, kg) {
  if (!chuoi || !kg || !isFinite(kg) || kg <= 0) return null;
  const van = String(chuoi);
  MAU.lastIndex = 0;

  // Quét HẾT các đoạn theo cân nặng trong ô. Một ô có thể ghi nhiều mức liều
  // cho nhiều tình huống — chỉ tính đoạn đầu rồi hiện một con số là làm người
  // đọc tưởng đó là tất cả.
  const phan = [];
  let m;
  while ((m = MAU.exec(van)) !== null) {
    const a = soVN(m[1]);
    const b = m[2] !== undefined ? soVN(m[2]) : null;
    const donVi = m[3];
    if (isFinite(a) && a > 0 && (b === null || (isFinite(b) && b >= a))) {
      const moi = doiTuong(van.slice(m.index + m[0].length));
      const duoi = a * kg;
      const tren = b !== null ? b * kg : null;
      phan.push({ duoi, tren, donVi, moi, chu: vietKhoang(duoi, tren, donVi) + moi });
    }
    if (phan.length >= 4) break;      // ô ghi quá nhiều mức thì dừng, tránh rối
  }
  if (!phan.length) return null;

  return {
    ...phan[0],
    soDoan: phan.length,
    chu: phan.map(x => x.chu).join(' \u00b7 '),
  };
}

/** Có ít nhất một ô nào trong bảng liều tính được theo cân nặng không? */
export function coTheTinh(lieu) {
  if (!lieu || typeof lieu !== 'object') return false;
  for (const nhom of Object.values(lieu)) {
    if (!nhom || typeof nhom !== 'object') continue;
    for (const v of Object.values(nhom)) {
      if (MAU_HOI.test(String(v || ''))) return true;   // dùng bản không cờ g
    }
  }
  return false;
}

// --- Nhớ cân nặng vừa dùng, tiện cho lần tra sau ---------------------------
const KHOA = 'duoc_hoc_can_nang';

export function canNangDaLuu() {
  try {
    const v = parseFloat(localStorage.getItem(KHOA) || '');
    return isFinite(v) && v > 0 ? v : null;
  } catch (_) { return null; }
}

export function luuCanNang(kg) {
  try {
    if (kg && isFinite(kg) && kg > 0) localStorage.setItem(KHOA, String(kg));
    else localStorage.removeItem(KHOA);
  } catch (_) { /* chế độ riêng tư chặn thì thôi, không sao */ }
}

// ---------------------------------------------------------------------------
// Quy đổi liều đã tính ra số đơn vị biệt dược thực tế.
//
// Tính ra "140 – 210 mg" mới xong một nửa việc. Người kê thuốc còn phải cầm
// gói 150 mg lên và tự chia. Đây là bước cuối cùng, và cũng là chỗ dễ nhầm.
// ---------------------------------------------------------------------------

// Hàm lượng ghi trên hộp: "500 mg", "150 mg", "100 mcg/nhát"
const MAU_HAM = /(\d+(?:[.,]\d+)?)\s*(mcg|µg|μg|mg|g|mL|ml|UI|IU)(?![a-zA-Z])/i;

const VE_MG = { mcg: 0.001, 'µg': 0.001, 'μg': 0.001, mg: 1, g: 1000 };

/** Đọc hàm lượng của một biệt dược. Thuốc phối hợp thì trả null — không đoán. */
export function docHamLuong(chuoi) {
  if (!chuoi) return null;
  const van = String(chuoi);
  // "500mg + 125mg" là thuốc phối hợp: không biết con số nào ứng với dược chất
  // đang tra, nên thà không nói gì còn hơn nói sai.
  if (/[+/]\s*\d/.test(van)) return null;
  const m = MAU_HAM.exec(van);
  if (!m) return null;
  const luong = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(luong) || luong <= 0) return null;
  return { luong, donVi: m[2] };
}

function quyVeMg(luong, donVi) {
  const he = VE_MG[String(donVi).toLowerCase()] ?? VE_MG[donVi];
  return he ? luong * he : null;
}

// Hai bên cùng một đơn vị thì chia thẳng, không cần quy về mg. Nhờ vậy dịch
// truyền (mL) và insulin (UI) cũng quy đổi được, chứ không im lặng như trước.
function cungDonVi(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

/**
 * Cần `lieu` (kết quả tinhTheoCan) thì tương đương bao nhiêu đơn vị biệt dược?
 * Trả null nếu hai bên không cùng thang đo — không quy đổi bừa.
 */
export function quyDoi(ketQuaLieu, hamLuongChuoi, donViDem = 'đơn vị') {
  if (!ketQuaLieu) return null;
  // Ô liều ghi NHIỀU mức cho nhiều tình huống ("10 mg/kg dưới 1 tuổi, 20 mg/kg
  // trẻ lớn") thì không thể biết mức nào ứng với người bệnh đang tra. Hiện một
  // con số duy nhất là mời người đọc hiểu nhầm — thà không hiện gì.
  if ((ketQuaLieu.soDoan || 1) > 1) return null;
  const h = docHamLuong(hamLuongChuoi);
  if (!h) return null;

  let mgHam, mgDuoi, mgTren;
  if (cungDonVi(h.donVi, ketQuaLieu.donVi)) {
    mgHam = h.luong;
    mgDuoi = ketQuaLieu.duoi;
    mgTren = ketQuaLieu.tren;
  } else {
    mgHam = quyVeMg(h.luong, h.donVi);
    mgDuoi = quyVeMg(ketQuaLieu.duoi, ketQuaLieu.donVi);
    mgTren = ketQuaLieu.tren !== null ? quyVeMg(ketQuaLieu.tren, ketQuaLieu.donVi) : null;
  }
  if (!mgHam || !mgDuoi) return null;      // khác thang đo, không quy đổi bừa

  const lam = (n) => {
    const x = n / mgHam;
    if (x >= 10) return String(Math.round(x));
    return (Math.round(x * 100) / 100).toString().replace('.', ',');
  };
  const chu = mgTren !== null
    ? lam(mgDuoi) + ' – ' + lam(mgTren) + ' ' + donViDem
    : lam(mgDuoi) + ' ' + donViDem;

  return { chu, duoi: mgDuoi / mgHam, tren: mgTren !== null ? mgTren / mgHam : null };
}

// Dạng bào chế nào bẻ/chia được, dạng nào không. Gợi ý "1,4 viên nang" là gợi
// ý sai — viên nang không chia được.
//
// So khớp theo TỪNG TỪ chứ không theo chuỗi con: "uống" có chứa "ống", khớp
// kiểu chuỗi con thì "hỗn dịch uống" bị hiểu nhầm thành thuốc dạng ống.
// Lọ và ống tiêm KHÔNG nằm trong danh sách này: pha xong rút một phần là
// thao tác thường ngày. Cái thật sự không chia được là dạng đã đóng liều cứng.
const TU_KHONG_CHIA = new Set([
  'nang',      // viên nang
  'xit', 'nhat',  // bình xịt định liều: mỗi nhát một liều cố định
  'dat',       // viên đặt
  'mieng', 'dan',  // miếng dán
  'goi',       // gói bột: chia dở dang không chính xác
  'bom',       // bơm định liều
]);
const CUM_KHONG_CHIA = ['bao phim', 'bao tan', 'phong thich', 'giai phong', 'keo dai'];

export function coTheChia(dangBaoChe) {
  const sach = boDau(dangBaoChe || '');
  if (!sach) return true;
  if (CUM_KHONG_CHIA.some(c => sach.includes(c))) return false;
  return !sach.split(/[^a-z0-9]+/).some(t => TU_KHONG_CHIA.has(t));
}

// Hàm lượng có hợp với liều cần dùng không. Cần 140 mg mà hộp là viên 500 mg
// thì con số "0,28 viên" tự nó đã nói lên rằng dạng này không dành cho đối
// tượng đang tra — nói thẳng ra vẫn hơn để người đọc tự suy.
export function nhanXetQuyDoi(qd, chiaDuoc) {
  if (!qd) return '';
  // Xét theo ĐẦU TRÊN của khoảng. Lấy đầu dưới thì khoảng 0,4–0,8 viên bị kêu
  // "hàm lượng quá cao" dù đầu trên gần đủ một viên.
  const cao = qd.tren !== null && qd.tren !== undefined ? qd.tren : qd.duoi;
  if (cao < 0.5) return 'hàm lượng quá cao cho liều này';
  if (!chiaDuoc) {
    const le = qd.duoi % 1;
    if (le > 0.05 && le < 0.95) return 'dạng này không chia được';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Độ thanh thải creatinin (CrCl) — công thức Cockcroft-Gault
//
// Hiệu chỉnh liều theo chức năng thận là phần lõi của dược lâm sàng, và là chỗ
// sai sót hay gặp nhất khi kê thuốc cho người cao tuổi. Công thức này là công
// thức được dùng để hiệu chỉnh liều (khác với eGFR dùng để phân giai đoạn bệnh
// thận mạn — hai thứ không thay thế nhau được).
//
//   CrCl = (140 − tuổi) × cân nặng / (72 × Scr)   ×0,85 nếu là nữ
//   Scr tính bằng mg/dL. Xét nghiệm ở Việt Nam thường trả µmol/L: chia 88,4.
// ---------------------------------------------------------------------------

export function doiCreatinin(giaTri, donVi) {
  const v = parseFloat(String(giaTri).replace(',', '.'));
  if (!isFinite(v) || v <= 0) return null;
  return donVi === 'umol' ? v / 88.4 : v;      // về mg/dL
}

// Khoảng creatinin huyết thanh hợp lý, tính bằng mg/dL. Ngoài khoảng này gần
// như chắc chắn là gõ nhầm số hoặc chọn nhầm đơn vị — µmol/L với mg/dL lệch
// nhau 88,4 lần, nhầm đơn vị thì CrCl sai cả chục lần rồi tô sáng nhầm mức
// liều mà không một dấu hiệu nào báo.
const SCR_THAP = 0.2;
const SCR_CAO = 25;

export function creatininVoLy(giaTri, donVi) {
  const scr = doiCreatinin(giaTri, donVi);
  if (scr === null) return false;
  return scr < SCR_THAP || scr > SCR_CAO;
}

export function tinhCrCl({ tuoi, canNang, gioiTinh, creatinin, donViCre }) {
  const t = parseFloat(String(tuoi).replace(',', '.'));
  const w = parseFloat(String(canNang).replace(',', '.'));
  const scr = doiCreatinin(creatinin, donViCre);
  if (!isFinite(t) || t <= 0 || t > 120) return null;
  if (!isFinite(w) || w <= 0 || w > 400) return null;
  if (!scr || scr < SCR_THAP || scr > SCR_CAO) return null;

  let v = ((140 - t) * w) / (72 * scr);
  if (gioiTinh === 'nu') v *= 0.85;
  if (!isFinite(v) || v <= 0) return null;
  return Math.round(v * 10) / 10;
}

// Mức suy thận, để người học nhìn con số là biết nó nói lên điều gì
export function mucThan(crcl) {
  if (crcl === null || crcl === undefined) return null;
  if (crcl >= 90) return 'chức năng thận bình thường';
  if (crcl >= 60) return 'giảm nhẹ';
  if (crcl >= 30) return 'giảm vừa';
  if (crcl >= 15) return 'giảm nặng';
  return 'suy thận rất nặng';
}

/** Trong bảng hiệu chỉnh, mức nào ứng với CrCl này? Trả về chỉ số dòng. */
// Nhãn của một mức trong bảng thận. Để chung một chỗ vì bảng chi tiết và
// cột so sánh phải nói giống hệt nhau, và cả hai phải nói đúng cái mà
// dongUngVoi() thật sự dùng để so khớp — trong đó có việc đảo lại ngưỡng gõ
// ngược. Hiện "60 – 20 mL/phút" trong khi máy đọc là "20 – 60" thì con số
// hiện ra không còn ứng với cái app đang làm nữa.
export function nhanNguong(tuGoc, denGoc) {
  let tu = String(tuGoc ?? '').trim();
  let den = String(denGoc ?? '').trim();
  const a = parseFloat(tu.replace(',', '.'));
  const b = parseFloat(den.replace(',', '.'));
  let daDoi = false;
  if (isFinite(a) && isFinite(b) && a > b) {
    const x = tu; tu = den; den = x; daDoi = true;
  }
  const nhan = tu && den ? `${tu} – ${den}` : tu ? `≥ ${tu}` : den ? `< ${den}` : 'Mọi mức';
  return { nhan, daDoi };
}

// ---------------------------------------------------------------------------
// ĐỐI CHIẾU LIỀU TRẦN
//
// Đây là phép tính hay sai nhất khi kê đơn cho trẻ. Trang thuốc đã có đủ ba
// dữ kiện — liều mỗi lần, khoảng cách, liều tối đa — nhưng để rời nhau thì
// chúng không trả lời được câu hỏi thật: "dùng cả ngày như vậy có quá không?".
// Paracetamol 15 mg/kg/lần mỗi 6 giờ cho trẻ 20 kg là 300 mg × 4 = 1200 mg,
// đúng bằng trần 60 mg/kg/24 giờ. Lệch một nhịp thành quá liều gan.
//
// Vẫn giữ nguyên tắc cũ: đọc không chắc thì trả null và im lặng.

// Ngưỡng coi là "sát trần". Dưới trần nhưng trên 95% thì vẫn phải nói, vì chỉ
// cần làm tròn lên một viên là vượt.
const NGUONG_CHAM = 0.95;

/**
 * Số lần dùng trong 24 giờ, đọc từ ô "Khoảng cách".
 * Hiểu "mỗi 6 giờ", "mỗi 4–6 giờ", "3 lần/ngày", "2 lần/24 giờ".
 * Trả { min, max } hoặc null.
 */
export function soLanMoiNgay(khoangCach) {
  if (!khoangCach) return null;
  const k = boDau(khoangCach);
  const KHOANG = '(?:\\s*(?:–|—|-|den|toi|~)\\s*(' + SO + '))?';

  // "3 lần/ngày", "3–4 lần/24 giờ"
  const mLan = new RegExp('(' + SO + ')' + KHOANG + '\\s*lan', 'i').exec(k);
  if (mLan && /ngay|24\s*gio/.test(k)) {
    const a = soVN(mLan[1]);
    const b = mLan[2] !== undefined ? soVN(mLan[2]) : a;
    if (!(a > 0 && b >= a && b <= 24)) return null;
    return { min: a, max: b };
  }

  // "mỗi 6 giờ", "mỗi 4–6 giờ" — cách càng ngắn thì càng nhiều lần, nên biên
  // dưới của số lần ứng với biên TRÊN của số giờ.
  const mGio = new RegExp('moi\\s*(' + SO + ')' + KHOANG + '\\s*gio', 'i').exec(k);
  if (mGio) {
    const a = soVN(mGio[1]);
    const b = mGio[2] !== undefined ? soVN(mGio[2]) : a;
    if (!(a > 0 && b >= a && b <= 168)) return null;
    return { min: 24 / b, max: 24 / a };
  }
  return null;
}

// Số tuyệt đối có đơn vị, KHÔNG phải dạng theo cân nặng: "4000 mg/24 giờ"
const MAU_TUYET = new RegExp(
  '(' + SO + ')' +
  '(?:\\s*(?:–|—|-|đến|tới|~)\\s*(' + SO + '))?' +
  '\\s*(mcg|µg|μg|mg|g|mL|ml|mEq|mmol|UI|IU)' +
  '(?!\\s*\\/\\s*kg)(?![a-zA-Z])', 'i');

/**
 * Đọc ô "Liều tối đa" (hoặc một ô liều tuyệt đối). Trả
 * { duoi, tren, donVi, pham } với pham = phạm vi trần đó nói tới:
 * 'ngay' | 'lan' | '' (không ghi rõ).
 */
export function docTran(chuoi, kg) {
  if (!chuoi) return null;
  const van = String(chuoi);
  const k = boDau(van);

  // Ô ghi CẢ hai loại trần ("1 g/lần, 4 g/24 giờ") thì không biết con số nào
  // ứng với phạm vi nào. Quét cả ô rồi gán cho con số đầu tiên là đọc 1 g
  // thành trần cả ngày — thắt gấp bốn lần trần thật rồi báo vượt oan.
  if (/\/\s*lan/.test(k) && /\/\s*(24\s*gio|24h|ngay)/.test(k)) return null;

  let duoi, tren, donVi, moi;
  if (MAU_HOI.test(van)) {
    // Trần ghi theo cân nặng: "60 mg/kg/24 giờ"
    const kq = tinhTheoCan(van, kg);
    if (!kq || (kq.soDoan || 1) > 1) return null;
    duoi = kq.duoi; tren = kq.tren; donVi = kq.donVi; moi = kq.moi;
  } else {
    const m = MAU_TUYET.exec(van);
    if (!m) return null;
    duoi = soVN(m[1]);
    tren = m[2] !== undefined ? soVN(m[2]) : null;
    donVi = m[3];
    if (!isFinite(duoi) || duoi <= 0) return null;
    if (tren !== null && !(isFinite(tren) && tren >= duoi)) return null;
    // Đọc phạm vi từ đoạn NGAY SAU con số, dùng đúng hàm mà tinhTheoCan dùng.
    moi = doiTuong(van.slice(m.index + m[0].length));
  }

  const mk = boDau(String(moi || ''));
  const i = van.search(/\d/);
  const sau = boDau(i < 0 ? '' : van.slice(i));
  const pham = /24\s*gio|\/\s*ngay/.test(mk) ? 'ngay'
    : /\/\s*lan/.test(mk) ? 'lan'
    // Không có dấu gạch chéo thì vẫn nhận cách viết bằng chữ. An toàn vì
    // trường hợp ghi cả hai loại đã bị loại ở trên.
    : /moi\s*ngay|trong\s*24\s*gio/.test(sau) ? 'ngay'
    : /moi\s*lan/.test(sau) ? 'lan' : '';
  return { duoi, tren, donVi, pham, moi: moi || '' };
}

/**
 * Đối chiếu liều đang dùng với liều trần.
 * Trả { chu, muc, tong, tran } — muc: 'duoi' | 'cham' | 'vuot' — hoặc null khi
 * không đủ cơ sở để nói. kg có thể null: khi đó chỉ đối chiếu được những ô ghi
 * liều tuyệt đối.
 */
export function soiTran({ lieu, khoangCach, toiDa, kg }) {
  const kq = tinhTheoCan(lieu, kg) || docTran(lieu, kg);
  const tran = docTran(toiDa, kg);
  if (!kq || !tran) return null;
  if ((kq.soDoan || 1) > 1) return null;      // ô liều ghi nhiều mức: không biết mức nào
  if (!tran.pham) return null;                // trần không ghi rõ /lần hay /24 giờ

  // Quy cả hai về cùng một thang. Khác thang đo (mg với UI) thì không so bừa.
  const cung = cungDonVi(kq.donVi, tran.donVi);
  const dv = cung ? tran.donVi : 'mg';
  const ve = (n, d) => (cung ? n : quyVeMg(n, d));
  const lieuDuoi = ve(kq.duoi, kq.donVi);
  const lieuTren = ve(kq.tren ?? kq.duoi, kq.donVi);
  const tranSo = ve(tran.tren ?? tran.duoi, tran.donVi);
  if (!lieuDuoi || !lieuTren || !tranSo) return null;

  // Phạm vi của ô LIỀU. docTran đã tính sẵn; tinhTheoCan thì chỉ trả hậu tố.
  // Trước đây chỉ đọc kq.moi, nên một ô liều tuyệt đối "500 mg/24 giờ" đi qua
  // nhánh docTran bị coi như liều mỗi lần rồi nhân thêm số lần — sai gấp mấy lần.
  const moi = boDau(String(kq.moi || ''));
  const laNgay = kq.pham !== undefined
    ? kq.pham === 'ngay'
    : /24\s*gio|\/\s*ngay/.test(moi);

  let tongDuoi = lieuDuoi, tongTren = lieuTren, dauNgay = '';
  if (tran.pham === 'lan') {
    if (laNgay) return null;                  // trần mỗi lần, liều ghi cả ngày: không so được
  } else if (!laNgay) {
    const sl = soLanMoiNgay(khoangCach);
    if (!sl) return null;                     // thiếu khoảng cách thì im lặng
    tongDuoi = lieuDuoi * sl.min;
    tongTren = lieuTren * sl.max;
    dauNgay = vietSoLan(sl) + ' → ';
  }

  const hau = tran.pham === 'ngay' ? '/24 giờ' : '/lần';

  // Tổng và trần PHẢI cùng một đơn vị. Để mỗi bên tự chọn thang đo thì dòng an
  // toàn ra thành "1,05 g/24 giờ — dưới trần 1500 mg/24 giờ": người đọc phải tự
  // quy đổi mới so được hai con số, mà đây đúng là chỗ không được bắt ai nhẩm.
  // Tệ hơn nữa là "1,58 g — sát trần 1575 mg" trông như cách nhau nghìn lần.
  // Lấy thang đo theo TỔNG LIỀU, không theo số lớn nhất: lấy theo số lớn nhất
  // thì một liều 500 mg đứng cạnh trần 1000 mg bị viết thành "0,5 g", biến con
  // số người dùng vừa gõ thành một dạng khác họ không nhận ra.
  const t = thangDo(tongTren, dv);
  const so = (n) => gonSo(n / t.chia);
  const tongChu = (tongDuoi === tongTren ? so(tongDuoi)
    : so(tongDuoi) + ' – ' + so(tongTren)) + ' ' + t.dv;
  const tranChu = so(tranSo) + ' ' + t.dv;

  // Liều là một KHOẢNG thì mức thấp có thể an toàn mà mức cao đã quá. Nói rõ
  // "mức cao nhất vượt" chứ không gộp thành một chữ "vượt" — gộp lại thì người
  // học tưởng cả khoảng đều sai.
  if (tongDuoi > tranSo * 1.001) {
    return { chu: `⛔ ${dauNgay}${tongChu}${hau} — VƯỢT trần ${tranChu}${hau}`,
      muc: 'vuot', tong: tongTren, tran: tranSo };
  }
  if (tongTren > tranSo * 1.001) {
    return { chu: `⚠️ ${dauNgay}${tongChu}${hau} — mức cao nhất VƯỢT trần ${tranChu}${hau}`,
      muc: 'cham', tong: tongTren, tran: tranSo };
  }
  if (tongTren >= tranSo * NGUONG_CHAM) {
    return { chu: `⚠️ ${dauNgay}${tongChu}${hau} — sát trần ${tranChu}${hau}`,
      muc: 'cham', tong: tongTren, tran: tranSo };
  }
  return { chu: `✓ ${dauNgay}${tongChu}${hau} — dưới trần ${tranChu}${hau}`,
    muc: 'duoi', tong: tongTren, tran: tranSo };
}

function vietSoLan(sl) {
  return (sl.min === sl.max ? gonSo(sl.min)
    : gonSo(sl.min) + '–' + gonSo(sl.max)) + ' lần/ngày';
}

export function dongUngVoi(bang, crcl) {
  if (!Array.isArray(bang) || crcl === null || crcl === undefined) return -1;
  // Ngưỡng gõ nhầm thành chữ thì coi như KHÔNG có ngưỡng, chứ không để nó
  // thành NaN — NaN so sánh với gì cũng ra false, dòng đó sẽ không bao giờ
  // được tô sáng và người dùng không hiểu vì sao.
  const so = (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  // Xếp hạng mức khớp: mức ghi RÕ hai đầu thắng mức ghi một đầu, mức một đầu
  // thắng mức "mọi mức". Bằng điểm thì mức hẹp hơn thắng. Nhờ vậy một dòng
  // "mọi mức" đặt trên đầu không nuốt mất các mức cụ thể phía dưới.
  let chon = -1;
  let diemNhat = -1;
  let hepNhat = Infinity;
  for (let i = 0; i < bang.length; i++) {
    let tu = so(bang[i].tu);
    let den = so(bang[i].den);
    // Gõ ngược (từ 50 đến 20) thì đổi chỗ, chứ để nguyên là dòng đó chết câm:
    // không điều kiện nào thoả, không bao giờ được tô sáng, không ai hiểu vì sao.
    if (tu !== null && den !== null && tu > den) { const x = tu; tu = den; den = x; }

    const duoiOk = tu === null || crcl >= tu;
    const trenOk = den === null || crcl < den;
    if (!duoiOk || !trenOk) continue;

    const diem = (tu === null ? 0 : 1) + (den === null ? 0 : 1);
    const rong = (den === null ? Infinity : den) - (tu === null ? -Infinity : tu);
    if (diem > diemNhat || (diem === diemNhat && rong < hepNhat)) {
      diemNhat = diem; hepNhat = rong; chon = i;
    }
  }
  return chon;
}
