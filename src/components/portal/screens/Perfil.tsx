'use client'

import React from 'react'
import { C, serif, longDate, initial, shadowCard } from '../theme'
import { ScreenHeader } from '../ui'
import { IconUser, IconBell, IconLock, IconChat } from '../Icons'
import type { PortalData, Screen } from '../types'

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <span style={{ width: 24, display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.graphite }}>{label}</span>
      <span style={{ fontSize: 20, color: C.navOff, lineHeight: 1 }}>›</span>
    </div>
  )
}

export function Perfil({ data, go, onLogout, onBack }: { data: PortalData; go: (s: Screen) => void; onLogout: () => void; onBack: () => void }) {
  return (
    <div className="pt-view">
      <ScreenHeader title="Perfil" subtitle="Suas informações e preferências" onBack={onBack} />

      {/* Bloco central: avatar + nome + desde */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 22px 26px' }}>
        <span style={{
          width: 84, height: 84, borderRadius: 28, background: 'linear-gradient(135deg,#e7d9b8,#C4A86A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: serif, color: '#fff', fontSize: 36, boxShadow: '0 16px 30px -16px rgba(196,168,106,.8)',
        }}>{initial(data.name)}</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: serif, fontSize: 24, color: C.graphiteStrong, lineHeight: 1.1 }}>{data.name}</div>
          {data.startDate && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Paciente desde {longDate(data.startDate)}</div>
          )}
        </div>
      </div>

      {/* Lista de itens */}
      <div style={{ margin: '0 20px', background: C.white, borderRadius: 18, boxShadow: shadowCard, overflow: 'hidden' }}>
        <Row icon={<IconUser size={20} color={C.goldIcon} />} label="Meus dados" />
        <div style={{ height: 1, background: C.border, margin: '0 16px' }} />
        <Row icon={<IconBell size={20} color={C.goldIcon} />} label="Notificações" />
        <div style={{ height: 1, background: C.border, margin: '0 16px' }} />
        <Row icon={<IconLock size={20} color={C.goldIcon} />} label="Privacidade e senha" />
        <div style={{ height: 1, background: C.border, margin: '0 16px' }} />
        <Row icon={<IconChat size={20} color={C.sageText} />} label="Falar com a clínica" onClick={() => go('ouvidoria')} />
      </div>

      {/* Sair */}
      <button onClick={onLogout} style={{
        display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'center', padding: 20, fontSize: 14, fontWeight: 700, color: C.danger,
      }}>Sair</button>
    </div>
  )
}
