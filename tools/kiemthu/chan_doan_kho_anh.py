"""Chẩn đoán: trong hồ sơ offline đã "Tải sẵn tất cả", thuốc nào còn thiếu tệp trong kho ảnh.
Chạy khi máy chủ thử (cổng 8091) đang TẮT — app mở từ bộ nhớ đệm."""
import os
from playwright.sync_api import sync_playwright

from chung import CACHE, doc

T = doc("data/thuoc.json")["t"]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(os.path.join(CACHE, "hoso_offline"), headless=True)
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto("http://localhost:8091/index.html#/ht", timeout=20000)
    pg.wait_for_timeout(2500)
    co = set(pg.evaluate("caches.open('duoc-hoc-anh-v1').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname + new URL(r.url).search))"))
    print("số mục trong kho:", len(co), "| mẫu:", sorted(co)[:3])
    thieu = []
    for t in T:
        can = ["/data/ct/%s.json" % t["s"]] + ["/img/sp/%s_%d.webp" % (t["s"], n) for n in range(1, t["a"] + 1)]
        th = [c for c in can if c not in co]
        if th:
            thieu.append((t["s"], th))
    print("thuốc thiếu tệp trong kho:", len(thieu), thieu[:5])
    # Thử mở 10 thuốc đủ tệp: ảnh có hiện không
    du = [t for t in T if t["s"] not in {x[0] for x in thieu}][:10]
    for t in du:
        pg.evaluate(f"location.hash='#/ht/t/{t['s']}'")
        pg.wait_for_timeout(800)
        n = pg.evaluate("[...document.querySelectorAll('img.ht-anh')].map(i => i.complete + '/' + i.naturalWidth).join(' ')")
        print(t["s"], t["a"], "ảnh ->", n, "| cảnh báo", pg.locator(".canh-bao").count())
    ctx.close()
