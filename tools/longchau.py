"""Phần dùng chung để đọc web Nhà thuốc Long Châu — CHỈ ĐỌC, không đăng nhập, không gửi gì.

Hai việc duy nhất, đều đúng như người dùng làm tay trên trình duyệt:
  - mở trang tìm kiếm  https://nhathuoclongchau.com.vn/tim-kiem?s=<từ khoá>
  - mở trang một sản phẩm  https://nhathuoclongchau.com.vn/<slug>
  - tải ảnh sản phẩm từ cdn.nhathuoclongchau.com.vn
Trang web là Next.js: dữ liệu trang nằm sẵn trong thẻ <script id="__NEXT_DATA__">.

Script chỉ đọc nên đi thẳng mạng máy, không qua proxy (theo quy ước của user).
Các núm (nghỉ giữa 2 lần tải, chờ khi lỗi) nằm ở BẢNG ĐIỀU KHIỂN của script gọi tới —
script đó gán vào CAU_HINH bên dưới trước khi gọi.
"""
import json
import os
import random
import re
import threading
import time

from curl_cffi import requests

WEB = "https://nhathuoclongchau.com.vn/"

# Ghi đè từ BẢNG ĐIỀU KHIỂN của script gọi tới (giây)
CAU_HINH = {
    "NGHI_MIN": 1.0, "NGHI_MAX": 2.0,           # nghỉ ngẫu nhiên giữa 2 request
    "CHO_LOI_MANG": 30,                          # đứt mạng / 429 / 5xx
    "CHO_LOI_KHAC_MIN": 60, "CHO_LOI_KHAC_MAX": 120,   # 403 Cloudflare, trang hỏng…
}

# Header y hệt Chrome trong .har (Chrome 153 / Windows) khi mở một trang; curl_cffi giả luôn vân tay TLS
HEADERS_TRANG = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=0, i",
    "sec-ch-ua": '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
}
HEADERS_ANH = {
    "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "accept-language": HEADERS_TRANG["accept-language"],
    "priority": "i",
    "referer": WEB,
    "sec-ch-ua": HEADERS_TRANG["sec-ch-ua"],
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "image",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "same-site",
    "user-agent": HEADERS_TRANG["user-agent"],
}

dem = {"mang": 0, "khac": 0}
chua_xong = {}          # việc -> (lý do, số lần thử) — việc nào xong thì xoá khỏi đây
_khoa = threading.Lock()


def dat_tieu_de(file):
    """Tiêu đề cmd = <thư mục>/<tên file bỏ đuôi>; chạy chữ nếu quá dài. Lỗi thì bỏ qua."""
    try:
        import ctypes
        duong = os.path.abspath(file)
        ten = os.path.basename(os.path.dirname(duong)) + "/" + os.path.splitext(os.path.basename(duong))[0]
        ctypes.windll.kernel32.SetConsoleTitleW(ten)
        if len(ten) > 40:
            def chay_chu():
                s = ten + "   "
                while True:
                    s = s[1:] + s[0]
                    ctypes.windll.kernel32.SetConsoleTitleW(s[:40])
                    time.sleep(0.3)
            threading.Thread(target=chay_chu, daemon=True).start()
    except Exception:
        pass


def nghi():
    time.sleep(random.uniform(CAU_HINH["NGHI_MIN"], CAU_HINH["NGHI_MAX"]))


def _ghi_loi(loai, viec, ly_do, lan):
    with _khoa:
        dem[loai] += 1
        chua_xong[viec] = (ly_do, lan)


