'use client'

import React from 'react'
import { C } from './theme'
import { IconBell } from './Icons'
import { usarAvisosPush, type EstadoAviso } from './usarAvisosPush'

// A linha de Notificações no Perfil. O estado e as ações vêm de
// `usarAvisosPush`, compartilhados com o convite que aparece depois de marcar
// uma aplicação — ver `ConviteDeAviso.tsx`.
//
// Esta linha continua existindo mesmo com o convite: é o único lugar onde quem
// já ligou consegue DESLIGAR, e onde quem ignorou o convite consegue voltar
// quando quiser.

export function AvisosPush() {
  const { estado, ocupado, ligar, desligar } = usarAvisosPush()

  const recado: Record<EstadoAviso, string> = {
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
