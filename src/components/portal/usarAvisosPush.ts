'use client'

import React from 'react'
import { chaveParaBytes } from '@/lib/push'

// O estado do aviso no celular e as duas ações, num lugar só.
//
// POR QUE VIROU HOOK: este conhecimento é usado por DUAS telas — a linha de
// Notificações no Perfil e o convite que aparece depois de marcar uma
// aplicação. Copiar a lógica para a segunda tela seria a repetição que já
// mordeu este projeto antes; e aqui o preço do erro é alto, porque o pedido
// de permissão só pode ser feito uma vez por pessoa.

export type EstadoAviso =
  | 'carregando'
  | 'sem_suporte'       // navegador antigo demais
  | 'precisa_instalar'  // iPhone no Safari, fora da tela de início
  | 'desligado'
  | 'ligado'
  | 'negado'            // a pessoa recusou; só nos Ajustes do aparelho dá pra voltar
  | 'erro'

const ehIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/**
 * No iPhone o push SÓ existe para quem instalou na tela de início — no Safari
 * comum a API nem aparece. Sem este aviso, o paciente tocaria num botão que
 * não faz nada e concluiria que o portal está quebrado.
 */
const instaladoNaTelaDeInicio = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari do iOS não implementa display-mode e usa esta propriedade própria.
  (navigator as unknown as { standalone?: boolean }).standalone === true

export function usarAvisosPush() {
  const [estado, setEstado] = React.useState<EstadoAviso>('carregando')
  const [ocupado, setOcupado] = React.useState(false)

  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado(ehIPhone() && !instaladoNaTelaDeInicio() ? 'precisa_instalar' : 'sem_suporte')
      return
    }
    if (ehIPhone() && !instaladoNaTelaDeInicio()) { setEstado('precisa_instalar'); return }
    if (Notification.permission === 'denied') { setEstado('negado'); return }

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((inscricao) => setEstado(inscricao ? 'ligado' : 'desligado'))
      .catch(() => setEstado('erro'))
  }, [])

  async function ligar() {
    setOcupado(true)
    try {
      // TEM QUE PARTIR DO TOQUE DA PESSOA. Duas razões, e as duas são
      // definitivas: o iPhone recusa pedido que não venha de um gesto, e um
      // "não" fica gravado para sempre — nem nós nem ninguém consegue
      // perguntar de novo, só os Ajustes do aparelho desfazem. Por isso
      // nenhuma tela pode chamar esta função sozinha.
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') { setEstado(permissao === 'denied' ? 'negado' : 'desligado'); return }

      const resposta = await fetch('/api/portal/push')
      if (!resposta.ok) { setEstado('erro'); return }
      const { chave } = await resposta.json()

      const reg = await navigator.serviceWorker.ready
      const inscricao = await reg.pushManager.subscribe({
        userVisibleOnly: true, // obrigatório: push silencioso é recusado
        applicationServerKey: chaveParaBytes(chave) as BufferSource,
      })

      const gravou = await fetch('/api/portal/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao.toJSON()),
      })
      setEstado(gravou.ok ? 'ligado' : 'erro')
    } catch {
      setEstado('erro')
    } finally {
      setOcupado(false)
    }
  }

  async function desligar() {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const inscricao = await reg.pushManager.getSubscription()
      if (inscricao) {
        // Apaga no servidor ANTES de cancelar no aparelho: cancelar primeiro
        // perderia o endereço e deixaria a linha órfã no banco.
        await fetch('/api/portal/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => {})
        await inscricao.unsubscribe()
      }
      setEstado('desligado')
    } catch {
      setEstado('erro')
    } finally {
      setOcupado(false)
    }
  }

  return { estado, ocupado, ligar, desligar }
}
