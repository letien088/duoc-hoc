"""Kiểm thử trắc nghiệm Học thuốc: làm nhiều lượt, mỗi câu kiểm
   - 2 hoặc 4 phương án, không trùng nhau (chữ đã chuẩn hoá / ảnh)
   - chọn xong: đúng 1 phương án đúng, và đáp án đúng khớp dữ liệu của thuốc
   - câu hoạt chất: không có 2 phương án cùng hoạt chất viết khác thứ tự
   - câu ảnh: không có 2 hộp cùng tên hiệu (Uruso 200 / Uruso 300 trông như nhau)
   - câu công dụng: đáp án đã che tên thuốc
   python kt_tracnghiem.py [số lượt, mặc định 30]"""
import re
import sys
import unicodedata
from collections import Counter
from playwright.sync_api import sync_playwright

from chung import Ghi, MayChu, doc

T = {t["s"]: t for t in doc("data/thuoc.json")["t"]}
SO_LUOT = int(sys.argv[1]) if len(sys.argv) > 1 else 30
CHUNG = {"dau", "thuoc", "siro", "vien", "kem", "gel", "nuoc", "tra", "cao", "bot", "goi", "at", "sp", "new", "the"}
g = Ghi("Trắc nghiệm")


def bd(s):
    s = unicodedata.normalize("NFD", (s or "").lower()).replace("đ", "d")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def hieu(ten):
    w = [x for x in re.split(r"[^a-z0-9]+", bd(ten)) if x]
    i = next((k for k, x in enumerate(w) if len(x) >= 3 and x not in CHUNG), None)
    return " ".join(w[:2]) if i is None else " ".join(w[:i + 1])


def khoa_hc(h):
    return " ".join(sorted(w for w in re.split(r"[^a-z0-9.]+", bd(h)) if w and w != "acid"))


dem = Counter()
may = MayChu(8092).bat()
try:
    with sync_playwright() as p:
        tr = p.chromium.launch(headless=True)
        pg = tr.new_context(viewport={"width": 390, "height": 844}, service_workers="block").new_page()
        g.gan(pg, lambda: "trắc nghiệm")
        pg.goto(may.goc + "#/ht"); pg.wait_for_timeout(2500)
        for luot in range(SO_LUOT):
            nguon = ["toa", "hv", "700", "tat"][luot % 4]
            pg.evaluate(f"location.hash = '#/ht'; setTimeout(() => location.hash = '#/ht/tn/{nguon}', 30)")
            pg.wait_for_timeout(500)
            for c in range(20):
                if pg.locator(".on-xong").count():
                    break
                cau = pg.locator(".dm-cau")
                loai, sku = cau.get_attribute("data-loai"), cau.get_attribute("data-sku")
                t = T[sku]
                dem[loai] += 1
                ten = f"[{loai}] {t['t']}"
                nut = pg.locator(".dm-lua")
                n = nut.count()
                if n not in (2, 4):
                    g.L(f"{ten}: {n} phương án")
                chu = [nut.nth(i).inner_text().split("\n", 1)[-1].strip() for i in range(n)]
                anh = [nut.nth(i).locator("img").get_attribute("src") if nut.nth(i).locator("img").count() else None for i in range(n)]
                if len(set(anh if anh[0] else [bd(x) for x in chu])) != n:
                    g.L(f"{ten}: phương án trùng {chu}")
                if loai == "Tên thuốc → hoạt chất" and len({khoa_hc(x) for x in chu}) != n:
                    g.L(f"{ten}: 2 phương án cùng hoạt chất: {chu}")
                if loai == "Nhìn hộp → tên thuốc" and len({hieu(x) for x in chu}) != n:
                    g.L(f"{ten}: phương án cùng tên hiệu: {chu}")
                if loai == "Tên thuốc → hộp thuốc":
                    ha = [hieu(T[re.search(r"sp/(.+?)_1", a).group(1)]["t"]) for a in anh]
                    if len(set(ha)) != n:
                        g.L(f"{ten}: hộp cùng tên hiệu: {ha}")
                nut.nth(c % n).click(); pg.wait_for_timeout(60)
                dung = pg.locator(".dm-lua.dung")
                if dung.count() != 1:
                    g.L(f"{ten}: {dung.count()} phương án đúng")
                else:
                    dchu = dung.inner_text().split("\n", 1)[-1].strip()
                    dimg = dung.locator("img").get_attribute("src") if dung.locator("img").count() else None
                    sai = {
                        "Nhìn hộp → tên thuốc": lambda: dchu != t["t"].title() and bd(dchu) != bd(t["t"]) and hieu(dchu) != hieu(t["t"]),
                        "Tên thuốc → hộp thuốc": lambda: dimg != f"img/sp/{sku}_1.webp",
                        "Tên thuốc → hoạt chất": lambda: dchu != t["h"],
                        "Đọc toa": lambda: dchu != (t["c"] or t["n"]),
                        "Kê đơn hay không": lambda: ("Kê đơn" in dchu) != (t["rx"] == 1),
                        "Tên thuốc → công dụng": lambda: hieu(t["t"]).split()[-1] in bd(dchu).split(),
                    }.get(loai, lambda: False)()
                    if sai:
                        g.L(f"{ten}: đáp án đúng không khớp dữ liệu / lộ tên: {dchu or dimg}")
                pg.locator(".on-nut .nut-chinh").click(); pg.wait_for_timeout(40)
        tr.close()
finally:
    may.tat()
print("Số câu theo kiểu:", dict(dem), "tổng", sum(dem.values()))
raise SystemExit(g.tong_ket())
