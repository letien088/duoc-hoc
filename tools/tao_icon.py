# -*- coding: utf-8 -*-
"""Sinh bộ icon cho app. Chạy lại khi muốn đổi màu hoặc hình.

    python tools/tao_icon.py
"""
import os
import sys

from PIL import Image, ImageDraw

# ============================================================================
# |                          BẢNG ĐIỀU KHIỂN                                 |
# ============================================================================
MAU_TREN = (74, 140, 255)      # màu nền phía trên (RGB)
MAU_DUOI = (26, 74, 214)       # màu nền phía dưới
MAU_VIEN = (255, 255, 255)     # màu viên thuốc
MAU_NUA = (206, 224, 255)      # màu nửa dưới viên thuốc
CANH_GOC = 1024                # vẽ ở cỡ lớn rồi thu nhỏ cho nét
THU_MUC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')

# Tên file : (cạnh, tỉ lệ viên thuốc so với khung)
#   maskable cần chừa lề vì Android/iOS có thể cắt tròn vào trong
BAN_XUAT = {
    'icon-192.png':           (192, 0.62),
    'icon-512.png':           (512, 0.62),
    'apple-touch-icon-180.png': (180, 0.62),
    'icon-maskable-512.png':  (512, 0.46),
}
# ============================================================================


def nen_chuyen_mau(canh):
    """Nền chuyển màu dọc."""
    im = Image.new('RGB', (canh, canh))
    px = im.load()
    for y in range(canh):
        t = y / max(1, canh - 1)
        mau = tuple(int(MAU_TREN[i] + (MAU_DUOI[i] - MAU_TREN[i]) * t) for i in range(3))
        for x in range(canh):
            px[x, y] = mau
    return im


def vien_thuoc(canh, ti_le):
    """Viên nang nằm nghiêng 45 độ, nền trong suốt."""
    rong = int(canh * ti_le)
    cao = int(rong * 0.46)
    lop = Image.new('RGBA', (rong, cao), (0, 0, 0, 0))
    d = ImageDraw.Draw(lop)
    bk = cao // 2

    d.rounded_rectangle([0, 0, rong - 1, cao - 1], radius=bk, fill=MAU_VIEN + (255,))
    # Nửa bên phải đậm hơn để nhìn ra hai nửa viên nang
    nua = Image.new('RGBA', (rong, cao), (0, 0, 0, 0))
    dn = ImageDraw.Draw(nua)
    dn.rounded_rectangle([0, 0, rong - 1, cao - 1], radius=bk, fill=MAU_NUA + (255,))
    mat_na = Image.new('L', (rong, cao), 0)
    ImageDraw.Draw(mat_na).rectangle([rong // 2, 0, rong, cao], fill=255)
    lop.paste(nua, (0, 0), mat_na)

    # Vạch ngăn giữa hai nửa
    d.line([(rong // 2, 2), (rong // 2, cao - 3)], fill=MAU_DUOI + (170,), width=max(2, canh // 200))

    return lop.rotate(45, expand=True, resample=Image.BICUBIC)


def tao(canh_ra, ti_le):
    im = nen_chuyen_mau(CANH_GOC).convert('RGBA')

    # Bo góc cho icon 192/512 (apple-touch-icon để vuông, iOS tự bo)
    v = vien_thuoc(CANH_GOC, ti_le)
    im.alpha_composite(v, ((CANH_GOC - v.width) // 2, (CANH_GOC - v.height) // 2))

    return im.convert('RGB').resize((canh_ra, canh_ra), Image.LANCZOS)


def main():
    os.makedirs(THU_MUC, exist_ok=True)
    for ten, (canh, ti_le) in BAN_XUAT.items():
        duong = os.path.normpath(os.path.join(THU_MUC, ten))
        tao(canh, ti_le).save(duong, 'PNG', optimize=True)
        print('da tao %-28s %4dx%-4d %6d byte' % (ten, canh, canh, os.path.getsize(duong)))


if __name__ == '__main__':
    sys.exit(main())
