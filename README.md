# Dược & Phác đồ

Sổ tay học dược chất, biệt dược, bệnh và phác đồ điều trị — chạy như một app
thật trên iPhone, hoạt động cả khi không có mạng.

Toàn bộ dữ liệu nằm trong máy bạn. Không có máy chủ, không có tài khoản, không
gửi gì đi đâu.

---

## 1. Chạy thử trên máy tính (2 phút)

Mở PowerShell tại thư mục này rồi gõ:

```
python serve.py
```

Cửa sổ sẽ in ra hai địa chỉ. Mở địa chỉ `http://localhost:8080` bằng trình
duyệt để xem thử. **Cứ để cửa sổ đó mở** — đóng là app tắt.

## 2. Thử ngay trên iPhone qua Wi-Fi nhà

1. Chạy `python serve.py` như trên, ghi lại dòng **"Tren iPhone"**
2. Mở Windows Firewall cho cổng 8080 — chạy PowerShell **quyền Admin**, một lần duy nhất:

   ```
   New-NetFirewallRule -DisplayName "PWA dev 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -Profile Private
   ```

3. iPhone phải **cùng Wi-Fi** với máy tính
4. Mở **Safari** trên iPhone, gõ địa chỉ vừa ghi (dạng `http://192.168.x.x:8080`)

Cách này xem được giao diện và nhập liệu bình thường, nhưng **chưa chạy offline**
vì iOS chỉ cho Service Worker hoạt động trên HTTPS. Muốn đủ tính năng thì làm
bước 3.

## 3. Đưa lên mạng để cài thật vào iPhone

### 3.1. Tạo kho chứa trên GitHub

1. Tạo tài khoản tại <https://github.com> nếu chưa có
2. Bấm **New repository**, đặt tên `duoc-hoc`, chọn **Public**, bấm **Create**

### 3.2. Đẩy mã nguồn lên

Mở PowerShell tại thư mục này, thay `TEN-CUA-BAN` bằng tên tài khoản GitHub:

```
git init
git add .
git commit -m "Ban dau"
git branch -M main
git remote add origin https://github.com/TEN-CUA-BAN/duoc-hoc.git
git push -u origin main
```

### 3.3. Bật GitHub Pages

Vào repo trên web → **Settings** → **Pages** → mục **Source** chọn
`Deploy from a branch` → nhánh `main`, thư mục `/ (root)` → **Save**.

Đợi khoảng một phút, địa chỉ app sẽ là:

```
https://TEN-CUA-BAN.github.io/duoc-hoc/
```

### 3.4. Cài vào màn hình chính iPhone

1. Mở địa chỉ trên bằng **Safari** (bắt buộc Safari, không dùng Chrome)
2. Chạm nút **Chia sẻ** — ô vuông có mũi tên hướng lên ở thanh dưới đáy
3. Vuốt xuống, chạm **"Thêm vào MH chính"**
4. Chạm **Thêm**

Xong. App nằm trên màn hình chính, mở ra không còn thanh địa chỉ Safari, chạy
được khi không có mạng.

## 4. Cập nhật app sau này

Sửa code trên máy tính rồi:

```
git add .
git commit -m "Mo ta thay doi"
git push
```

iPhone tự nhận bản mới ở lần mở kế tiếp, **không phải cài lại**.

App tự nhận bản mới thế nào: mỗi lần mở, nó vừa dùng bản đã lưu sẵn cho
nhanh vừa âm thầm tải bản mới về, nên chậm nhất là lần mở sau đã có mã mới.
Nếu bản mới thay cả `sw.js` thì app còn tự nạp lại đúng một lần ngay lúc đó.

> 💡 Sửa code xong nên đổi số `BAN` ở đầu `sw.js` (`duoc-hoc-v1` → `v2`). Không
> đổi vẫn cập nhật được, nhưng đổi thì chắc chắn và nhanh hơn một nhịp.

---

## 5. Dữ liệu của bạn nằm ở đâu

Trong bộ nhớ trình duyệt của chính chiếc iPhone đó (IndexedDB), gồm cả ảnh chụp
hộp thuốc. Không đồng bộ sang máy khác.

**Điều này có nghĩa là:**

- Gỡ icon khỏi màn hình chính → **mất toàn bộ dữ liệu**
- Đổi máy → dữ liệu không tự theo sang

