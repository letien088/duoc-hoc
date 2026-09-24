// ============================================================================
// |                          BẢNG ĐIỀU KHIỂN                                 |
// |  Mọi thứ hay phải chỉnh đều nằm trong khối này. Sửa ở đây, không sửa     |
// |  rải rác trong các file khác.                                            |
// ============================================================================

export const CAU_HINH = {
  // --- Nhận dạng app -------------------------------------------------------
  TEN_APP:        'Dược & Phác đồ',
  PHIEN_BAN:      '1.0.0',          // đổi số này mỗi lần cập nhật code

  // --- Ảnh biệt dược -------------------------------------------------------
  ANH_CANH_TOI_DA:    1280,         // px — cạnh dài nhất sau khi nén
  ANH_CHAT_LUONG:     0.72,         // 0.1 - 1.0  (0.72 ~ 100-200KB mỗi ảnh)
  ANH_TOI_DA_MOI_BD:  6,            // số ảnh tối đa cho 1 biệt dược

  // --- Tìm kiếm ------------------------------------------------------------
  TIM_TOI_THIEU:      1,            // gõ đủ mấy ký tự thì bắt đầu tìm
  TIM_KET_QUA_TOI_DA: 60,           // số kết quả tối đa ở ô Tra cứu
  VE_MOI_DOT:         100,          // số hàng vẽ ra mỗi đợt trong danh sách dài

  // --- Giao diện -----------------------------------------------------------
  TRANG_MAC_DINH:     '#/nha',      // mở app lên thì vào mục nào
  NHAC_MIEN_TRU:      true,         // hiện dòng nhắc "đây là app học tập"

  // --- Sao lưu -------------------------------------------------------------
  NHAC_SAO_LUU_SAU_NGAY: 14,        // quá bao nhiêu ngày không sao lưu thì nhắc
};

// ============================================================================
// ĐỊNH NGHĨA DỮ LIỆU
// Form nhập liệu được sinh tự động từ bảng này. Muốn thêm một ô thông tin mới
// cho dược chất / biệt dược / bệnh / phác đồ thì chỉ cần thêm 1 dòng vào đây,
// không phải sửa giao diện.
//   t (kiểu ô): text | textarea | chips | lieu | lienket | anh | buoc
//   bat: bắt buộc nhập   goiY: gợi ý từ các giá trị đã nhập trước đó
// ============================================================================

export const NHOM_DOI_TUONG = [
  { k: 'nguoiLon', ten: 'Người lớn',        icon: '🧑' },
  { k: 'soSinh',   ten: 'Trẻ sơ sinh',      icon: '👶' },
  { k: 'duoi12',   ten: 'Trẻ dưới 12 tuổi', icon: '🧒' },
  { k: 'mangThai', ten: 'Phụ nữ mang thai', icon: '🤰' },
  { k: 'choConBu', ten: 'Phụ nữ cho con bú', icon: '🤱' },
];

// Các ô con bên trong MỘT ô liều dùng
export const O_LIEU = [
  { k: 'lieu',       ten: 'Liều dùng',   ph: 'VD: 10-15 mg/kg/lần' },
  { k: 'duongDung',  ten: 'Đường dùng',  ph: 'VD: uống, tiêm tĩnh mạch' },
  { k: 'khoangCach', ten: 'Khoảng cách', ph: 'VD: mỗi 6 giờ' },
  { k: 'toiDa',      ten: 'Liều tối đa', ph: 'VD: 60 mg/kg/24 giờ' },
  { k: 'ghiChu',     ten: 'Lưu ý',       ph: 'VD: giảm liều khi suy gan' },
];

// Các ô con của MỘT thuốc bên trong MỘT bước điều trị
export const O_THUOC_BUOC = [
  { k: 'lieu',      ten: 'Liều',       ph: 'VD: 1g x 3 lần/ngày' },
  { k: 'duongDung', ten: 'Đường dùng', ph: 'VD: tiêm tĩnh mạch' },
  { k: 'thoiGian',  ten: 'Thời gian',  ph: 'VD: 7-10 ngày' },
  { k: 'ghiChu',    ten: 'Ghi chú',    ph: '' },
];

