# -*- coding: utf-8 -*-
"""Máy chủ chạy thử trong mạng nhà.

    python serve.py

Mở cửa sổ này rồi để yên. Đóng cửa sổ là app tắt.
Trên iPhone (cùng Wi-Fi) mở địa chỉ mà script in ra.
"""
import http.server
import mimetypes
import os
import socket
import socketserver
import sys

# ============================================================================
# |                          BẢNG ĐIỀU KHIỂN                                 |
# ============================================================================
CONG = 8080                                                    # cổng mạng
THU_MUC = os.path.dirname(os.path.abspath(__file__))           # thư mục chứa app
TAT_BO_NHO_DEM = True     # True: iPhone luôn tải bản mới, tiện lúc đang sửa code
# ============================================================================

TIEU_DE_CMD = 'duoc_hoc/serve'

# Windows đôi khi lấy MIME của .js từ registry và trả về text/plain, khiến
# trình duyệt từ chối nạp module. Ép đúng kiểu ở đây.
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/png', '.png')


def dat_tieu_de(tieu_de):
    try:
        if os.name == 'nt':
            os.system('title ' + tieu_de)
        else:
            sys.stdout.write('\33]0;%s\a' % tieu_de)
            sys.stdout.flush()
    except Exception:
        pass


def ip_mang_lan():
    """IP của máy trong mạng nội bộ — cái mà iPhone gõ vào Safari."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))     # không gửi gì, chỉ để hệ điều hành chọn card mạng
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=THU_MUC, **kw)

    def end_headers(self):
        if TAT_BO_NHO_DEM:
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Chỉ in lỗi, không in mọi file tĩnh cho đỡ rối
        try:
            ma = int(args[1])
        except Exception:
            ma = 0
        if ma >= 400:
            sys.stderr.write('  %s %s\n' % (self.address_string(), fmt % args))


class MayChu(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    dat_tieu_de(TIEU_DE_CMD)
    ip = ip_mang_lan()
    print('')
    print('  ' + '=' * 56)
    print('   MAY CHU DANG CHAY')
    print('  ' + '=' * 56)
    print('   Tren may nay   : http://localhost:%d' % CONG)
    print('   Tren iPhone    : http://%s:%d' % (ip, CONG))
    print('')
    print('   iPhone phai cung Wi-Fi voi may nay.')
    print('   Neu iPhone khong vao duoc -> mo cong %d trong Windows Firewall.' % CONG)
    print('   Dung may chu : bam Ctrl + C')
    print('  ' + '=' * 56)
    print('')
    try:
        with MayChu(('0.0.0.0', CONG), Handler) as sv:
            sv.serve_forever()
    except OSError as e:
        print('  LOI: khong mo duoc cong %d (%s)' % (CONG, e))
        print('  Co the mot chuong trinh khac dang dung cong nay.')
        print('  Doi so CONG o dau file roi chay lai.')
        return 1
    except KeyboardInterrupt:
        print('\n  Da dung may chu.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
