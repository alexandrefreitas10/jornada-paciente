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
