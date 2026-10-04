"""Kiểm thử công cụ Python (xuat_toa.py, lay_thuoc.py) — ghi ra tệp tạm, không đụng dữ liệu thật.
  - toa_100.txt sai cú pháp: dừng và báo đúng số dòng
  - sku=-  /  sku=hc  /  sku=<mã>  /  sku=<mã không có>
  - chạy 2 lần cùng đầu vào ra cùng kết quả (tất định)
  - lay_thuoc: lọc mã rác của Excel, cắt câu công dụng, tách mục chi tiết
"""
import hashlib
import io
import json
import os
import sys
from contextlib import redirect_stdout

from chung import APP, CACHE, Ghi

sys.path.insert(0, os.path.join(APP, "tools"))
import xuat_toa as X     # noqa: E402
import lay_thuoc as LT   # noqa: E402

g = Ghi("Công cụ Python")
TAM = os.path.join(CACHE, "congcu")
os.makedirs(TAM, exist_ok=True)
X.FILE_RA, X.FILE_SOAT = os.path.join(TAM, "toa.json"), os.path.join(TAM, "toa_khop.txt")


def chay_toa(noi_dung):
    f = os.path.join(TAM, "toa.txt")
    open(f, "w", encoding="utf-8").write(noi_dung)
    X.FILE_TOA = f
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            X.main()
        return None, json.load(open(X.FILE_RA, encoding="utf-8"))
    except SystemExit as e:
        return str(e.code), None


DAU = "@ 000001 | Thử | 30 | Nam | Viêm họng\n"
# 1. Cú pháp hỏng
for noi, mong in [("- Augmentin 1g | Amoxicilin |  875mg | 14 viên | uống\n", "Dòng 1: dòng thuốc nằm trước mọi toa"),
                  ("@ 000001 | Thử | 30 | Nam\n", "Dòng 1: dòng mở toa phải có đúng 5 ô"),
                  (DAU + "- Augmentin 1g | Amoxicilin | 875mg\n", "Dòng 2: dòng thuốc phải có ít nhất 5 ô"),
                  (DAU + "Augmentin 1g\n", "Dòng 2: không hiểu dòng này"),
                  (DAU + "- Augmentin 1g | Amoxicilin + Acid clavulanic | 875mg + 125mg | 14 viên | uống | sku=99999999\n",
                   "sku=99999999 không có trên web")]:
    loi, _ = chay_toa(noi)
    if not loi or mong not in loi:
        g.L(f"đầu vào hỏng {noi.splitlines()[-1][:40]!r}: mong '{mong}', nhận {loi!r}")
print("1. đã thử 5 kiểu đầu vào hỏng")

# 2. Ép tay + tất định
noi = DAU + "\n".join([
    "- Augmentin 1g | Amoxicilin + Acid clavulanic | 875mg + 125mg | 14 viên | uống",
    "- Augmentin 1g | Amoxicilin + Acid clavulanic | 875mg + 125mg | 14 viên | uống | sku=-",
    "- Calcium | Calci lactat | 300mg | 20 viên | uống | sku=hc",
    "- Zinnat | Cefuroxim | 500mg | 14 viên | uống | sku=00008252",
    "# chú thích",
    "",
    "- Paracetamol 500mg | Paracetamol | 500mg | 10 viên | uống",
]) + "\n"
loi, a = chay_toa(noi)
_, b = chay_toa(noi)
if loi:
    g.L(f"đầu vào đúng mà dừng: {loi}")
else:
    d = a["toa"][0]["thuoc"]
    kiem = [(d[0]["kieu"], d[0]["sku"]), (d[1]["kieu"], d[1]["sku"]), (d[2]["kieu"], d[2]["sku"]), (d[3]["kieu"], d[3]["sku"]), (d[4]["kieu"], d[4]["sku"])]
    mong = [("bd", "00000964"), ("ngoai", None), ("hc", None), ("bd", "00008252"), ("hc", None)]
    if kiem != mong:
        g.L(f"ép tay / ghép: nhận {kiem}, mong {mong}")
    if not d[1]["thay"]:
        g.L("sku=- mà không gợi ý thuốc thay thế")
    if not d[4]["thay"]:
        g.L("dòng hoạt chất Paracetamol 500mg không có thuốc thay thế")
    for x in (a, b):
        x.pop("ngay", None)
    if hashlib.md5(json.dumps(a, sort_keys=True).encode()).digest() != hashlib.md5(json.dumps(b, sort_keys=True).encode()).digest():
        g.L("chạy 2 lần cùng đầu vào ra kết quả khác nhau")
print("2. ép tay + tất định:", kiem if not loi else loi)

# 3. lay_thuoc: hàm thuần
for chu, toi_da, mong in [("Câu một. Câu hai dài.", 260, "Câu một. Câu hai dài."),
                          ("A" * 50 + ". " + "B" * 300 + ".", 100, "A" * 50 + "."),
                          ("x " * 200, 50, None)]:
    kq = LT.cau_ngan(chu, toi_da)
    if len(kq) > toi_da + 1 or (mong and kq != mong):
        g.L(f"cau_ngan({chu[:20]!r}, {toi_da}) = {kq[:40]!r}")
khoi = LT.khoi("<h3>Chỉ định</h3><p>Điều trị <b>đau</b>.</p><ul><li>Một</li><li>Hai</li></ul><h3>Dược lực học</h3><p>Bỏ</p>")
cat = LT.cat_theo_tieu_de(khoi, r"^$|chỉ định", (r"dược lực",))
if cat != [["h", "Chỉ định"], ["p", "Điều trị đau ."], ["li", "Một"], ["li", "Hai"]] and cat != [["h", "Chỉ định"], ["p", "Điều trị đau."], ["li", "Một"], ["li", "Hai"]]:
    g.L(f"tách mục chỉ định sai: {cat}")
nhom, atc = LT.nhom_duoc_ly("<p><strong>Nhóm dược lý: Vitamin và Khoáng chất. Mã ATC: A12CC06 (Magnesi lactat)</strong></p>")
if nhom != "Vitamin và Khoáng chất" or not atc.startswith("A12CC06"):
    g.L(f"nhom_duoc_ly sai: {nhom!r} {atc!r}")
ds = LT.ds_phai_hoc()
rac = [s for s, _, _ in ds if not s[0].isdigit() and not (s[0].isalpha() and s[1:].isdigit())]
if rac:
    g.L(f"danh sách phải học còn mã rác: {rac[:5]}")
print(f"3. lay_thuoc: {len(ds)} mã phải học, cắt câu / tách mục / nhóm dược lý đã thử")
raise SystemExit(g.tong_ket())
