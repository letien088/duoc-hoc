// Service Worker — giữ app chạy được khi không có mạng.
//
// QUAN TRỌNG khi sửa code: đổi số BAN ở dòng dưới mỗi lần đẩy bản mới lên,
// nếu không iPhone sẽ dùng lại bản cũ đã nằm trong bộ nhớ đệm.
const BAN = 'duoc-hoc-v2';

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
      .then(ds => Promise.all(ds.filter(k => k !== BAN).map(k => caches.delete(k))))
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
