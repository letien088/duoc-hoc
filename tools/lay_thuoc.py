"""Tải chi tiết + ảnh hộp thuốc từ web Long Châu cho mọi thuốc phải học -> tab 💊 Học thuốc.

    python tools/lay_thuoc.py

Thuốc phải học = (1) mọi thuốc nhắc tới trong 100 toa (data/toa.json, sinh bằng tools/xuat_toa.py:
biệt dược đúng như toa, bản cùng tên khác hàm lượng, thuốc thay thế cùng hoạt chất)
             + (2) bộ học viên = Bộ HV + Bộ 700 trong data_hoc_vien.xlsx (data/khoahoc.json).

Mỗi thuốc: mở trang sản phẩm như người dùng bấm vào (đọc __NEXT_DATA__), rồi tải ảnh qua bộ thu nhỏ
của CDN đúng cỡ điện thoại vẫn tải (768px), tự nén lại về WebP nhỏ để app nhẹ.

Chạy lại được bất cứ lúc nào: trang đã đọc (tools/.cache/sp/<mã>.json) và ảnh đã có (img/sp/) thì bỏ
qua, nên dừng giữa chừng (Ctrl-C) rồi chạy lại là làm tiếp. Muốn đọc lại trang mới nhất thì xoá
thư mục tools/.cache/sp.

    python tools/lay_thuoc.py --chi-dung
        chỉ dựng lại data/thuoc.json + data/ct từ những trang đã lưu tạm, KHÔNG mở web, không tải ảnh
        (để thử app khi lượt tải chính còn đang chạy)

Ghi ra:
  data/thuoc.json        chỉ mục gọn của mọi thuốc (tên, hoạt chất, dạng, nhóm, kê đơn, công dụng ngắn, số ảnh)
  data/ct/<mã>.json      chi tiết từng thuốc (chỉ định, liều dùng, chống chỉ định, tác dụng phụ…) — app nạp khi mở
  img/sp/<mã>_<n>.webp   ảnh hộp thuốc đã nén
"""
import html
import io
import json
import os
import re
import sys
from datetime import datetime
from html.parser import HTMLParser

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import longchau as lc  # noqa: E402

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                              BẢNG ĐIỀU KHIỂN                                 ║
# ╠══════════════════════════════════════════════════════════════════════════════╣
# ║ Script CHỈ ĐỌC web (không đăng nhập/không gửi gì) → đi thẳng mạng máy, không proxy ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # thư mục app duoc_hoc

# Toa đã ghép (từ tools/xuat_toa.py). VD: r"D:\congviec\code\duoc_hoc\data\toa.json"
FILE_TOA = os.path.join(DIR, "data", "toa.json")
# Khoá học (bộ HV + 700 = data_hoc_vien.xlsx). VD: r"D:\congviec\code\duoc_hoc\data\khoahoc.json"
FILE_KHOA_HOC = os.path.join(DIR, "data", "khoahoc.json")
# Các bộ trong khoá học phải học (khoá bộ trong khoahoc.json). Thêm "1500", "3000" nếu muốn học cả bộ lớn
BO_PHAI_HOC = ["hv", "700"]
# Danh mục đã quét — để tra slug theo mã. VD: r"D:\congviec\code\nhathuoclongchau\thuoc_longchau.json"
FILE_DANH_MUC = os.path.join(os.path.dirname(DIR), "nhathuoclongchau", "thuoc_longchau.json")

# Nơi ghi. VD: r"D:\congviec\code\duoc_hoc\data\thuoc.json"
FILE_CHI_MUC = os.path.join(DIR, "data", "thuoc.json")
THU_MUC_CT = os.path.join(DIR, "data", "ct")            # VD: r"D:\congviec\code\duoc_hoc\data\ct"
THU_MUC_ANH = os.path.join(DIR, "img", "sp")            # VD: r"D:\congviec\code\duoc_hoc\img\sp"
THU_MUC_CACHE = os.path.join(DIR, "tools", ".cache")   # trang đã đọc + kết quả tìm mã

