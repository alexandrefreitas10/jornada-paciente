'use client'

import { logoutPortal } from './actions'

// Limpa o cache do service worker ANTES de sair, para que a troca de conta no
// mesmo dispositivo não deixe páginas/imagens do paciente anterior acessíveis
// offline (PWA §15).
export function PortalLogoutButton() {
  async function handleLogout() {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch {
      // Se limpar o cache falhar, segue com o logout mesmo assim
    }
    await logoutPortal()
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-xs text-gray-500 hover:text-gray-700"
    >
      Sair
    </button>
  )
}
