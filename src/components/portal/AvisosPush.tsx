'use client'

import React from 'react'
import { C } from './theme'
import { IconBell } from './Icons'
import { chaveParaBytes } from '@/lib/push'

type Estado =
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

export function AvisosPush() {
  const [estado, setEstado] = React.useState<Estado>('carregando')
  const [ocupado, setOcupado] = React.useState(false)

  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado(ehIPhone() && !instaladoNaTelaDeInicio() ? 'precisa_instalar' : 'sem_suporte')
      return
    }
    if (ehIPhone() && !instaladoNaTelaDeInicio()) { setEstado('precisa_instalar'); return }
    if (Notification.permission === 'denied') { setEstado('negado'); return }

    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(inscricao => setEstado(inscricao ? 'ligado' : 'desligado'))
      .catch(() => setEstado('erro'))
  }, [])

  async function ligar() {
    setOcupado(true)
    try {
      // Tem que partir do toque da pessoa: pedido automático o iPhone recusa.
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

  const recado: Record<Estado, string> = {
    carregando: '',
    sem_suporte: 'Este navegador não recebe avisos',
    precisa_instalar: 'Adicione o portal à tela de início para receber',
    desligado: 'Toque para ativar',
    ligado: 'Ativado',
    negado: 'Bloqueado nos ajustes do aparelho',
    erro: 'Não deu certo — toque para tentar de novo',
  }

  const podeTocar = estado === 'desligado' || estado === 'ligado' || estado === 'erro'
  const aoTocar = () => {
    if (ocupado) return
    if (estado === 'ligado') desligar()
    else ligar()
  }

  return (
    <div
      onClick={podeTocar ? aoTocar : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px',
        cursor: podeTocar && !ocupado ? 'pointer' : 'default',
        opacity: ocupado ? 0.6 : 1,
      }}
    >
      <span style={{ width: 24, display: 'flex', justifyContent: 'center' }}>
        <IconBell size={20} color={C.goldIcon} />
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.graphite }}>
        Notificações
        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: C.soft, marginTop: 2 }}>
          {ocupado ? 'Um instante...' : recado[estado]}
        </span>
      </span>
      {estado === 'ligado' && <span style={{ fontSize: 13, fontWeight: 700, color: C.sageText }}>on</span>}
      {podeTocar && <span style={{ fontSize: 20, color: C.navOff, lineHeight: 1 }}>›</span>}
    </div>
  )
}