def tai(url, viec, headers, cho_phep_404=True):
    """GET thử lại tới khi có kết quả. Trả về (mã HTTP, bytes).
    - 200            -> trả về
    - 404            -> trả về luôn (trang/ảnh đã gỡ khỏi web là một câu trả lời, không phải lỗi)
    - đứt mạng / 429 / 5xx -> chờ CHO_LOI_MANG giây, thử lại vô hạn
    - mã khác (403 Cloudflare…) -> chờ ngẫu nhiên CHO_LOI_KHAC_MIN..MAX giây, thử lại vô hạn
    """
    lan = 0
    while True:
        lan += 1
        try:
            r = requests.get(url, headers=headers, impersonate="chrome", timeout=40)
        except Exception as ex:
            _ghi_loi("mang", viec, "mạng: " + ex.__class__.__name__, lan)
            print(f"  [lỗi mạng #{dem['mang']}] {viec} lần {lan}: {ex} → chờ {CAU_HINH['CHO_LOI_MANG']}s")
            time.sleep(CAU_HINH["CHO_LOI_MANG"])
            continue
        if r.status_code == 200 or (r.status_code == 404 and cho_phep_404):
            with _khoa:
                chua_xong.pop(viec, None)
            return r.status_code, r.content
        if r.status_code == 429 or r.status_code >= 500:
            _ghi_loi("mang", viec, f"HTTP {r.status_code}", lan)
            print(f"  [lỗi server #{dem['mang']}] {viec} lần {lan}: HTTP {r.status_code} → chờ {CAU_HINH['CHO_LOI_MANG']}s")
            time.sleep(CAU_HINH["CHO_LOI_MANG"])
            continue
        cho = random.uniform(CAU_HINH["CHO_LOI_KHAC_MIN"], CAU_HINH["CHO_LOI_KHAC_MAX"])
        _ghi_loi("khac", viec, f"HTTP {r.status_code}", lan)
        print(f"  [lỗi #{dem['khac']}] {viec} lần {lan}: HTTP {r.status_code} → chờ {cho:.0f}s")
        time.sleep(cho)


_RE_NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def doc_next_data(html_bytes):
    """pageProps của trang Next.js, hoặc None nếu trang không có (trang lỗi / bị chặn)."""
    m = _RE_NEXT.search(html_bytes.decode("utf-8", "replace"))
    if not m:
        return None
    try:
        return json.loads(m.group(1))["props"]["pageProps"]
    except (ValueError, KeyError, TypeError):
        return None


def tai_trang(duong, viec):
    """Mở một trang web Long Châu, trả về pageProps (None nếu trang đã gỡ — HTTP 404).
    Trang trả 200 mà không đọc được __NEXT_DATA__ (trang chặn bot, trang bảo trì) thì coi là lỗi, thử lại."""
    url = duong if duong.startswith("http") else WEB + duong.lstrip("/")
    lan = 0
    while True:
        lan += 1
        ma, noi_dung = tai(url, viec, HEADERS_TRANG)
        if ma == 404:
            return None
        pp = doc_next_data(noi_dung)
        if pp is not None:
            return pp
        cho = random.uniform(CAU_HINH["CHO_LOI_KHAC_MIN"], CAU_HINH["CHO_LOI_KHAC_MAX"])
        _ghi_loi("khac", viec, "trang không có __NEXT_DATA__", lan)
        print(f"  [lỗi #{dem['khac']}] {viec} lần {lan}: trang không có dữ liệu → chờ {cho:.0f}s")
        time.sleep(cho)


def tim_kiem(tu_khoa, viec=None):
    """Trang tìm kiếm của web -> danh sách sản phẩm (dạng rút gọn như thanh tìm kiếm trả về)."""
    from urllib.parse import quote
    pp = tai_trang("tim-kiem?s=" + quote(tu_khoa), viec or f"tìm '{tu_khoa}'")
    if not pp:
        return []
    return ((pp.get("initProducts") or {}).get("products")) or []


def in_tong_ket():
    print("\n══════════ TỔNG KẾT ══════════")
    print(f"Lỗi mạng/server: {dem['mang']} | lỗi khác: {dem['khac']}")
    if chua_xong:
        print("Việc CHƯA XONG:")
        for viec, (ly_do, lan) in chua_xong.items():
            print(f"  - {viec}: {ly_do} (đã thử {lan} lần)")
    else:
        print("Không còn việc nào dở dang.")