# Ảnh: số ảnh tối đa mỗi thuốc (cái) — ảnh 1 là mặt trước hộp, sau đó mặt sau, vỉ/lọ…
SO_ANH = 3
# Cạnh dài nhất sau khi nén (px). 400px vẫn đọc rõ chữ trên hộp, ~13KB/ảnh
ANH_CANH = 400
# Chất lượng WebP 1-100. 45 ~ 13KB; 60 ~ 17KB
ANH_CHAT_LUONG = 45
# Cỡ ảnh tải về từ CDN (px) — đúng cỡ điện thoại vẫn tải trên trang sản phẩm (srcset 768w)
ANH_TAI = 768

# Độ dài tối đa mỗi mục chi tiết (ký tự) — tờ hướng dẫn đầy đủ quá dài để học trên điện thoại
TOI_DA_MUC = 1800

# Nghỉ NGẪU NHIÊN giữa 2 thuốc (giây), min/max — ảnh của cùng một thuốc tải liền nhau như trình duyệt
NGHI_MIN = 1.0
NGHI_MAX = 2.0
# Chờ khi lỗi (giây). Lỗi mạng/429/5xx: cố định; lỗi khác (403…): ngẫu nhiên min/max
CHO_LOI_MANG = 30
CHO_LOI_KHAC_MIN = 60
CHO_LOI_KHAC_MAX = 120
# ════════════════════════════════════════════════════════════════════════════════

lc.CAU_HINH.update(NGHI_MIN=NGHI_MIN, NGHI_MAX=NGHI_MAX, CHO_LOI_MANG=CHO_LOI_MANG,
                   CHO_LOI_KHAC_MIN=CHO_LOI_KHAC_MIN, CHO_LOI_KHAC_MAX=CHO_LOI_KHAC_MAX)
CDN_GOC = "https://cdn.nhathuoclongchau.com.vn/v1/static/"
CDN_THU_NHO = f"https://cdn.nhathuoclongchau.com.vn/unsafe/{ANH_TAI}x0/filters:quality(90):format(webp)/"


