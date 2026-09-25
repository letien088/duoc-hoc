// Nối các dữ kiện đã có lại với nhau để cảnh báo.
//
// Bạn ghi ở chuyên luận Vancomycin: "aminoglycosid → tăng độc thận".
// Rồi bạn dựng một phác đồ có cả Vancomycin lẫn Gentamicin.
// Hai dữ kiện đó nằm cách nhau hai trang, đọc rời thì không ai thấy.
// File này ghép chúng lại và nhắc ngay trên trang phác đồ.
//
// KHÔNG phải cơ sở dữ liệu tương tác thuốc. Nó chỉ soi lại đúng những gì CHÍNH
// BẠN đã gõ vào — nên đáng tin đúng bằng mức ghi chép của bạn, không hơn.
import { boDau } from './util.js';
import { layMot } from './store.js';

const TOI_THIEU = 5;   // chuỗi ngắn hơn thì dễ khớp bừa, bỏ qua

// Những từ quá chung, xuất hiện ở mọi chuyên luận -> khớp vào là nhiễu
const TU_CHUNG = new Set([
  'thuoc', 'khang', 'sinh', 'khang sinh', 'dung', 'dieu', 'tri', 'nhom',
  'tiem', 'uong', 'truyen', 'tinh', 'mach', 'lieu', 'benh', 'nhan',
]);

// Gom các cách gọi một dược chất: tên, tên khác, và từng từ trong nhóm dược lý
function tenGoi(r) {
  const ra = new Set();
  const them = (s) => {
    const k = boDau(s);
    if (k.length >= TOI_THIEU && !TU_CHUNG.has(k)) ra.add(k);
  };
  them(r.ten);
  them(r.tenKhac);
  if (r.nhom) {
    them(r.nhom);
    // "Kháng sinh nhóm Beta-lactam" -> bắt cả chữ "beta-lactam"
    for (const tu of String(r.nhom).split(/[\s,;/()]+/)) them(tu);
  }
  return [...ra];
}

/**
 * Soi một phác đồ, trả về danh sách cảnh báo.
 * Mỗi cảnh báo: { canhBao: <dược chất ghi điều đó>, lienQuan: <thuốc bị nhắc tới>,
 *                 o: 'Tương tác' | 'Chống chỉ định', trich: <đoạn trích> }
 */
export function soiPhacDo(phacDo) {
  const ds = [];
  for (const b of phacDo?.buoc || []) {
    for (const t of b.thuoc || []) {
      if (!t.duocChatId) continue;
      const r = layMot('duocchat', t.duocChatId);
      if (r && !ds.some(x => x.id === r.id)) ds.push(r);
    }
  }
  if (ds.length < 2) return [];

  const ra = [];
  for (const a of ds) {
    const oKiem = [
      { ten: 'Tương tác', chu: a.tuongTac },
      { ten: 'Chống chỉ định', chu: a.chongChiDinh },
      { ten: 'Lưu ý khi dùng', chu: a.luuY },
    ];
    for (const o of oKiem) {
      if (!o.chu) continue;
      const than = boDau(o.chu);
      for (const b of ds) {
        if (b.id === a.id) continue;
        const khop = tenGoi(b).find(k => than.includes(k));
        if (!khop) continue;
        if (ra.some(x => x.canhBao.id === a.id && x.lienQuan.id === b.id && x.o === o.ten)) continue;
        ra.push({ canhBao: a, lienQuan: b, o: o.ten, trich: trichDoan(o.chu, khop) });
      }
    }
  }
  return ra;
}

// Cắt lấy đúng câu có nhắc tới, để người đọc thấy ngay chỗ mình đã ghi
function trichDoan(chu, khoaKhongDau) {
  // Không dùng regex nhìn lui (?<=...): Safari đời cũ ném lỗi cú pháp ngay
  // lúc nạp file, làm hỏng cả module chứ không chỉ hỏng một hàm.
  const cau = String(chu).split(/([.;\n])/).reduce((ra, phan, i) => {
    if (i % 2 === 0) ra.push(phan);
    else ra[ra.length - 1] += phan;
    return ra;
  }, []);
  const thay = cau.find(c => boDau(c).includes(khoaKhongDau));
  const ra = (thay || chu).trim();
  return ra.length > 180 ? ra.slice(0, 177) + '…' : ra;
}