Nên vào **Cài đặt → Xuất kèm ảnh** định kỳ, chọn "Lưu vào Tệp" rồi cất file
JSON đó vào iCloud Drive. Khôi phục bằng **Cài đặt → Khôi phục**, chọn lại file
đó. Khi khôi phục, bản ghi nào mới hơn sẽ thắng nên nhập nhầm file cũ cũng
không mất ghi chú vừa gõ.

Mục **Cài đặt → Dung lượng** đo số liệu thật trên chính máy đang chạy, và cho
biết iOS đã hứa **giữ lại** kho dữ liệu hay chưa. Nếu nó báo "CHƯA hứa" thì
nghĩa là khi iPhone đầy bộ nhớ, hệ điều hành có quyền dọn — lúc đó phải xuất
file sao lưu thường xuyên hơn.

Mục **Cài đặt → Dọn rác** quét những ảnh không còn biệt dược nào dùng tới rồi
xoá hẳn, và báo lấy lại được bao nhiêu MB. Bình thường app đã tự dọn khi bạn
xoá hoặc bấm Huỷ, nút này là lớp quét vét cho chắc.

---

## 5a. Học thuốc (tab 💊) — 100 toa thật + Bộ HV + Bộ 700

Mục tiêu: mở một toa ra là biết ngay **thuốc gì, dùng để làm gì, hộp trông thế nào**.

- **Thuốc phải học** = mọi thuốc trong **100 toa thật** (thư mục `100 toa thuốc`) + **Bộ HV và
  Bộ 700** trong `data_hoc_vien.xlsx`. Chọn nguồn ở hàng nút trên cùng: 100 toa · Bộ HV · Bộ 700 ·
  Tất cả. Mỗi thuốc có **ảnh hộp thật của Long Châu** (mặt trước, mặt sau, vỉ — vuốt ngang, chạm để
  phóng to), hoạt chất + hàm lượng, dạng, nhóm, kê đơn hay không, công dụng; mở thẻ thuốc xem thêm
  chỉ định, liều dùng, chống chỉ định, tác dụng phụ, thận trọng, thai kỳ, tương tác và **hỏi-đáp tư
  vấn** (lấy từ trang sản phẩm Long Châu).
- **100 toa**: xếp theo chuyên khoa. Mỗi dòng thuốc ghi đúng chữ bác sĩ viết, kèm nhãn
  ✓ *Long Châu có* (bấm sang đúng biệt dược đó), *Toa ghi tên hoạt chất*, hoặc ✗ *Long Châu không
  bán* — khi đó app gợi ý **thuốc thay thế cùng hoạt chất, hàm lượng, dạng đang bán ở Long Châu**
  (ưu tiên thuốc trong bộ học viên). Biệt dược có ở Long Châu nhưng khác hàm lượng thì ghi rõ
  (vd toa Agilecox 100 → Long Châu chỉ có Agilecox 200).
- **Luyện đọc toa**: từng dòng của toa hiện đúng chữ bác sĩ ghi + chẩn đoán; tự nói ra thuốc gì,
  để làm gì, rồi lật xem ảnh hộp + đáp án.
- **Học thuốc mới** (10 thuốc/lượt, đọc thẻ có ảnh rồi tự kiểm tra) · **ôn thẻ tới hạn**
  (1 → 3 → 7 → 14 → 30 ngày, quên thì 10 phút) · **Nhìn hộp đoán thuốc** · danh sách **hay quên**.
- **Trắc nghiệm** 6 kiểu: nhìn hộp → tên · tên → **chọn đúng hộp** (4 ảnh) · tên → hoạt chất ·
  tên → công dụng (đã che tên thuốc) · **đọc toa: trong toa này thuốc X thuộc nhóm nào** (phương án
  sai là nhóm của các thuốc khác trong chính toa đó) · kê đơn hay không.
- Tab 🎓 Khoá học: biệt dược nào có ảnh thì hiện ảnh nhỏ, bấm vào mở thẻ học thuốc. Tab 📚 Danh mục:
  trang một thuốc có ảnh hộp nếu thuốc nằm trong bộ phải học.
- **Học không cần mạng**: ảnh và chi tiết chỉ tải khi mở tới; bấm **"Tải sẵn tất cả"** ở cuối trang
  Học thuốc một lần (khoảng 25-35 MB) là học được cả lúc mất mạng.

Tiến độ ghi chung bản ghi với Ôn tập / Khoá học nên đi theo sao lưu và đồng bộ Drive.