export const SCHEMA = {
  duocchat: {
    ten: 'Dược chất', tenSo: 'dược chất', icon: '💊', mau: '#2f6fed',
    nhan: r => r.ten,
    phu:  r => [r.nhom, r.tenKhac].filter(Boolean).join(' · '),
    fields: [
      { k: 'ten',          l: 'Tên dược chất (INN)',      t: 'text', bat: true, ph: 'VD: Paracetamol' },
      { k: 'tenKhac',      l: 'Tên khác / đồng nghĩa',    t: 'text', ph: 'VD: Acetaminophen' },
      { k: 'nhom',         l: 'Nhóm dược lý',             t: 'text', goiY: true, ph: 'VD: Giảm đau - hạ sốt' },
      { k: 'coChe',        l: 'Cơ chế tác dụng',          t: 'textarea' },
      { k: 'tacDung',      l: 'Tác dụng',                 t: 'textarea' },
      { k: 'chiDinh',      l: 'Chỉ định',                 t: 'textarea' },
      { k: 'chongChiDinh', l: 'Chống chỉ định',           t: 'textarea' },
      { k: 'lieu',         l: 'Liều dùng theo đối tượng', t: 'lieu' },
      { k: 'tacDungPhu',   l: 'Tác dụng không mong muốn', t: 'textarea' },
      { k: 'tuongTac',     l: 'Tương tác thuốc',          t: 'textarea' },
      { k: 'luuY',         l: 'Lưu ý khi dùng',           t: 'textarea' },
      { k: 'baoQuan',      l: 'Bảo quản',                 t: 'text' },
      { k: 'tags',         l: 'Nhãn',                     t: 'chips', goiY: true },
      { k: 'nguon',        l: 'Nguồn tham khảo',          t: 'text', ph: 'VD: Dược thư Quốc gia 2022' },
    ],
  },

  bietduoc: {
    ten: 'Biệt dược', tenSo: 'biệt dược', icon: '📦', mau: '#8b5cf6',
    nhan: r => r.ten,
    phu:  r => [r.hamLuong, r.dangBaoChe, r.hang].filter(Boolean).join(' · '),
    fields: [
      { k: 'ten',         l: 'Tên biệt dược',     t: 'text', bat: true, ph: 'VD: Efferalgan 500mg' },
      { k: 'anh',         l: 'Ảnh hộp thuốc',     t: 'anh' },
      { k: 'duocChatIds', l: 'Chứa dược chất',    t: 'lienket', toi: 'duocchat' },
      { k: 'hamLuong',    l: 'Hàm lượng',         t: 'text', ph: 'VD: 500 mg' },
      { k: 'dangBaoChe',  l: 'Dạng bào chế',      t: 'text', goiY: true, ph: 'VD: viên sủi' },
      { k: 'hang',        l: 'Hãng sản xuất',     t: 'text', goiY: true },
      { k: 'quyCach',     l: 'Quy cách đóng gói', t: 'text', ph: 'VD: hộp 4 vỉ x 4 viên' },
      { k: 'gia',         l: 'Giá tham khảo',     t: 'text' },
      { k: 'ghiChu',      l: 'Ghi chú',           t: 'textarea' },
      { k: 'tags',        l: 'Nhãn',              t: 'chips', goiY: true },
    ],
  },

  benh: {
    ten: 'Bệnh', tenSo: 'bệnh', icon: '🩺', mau: '#e0533d',
    nhan: r => r.ten,
    phu:  r => [r.maICD, r.chuyenKhoa].filter(Boolean).join(' · '),
    fields: [
      { k: 'ten',        l: 'Tên bệnh',            t: 'text', bat: true, ph: 'VD: Viêm phổi cộng đồng' },
      { k: 'tenKhac',    l: 'Tên khác',            t: 'text' },
      { k: 'maICD',      l: 'Mã ICD-10',           t: 'text', ph: 'VD: J18' },
      { k: 'chuyenKhoa', l: 'Chuyên khoa',         t: 'text', goiY: true },
      { k: 'moTa',       l: 'Định nghĩa / mô tả',  t: 'textarea' },
      { k: 'nguyenNhan', l: 'Nguyên nhân',         t: 'textarea' },
      { k: 'trieuChung', l: 'Triệu chứng',         t: 'textarea' },
      { k: 'canLamSang', l: 'Cận lâm sàng',        t: 'textarea' },
      { k: 'chanDoan',   l: 'Chẩn đoán phân biệt', t: 'textarea' },
      { k: 'tags',       l: 'Nhãn',                t: 'chips', goiY: true },
    ],
  },

  phacdo: {
    ten: 'Phác đồ', tenSo: 'phác đồ', icon: '📋', mau: '#0f9d63',
    nhan: r => r.ten,
    phu:  r => [r.nguon, r.nam].filter(Boolean).join(' · '),
    fields: [
      { k: 'ten',      l: 'Tên phác đồ',         t: 'text', bat: true, ph: 'VD: Kháng sinh kinh nghiệm' },
      { k: 'benhId',   l: 'Điều trị bệnh',       t: 'lienket', toi: 'benh', don: true },
      { k: 'doiTuong', l: 'Áp dụng cho',         t: 'text', ph: 'VD: người lớn, không bệnh nền' },
      { k: 'nguon',    l: 'Nguồn',               t: 'text', goiY: true, ph: 'VD: Bộ Y tế 2020' },
      { k: 'nam',      l: 'Năm',                 t: 'text' },
      { k: 'buoc',     l: 'Các bước điều trị',   t: 'buoc' },
      { k: 'theoDoi',  l: 'Theo dõi & đánh giá', t: 'textarea' },
      { k: 'ghiChu',   l: 'Ghi chú',             t: 'textarea' },
      { k: 'tags',     l: 'Nhãn',                t: 'chips', goiY: true },
    ],
  },
};

export const LOAI = Object.keys(SCHEMA);
