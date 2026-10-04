"""Kiểm thử giao diện Học thuốc:
  A. mọi trang toa + 150 thẻ thuốc + địa chỉ sai: không lỗi JS, không trang trắng, không kẹt "Đang nạp"
  B. dữ liệu hỏng / thiếu: báo lỗi rõ + nút Thử lại chạy được
  C. tràn ngang ở màn hình 320px (iPhone SE đời đầu) và 768px (iPad)
  D. bấm đúp nhanh: không nhảy 2 câu / tự chọn đáp án câu sau
  E. hiệu năng: thời gian dựng các trang nặng
"""
import random
import time
from playwright.sync_api import sync_playwright

from chung import Ghi, MayChu, doc

TOA = doc("data/toa.json")["toa"]
T = doc("data/thuoc.json")["t"]
g = Ghi("Giao diện")
may = MayChu(8093).bat()


def ngu(pg, h, cho=300):
    pg.evaluate(f"location.hash = {h!r}")
    pg.wait_for_timeout(cho)


def kiem_than(pg, h):
    than = pg.inner_text("#than").strip()
    if not than:
        g.L(f"{h}: trang trắng")
    elif "Đang nạp" in than and "Đang nạp chỉ định" not in than:
        g.L(f"{h}: kẹt 'Đang nạp'")


