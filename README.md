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

- **Tra cứu** theo tên, hoạt chất hoặc công dụng, gõ không dấu cũng ra. Ô Tra
  cứu chung của app cũng tìm luôn trong danh mục.
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
data/lotrinh.json       dữ liệu lộ trình (sinh bằng ..\nhathuoclongchau\lam_tai_lieu.py)
data/danhmuc.json       dữ liệu danh mục (sinh bằng ..\nhathuoclongchau\xuat_app.py)
js/app.js               khung app và định tuyến
icons/                  icon màn hình chính
tools/tao_icon.py       sinh lại bộ icon khi muốn đổi màu/hình
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
