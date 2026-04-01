const CACHE = 'devedorapp-v1';
const ASSETS = ['./index.html', './manifest.json'];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  // Checa lembretes ao ativar o SW
  checkLembretes();
});

// ── FETCH (cache-first) ───────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── MENSAGEM DA PÁGINA PRINCIPAL ─────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'CHECK_LEMBRETES') checkLembretes();
  if (e.data?.type === 'AGENDAR') agendarNotificacao(e.data.lembrete);
});

// ── NOTIFICAÇÃO CLICADA ───────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};

  if (e.action === 'wpp' && data.wppUrl) {
    e.waitUntil(clients.openWindow(data.wppUrl));
  } else {
    e.waitUntil(
      clients.matchAll({ type: 'window' }).then(cs => {
        if (cs.length) { cs[0].focus(); return; }
        clients.openWindow('./index.html');
      })
    );
  }
});

// ── AGENDAR COM NOTIFICATION TRIGGERS API ─────────────
async function agendarNotificacao(lembrete) {
  try {
    const reg = self.registration;
    // Tenta Notification Triggers API (Chrome Android)
    if ('showTrigger' in Notification.prototype || typeof TimestampTrigger !== 'undefined') {
      await reg.showNotification(`💰 Cobrar ${lembrete.nome}`, {
        body: `Deve ${lembrete.valor} — toque para enviar cobrança`,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: `lembrete-${lembrete.id}`,
        renotify: true,
        data: { id: lembrete.id, wppUrl: lembrete.wppUrl },
        actions: [
          { action: 'wpp', title: '📱 WhatsApp' },
          { action: 'ok',  title: '✓ Ok' }
        ],
        showTrigger: new TimestampTrigger(lembrete.timestamp)
      });
    }
  } catch (_) {
    // fallback: guardar para verificar manualmente
  }
}

// ── CHECAR LEMBRETES NO BANCO ─────────────────────────
async function checkLembretes() {
  try {
    const db = await openDB();
    const lembretes = await getAll(db);
    const agora = Date.now();

    for (const l of lembretes) {
      if (l.timestamp <= agora && !l.disparado) {
        await self.registration.showNotification(`💰 Cobrar ${l.nome}`, {
          body: `Deve ${l.valor} — toque para enviar cobrança no WhatsApp`,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: `lembrete-${l.id}`,
          renotify: true,
          data: { id: l.id, wppUrl: l.wppUrl },
          actions: [
            { action: 'wpp', title: '📱 WhatsApp' },
            { action: 'ok',  title: '✓ Ciente' }
          ]
        });
        l.disparado = true;
        await put(db, l);
      }
    }
    db.close();
  } catch (_) {}
}

// ── INDEXEDDB HELPERS ─────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('devedorapp-sw', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('lembretes')) {
        db.createObjectStore('lembretes', { keyPath: 'swId' });
      }
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}

function getAll(db) {
  return new Promise((res, rej) => {
    const tx = db.transaction('lembretes', 'readonly');
    const req = tx.objectStore('lembretes').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function put(db, item) {
  return new Promise((res, rej) => {
    const tx = db.transaction('lembretes', 'readwrite');
    const req = tx.objectStore('lembretes').put(item);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