try:
    with sync_playwright() as p:
        tr = p.chromium.launch(headless=True)
        ctx = tr.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
        pg = ctx.new_page()
        hien = {"h": ""}
        g.gan(pg, lambda: hien["h"])
        pg.on("dialog", lambda d: (g.L("hộp thoại bất ngờ: " + d.message), d.dismiss()))
        pg.goto(may.goc + "#/ht"); pg.wait_for_timeout(2500)

        # ---- A
        for t in TOA:
            hien["h"] = h = "#/ht/toa/" + t["id"]
            ngu(pg, h, 200)
            kiem_than(pg, h)
            if pg.locator(".ht-dong").count() != len(t["thuoc"]):
                g.L(f"{h}: hiện {pg.locator('.ht-dong').count()} dòng, dữ liệu {len(t['thuoc'])}")
        for t in random.sample(T, 150):
            hien["h"] = h = "#/ht/t/" + t["s"]
            ngu(pg, h, 150)
            kiem_than(pg, h)
        SAI = ["#/ht/t/abc", "#/ht/t/", "#/ht/t/%E0%A4%A", "#/ht/toa/zzz", "#/ht/doc/zzz", "#/ht/the/xyz/abc",
               "#/ht/the/moi/xyz", "#/ht/tn/xyz", "#/ht/ds/xyz", "#/ht/hoc/xyz", "#/ht/zzz",
               "#/ht/toa/%3Cimg%20src=x%20onerror=alert(1)%3E"]
        for h in SAI + ["#/ht", "#/ht/toa", "#/ht/ds/tat", "#/ht/hoc/toa", "#/ht/the/han/tat", "#/ht/the/anh/hv", "#/kh", "#/nha", "#/tim"]:
            hien["h"] = h
            ngu(pg, h, 400)
            kiem_than(pg, h)
        print("A. đã mở", len(TOA), "toa + 150 thẻ thuốc +", len(SAI), "địa chỉ sai")

        # ---- B
        for chan, h in [("**/data/thuoc.json", "#/ht"), ("**/data/toa.json", "#/ht"), ("**/data/khoahoc.json", "#/ht"),
                        ("**/data/ct/00000964.json", "#/ht/t/00000964"), ("**/img/sp/**", "#/ht/t/00000964"),
                        ("**/img/sp/**", "#/ht/tn/toa"), ("**/data/thuoc.json", "#/kh"), ("**/data/thuoc.json", "#/dm/t/00000964")]:
            p2 = ctx.new_page()
            hien["h"] = f"chặn {chan} {h}"
            # Chỉ bắt lỗi JS: log "Failed to load resource 404" là do chính bài này cố ý trả 404
            p2.on("pageerror", lambda e: g.L(f"[lỗi JS @ {hien['h']}] {e}"))
            p2.route(chan, lambda r: r.fulfill(status=404, body="x"))
            p2.goto(may.goc + h); p2.wait_for_timeout(2500)
            than = p2.inner_text("#than")
            if not than.strip():
                g.L(f"{hien['h']}: trang trắng")
            if chan.endswith(("thuoc.json", "toa.json")) and h == "#/ht":
                if "Thử lại" not in than:
                    g.L(f"{hien['h']}: không báo lỗi / không có nút Thử lại")
                else:
                    p2.unroute(chan)
                    p2.click("text=Thử lại"); p2.wait_for_timeout(2500)
                    if not p2.locator(".lt-tong").count():
                        g.L(f"{hien['h']}: bấm Thử lại khi đã có mạng mà không vào được")
            if chan.endswith("00000964.json") and "Chưa tải được chi tiết" not in than:
                g.L(f"{hien['h']}: không báo thiếu chi tiết")
            if chan == "**/img/sp/**" and h.startswith("#/ht/t/") and "Chưa tải được ảnh" not in than:
                g.L(f"{hien['h']}: không báo thiếu ảnh")
            p2.close()
        print("B. đã thử 8 tình huống dữ liệu hỏng")

        # ---- C
        for w, hh in [(320, 568), (768, 1024)]:
            p3 = ctx.browser.new_context(viewport={"width": w, "height": hh}, service_workers="block").new_page()
            p3.goto(may.goc + "#/ht"); p3.wait_for_timeout(2000)
            for h in ["#/ht", "#/ht/toa", "#/ht/toa/060624", "#/ht/toa/061336", "#/ht/t/00000964", "#/ht/t/00004648",
                      "#/ht/hoc/toa", "#/ht/the/anh/toa", "#/ht/tn/toa", "#/ht/doc/060624", "#/ht/ds/tat", "#/kh/b/hv/n/0", "#/dm/t/00000964"]:
                ngu(p3, h, 700)
                tran = p3.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                if tran > 1:
                    rong = p3.evaluate("""() => [...document.querySelectorAll('#than *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
                        .slice(0, 3).map(e => e.tagName + '.' + e.className + ' ' + (e.textContent || '').slice(0, 30))""")
                    g.L(f"màn {w}px {h}: tràn ngang {tran}px — {rong}")
            p3.context.close()
        print("C. đã đo tràn ngang ở 320px và 768px")

        # ---- D
        ngu(pg, "#/ht", 300); ngu(pg, "#/ht/tn/toa", 800)
        pg.locator(".dm-lua").first.click(); pg.wait_for_timeout(200)
        truoc = pg.locator(".on-tien span").first.inner_text()
        pg.locator(".on-nut .nut-chinh").dblclick(); pg.wait_for_timeout(500)
        sau = pg.locator(".on-tien span").first.inner_text()
        da_chon = pg.locator(".dm-lua.dung, .dm-lua.sai").count()
        print(f"D. bấm đúp 'Câu tiếp': {truoc} -> {sau}, câu mới đã bị chọn sẵn: {da_chon > 0}")
        if int(sau.split("/")[0]) - int(truoc.split("/")[0]) != 1 or da_chon:
            g.L(f"bấm đúp 'Câu tiếp' nhảy {truoc} -> {sau}, câu sau bị chọn sẵn: {da_chon > 0}")
        ngu(pg, "#/ht", 300); ngu(pg, "#/ht/the/anh/toa", 800)
        pg.locator(".the-lat").click(); pg.wait_for_timeout(200)
        truoc = pg.locator(".on-tien span").first.inner_text()
        pg.locator("text=✓ Đã nhớ").dblclick(); pg.wait_for_timeout(600)
        sau = pg.locator(".on-tien span").first.inner_text()
        lat = "Chạm để xem đáp án" not in pg.inner_text(".the-lat")
        print(f"   bấm đúp 'Đã nhớ': {truoc} -> {sau}, thẻ sau bị lật sẵn: {lat}")
        if int(sau.split("/")[0]) - int(truoc.split("/")[0]) != 1 or lat:
            g.L(f"bấm đúp 'Đã nhớ' nhảy {truoc} -> {sau}, thẻ sau bị lật sẵn: {lat}")
        ngu(pg, "#/ht", 300); ngu(pg, "#/ht/doc/060624", 800)
        pg.locator(".the-lat").click(); pg.wait_for_timeout(200)
        pg.locator("text=✓ Đã nhớ").dblclick(); pg.wait_for_timeout(600)
        if "Chạm để xem đáp án" not in pg.inner_text(".the-lat"):
            g.L("luyện đọc toa: bấm đúp 'Đã nhớ' làm dòng sau bị lật sẵn")

        # ---- E
        for h in ["#/ht", "#/ht/ds/tat", "#/ht/toa", "#/ht/toa/061336", "#/ht/t/00000964", "#/ht/tn/tat", "#/kh/b/hv/n/0"]:
            ngu(pg, "#/nha", 300)
            t0 = time.time()
            pg.evaluate(f"location.hash = {h!r}")
            pg.wait_for_function("document.querySelector('#than .trang') && !document.querySelector('#than').innerText.includes('Đang nạp danh')")
            ms = (time.time() - t0) * 1000
            print(f"E. dựng {h:20} {ms:6.0f} ms")
            if ms > 1500:
                g.C(f"{h} dựng chậm {ms:.0f} ms")
        p4 = ctx.browser.new_context(service_workers="block").new_page()
        t0 = time.time(); p4.goto(may.goc + "#/ht")
        p4.wait_for_selector(".lt-tong", timeout=30000)
        print(f"E. mở app lần đầu tới khi thấy trang Học thuốc: {(time.time() - t0) * 1000:.0f} ms")
        p4.context.close()
        tr.close()
finally:
    may.tat()
raise SystemExit(g.tong_ket())