> Ảnh chụp 100 toa **không** đưa lên GitHub (có tên, SĐT, số BHYT người bệnh — đã nằm trong
> `.gitignore`). Nội dung học đã được chép tay sang `tools/toa_100.txt`, bỏ hết thông tin cá nhân,
> chỉ giữ chuyên khoa, tuổi, giới, chẩn đoán và các dòng thuốc.

### Làm mới dữ liệu học thuốc

```
python tools\xuat_toa.py      # toa_100.txt -> ghép với Long Châu -> data\toa.json + bảng soát tools\toa_khop.txt
python tools\lay_thuoc.py     # đọc trang Long Châu của từng thuốc, tải + nén ảnh -> data\thuoc.json, data\ct\, img\sp\
```

- Thêm / sửa toa: sửa `tools/toa_100.txt` (cú pháp ghi ở đầu file). Ghép sai biệt dược thì thêm
  `| sku=<mã>` cuối dòng thuốc; `| sku=-` = ép "Long Châu không bán"; `| sku=hc` = coi như toa ghi
  tên hoạt chất. Sau mỗi lần chạy `xuat_toa.py` nên đọc lại `tools/toa_khop.txt`.
- `lay_thuoc.py` chạy lại được bất cứ lúc nào (~4 giây/thuốc lần đầu, bỏ qua thuốc đã có); dừng
  giữa chừng bằng Ctrl-C rồi chạy lại là làm tiếp. Thêm `--chi-dung` để chỉ dựng lại `data/thuoc.json`
  từ những trang đã lưu tạm mà không mở web. Muốn học cả Bộ 1500/3000: thêm vào `BO_PHAI_HOC` ở
  bảng điều khiển đầu file.
- Cỡ ảnh, chất lượng nén, số ảnh mỗi thuốc: núm `ANH_CANH`, `ANH_CHAT_LUONG`, `SO_ANH` ở bảng điều
  khiển `tools/lay_thuoc.py` (mặc định 400px, WebP chất lượng 45, 3 ảnh ≈ 6-15 KB/ảnh).
- Ảnh + chi tiết thuốc nằm ở bộ nhớ đệm riêng của service worker (`KHO_ANH` trong `sw.js`), không bị
  xoá khi đổi `BAN`. Nếu đã tải lại ảnh / chi tiết mới cho cùng mã thuốc thì đổi số ở `KHO_ANH`
  (`duoc-hoc-anh-v1` → `v2`) để máy tải lại.
- Núm của app (số thuốc mỗi lượt, số câu trắc nghiệm, chiều thẻ lật, số tệp tải song song): khối
  `HT_...` trong `js/config.js`.

### Kiểm thử tự động (`tools/kiemthu/`)

Chạy sau mỗi lần sửa code hoặc làm mới dữ liệu (cần `pip install playwright pillow` và
`playwright install chromium` một lần):

```
python tools\kiemthu\chay_tat_ca.py          # đủ 5 bài, ~15 phút
python tools\kiemthu\chay_tat_ca.py nhanh    # bỏ bài offline, ~5 phút
```

| Bài | Kiểm gì |
|---|---|
| `kt_dulieu.py` | chỉ mục ↔ ảnh (mở được, đúng cỡ) ↔ chi tiết ↔ toa ↔ khoá học, tệp mồ côi |
| `kt_congcu.py` | `xuat_toa.py` với đầu vào hỏng, ép tay `sku=`, chạy lại ra cùng kết quả; hàm của `lay_thuoc.py` |
| `kt_tracnghiem.py` | hàng trăm câu: đúng 1 đáp án, đáp án khớp dữ liệu, không phương án trùng / cùng hộp / lộ tên |
| `kt_giaodien.py` | 100 toa + 150 thẻ thuốc + địa chỉ sai, dữ liệu hỏng, tràn ngang 320px/768px, bấm đúp, tốc độ |
| `kt_offline.py` | mất mạng thật (tắt máy chủ) với service worker: trước và sau "Tải sẵn tất cả" |

Mỗi bài tự bật máy chủ riêng ở cổng 8091-8093 và chỉ tắt đúng tiến trình nó bật.

## 5b. Khoá học (tab 🎓)

Bộ dữ liệu của khoá đào tạo, lấy từ 2 file Excel `6.4.2026 Bộ data 700 - 1500 - 3000.xlsx`
và `6.4.2026 data học viên.xlsx` (file sau là bản rút gọn của file trước, 14/16 sheet giống hệt):

