"""100 toa thuốc -> data/toa.json cho tab 📋 Toa thuốc.

    python tools/xuat_toa.py

Đầu vào: tools/toa_100.txt — bản chép tay 100 ảnh toa (đã bỏ tên người bệnh, bác sĩ, SĐT;
ảnh gốc có thông tin cá nhân nên KHÔNG đưa lên mạng).

Mỗi dòng thuốc được ghép với một sản phẩm Long Châu:
  - toa ghi BIỆT DƯỢC (Midantin, Concor Cor…): tìm đúng biệt dược đó — trong danh mục đã quét
    (../nhathuoclongchau/thuoc_longchau.json), không có thì mở trang tìm kiếm của web như người dùng gõ tay.
  - toa chỉ ghi HOẠT CHẤT (Paracetamol 500mg) hoặc Long Châu không bán biệt dược đó: không gán
    biệt dược nào, chỉ gợi ý "thuốc tương đương" cùng hoạt chất + hàm lượng — ưu tiên thuốc nằm trong
    bộ học viên (data_hoc_vien.xlsx -> data/khoahoc.json) vì đó là thuốc khoá học dạy.
Ghép sai thì sửa tay bằng ô sku= ở cuối dòng trong toa_100.txt (sku=- : ép "Long Châu không bán").

In ra bảng đối chiếu tools/toa_khop.txt để soát từng dòng.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import longchau as lc  # noqa: E402

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                              BẢNG ĐIỀU KHIỂN                                 ║
# ╠══════════════════════════════════════════════════════════════════════════════╣
# ║ Script CHỈ ĐỌC web (không đăng nhập/không gửi gì) → đi thẳng mạng máy, không proxy ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # thư mục app duoc_hoc

# Bản chép 100 toa. VD: r"D:\congviec\code\duoc_hoc\tools\toa_100.txt"
FILE_TOA = os.path.join(DIR, "tools", "toa_100.txt")
# Danh mục thuốc đã quét (có ảnh, slug). VD: r"D:\congviec\code\nhathuoclongchau\thuoc_longchau.json"
FILE_DANH_MUC = os.path.join(os.path.dirname(DIR), "nhathuoclongchau", "thuoc_longchau.json")
# Dữ liệu khoá học (bộ HV + 700 lấy từ data_hoc_vien.xlsx). VD: r"D:\congviec\code\duoc_hoc\data\khoahoc.json"
FILE_KHOA_HOC = os.path.join(DIR, "data", "khoahoc.json")
# Kết quả cho app. VD: r"D:\congviec\code\duoc_hoc\data\toa.json"
FILE_RA = os.path.join(DIR, "data", "toa.json")
# Bảng đối chiếu để soát tay. VD: r"D:\congviec\code\duoc_hoc\tools\toa_khop.txt"
FILE_SOAT = os.path.join(DIR, "tools", "toa_khop.txt")
# Bộ nhớ tạm kết quả tìm kiếm trên web (chạy lại khỏi tải lại). VD: r"D:\congviec\code\duoc_hoc\tools\.cache\tim"
THU_MUC_CACHE = os.path.join(DIR, "tools", ".cache", "tim")

# Số thuốc tương đương gợi ý tối đa cho mỗi dòng (cái)
SO_TUONG_DUONG = 3
# Điểm tối thiểu để nhận là ĐÚNG biệt dược toa ghi (0-15). Thấp hơn -> coi như Long Châu không bán.
DIEM_NHAN = 10.5

# Nghỉ NGẪU NHIÊN giữa 2 lần mở trang tìm kiếm (giây), min/max
NGHI_MIN = 1.0
NGHI_MAX = 2.0
# Chờ khi lỗi (giây). Lỗi mạng/429/5xx: cố định; lỗi khác (403…): ngẫu nhiên min/max
CHO_LOI_MANG = 30
CHO_LOI_KHAC_MIN = 60
CHO_LOI_KHAC_MAX = 120
# ════════════════════════════════════════════════════════════════════════════════

lc.CAU_HINH.update(NGHI_MIN=NGHI_MIN, NGHI_MAX=NGHI_MAX, CHO_LOI_MANG=CHO_LOI_MANG,
                   CHO_LOI_KHAC_MIN=CHO_LOI_KHAC_MIN, CHO_LOI_KHAC_MAX=CHO_LOI_KHAC_MAX)


# ---------------------------------------------------------------------------
# CHỮ
def bo_dau(s):
    s = unicodedata.normalize("NFD", str(s or "").lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9.,%]+", " ", s).strip()


# Dấu hiệu dạng giải phóng kéo dài trong tên: Glucophage ≠ Glucophage XR, Vastarel MR ≠ Vastarel OD
GIAI_PHONG = {"xr", "mr", "sr", "od", "cr", "retard"}


def cac_so_dv(s):
    """Chỉ các con số đi với đơn vị khối lượng / % / IU — con số đặc trưng của hàm lượng."""
    ra = set()
    # (?<![/\d.,]): bỏ mẫu số nồng độ — "1,16g/100g" chỉ lấy 1,16g
    for m, dv in re.findall(r"(?<![/\d.,])(\d+(?:[.,]\d+)?)\s*(mcg|µg|mg|g|%|iu|ui)(?![a-z])", str(s or "").lower()):
        x = cac_so(m + dv)
        if dv == "g":                  # 0,5g -> chỉ giữ bản quy ra mg (500); web có cả "0.5g" lẫn "500mg" đều khớp
            x = {max(x, key=float)}
        ra |= x
    return ra


def don_vi(s):
    """Các đơn vị hàm lượng xuất hiện: mg, mcg, g, ml, %, iu."""
    ra = set()
    for dv in re.findall(r"\d\s*(mcg|µg|mg|ml|g|%|iu|ui)\b|\d\s*(%)", str(s or "").lower()):
        x = dv[0] or dv[1]
        ra.add({"µg": "mcg", "ui": "iu"}.get(x, x))
    return ra


def tu(s):
    return [w for w in re.split(r"[^a-z0-9]+", bo_dau(s)) if w]


def cac_so(s):
    """Các con số trong chuỗi, chuẩn hoá: '2,5' -> '2.5', '500.0' -> '500'. Bỏ dấu chấm nghìn '1.500'.
    Số đi với đơn vị g (không phải mg/mcg) thêm cả bản quy ra mg: 0,5g -> 0.5 và 500."""
    ra = set()
    for m, dv in re.findall(r"(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]*)", str(s or "")):
        if re.fullmatch(r"\d{1,3}\.\d{3}", m):          # 1.500 (nghìn) — kiểu ghi hàm lượng VN
            m = m.replace(".", "")
        m = m.replace(",", ".")
        try:
            f = float(m)
        except ValueError:
            continue
        ra.add(("%f" % f).rstrip("0").rstrip("."))
        if dv.lower() == "g":
            ra.add(("%f" % (f * 1000)).rstrip("0").rstrip("."))
    return ra


# Chữ không mang tên thuốc: đơn vị, dạng bào chế, quy cách
KHONG_PHAI_TEN = set("""mg mcg g ml iu ui ul vien tab tabs tablet tablets cap caps capsule capsules sac sachet sachets goi
ong chai lo tuyp tube hop vi x dt mr xr od sr cr la film forte extra plus siro sir syrup spray nebules respules cream kem gel
drops suspension soft orodispersible collyre nho mat mui dung ngoai uong sui nhai chu viet tay tu mua hoac dau goi lieu va voi fip u bot pha hd""".split())
# Chữ thuộc về tên muối / gốc / chữ chung — không dùng để nhận ra hoạt chất
MUOI = set("""hydroclorid hydrochlorid hydrochloride clohydrat clorhydrat hcl natri sodium kali potassium calci calcium
magnesi acid dihydrat monohydrat trihydrat pentahydrat sesquihydrat besylat besilat maleat fumarat tartrat succinat
mesylat citrat sulfat sulphat phosphat acetat propionat dipropionat butylbromid lysinat mononitrat mononitrate duoi dang
tuong ung voi cao kho long vitamin chiet xuat tinh dau""".split())
# Cùng một chất, khác tên gọi -> một tên chung
DONG_NGHIA = {
    "acetaminophen": "paracetamol", "acetylsalicylic": "aspirin", "acetylsalicylat": "aspirin",
    "thiamin": "b1", "thiamine": "b1", "riboflavin": "b2", "riboflavine": "b2", "pyridoxin": "b6", "pyridoxine": "b6",
    "cyanocobalamin": "b12", "cyanocobalamine": "b12", "nicotinamid": "pp", "nicotinamide": "pp",
    "dexpanthenol": "b5", "pantothenat": "b5", "retinol": "a", "retinyl": "a", "tocopherol": "e", "tocopheryl": "e",
    "ascorbic": "c", "cholecalciferol": "d3", "colecalciferol": "d3", "ergocalciferol": "d2",
    "methylcobalamin": "mecobalamin", "simethicone": "simethicon", "simeticon": "simethicon",
    "clavulanat": "clavulanic", "aciclovir": "acyclovir", "clavulanate": "clavulanic", "levothyroxin": "levothyroxine",
}
VITAMIN_NGAN = re.compile(r"^(b\d{1,2}|d\d|k\d|pp)$")


def chuan_tu(w):
    """Quy chữ tên chất về một cách viết: tra đồng nghĩa, rồi gộp khác biệt Anh/Việt
    (chloride/clorid, chlorhexidine/clorhexidin, acyclovir/aciclovir, sulphate/sulfat)."""
    w = DONG_NGHIA.get(w, w)
    if VITAMIN_NGAN.match(w) or len(w) < 4:
        return w
    w = w.replace("ph", "f").replace("chl", "cl").replace("th", "t").replace("y", "i").replace("k", "c")
    w = re.sub(r"(.)\1", r"\1", w)            # amoxicillin -> amoxicilin
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return DONG_NGHIA.get(w, w)


def giong(a, b):
    """Hai chữ tên hoạt chất có phải một (khác cách viết: amoxicilin/amoxicillin, cefuroxim/cefuroxime)?"""
    if a == b:
        return True
    # Hai chữ đã qua chuan_tu (gộp chữ đôi, bỏ 'e' cuối, ph/chl/th/y) nên cách viết khác chỉ còn lệch ≤ 1 ký tự.
    # Lệch nhiều hơn là chất khác: prednisolon ≠ prednison, glucos ≠ gluconat, amlodac ≠ amlodipin.
    if abs(len(a) - len(b)) > 1:
        return False
    n = min(len(a), len(b))
    if n < 5:
        return False
    k = 0
    while k < n and a[k] == b[k]:
        k += 1
    return k >= n - 1


def tu_hoat_chat(hc):
    """Chữ nhận dạng của MỘT hoạt chất (đã quy về tên chung)."""
    ra = []
    for w in tu(hc):
        if w[0].isdigit():             # 16mg, 500 — con số hàm lượng, không phải tên chất
            continue
        if VITAMIN_NGAN.match(w) or w in ("a", "c", "e") and "vitamin" in tu(hc):
            ra.append(w)
        elif len(w) >= 4 and w not in MUOI:
            ra.append(chuan_tu(w))
    return ra


def cac_hoat_chat(hc, tach):
    """'A 10mg + B 5mg' (toa, tach='+') hoặc 'A 10mg, B 5mg' (Long Châu, tach=',') -> [chữ của từng chất]."""
    ra = []
    for phan in re.split(tach, hc or ""):
        ws = tu_hoat_chat(phan)
        if ws:
            ra.append(ws)
    return ra


def chat_khop(a, b):
    """Hai hoạt chất (mỗi cái là một danh sách chữ) có chung một chữ nhận dạng?
    So cả bản viết liền: 'Acetyl leucin' = 'Acetylleucine', 'L-Ornithin L-Aspartat' = 'L-ornithine-L-aspartate'."""
    if any(giong(x, y) for x in a for y in b):
        return True
    return len(a) + len(b) > 2 and giong(chuan_tu("".join(a)), chuan_tu("".join(b)))


def tu_ten(ten):
    """Các chữ mang tên thuốc trong tên toa ghi: bỏ phần trong ngoặc, đơn vị, con số."""
    ten = re.sub(r"\([^)]*\)", " ", ten)
    return [w for w in tu(ten) if not re.fullmatch(r"\d+(mg|mcg|g|ml|iu|ui)?", w) and w not in KHONG_PHAI_TEN and len(w) >= 2]


def la_ten_hoat_chat(t, chu_hc):
    """Chữ t trong tên toa ghi chỉ là tên hoạt chất (Paracetamol, Flunarizine) hoặc viết tắt (Ome, Para)?"""
    if t in MUOI:
        return True
    t = chuan_tu(t)
    for g in chu_hc:
        if giong(t, g) or (len(t) >= 3 and g.startswith(t) and len(t) < len(g)):
            return True
    return False


def nhom_dang(chu):
    """Nhóm dạng dùng từ chữ (đã bỏ dấu): ran (viên) · goi · long (dung dịch, ống, siro) · boi (kem, gel)."""
    if re.search(r"\b(kem|gel|mo|thuoc mo|cream|tuyp|tube)\b", chu):
        return "boi"
    if re.search(r"\b(vien|nang|ngam)\b", chu):      # xét trước "bột": viên nén sủi bọt vẫn là viên
        return "ran"
    if re.search(r"\b(goi|bot|com)\b", chu):
        return "goi"
    if re.search(r"\b(dung dich|hon dich|siro|nhu tuong|nho|xit|khi dung|ong|chai|lo|but|binh|tui|phun)\b", chu):
        return "long"
    return None


def hop_dang(a, b):
    if not a or not b or a == b:
        return True
    return {a, b} == {"goi", "long"}          # gói hỗn dịch (Gaviscon, Aquima) là thuốc nước đóng gói


# ---------------------------------------------------------------------------
# ĐỌC TOA
def doc_toa():
    """toa_100.txt -> danh sách toa. Mỗi dòng giữ nguyên số dòng gốc để báo lỗi đúng chỗ."""
    toa, hien = [], None
    with open(FILE_TOA, encoding="utf-8") as fh:
        for so, dong in enumerate(fh, 1):
            dong = dong.rstrip("\n")
            if not dong.strip() or dong.startswith("#"):
                continue
            if dong.startswith("@"):
                o = [x.strip() for x in dong[1:].split("|")]
                if len(o) != 5:
                    sys.exit(f"Dòng {so}: dòng mở toa phải có đúng 5 ô (ảnh | khoa | tuổi | giới | chẩn đoán)")
                hien = {"id": o[0], "khoa": o[1], "tuoi": o[2], "gioi": o[3], "cd": o[4], "thuoc": []}
                toa.append(hien)
            elif dong.startswith("- "):
                if hien is None:
                    sys.exit(f"Dòng {so}: dòng thuốc nằm trước mọi toa")
                o = [x.strip() for x in dong[2:].split("|")]
                if len(o) < 5:
                    sys.exit(f"Dòng {so}: dòng thuốc phải có ít nhất 5 ô (tên | hoạt chất | hàm lượng | số lượng | cách dùng)")
                ep = None
                for x in o[5:]:
                    if x.startswith("sku="):
                        ep = x[4:].strip()
                hien["thuoc"].append({"ten": o[0], "hc": o[1], "ham": o[2], "sl": o[3], "dung": o[4], "ep": ep, "dong": so})
            else:
                sys.exit(f"Dòng {so}: không hiểu dòng này: {dong[:60]}")
    return toa


# ---------------------------------------------------------------------------
# KHO SẢN PHẨM ĐỂ SO
def san_pham(p):
    """Rút gọn một sản phẩm (từ danh mục đã quét hoặc từ trang tìm kiếm) về đúng những gì cần để so."""
    loai = ""
    for c in p.get("category") or []:
        if c.get("level") == 1:
            loai = c.get("name") or ""
    ten = p.get("name") or ""
    web = p.get("webName") or ""
    hc = p.get("ingredients") or ""
    dang = p.get("dosageForm") or ""
    # Bỏ quy cách đóng gói khỏi phần lấy con số: "2X5 ỐNG", "(10 vỉ x 10 viên)", "20 ỐNG X 10ML"
    ten_so = re.sub(r"\d+\s*[xX]\s*\d+", " ", ten)
    ten_so = re.sub(r"\b\d+\s*(ỐNG|GÓI|VIÊN|V)\b", " ", ten_so, flags=re.I)
    web_so = re.sub(r"\([^)]*\)", " ", web)
    return {
        "sku": p["sku"], "ten": ten, "web": web, "hc": hc, "dang": dang,
        "loai": loai, "slug": p.get("slug") or "",
        "chu": " ".join(tu(ten + " " + web)),
        "lien": re.sub(r"[^a-z0-9]", "", bo_dau(ten + web)),
        "chat": cac_hoat_chat(hc, r"[,;]"),
        "so": cac_so(ten_so + " " + web_so + " " + hc),
        "don_vi": don_vi(ten_so + " " + web_so + " " + hc),
        "nhom_dang": nhom_dang(bo_dau(dang)) or nhom_dang(bo_dau(ten)),
    }


def ma_da_go():
    """Mã mà tools/lay_thuoc.py đã mở trang và thấy web gỡ (404) — không gợi ý những thuốc này nữa."""
    thu_muc = os.path.join(os.path.dirname(THU_MUC_CACHE), "sp")
    ra = set()
    if os.path.isdir(thu_muc):
        for f in os.listdir(thu_muc):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(thu_muc, f), encoding="utf-8") as fh:
                        if json.load(fh).get("mat"):
                            ra.add(f[:-5])
                except (ValueError, OSError):
                    pass
    return ra


DA_GO = set()


def nap_kho():
    DA_GO.update(ma_da_go())
    with open(FILE_DANH_MUC, encoding="utf-8") as fh:
        ds = json.load(fh)
    kho = {}
    for p in ds:
        if p.get("sku") and p["sku"] not in DA_GO:
            kho[p["sku"]] = san_pham(p)
    return kho


def nap_khoa_hoc():
    """SKU trong bộ HV + 700 (data_hoc_vien.xlsx) -> (bán chạy?, tên). Dùng để ưu tiên khi gợi ý."""
    with open(FILE_KHOA_HOC, encoding="utf-8") as fh:
        k = json.load(fh)
    ra = {}
    for b in k["bo"]:
        if b["k"] not in ("hv", "700"):
            continue
        for j in b["muc"]:
            for x in k["muc"][j][5]:
                s = k["sp"][x]
                if s[0]:
                    ra[s[0]] = bool(s[4])
    return ra


def tim_web(tu_khoa):
    """Trang tìm kiếm của web, có bộ nhớ tạm trên đĩa."""
    os.makedirs(THU_MUC_CACHE, exist_ok=True)
    tep = os.path.join(THU_MUC_CACHE, re.sub(r"[^a-z0-9]+", "_", bo_dau(tu_khoa))[:80] + ".json")
    if os.path.exists(tep):
        with open(tep, encoding="utf-8") as fh:
            return json.load(fh)
    ds = lc.tim_kiem(tu_khoa)
    with open(tep, "w", encoding="utf-8") as fh:
        json.dump(ds, fh, ensure_ascii=False)
    lc.nghi()
    return ds


# ---------------------------------------------------------------------------
# GHÉP
def co_tu(tok, sp):
    """Chữ tên thuốc có mặt trong tên sản phẩm? (đầu một chữ, hoặc nằm trong tên viết liền: DexlanzoMR).
    Chữ ngắn 1-2 ký tự (KH, MR) phải đứng riêng thành một chữ — không thì 'kh' khớp cả 'khẩu trang'."""
    if len(tok) <= 2:
        return bool(re.search(r"\b" + re.escape(tok) + r"\b", sp["chu"]))
    if re.search(r"\b" + re.escape(tok), sp["chu"]):
        return True
    return len(tok) >= 5 and tok in sp["lien"]


def chu_neo(dong):
    """Chữ tên riêng dùng làm mốc (chữ đầu tiên dài ≥ 3); toàn chữ ngắn thì lấy chữ đầu."""
    ten = dong["tu_rieng"]
    return next((t for t in ten if len(t) >= 3), ten[0] if ten else None)


def ty_le_ten(dong, sp):
    ten = dong["tu_rieng"]
    neo = chu_neo(dong)
    if not ten or not co_tu(neo, sp):
        return 0
    if all(len(t) <= 2 for t in ten) and not all(co_tu(t, sp) for t in ten):
        return 0
    return sum(co_tu(t, sp) for t in ten) / len(ten)


def so_chat(dong, sp):
    """(số chất của toa có trong sản phẩm, số chất sản phẩm có mà toa không ghi)."""
    toa, cua = dong["chat"], sp["chat"]
    khop = sum(1 for a in toa if any(chat_khop(a, b) for b in cua))
    thua = sum(1 for b in cua if not any(chat_khop(a, b) for a in toa))
    return khop, thua


def dung_chat(dong, sp):
    """Sản phẩm có ĐÚNG các hoạt chất toa ghi? Thuốc nhiều chất (≥3) chỉ cần chung phần lớn."""
    toa, cua = dong["chat"], sp["chat"]
    if not toa or not cua:
        return not toa                 # toa không ghi hoạt chất -> không xét; web không ghi -> không chắc
    khop, thua = so_chat(dong, sp)
    if len(toa) <= 2 and len(cua) <= 3:
        return khop == len(toa) and thua == 0
    return khop >= max(1, (len(toa) + 1) // 2)


def diem(dong, sp):
    """Tối đa 15: 10 phần tên biệt dược, 3 phần con số hàm lượng, 2 phần hoạt chất. Trừ điểm khi sai chất,
    sai hàm lượng, sai dạng dùng — nhận nhầm thuốc khác cùng hãng còn tệ hơn báo "Long Châu không bán"."""
    tl = ty_le_ten(dong, sp)
    if not tl:
        return 0
    d = 10 * tl
    # Thưởng nhỏ khi tên web chứa đủ mọi chữ toa ghi, kể cả tên hoạt chất — để "Amlodipine Stella 5mg"
    # chọn đúng AMLODIPINE STELLA 5MG chứ không phải STADOVAS (cũng của Stella, cũng 5mg)
    if dong["tu_ten"]:
        d += sum(co_tu(t, sp) for t in dong["tu_ten"]) / len(dong["tu_ten"])
    toa, cua = dong["chat"], sp["chat"]
    if toa and cua:
        khop, thua = so_chat(dong, sp)
        if not khop:
            return 0                   # cùng hãng nhưng khác hẳn hoạt chất (SaVi Montelukast ≠ SaVi Prolol)
        d += 2 * khop / len(toa)
        if not dung_chat(dong, sp):
            d -= 5                     # thừa / thiếu chất: Tatanol ≠ Tatanol Codein
    so = dong["so"]
    if so:
        d += 3 * len(so & sp["so"]) / len(so)
    # Sai hàm lượng: chỉ xét các con số đi với mg/mcg/g/%/IU, và chỉ khi web ghi cùng đơn vị
    # (toa ghi 0,3% mà web ghi 3mg thì không so được). Thiếu càng nhiều số càng trừ nặng:
    # Agilecox 100 ≠ Agilecox 200, Atovze 40/10 ≠ Atovze 20/10.
    so_dv = dong["so_dv"]
    if so_dv and len(dong["chat"]) <= 2 and (not dong["don_vi"] or dong["don_vi"] & sp["don_vi"]):
        d -= 8 * (1 - len(so_dv & sp["so"]) / len(so_dv))
    if not hop_dang(dong["nhom_dang"], sp["nhom_dang"]):
        d -= 6                         # sai dạng: Forsancort viên ≠ Forsancort kem
    if dong["giai_phong"] != (set(sp["chu"].split()) & GIAI_PHONG):
        d -= 5                         # Glucophage thường ≠ Glucophage XR
    return d


def tuong_duong(dong, kho, khoa_hoc, tru=()):
    """Thuốc cùng hoạt chất (đủ mọi chất, không thêm chất khác), có đủ con số hàm lượng, cùng dạng dùng."""
    if not dong["chat"]:
        return []
    so = dong["so_dv"]
    ra, khac_dang = [], []
    for sp in kho.values():
        if sp["sku"] in tru or not sp["chat"]:
            continue
        if len(sp["chat"]) != len(dong["chat"]):
            continue
        # Thuốc thay thế phải đúng đủ mọi hoạt chất, không thừa — kể cả thuốc nhiều thành phần
        if so_chat(dong, sp) != (len(dong["chat"]), 0):
            continue
        if so and not so <= sp["so"]:
            continue
        if dong["giai_phong"] != (set(sp["chu"].split()) & GIAI_PHONG):
            continue
        (ra if hop_dang(dong["nhom_dang"], sp["nhom_dang"]) else khac_dang).append(sp)
    # Không có thuốc cùng dạng (Montelukast 5mg dạng gói) thì mới gợi ý dạng khác — app hiện rõ dạng của từng thuốc
    ra = ra or khac_dang
    # Ưu tiên: thuốc trong bộ học viên (bán chạy trước) -> mục Thuốc -> tên ngắn
    ra.sort(key=lambda sp: (sp["sku"] not in khoa_hoc, not khoa_hoc.get(sp["sku"]), sp["loai"] != "Thuốc", len(sp["web"])))
    return [sp["sku"] for sp in ra[:SO_TUONG_DUONG]]


def them_tu_web(kho, ds):
    for p in ds:
        if p.get("sku") and p["sku"] not in kho and p["sku"] not in DA_GO:
            kho[p["sku"]] = san_pham(p)


def ghep(dong, kho, khoa_hoc):
    """Gán dong['sku'] (biệt dược đúng như toa, hoặc None) + 'thay' (tương đương) + 'gan' (cùng biệt dược,
    khác hàm lượng/dạng) + 'kieu': bd = đúng biệt dược · hc = toa chỉ ghi hoạt chất · ngoai = Long Châu không bán."""
    dong["chat"] = cac_hoat_chat(dong["hc"], r"\+")
    chu_hc = [w for c in dong["chat"] for w in c]
    ten = tu_ten(dong["ten"])
    dong["tu_ten"] = [t for t in ten if len(t) >= 3]
    dong["tu_rieng"] = [t for t in ten if not la_ten_hoat_chat(t, chu_hc)]
    dong["so_ham"] = cac_so(dong["ham"])
    dong["don_vi"] = don_vi(dong["ham"])
    dong["so_dv"] = cac_so_dv(dong["ham"])
    dong["giai_phong"] = set(tu(dong["ten"].replace(".", ""))) & GIAI_PHONG      # "S.R." -> sr
    dong["so"] = dong["so_ham"] | cac_so(re.sub(r"\([^)]*\)", " ", dong["ten"]))
    dong["nhom_dang"] = nhom_dang(bo_dau(dong["sl"] + " " + dong["ten"]))
    dong["gan"] = None

    if dong["ep"]:
        dong["diem"] = 99
        if dong["ep"] in ("-", "hc"):
            dong["sku"], dong["kieu"] = None, ("ngoai" if dong["ep"] == "-" else "hc")
            dong["thay"] = tuong_duong(dong, kho, khoa_hoc)
            return
        skus = [s.strip() for s in dong["ep"].split(",") if s.strip()]
        for s in skus:
            if s not in kho:
                them_tu_web(kho, tim_web(s))
            if s not in kho:
                sys.exit(f"Dòng {dong['dong']}: sku={s} không có trên web Long Châu")
        dong["sku"], dong["kieu"] = skus[0], "bd"
        dong["thay"] = skus[1:] or tuong_duong(dong, kho, khoa_hoc, tru={skus[0]})
        return

    if not dong["tu_rieng"]:
        dong["sku"], dong["kieu"], dong["diem"] = None, "hc", 0
        dong["thay"] = tuong_duong(dong, kho, khoa_hoc)
        return

    dau = chu_neo(dong)
    xet = lambda: [sp for sp in kho.values() if dau in sp["lien"]]          # noqa: E731 — lọc nhanh trước khi chấm
    hang = lambda sp: (diem(dong, sp), sp["sku"] in khoa_hoc, sp["loai"] == "Thuốc", -len(sp["web"]))  # noqa: E731
    ung = xet()
    tot = max(ung, key=hang, default=None)
    d = diem(dong, tot) if tot else 0
    if d < DIEM_NHAN:
        # Không có trong danh mục đã quét -> tra trang tìm kiếm của web, như gõ tay tên thuốc
        go = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", dong["ten"])).strip()
        them_tu_web(kho, tim_web(go))
        if bo_dau(go) != " ".join(dong["tu_rieng"]):
            them_tu_web(kho, tim_web(" ".join(dong["tu_rieng"])))
        ung = xet()
        tot = max(ung, key=hang, default=None)
        d = diem(dong, tot) if tot else 0
    dong["diem"] = round(d, 1)
    # Toa chỉ ghi mỗi tên (không hoạt chất, không hàm lượng): khớp đủ tên là nhận
    chi_ten = tot is not None and not dong["chat"] and not dong["so_ham"] and ty_le_ten(dong, tot) == 1         and hop_dang(dong["nhom_dang"], tot["nhom_dang"])
    if d >= DIEM_NHAN or chi_ten:
        dong["sku"], dong["kieu"] = tot["sku"], "bd"
        dong["thay"] = tuong_duong(dong, kho, khoa_hoc, tru={tot["sku"]})
        return
    dong["sku"], dong["kieu"] = None, "ngoai"
    # Long Châu có đúng tên biệt dược đó, đúng hoạt chất, chỉ khác hàm lượng / dạng -> vẫn đáng xem hình hộp
    gan = [sp for sp in ung if ty_le_ten(dong, sp) == 1 and dung_chat(dong, sp)]
    if gan:
        dong["gan"] = max(gan, key=hang)["sku"]
    dong["thay"] = tuong_duong(dong, kho, khoa_hoc)


# ---------------------------------------------------------------------------
def main():
    lc.dat_tieu_de(__file__)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    toa = doc_toa()
    kho = nap_kho()
    khoa_hoc = nap_khoa_hoc()
    print(f"{len(toa)} toa · {sum(len(t['thuoc']) for t in toa)} dòng thuốc · danh mục {len(kho)} SP · bộ học viên {len(khoa_hoc)} SP")

    for t in toa:
        for d in t["thuoc"]:
            ghep(d, kho, khoa_hoc)

    # Bảng soát tay
    with open(FILE_SOAT, "w", encoding="utf-8") as fh:
        for t in toa:
            fh.write(f"\n@ {t['id']} | {t['khoa']} | {t['cd'][:70]}\n")
            for d in t["thuoc"]:
                sp = kho.get(d["sku"]) if d["sku"] else None
                fh.write(f"  [{d['kieu']:5}] {d['diem']:>5} dòng {d['dong']:<4} {d['ten']}  ({d['hc']} {d['ham']})\n")
                if sp:
                    fh.write(f"        = {sp['sku']} {sp['ten']} | {sp['hc'][:80]}\n")
                elif d.get("gan"):
                    g = kho[d["gan"]]
                    fh.write(f"        ≈ cùng biệt dược, khác hàm lượng/dạng: {g['sku']} {g['ten']} | {g['hc'][:60]}\n")
                for s in d["thay"]:
                    fh.write(f"        ~ {s} {kho[s]['ten']} | {kho[s]['hc'][:60]}\n")

    # Ghi cho app: chỉ những gì cần hiện, không có tên người bệnh
    ra = {
        "v": 1,
        "ngay": datetime.now().strftime("%d/%m/%Y"),
        "nguon": "100 toa thuốc thật (đã ẩn thông tin người bệnh) · ghép với Nhà thuốc FPT Long Châu",
        "toa": [{
            "id": t["id"], "khoa": t["khoa"], "tuoi": t["tuoi"], "gioi": t["gioi"], "cd": t["cd"],
            "thuoc": [{k: d[k] for k in ("ten", "hc", "ham", "sl", "dung", "sku", "gan", "thay", "kieu")} for d in t["thuoc"]],
        } for t in toa],
        # Tên + slug của mọi SKU được nhắc tới, để tools/lay_thuoc.py biết mở trang nào
        "sp": {s: {"ten": kho[s]["ten"], "slug": kho[s]["slug"]}
               for t in toa for d in t["thuoc"] for s in [x for x in (d["sku"], d["gan"]) if x] + d["thay"]},
    }
    os.makedirs(os.path.dirname(FILE_RA), exist_ok=True)
    with open(FILE_RA, "w", encoding="utf-8") as fh:
        json.dump(ra, fh, ensure_ascii=False, separators=(",", ":"))

    dem = {"bd": 0, "hc": 0, "ngoai": 0}
    for t in toa:
        for d in t["thuoc"]:
            dem[d["kieu"]] += 1
    print(f"Biệt dược đúng như toa: {dem['bd']} · toa ghi hoạt chất: {dem['hc']} · Long Châu không bán: {dem['ngoai']}")
    print(f"SKU được nhắc tới: {len(ra['sp'])}")
    print(f"Đã ghi {FILE_RA}\nBảng soát: {FILE_SOAT}")
    lc.in_tong_ket()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã dừng (Ctrl-C).")
        lc.in_tong_ket()
