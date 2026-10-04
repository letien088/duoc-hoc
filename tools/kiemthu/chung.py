"""Phần dùng chung của bộ kiểm thử app (cần: pip install playwright && playwright install chromium).

Mỗi bài kiểm thử tự bật một máy chủ RIÊNG (serve.py ở cổng khác 8080) và chỉ tắt đúng tiến trình
nó bật ra — không đụng tới máy chủ bạn đang chạy hay chương trình nào khác.
"""
import json
import os
import socket
import subprocess
import sys
import time

APP = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # thư mục duoc_hoc
CACHE = os.path.join(APP, "tools", ".cache", "kiemthu")       # hồ sơ trình duyệt, ảnh chụp
os.makedirs(CACHE, exist_ok=True)


def doc(tep):
    with open(os.path.join(APP, tep), encoding="utf-8") as fh:
        return json.load(fh)


def cong_trong(cong):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", cong)) != 0


class MayChu:
    """Bật serve.py ở cổng riêng trong một tiến trình con; tắt() chỉ dừng đúng tiến trình đó."""

    def __init__(self, cong):
        self.cong, self.tt = cong, None

    def bat(self):
        if not cong_trong(self.cong):
            raise SystemExit(f"Cổng {self.cong} đang bận — đổi cổng trong bài kiểm thử.")
        ma = f"import sys; sys.path.insert(0, r'{APP}'); import serve; serve.CONG = {self.cong}; serve.main()"
        self.tt = subprocess.Popen([sys.executable, "-c", ma], cwd=APP,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if not cong_trong(self.cong):
                return self
            time.sleep(0.1)
        raise SystemExit("Máy chủ thử không lên được")

    def tat(self):
        if self.tt and self.tt.poll() is None:
            self.tt.terminate()          # đúng PID của tiến trình con này
            try:
                self.tt.wait(5)
            except subprocess.TimeoutExpired:
                self.tt.kill()
        self.tt = None

    @property
    def goc(self):
        return f"http://localhost:{self.cong}/index.html"


class Ghi:
    """Gom lỗi / cảnh báo, in tổng kết."""

    def __init__(self, ten):
        self.ten, self.loi, self.canh = ten, [], []

    def L(self, x):
        self.loi.append(x)

    def C(self, x):
        self.canh.append(x)

    def gan(self, pg, nhan=lambda: ""):
        pg.on("pageerror", lambda e: self.L(f"[lỗi JS @ {nhan()}] {e}"))
        pg.on("console", lambda m: self.L(f"[console.error @ {nhan()}] {m.text}") if m.type == "error" else None)

    def tong_ket(self):
        print(f"\n===== {self.ten}: {len(self.loi)} lỗi, {len(self.canh)} cảnh báo =====")
        for x in self.loi[:50]:
            print("  LỖI  ", x[:240])
        for x in self.canh[:30]:
            print("  chú ý", x[:240])
        return len(self.loi)


try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
