// Service Worker — giữ app chạy được khi không có mạng.
//
// QUAN TRỌNG khi sửa code: đổi số BAN ở dòng dưới mỗi lần đẩy bản mới lên,
// nếu không iPhone sẽ dùng lại bản cũ đã nằm trong bộ nhớ đệm.
const BAN = 'duoc-hoc-v26';
// Ảnh hộp thuốc + chi tiết từng thuốc (vài nghìn tệp, ~20 MB) nằm ở bộ nhớ đệm RIÊNG, không đổi
// theo BAN: đổi BAN mà xoá luôn chỗ này thì mỗi lần cập nhật code lại phải tải lại toàn bộ ảnh.
// Tệp trong img/sp và data/ct đặt tên theo mã thuốc, nội dung coi như không đổi.
const KHO_ANH = 'duoc-hoc-anh-v1';

const KHUNG = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/config.js',
  './js/util.js',
  './js/db.js',
  './js/store.js',
  './js/img.js',
  './js/form.js',
  './js/view.js',
  './js/ontap.js',
  './js/drive.js',
  './js/dongbo.js',
  './js/lieu.js',
  './js/canhbao.js',
  './js/danhmuc.js',
  './js/lotrinh.js',
  './js/khoahoc.js',
  './js/hocthuoc.js',
  // Danh mục thuốc ~4MB (gzip ~0.9MB): nạp sẵn lúc cài để tra được cả khi mất mạng
  './data/danhmuc.json',
  './data/lotrinh.json',
  './data/khoahoc.json',
  './data/thuoc.json',
  './data/toa.json',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(BAN)
      // addAll hỏng toàn bộ nếu 1 file lỗi, nên thêm từng file để app vẫn cài được
      .then(c => Promise.allSettled(KHUNG.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ds => Promise.all(ds.filter(k => k !== BAN && k !== KHO_ANH).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const rq = e.request;
  if (rq.method !== 'GET') return;
  const url = new URL(rq.url);
  if (url.origin !== location.origin) return;   // không đụng vào tài nguyên ngoài

  // Trang HTML: ưu tiên mạng để nhận bản mới ngay, mất mạng thì lấy bản đã lưu.
  if (rq.mode === 'navigate') {
    e.respondWith(
      fetch(rq)
        .then(res => {
          const ban = res.clone();
          caches.open(BAN).then(c => c.put('./index.html', ban));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Ảnh hộp thuốc + chi tiết thuốc: lấy từ kho riêng, chưa có thì tải rồi cất vào.
  if (url.pathname.includes('/img/sp/') || url.pathname.includes('/data/ct/')) {
    e.respondWith(
      caches.open(KHO_ANH).then(kho => kho.match(rq).then(daCo => daCo || fetch(rq).then(res => {
        if (res && res.status === 200) kho.put(rq, res.clone());
        return res;
      })))
    );
    return;
  }

  // Tệp dữ liệu (danh mục ~4 MB, lộ trình ~1 MB) chỉ đổi khi có bản mới — mà bản
  // mới thì đổi BAN nên được tải sẵn lúc cài. Lấy thẳng từ bộ nhớ đệm, KHÔNG tải
  // ngầm lại mỗi lần mở app (tốn mấy MB dữ liệu di động cho một file không đổi).
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      caches.match(rq).then(daCo => daCo || fetch(rq).then(res => {
        if (res && res.status === 200) {
          const ban = res.clone();
          caches.open(BAN).then(c => c.put(rq, ban));
        }
        return res;
      }))
    );
    return;
  }

  // Tài nguyên tĩnh: lấy bản đã lưu cho nhanh, đồng thời tải ngầm bản mới.
  e.respondWith(
    caches.match(rq).then(daCo => {
      const mang = fetch(rq).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const ban = res.clone();
          caches.open(BAN).then(c => c.put(rq, ban));
        }
        return res;
      }).catch(() => daCo);
      return daCo || mang;
    })
  );
});