- **4 bộ, chọn ở hàng nút trên cùng**: Bộ HV (bộ chính thức, 34 nhóm, chia Tuần 1-2-3 đúng
  lịch "Tuần chạy data") · Bộ 700 · Bộ 1500 · Bộ 3000. Mỗi mục là một dòng Excel: hoạt chất +
  hàm lượng + dạng bào chế + các **biệt dược tương đương** (nước sản xuất, Brandname/Generic,
  🔥 bán chạy). Viền đỏ/xanh = kê đơn/không kê đơn, tra theo danh mục Long Châu.
- **Học mục mới**: mỗi lượt 15 mục theo đúng thứ tự tuần → nhóm, đọc thẻ rồi tự kiểm tra
  bằng thẻ lật hai chiều (tên thuốc → hoạt chất, hoặc hoạt chất → kể tên thuốc). Thẻ nào tên
  thuốc đã lộ tên hoạt chất thì app tự hỏi chiều ngược lại.
- **Lịch ôn** giống Ôn tập / Lộ trình (1 → 3 → 7 → 14 → 30 ngày, quên thì 10 phút). Mục trùng
  giữa các bộ dùng chung tiến độ: học ở Bộ HV thì sang Bộ 1500 đã tính là đã học. Có danh sách
  **thẻ hay quên** (quên từ 2 lần trở lên).
- **Trắc nghiệm** 6 kiểu câu: biệt dược → hoạt chất · biệt dược → hàm lượng · **hết hàng thì
  thay bằng thuốc nào** (phương án bẫy: cùng hoạt chất khác hàm lượng) · hoạt chất → nhóm ·
  Brandname hay Generic · kê đơn hay không. Phương án sai lấy từ cùng nhóm; câu 2 phương án
  chỉ chiếm ~1/5 đề. Làm cả bộ, phần đã học, hoặc từng nhóm. Đúng/sai ghi vào lịch ôn.
- **Tình huống cắt liều** (6 tình huống có đáp án): gõ câu trả lời, app chấm theo từ khoá của
  giảng viên (gõ không dấu vẫn nhận), rồi hiện đáp án mẫu. Kèm các chủ đề cắt liều và cách
  làm một tình huống.
- **Lịch khoá học**: các đợt bài giảng và thời lượng, bấm vào bài để mở đúng nhóm trong Bộ HV;
  danh sách tình huống QTBH để tự chuẩn bị.
- Tab **Tra cứu** tìm cả trong khoá học (hoạt chất, tên thuốc, mã SP); trang một thuốc ở
  Danh mục có khối **"Có trong khoá học"** cho biết thuốc nằm ở bộ nào, nhóm nào.

Sheet không đưa vào app: Data bỏ, Timeline, Mẫu lesson plan, Hướng dẫn làm Data, Bảng tổng
hợp 3 (giấy tờ làm việc của nhóm soạn). Tên giảng viên cũng bỏ ra vì app đăng công khai.
Hai file Excel **chỉ nằm trong máy** (có trong `.gitignore`), không đẩy lên GitHub.

### Làm mới khi Excel thay đổi

Chép file Excel mới đè lên file cũ trong thư mục này (giữ đúng tên, hoặc sửa đường dẫn ở
**BẢNG ĐIỀU KHIỂN** đầu `tools/xuat_khoahoc.py`), rồi:

```
python tools\xuat_khoahoc.py    # ghi đè data\khoahoc.json, in số dòng / nhóm / biệt dược mỗi bộ
```

Đổi số `BAN` trong `sw.js` và đẩy lên như mục 4. Các núm số mục mỗi lượt, số câu trắc
nghiệm, chiều thẻ lật nằm ở khối `KH_...` trong `js/config.js`.

## 6. Lộ trình học (tab 🎯)

Đúng lộ trình của tài liệu PDF "Nhận biết thuốc Long Châu", dựng từ cùng dữ liệu
(`data/lotrinh.json`):

- **Chặng 0 — Đuôi tên**: nhìn tên hoạt chất đoán nhóm (-sartan, -prazol, cef-…),
  kèm các bẫy (Nystatin, Domperidon…) và phần kháng sinh.
- **Chặng 1–4**: 1.000 hoạt chất xếp theo độ phổ biến, 50 bài × 20 hoạt chất,
  mỗi thẻ đủ 5 ý: nhóm dược lý, công dụng, kê đơn hay không, dạng bào chế,
  biệt dược. Thuộc hết 4 chặng thì nhận ra 88,7% thuốc Long Châu.
