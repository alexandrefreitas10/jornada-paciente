// Service worker mínimo para o PWA do portal do paciente.
// Estratégia network-first: dados médicos sempre atualizados;
// o cache só serve como fallback offline para navegação.
const CACHE = 'portal-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Só intercepta GET de navegação/estáticos do mesmo domínio
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  // Nunca cacheia APIs nem autenticação
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (request.destination === 'document' || request.destination === 'image' || request.destination === 'style' || request.destination === 'script')) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

// ---------------------------------------------------------------------------
// Avisos (push) do portal.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  // Sem dados a notificação ainda precisa aparecer: o iPhone CANCELA a
  // inscrição de quem recebe push e não mostra nada.
  let aviso = { titulo: 'Instituto Torres', texto: 'Toque para abrir o portal', url: '/portal/paciente' }
  try {
    if (event.data) aviso = { ...aviso, ...event.data.json() }
  } catch {
    // Corpo estranho não pode impedir a notificação de aparecer.
  }

  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.texto,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Uma notificação substitui a anterior em vez de empilhar: o paciente
      // não precisa ver cinco avisos do mesmo assunto.
      tag: 'portal',
      data: { url: aviso.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data && event.notification.data.url) || '/portal/paciente'

  // Se o portal já estiver aberto numa aba, usa ela em vez de abrir outra.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if (aba.url.includes('/portal/') && 'focus' in aba) {
          aba.navigate(destino)
          return aba.focus()
        }
      }
      return self.clients.openWindow(destino)
    })
  )
})
