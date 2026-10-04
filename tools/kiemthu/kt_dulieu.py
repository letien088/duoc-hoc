"""Kiểm thử toàn vẹn dữ liệu Học thuốc: chỉ mục ↔ ảnh ↔ chi tiết ↔ toa ↔ khoá học (không cần trình duyệt)."""
import json
import os
import re
from PIL import Image

from chung import APP, Ghi, doc

g = Ghi("Toàn vẹn dữ liệu")
toa, th, kh = doc("data/toa.json"), doc("data/thuoc.json"), doc("data/khoahoc.json")
T = {t["s"]: t for t in th["t"]}
mat = {m["s"] for m in th["mat"]}
anh_dir, ct_dir = os.path.join(APP, "img", "sp"), os.path.join(APP, "data", "ct")

# 1. Từng thuốc: khoá bắt buộc, ảnh đúng số lượng + mở được + đúng cỡ, chi tiết đọc được
for t in th["t"]:
    for k in ["s", "t", "w", "h", "d", "q", "n", "c", "l", "rx", "b", "x", "cd", "a"]:
        if k not in t:
            g.L(f"{t.get('s')}: thiếu khoá {k}")
    if not t["t"]:
        g.L(f"{t['s']}: tên rỗng")
    if t["rx"] not in (0, 1, None):
        g.L(f"{t['s']}: rx lạ {t['rx']}")
    for n in range(1, t["a"] + 1):
        f = os.path.join(anh_dir, f"{t['s']}_{n}.webp")
        if not os.path.exists(f):
            g.L(f"{t['s']}: thiếu ảnh {n}")
            continue
        try:
            Image.open(f).verify()
            w, h = Image.open(f).size
            if max(w, h) > 400 or min(w, h) < 40:
                g.C(f"ảnh {t['s']}_{n} cỡ lạ {w}x{h}")
        except Exception as e:
            g.L(f"ảnh hỏng {f}: {e}")
    if os.path.exists(os.path.join(anh_dir, f"{t['s']}_{t['a'] + 1}.webp")):
        g.L(f"{t['s']}: có ảnh {t['a'] + 1} mà chỉ mục ghi a={t['a']}")
    f = os.path.join(ct_dir, t["s"] + ".json")
    if not os.path.exists(f):
        g.L(f"{t['s']}: thiếu data/ct")
        continue
    ct = json.load(open(f, encoding="utf-8"))
    if not ct.get("muc"):
        g.C(f"{t['s']} {t['t']}: chi tiết không có mục nào")
    for m in ct.get("muc", []):
        if not m["c"] or m["c"][0][0] == "cut":
            g.L(f"ct {t['s']} mục {m['k']}: rỗng")
        for b in m["c"]:
            if b[0] not in ("h", "p", "li", "q", "a", "cut"):
                g.L(f"ct {t['s']}: loại khối lạ {b[0]}")
    if re.search(r"<[a-z/][^>]*>", t["cd"] or ""):
        g.L(f"{t['s']}: công dụng còn thẻ HTML")

# 2. Tệp mồ côi
for f in os.listdir(anh_dir):
    m = re.match(r"(.+)_(\d+)\.webp$", f)
    if not m or m.group(1) not in T:
        g.C(f"ảnh mồ côi / lạ: img/sp/{f}")
for f in os.listdir(ct_dir):
    if not f.endswith(".json") or f[:-5] not in T:
        g.C(f"chi tiết mồ côi: data/ct/{f}")

# 3. Toa
for t in toa["toa"]:
    if not t["thuoc"]:
        g.L(f"toa {t['id']}: không có thuốc")
    for i, d in enumerate(t["thuoc"]):
        ten = f"toa {t['id']} dòng {i + 1} {d['ten']}"
        if d["kieu"] not in ("bd", "hc", "ngoai"):
            g.L(f"{ten}: kieu lạ {d['kieu']}")
        if (d["kieu"] == "bd") != bool(d["sku"]):
            g.L(f"{ten}: kieu {d['kieu']} không khớp sku {d['sku']}")
        for s in [d["sku"], d["gan"], *d["thay"]]:
            if s and s not in T:
                (g.C if s in mat else g.L)(f"{ten}: mã {s} không có trong thuoc.json")
        if len(set(d["thay"])) != len(d["thay"]) or (d["sku"] and d["sku"] in d["thay"]):
            g.L(f"{ten}: thuốc thay thế trùng")

# 4. Khoá học: mã của bộ HV + 700 phải có dữ liệu hoặc nằm trong danh sách web đã gỡ
for b in kh["bo"]:
    if b["k"] in ("hv", "700"):
        thieu = {kh["sp"][x][0] for j in b["muc"] for x in kh["muc"][j][5]
                 if re.fullmatch(r"[A-Z]?\d{5,}", kh["sp"][x][0] or "") and kh["sp"][x][0] not in T and kh["sp"][x][0] not in mat}
        if thieu:
            g.L(f"bộ {b['k']}: {len(thieu)} mã chưa tải: {sorted(thieu)[:10]}")

print(f"{len(th['t'])} thuốc · {sum(t['a'] for t in th['t'])} ảnh · {len(toa['toa'])} toa · {sum(len(t['thuoc']) for t in toa['toa'])} dòng thuốc")
raise SystemExit(g.tong_ket())