- **Mỗi ngày**: học 1 bài mới (đọc thẻ → "Tự kiểm tra" bằng thẻ lật) và ôn
  các thẻ tới hạn. App tự tính lịch ôn: nhớ thì gặp lại sau 1 → 3 → 7 → 14 →
  30 ngày, quên thì sau 10 phút.
- **Kiểm tra cuối chặng**: 30 câu trộn (biệt dược → hoạt chất, hoạt chất →
  nhóm, kê đơn hay không). Đạt từ 80% thì sang chặng mới.
- **"Bạn đã nhận ra X% thuốc Long Châu"**: tính thật từ các hoạt chất đã thuộc.
- **Nhánh dược liệu** (80 vị) và **phối hợp hay gặp** (40 cặp).

Tiến độ lộ trình lưu cùng tiến độ Ôn tập nên đi theo sao lưu và đồng bộ Drive.
Làm mới: chạy `..\nhathuoclongchau\lam_tai_lieu.py` — ghi cùng lúc PDF và
`data/lotrinh.json`.

## 6b. Danh mục thuốc (tab 📚)

App kèm sẵn danh mục **5.819 thuốc** của Nhà thuốc FPT Long Châu (mục "Thuốc"),
lấy ngày 27/09/2026. Danh mục **chỉ để đọc**: nằm trong tệp `data/danhmuc.json`,
không trộn vào sổ tay của bạn và không đồng bộ lên Drive.

- **Tra cứu** theo tên, hoạt chất, công dụng hoặc **mã SKU** (đủ 8 số, một phần
  mã, hay mã có chữ như A042300000086), gõ không dấu cũng ra. Tab Tra cứu tìm
  cùng lúc trong sổ tay, hoạt chất của Lộ trình và danh mục thuốc. Ở trang một
  thuốc, **chạm vào mã SKU là chép**.
- **Kê đơn / không kê đơn**: mỗi thuốc có nhãn theo bộ lọc "Loại thuốc" của web.
  Có bộ lọc ba nút (Tất cả · ℞ Kê đơn · Không kê đơn) ở kết quả tìm kiếm, nhóm
  con, hoạt chất và trắc nghiệm; app nhớ lựa chọn giữa các trang.
- **Duyệt theo nhóm**: 19 nhóm → 100 nhóm con, kèm thanh tiến độ đã thuộc.
- **Tra theo hoạt chất** (2.136 hoạt chất): mỗi chất có danh sách biệt dược, các
  nhóm nó có mặt, các dạng bào chế.
- **Trang một thuốc**: hoạt chất, công dụng, phân loại, quy cách, xuất xứ, giá;
  danh sách **cùng thành phần** (biệt dược tương đương) và **cùng nhóm, khác
  thành phần** để so sánh.
- **Trắc nghiệm**, 4 kiểu câu: Thuốc → hoạt chất · Thuốc → nhóm · Công dụng →
  thuốc (đã che tên thuốc và tên hãng) · Kê đơn hay không. Phương án nhiễu lấy
  từ cùng nhóm. Làm theo toàn bộ, theo nhóm, theo nhóm con, hoặc chỉ các thuốc đã ★.
  Lịch nhắc lại giống trang Ôn tập: sai gặp lại sau 10 phút, đúng giãn dần
  1 ngày → 3 ngày → 1 tuần → 2 tuần → 1 tháng.
- **★ Đánh dấu** và tiến độ trắc nghiệm được lưu cùng tiến độ Ôn tập, nên đi
  theo file sao lưu và đồng bộ Drive.
- **📦 Chép vào Biệt dược**: mở form biệt dược điền sẵn (tên, hoạt chất, dạng,
  hãng, quy cách, giá, công dụng + nguồn), tự nối với dược chất trong sổ tay nếu
  trùng tên. Chưa bấm Lưu thì chưa có gì vào sổ tay.
- Ở trang một dược chất trong sổ tay có nút **📚 Biệt dược trên thị trường**.

> Thuốc kê đơn không có giá vì trang web không công bố giá.

### Làm mới danh mục

