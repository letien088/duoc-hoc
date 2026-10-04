"""Chạy toàn bộ bộ kiểm thử, in tổng kết từng bài.

    python tools/kiemthu/chay_tat_ca.py            # đủ cả bài offline (~10 phút, tải sẵn 5.000+ tệp)
    python tools/kiemthu/chay_tat_ca.py nhanh      # bỏ bài offline

Cần: pip install playwright pillow && playwright install chromium
Nên chạy sau mỗi lần sửa code app hoặc chạy lại tools/xuat_toa.py, tools/lay_thuoc.py.
"""
import os
import subprocess
import sys
import time

DIR = os.path.dirname(os.path.abspath(__file__))
BAI = ["kt_dulieu.py", "kt_congcu.py", "kt_tracnghiem.py", "kt_giaodien.py", "kt_offline.py"]
if "nhanh" in sys.argv:
    BAI.remove("kt_offline.py")

try:
    import ctypes
    ctypes.windll.kernel32.SetConsoleTitleW("tools/kiemthu/chay_tat_ca")
except Exception:
    pass

kq = []
for bai in BAI:
    t0 = time.time()
    print(f"\n>>> {bai}", flush=True)
    ma = subprocess.call([sys.executable, os.path.join(DIR, bai)], cwd=DIR, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    kq.append((bai, ma, time.time() - t0))

print("\n══════════ TỔNG KẾT KIỂM THỬ ══════════")
for bai, ma, giay in kq:
    print(f"  {'ĐẠT ' if ma == 0 else 'LỖI '} {bai:20} {('' if ma == 0 else str(ma) + ' lỗi'):10} {giay:5.0f}s")
sys.exit(sum(1 for _, ma, _ in kq if ma))