# ---------------------------------------------------------------------------
# HTML -> các khối chữ [loại, chữ]: h (tiêu đề) · p (đoạn) · li (gạch đầu dòng)
class _Khoi(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ra, self.buf, self.loai = [], [], None

    def _xong(self):
        chu = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if chu:
            self.ra.append([self.loai or "p", chu])
        self.buf, self.loai = [], None

    def handle_starttag(self, tag, attrs):
        if tag in ("h1", "h2", "h3", "h4", "h5", "p", "li", "tr", "div"):
            self._xong()
            self.loai = "h" if tag[0] == "h" and tag[1:].isdigit() else ("li" if tag == "li" else "p")
        elif tag == "br":
            self.buf.append(" ")
        elif tag in ("td", "th"):
            self.buf.append(" · " if self.buf else "")

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h3", "h4", "h5", "p", "li", "tr", "div"):
            self._xong()

    def handle_data(self, data):
        self.buf.append(data)


def khoi(html_chu):
    if not html_chu:
        return []
    p = _Khoi()
    p.feed(html_chu)
    p.close()
    p._xong()
    return p.ra


def bo_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def cat_theo_tieu_de(ds, giu, bo=()):
    """Chia các khối theo tiêu đề; giữ phần có tiêu đề khớp `giu` (regex, bỏ dấu không cần) và không khớp `bo`.
    Phần đứng trước tiêu đề đầu tiên được giữ khi '' khớp `giu`."""
    ra, dang_giu = [], bool(re.search(giu, ""))
    for loai, chu in ds:
        if loai == "h":
            thap = chu.lower()
            dang_giu = bool(re.search(giu, thap)) and not any(re.search(b, thap) for b in bo)
        if dang_giu:
            ra.append([loai, chu])
    return ra


def gon(ds, toi_da=TOI_DA_MUC):
    """Cắt bớt khi quá dài, đánh dấu 'cut' để app hiện "xem đầy đủ trên web"."""
    ra, dem = [], 0
    for loai, chu in ds:
        if dem + len(chu) > toi_da and ra:
            ra.append(["cut", ""])
            break
        ra.append([loai, chu])
        dem += len(chu)
    # bỏ tiêu đề trống ở cuối
    while ra and ra[-1][0] == "h":
        ra.pop()
    return ra


def nhom_duoc_ly(usage_html):
    """'Nhóm dược lý: Vitamin và Khoáng chất. Mã ATC: A12CC06' -> (nhóm, ATC)."""
    chu = bo_html(usage_html)
    m = re.search(r"Nhóm dược lý\s*:\s*([^.]{3,120}?)(?:\.|\s+Mã ATC|$)", chu, re.I)
    a = re.search(r"Mã ATC\s*:\s*([A-Z0-9 ,;()/.\-a-zà-ỹ]{3,120}?)(?:\.\s|\s{2}|$)", chu)
    return (m.group(1).strip() if m else ""), (a.group(1).strip().rstrip(".") if a else "")


# ---------------------------------------------------------------------------
# DANH SÁCH THUỐC PHẢI HỌC
def doc_json(tep):
    with open(tep, encoding="utf-8") as fh:
        return json.load(fh)


def ghi_json(tep, du_lieu, gon_nhe=True):
    os.makedirs(os.path.dirname(tep), exist_ok=True)
    tam = f"{tep}.{os.getpid()}.tam"       # tên theo tiến trình: chạy --chi-dung song song không giẫm nhau
    with open(tam, "w", encoding="utf-8") as fh:
        if gon_nhe:
            json.dump(du_lieu, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(du_lieu, fh, ensure_ascii=False, indent=1)
    os.replace(tam, tep)            # ghi xong mới thay: dừng giữa chừng không để lại file hỏng


def ds_phai_hoc():
    """[(mã, slug|None, nguồn)] — thuốc trong toa trước (học trước), rồi bộ học viên."""
    toa = doc_json(FILE_TOA)
    kh = doc_json(FILE_KHOA_HOC)
    slug = {p["sku"]: p.get("slug") for p in doc_json(FILE_DANH_MUC)}
    for s, x in toa["sp"].items():
        slug.setdefault(s, x.get("slug"))
    ra, da = [], set()
    for t in toa["toa"]:
        for d in t["thuoc"]:
            for s in [x for x in (d["sku"], d["gan"]) if x] + d["thay"]:
                if s not in da:
                    da.add(s)
                    ra.append((s, slug.get(s), "toa"))
    for b in kh["bo"]:
        if b["k"] not in BO_PHAI_HOC:
            continue
        for j in b["muc"]:
            for x in kh["muc"][j][5]:
                s = kh["sp"][x][0]
                # Ô mã SP trong Excel đôi khi chứa chữ nằm nhầm cột ("GENERIC", "BRANDNAME", "FUROSEMID")
                if s and re.fullmatch(r"[A-Z]?\d{5,}", s) and s not in da:
                    da.add(s)
                    ra.append((s, slug.get(s), "kh"))
    return ra


def tim_slug(sku):
    """Mã không có trong danh mục đã quét -> gõ mã vào ô tìm kiếm của web (có bộ nhớ tạm)."""
    tep = os.path.join(THU_MUC_CACHE, "tim", "ma_" + sku + ".json")
    if os.path.exists(tep):
        ds = doc_json(tep)
    else:
        ds = lc.tim_kiem(sku, f"tìm mã {sku}")
        ghi_json(tep, ds)
        lc.nghi()
    for p in ds:
        if p.get("sku") == sku:
            return p.get("slug")
    return None


# ---------------------------------------------------------------------------
# MỘT THUỐC
def rut_gon_trang(pp):
    """Từ pageProps của trang sản phẩm, giữ đúng những gì app cần (để lưu tạm, khỏi đọc lại web)."""
    p = pp.get("product") or {}
    ct = pp.get("content") or {}
    tp = pp.get("transformedProductData") or {}
    anh = [x.get("url") for x in (tp.get("galleryImgUrls") or []) if x.get("url")]
    if not anh and (p.get("primaryImage") or {}).get("url"):
        anh = [p["primaryImage"]["url"]] + [x.get("url") for x in p.get("secondaryImages") or [] if x.get("url")]
    nhom = {c.get("level"): c.get("name") for c in p.get("categories") or []}
    return {
        "sku": p.get("sku"), "ten": p.get("name") or "", "web": p.get("webName") or "",
        "tieuDe": p.get("headingText") or "", "slug": p.get("slug") or "",
        "hc": [[i.get("name") or "", i.get("shortDescription") or ""] for i in p.get("ingredient") or []],
        "hcCho": p.get("ingredientFor") or "",
        "dang": p.get("dosageForm") or "", "quyCach": p.get("specification") or "",
        "hang": p.get("brand") or "", "nsx": p.get("producer") or "", "nuoc": p.get("manufactor") or "",
        "xuatXu": p.get("brandOrigin") or "", "sdk": p.get("registNum") or "",
        "rx": p.get("prescription"), "doiTuong": p.get("objectUse") or [], "tuoi": p.get("ageUse") or "",
        "hsd": p.get("expirationDate") or "",
        "nhom": [nhom.get(1) or "", nhom.get(2) or "", nhom.get(3) or ""],
        "moTaNgan": bo_html(p.get("shortDescription")),
        "moTa": p.get("description") or ct.get("description") or "",
        "usage": ct.get("usage") or p.get("usage") or "",
        "dosage": ct.get("dosage") or p.get("dosage") or "",
        "adverse": ct.get("adverseEffect") or p.get("adverseEffect") or "",
        "careful": ct.get("careful") or "",
        "chong": p.get("contraindication") or "",
        "baoQuan": bo_html(ct.get("preservation")),
        "hoiDap": [[bo_html(f.get("title")), bo_html(f.get("content"))] for f in pp.get("faq") or [] if f.get("title")],
        "anh": anh,
        "luc": datetime.now().strftime("%d/%m/%Y"),
    }


def doc_trang(sku, slug):
    """Trang đã lưu tạm thì dùng lại; chưa có thì mở web. Trả về dict, hoặc {'mat': True} nếu web đã gỡ."""
    tep = os.path.join(THU_MUC_CACHE, "sp", sku + ".json")
    if os.path.exists(tep):
        return doc_json(tep), False
    if not slug:
        slug = tim_slug(sku)
    if not slug:
        x = {"sku": sku, "mat": True, "lyDo": "không tìm thấy mã trên web"}
    else:
        pp = lc.tai_trang(slug, f"trang {sku}")
        if pp is None or not (pp.get("product") or {}).get("sku"):
            x = {"sku": sku, "mat": True, "lyDo": "trang đã gỡ (404)"}
        else:
            x = rut_gon_trang(pp)
            if x["sku"] != sku:
                # slug cũ trỏ sang sản phẩm khác (web đổi mã) -> thử tìm theo mã
                slug2 = tim_slug(sku)
                if slug2 and slug2 != slug:
                    pp = lc.tai_trang(slug2, f"trang {sku}")
                    x = rut_gon_trang(pp) if pp else {"sku": sku, "mat": True, "lyDo": "trang đã gỡ (404)"}
                if x.get("sku") != sku:
                    x = {"sku": sku, "mat": True, "lyDo": "slug trỏ sang sản phẩm khác"}
    ghi_json(tep, x)
    return x, True


def tai_anh(sku, ds_url):
    """Tải SO_ANH ảnh đầu, nén lại. Trả về số ảnh có trên đĩa. Ảnh đã có thì bỏ qua."""
    os.makedirs(THU_MUC_ANH, exist_ok=True)
    co = 0
    for i, url in enumerate(ds_url[:SO_ANH], 1):
        tep = os.path.join(THU_MUC_ANH, f"{sku}_{i}.webp")
        if os.path.exists(tep):
            co += 1
            continue
        ten = url[len(CDN_GOC):] if url.startswith(CDN_GOC) else None
        nguon = CDN_THU_NHO + ten if ten else url
        ma, noi_dung = lc.tai(nguon, f"ảnh {sku}_{i}", lc.HEADERS_ANH)
        if ma == 404 and ten:
            ma, noi_dung = lc.tai(url, f"ảnh gốc {sku}_{i}", lc.HEADERS_ANH)
        if ma != 200:
            print(f"  ảnh {sku}_{i}: HTTP {ma} — bỏ qua ảnh này")
            break           # giữ ảnh liền số: thiếu ảnh 2 thì không lưu ảnh 3
        try:
            im = Image.open(io.BytesIO(noi_dung))
            im = im.convert("RGBA") if im.mode in ("P", "LA") else im
            if im.mode == "RGBA":                       # nền trong suốt -> trắng như trên web
                nen = Image.new("RGB", im.size, (255, 255, 255))
                nen.paste(im, mask=im.split()[3])
                im = nen
            im = im.convert("RGB")
            im.thumbnail((ANH_CANH, ANH_CANH), Image.LANCZOS)
            tam = f"{tep}.{os.getpid()}.tam"
            im.save(tam, "WEBP", quality=ANH_CHAT_LUONG, method=6)
            os.replace(tam, tep)
            co += 1
        except Exception as ex:          # ảnh hỏng (không đọc được) — không phải lỗi mạng
            print(f"  ảnh {sku}_{i}: không đọc được ({ex.__class__.__name__}) — bỏ qua ảnh này")
            break
    return co


# ---------------------------------------------------------------------------
# DỰNG DỮ LIỆU CHO APP
def chi_tiet(x):
    """Các mục chi tiết, đã cắt gọn để học trên điện thoại."""
    usage = khoi(x["usage"])
    dosage = khoi(x["dosage"])
    careful = khoi(x["careful"])
    nhom, atc = nhom_duoc_ly(x["usage"])
    for hoi, dap in x.get("hoiDap") or []:          # trang không ghi trong chỉ định thì xem mục Hỏi-đáp
        if not nhom and "nhóm dược lý" in hoi.lower():
            nhom, atc2 = nhom_duoc_ly(dap)
            atc = atc or atc2
    muc = []

    def them(ma, ten, ds):
        ds = gon(ds)
        if ds:
            muc.append({"k": ma, "ten": ten, "c": ds})

    # Chỉ định: phần đầu của usage, bỏ dược lực học / dược động học
    them("cd", "Chỉ định", cat_theo_tieu_de(usage, r"^$|chỉ định|công dụng|tác dụng", (r"dược lực", r"dược động")))
    them("ld", "Liều dùng & cách dùng",
         cat_theo_tieu_de(dosage, r"^$|cách dùng|liều", (r"quá liều", r"xử trí")))
    them("ql", "Quên liều", cat_theo_tieu_de(dosage, r"quên liều"))
    ccd = cat_theo_tieu_de(careful, r"chống chỉ định")
    if not ccd and x.get("chong"):
        ccd = khoi(x["chong"])
    them("ccd", "Chống chỉ định", ccd)
    them("tdp", "Tác dụng phụ", khoi(x["adverse"]))
    them("tt", "Thận trọng", cat_theo_tieu_de(careful, r"thận trọng|cảnh báo|lưu ý", (r"chống chỉ định",)))
    them("tk", "Phụ nữ có thai & cho con bú", cat_theo_tieu_de(careful, r"mang thai|có thai|cho con bú|thai kỳ"))
    them("lx", "Lái xe & vận hành máy móc", cat_theo_tieu_de(careful, r"lái xe"))
    them("tu", "Tương tác thuốc", cat_theo_tieu_de(careful, r"tương tác"))
    hd = []
    for hoi, dap in x.get("hoiDap") or []:
        if "nhóm dược lý" not in hoi.lower() and dap:
            hd += [["q", hoi], ["a", dap]]
    them("hd", "Hỏi đáp tư vấn", hd)
    if not muc and x.get("moTa"):
        them("mt", "Mô tả", khoi(x["moTa"]))
    return nhom, atc, muc


def cau_ngan(chu, toi_da=260):
    """Giữ trọn các câu đầu cho tới khi quá toi_da ký tự — không cắt giữa chữ như 'dưới dạng amo'."""
    chu = (chu or "").strip()
    if len(chu) <= toi_da:
        # Chữ gốc trên web đôi khi bị cắt cụt, kết thúc bằng dấu phẩy ("…Calci Carbonat,") -> báo là còn tiếp
        return chu[:-1].rstrip() + "…" if chu.endswith((",", ";", ":")) else chu
    ra = ""
    for cau in re.split(r"(?<=[.!?])\s+", chu):
        if ra and len(ra) + 1 + len(cau) > toi_da:
            break
        ra = (ra + " " + cau).strip()
    if len(ra) > toi_da:                 # câu đầu đã quá dài: cắt ở chỗ cách gần nhất
        ra = ra[:toi_da].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return ra


def ten_hoat_chat(x):
    hc = [f"{a} {b}".strip() for a, b in x.get("hc") or [] if a]
    return ", ".join(hc)


def main():
    lc.dat_tieu_de(__file__)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    chi_dung = "--chi-dung" in sys.argv
    ds = ds_phai_hoc()
    if chi_dung:
        ds = [d for d in ds if os.path.exists(os.path.join(THU_MUC_CACHE, "sp", d[0] + ".json"))]
        print(f"--chi-dung: chỉ dựng từ {len(ds)} thuốc đã có trang lưu tạm")
    print(f"Thuốc phải học: {len(ds)} (từ toa: {sum(1 for d in ds if d[2] == 'toa')}, "
          f"bộ học viên thêm: {sum(1 for d in ds if d[2] == 'kh')})")

    chi_muc, mat = [], []
    for so, (sku, slug, nguon) in enumerate(ds, 1):
        x, moi = doc_trang(sku, slug)
        if x.get("mat"):
            mat.append((sku, x.get("lyDo")))
            print(f"[{so}/{len(ds)}] {sku}: {x.get('lyDo')}")
            continue
        so_anh_truoc = len([1 for i in range(1, SO_ANH + 1) if os.path.exists(os.path.join(THU_MUC_ANH, f"{sku}_{i}.webp"))])
        so_anh = so_anh_truoc if chi_dung else tai_anh(sku, x["anh"])
        nhom, atc, muc = chi_tiet(x)
        ghi_json(os.path.join(THU_MUC_CT, sku + ".json"), {
            "s": sku, "nhomDL": nhom, "atc": atc, "hcCho": x["hcCho"], "nsx": x["nsx"], "nuoc": x["nuoc"],
            "xuatXu": x["xuatXu"], "sdk": x["sdk"], "doiTuong": x["doiTuong"], "tuoi": x["tuoi"], "hsd": x["hsd"],
            "baoQuan": x["baoQuan"], "muc": muc, "slug": x["slug"], "luc": x["luc"],
        })
        chi_muc.append({
            "s": sku, "t": x["ten"], "w": x["web"], "td": x["tieuDe"], "h": ten_hoat_chat(x),
            "d": x["dang"], "q": x["quyCach"], "n": x["nhom"][1], "c": x["nhom"][2], "l": x["nhom"][0],
            "rx": 1 if x["rx"] is True else 0 if x["rx"] is False else None,
            "b": x["hang"], "x": x["nuoc"] or x["xuatXu"], "cd": cau_ngan(x["moTaNgan"]), "a": so_anh,
        })
        if moi or so_anh != so_anh_truoc:
            print(f"[{so}/{len(ds)}] {sku} {x['ten'][:50]} · {so_anh} ảnh · {len(muc)} mục")
            lc.nghi()

    ghi_json(FILE_CHI_MUC, {
        "v": 1, "ngay": datetime.now().strftime("%d/%m/%Y"), "nguon": "Nhà thuốc FPT Long Châu",
        "web": lc.WEB, "soAnh": SO_ANH, "t": chi_muc,
        "mat": [{"s": s, "ly": l} for s, l in mat],
    })
    tong_anh = sum(os.path.getsize(os.path.join(THU_MUC_ANH, f)) for f in os.listdir(THU_MUC_ANH)) if os.path.isdir(THU_MUC_ANH) else 0
    tong_ct = sum(os.path.getsize(os.path.join(THU_MUC_CT, f)) for f in os.listdir(THU_MUC_CT)) if os.path.isdir(THU_MUC_CT) else 0
    print(f"\nXong: {len(chi_muc)} thuốc có dữ liệu · {len(mat)} mã web đã gỡ / không tìm thấy")
    print(f"  {FILE_CHI_MUC} ({os.path.getsize(FILE_CHI_MUC) / 1024:.0f} KB)")
    print(f"  data/ct: {tong_ct / 1024 / 1024:.1f} MB · img/sp: {tong_anh / 1024 / 1024:.1f} MB")
    if mat:
        print("Mã không lấy được (app vẫn hiện tên từ toa / Excel, chỉ thiếu ảnh và chi tiết):")
        for s, l in mat:
            print(f"  - {s}: {l}")
    lc.in_tong_ket()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã dừng (Ctrl-C). Chạy lại sẽ làm tiếp từ chỗ dừng.")
        lc.in_tong_ket()