Công cụ nằm ở thư mục bên cạnh, `..\nhathuoclongchau\`:

```
python quet_thuoc.py    # quét lại toàn bộ mục Thuốc (~6 phút) -> thuoc_longchau.csv
python lam_excel.py     # dựng file Excel Danh_muc_thuoc_Long_Chau.xlsx
python xuat_app.py      # ghi đè data\danhmuc.json của app này
```

Rồi đổi số `BAN` trong `sw.js` và đẩy lên như mục 4.

## 7. Cấu trúc thư mục

```
index.html              trang duy nhất của app
manifest.webmanifest    khai báo tên, icon, màu khi cài vào màn hình chính
sw.js                   chạy offline (đổi số BAN mỗi lần cập nhật)
serve.py                máy chủ chạy thử trong mạng nhà
css/style.css           toàn bộ giao diện
js/config.js            ⭐ BẢNG ĐIỀU KHIỂN + định nghĩa các ô dữ liệu
js/util.js              hàm dùng chung (bỏ dấu tiếng Việt, thông báo…)
js/db.js                truy cập IndexedDB
js/store.js             kho dữ liệu trong RAM, tìm kiếm, sao lưu
js/img.js               chụp và nén ảnh biệt dược
js/form.js              sinh form nhập liệu từ config.js
js/view.js              trang xem chi tiết
js/ontap.js             thẻ lật ôn tập
js/danhmuc.js           danh mục thuốc: tra cứu, nhóm, hoạt chất, trắc nghiệm
js/lotrinh.js           lộ trình học 1.000 hoạt chất: bài, thẻ lật, kiểm tra chặng
js/khoahoc.js           khoá học: 4 bộ data, thẻ lật, trắc nghiệm, tình huống cắt liều
js/hocthuoc.js          học thuốc: 100 toa, ảnh hộp, thẻ lật, trắc nghiệm, luyện đọc toa
data/toa.json           100 toa đã ghép Long Châu (sinh bằng tools\xuat_toa.py)
data/thuoc.json         chỉ mục thuốc phải học (sinh bằng tools\lay_thuoc.py)
data/ct/<mã>.json       chi tiết từng thuốc: chỉ định, liều, CCĐ, tác dụng phụ, hỏi-đáp
img/sp/<mã>_<n>.webp    ảnh hộp thuốc đã nén
tools/toa_100.txt       bản chép tay 100 toa (đã bỏ thông tin người bệnh)
tools/xuat_toa.py       ghép từng dòng toa với sản phẩm Long Châu + thuốc thay thế
tools/lay_thuoc.py      tải chi tiết + ảnh từng thuốc từ web Long Châu
tools/longchau.py       phần đọc web Long Châu dùng chung (thử lại khi lỗi mạng)
data/lotrinh.json       dữ liệu lộ trình (sinh bằng ..\nhathuoclongchau\lam_tai_lieu.py)
data/danhmuc.json       dữ liệu danh mục (sinh bằng ..\nhathuoclongchau\xuat_app.py)
js/app.js               khung app và định tuyến
icons/                  icon màn hình chính
tools/tao_icon.py       sinh lại bộ icon khi muốn đổi màu/hình
tools/xuat_khoahoc.py   chuyển 2 file Excel khoá học -> data/khoahoc.json
data/khoahoc.json       dữ liệu khoá học (sinh bằng tools\xuat_khoahoc.py)
```

## 8. Muốn thêm một ô thông tin mới

Mở `js/config.js`, tìm phần `SCHEMA`, thêm một dòng vào `fields` của loại tương
ứng. Ví dụ thêm ô "Giá bán lẻ" cho biệt dược:

```js
{ k: 'giaBanLe', l: 'Giá bán lẻ', t: 'text', ph: 'VD: 35.000đ/hộp' },
```

Form nhập liệu, trang xem chi tiết và tìm kiếm tự động hiểu ô mới. Không phải
sửa file nào khác.

Các kiểu ô dùng được: `text` (một dòng), `textarea` (nhiều dòng), `chips`
(nhãn), `lieu` (bảng liều theo 5 nhóm đối tượng), `lienket` (trỏ sang bản ghi
khác), `anh`, `buoc` (các bước điều trị).

Các núm hay chỉnh khác — cỡ ảnh sau khi nén, số ảnh tối đa mỗi biệt dược, số
ngày nhắc sao lưu — đều nằm ở khối **BẢNG ĐIỀU KHIỂN** đầu file `js/config.js`.

---

## 9. Lưu ý

App này là công cụ học tập cá nhân. Sổ tay là nội dung do bạn nhập vào, app
không kiểm chứng những gì bạn gõ. Danh mục thuốc là thông tin bán lẻ lấy từ web
Nhà thuốc Long Châu, dùng để tham khảo khi học — không thay tờ hướng dẫn sử
dụng, Dược thư Quốc gia hay chỉ định của bác sĩ. Luôn ghi
rõ nguồn cho mỗi phác đồ và đối chiếu tài liệu gốc trước khi áp dụng.
