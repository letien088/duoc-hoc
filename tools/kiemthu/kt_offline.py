"""Kiểm thử chạy KHÔNG MẠNG với service worker thật.

Chế độ giả lập offline của trình duyệt không chặn request do service worker gửi, nên bài này
tắt hẳn máy chủ để mất mạng thật. Hồ sơ trình duyệt cố định (tools/.cache/kiemthu/hoso_offline)
để bộ nhớ đệm còn nguyên giữa các bước.
  1. có mạng: mở app, xem 1 thuốc
  2. tắt máy chủ: mọi trang phải mở được; thuốc đã xem đủ ảnh + chi tiết; thuốc chưa xem báo cần mạng
  3. có mạng: bấm "Tải sẵn tất cả"
  4. tắt máy chủ: 40 thuốc ngẫu nhiên phải đủ ảnh + chi tiết; trắc nghiệm chạy được
"""
import json
import os
import random
import shutil
import time
from playwright.sync_api import sync_playwright

from chung import APP, CACHE, Ghi, MayChu, doc

HO_SO = os.path.join(CACHE, "hoso_offline")
T = doc("data/thuoc.json")["t"]
g = Ghi("Kiểm thử offline")
may = MayChu(8091)


def anh_ok(pg):
    return pg.evaluate("[...document.querySelectorAll('img.ht-anh')].filter(i => i.complete && i.naturalWidth > 0).length")


def mo(p):
    ctx = p.chromium.launch_persistent_context(HO_SO, headless=True, viewport={"width": 390, "height": 844})
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    nhan = lambda: pg.url.split("#")[-1]          # noqa: E731
    pg.on("pageerror", lambda e: g.L(f"[lỗi JS @ {nhan()}] {e}"))
    # Mất mạng thì trình duyệt luôn in "Failed to load resource" cho ảnh chưa tải sẵn — đó là điều
    # được chờ đợi, không phải lỗi app; app phải tự báo "cần mạng" (được kiểm riêng ở bước 2)
    pg.on("console", lambda m: g.L(f"[console.error @ {nhan()}] {m.text}")
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    return ctx, pg


def dong(ctx, pg):
    pg.wait_for_timeout(3000)        # cho Chrome ghi xong bộ nhớ đệm xuống đĩa
    ctx.close()


shutil.rmtree(HO_SO, ignore_errors=True)
with sync_playwright() as p:
    # 1
    may.bat()
    ctx, pg = mo(p)
    pg.goto(may.goc + "#/ht"); pg.wait_for_timeout(2000)
    pg.reload(); pg.wait_for_timeout(3000)
    if not pg.evaluate("!!navigator.serviceWorker.controller"):
        g.L("service worker không điều khiển trang sau khi tải lại")
    pg.evaluate("location.hash='#/ht/t/00000964'"); pg.wait_for_timeout(3000)
    print("1. có mạng: thuốc 00000964 ảnh", anh_ok(pg), "| bộ nhớ đệm", pg.evaluate("caches.keys()"))
    dong(ctx, pg)
    may.tat()

    # 2
    ctx, pg = mo(p)
    try:
        pg.goto(may.goc + "#/ht/t/00000964", timeout=20000)
    except Exception as e:
        g.L(f"mất mạng: không mở được app: {e}")
    pg.wait_for_timeout(3000)
    if anh_ok(pg) < 3 or "Chỉ định" not in pg.inner_text("#than"):
        g.L(f"mất mạng: thuốc đã xem chỉ hiện {anh_ok(pg)} ảnh / chi tiết {'có' if 'Chỉ định' in pg.inner_text('#than') else 'không'}")
    for h in ["#/ht", "#/ht/toa", "#/ht/toa/060624", "#/ht/doc/060624", "#/ht/tn/toa", "#/kh", "#/kh/b/hv/n/0",
              "#/dm", "#/dm/t/00000964", "#/lt", "#/tim", "#/nha", "#/caidat"]:
        pg.evaluate(f"location.hash={h!r}"); pg.wait_for_timeout(1500)
        than = pg.inner_text("#than")
        if "Chưa nạp" in than or "Chưa tải được mã" in than or not than.strip():
            g.L(f"mất mạng: {h} không mở được: {than[:80]!r}")
    pg.evaluate("location.hash='#/ht/t/00004648'"); pg.wait_for_timeout(12000)
    if not pg.locator(".ht-anh-trong").count():
        g.L("mất mạng: thuốc chưa xem không báo 'chưa tải được ảnh'")
    if not pg.locator(".canh-bao").count():
        g.L("mất mạng: thuốc chưa xem không báo 'chưa tải được chi tiết'")
    print("2. mất mạng: đã kiểm 13 trang + thuốc đã xem + thuốc chưa xem")
    dong(ctx, pg)

    # 3
    may.bat()
    ctx, pg = mo(p)
    pg.goto(may.goc + "#/ht"); pg.wait_for_timeout(2500)
    t0 = time.time()
    pg.click("text=Tải sẵn tất cả")
    pg.wait_for_function("document.body.innerText.includes('Giờ học được cả khi không có mạng') || document.body.innerText.includes('tệp lỗi')", timeout=1200000)
    chu = pg.locator(".the .the-chu").filter(has_text="tệp").first.inner_text()
    so = pg.evaluate("caches.open('duoc-hoc-anh-v1').then(c => c.keys()).then(k => k.length)")
    print(f"3. tải sẵn: {time.time() - t0:.0f}s — {chu} | kho ảnh {so} tệp")
    if "tệp lỗi" in chu:
        g.L("tải sẵn có tệp lỗi: " + chu)
    can = sum(1 + t["a"] for t in T)
    if so < can:
        g.L(f"kho ảnh chỉ có {so}/{can} tệp")
    pg.wait_for_timeout(15000)
    dong(ctx, pg)
    may.tat()

    # 4
    ctx, pg = mo(p)
    pg.goto(may.goc + "#/ht", timeout=20000); pg.wait_for_timeout(2500)
    thieu = 0
    for t in random.sample(T, 40):
        pg.evaluate(f"location.hash='#/ht/t/{t['s']}'"); pg.wait_for_timeout(700)
        if anh_ok(pg) != t["a"] or pg.locator(".canh-bao").count():
            thieu += 1
            g.L(f"mất mạng sau tải sẵn: {t['s']} ảnh {anh_ok(pg)}/{t['a']}, cảnh báo {pg.locator('.canh-bao').count()}")
    print(f"4. mất mạng sau tải sẵn: {40 - thieu}/40 thuốc đủ ảnh + chi tiết")
    pg.evaluate("location.hash='#/ht/tn/tat'"); pg.wait_for_timeout(1500)
    for i in range(15):
        if pg.locator(".on-xong").count():
            break
        pg.locator(".dm-lua").first.click(); pg.wait_for_timeout(60)
        pg.locator(".on-nut .nut-chinh").click(); pg.wait_for_timeout(60)
    if not pg.locator(".on-xong").count():
        g.L("mất mạng: không làm trọn được một lượt trắc nghiệm")
    dong(ctx, pg)
may.tat()
raise SystemExit(g.tong_ket())
