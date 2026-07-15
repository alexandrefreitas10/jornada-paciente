'use client'

import React from 'react'
import { C, serif, shadowCard, shortDate } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import { IconSwap } from '../Icons'
import type { PortalData } from '../types'

export function Antes({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const sorted = [...data.photos].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const antes = sorted[0]
  const depois = sorted[sorted.length - 1]

  return (
    <div className="pt-view">
      <ScreenHeader title="Antes & depois" subtitle="Comparação da sua evolução" onBack={onBack} />

      {sorted.length < 2 ? (
        <EmptyState>São necessárias pelo menos duas fotos para comparar. Continue registrando sua evolução!</EmptyState>
      ) : (
        <div style={{ padding: '0 20px 20px' }}>
          {/* Comparativo lado a lado */}
          <div style={{ position: 'relative', display: 'flex', borderRadius: 20, overflow: 'hidden', boxShadow: shadowCard }}>
            <img src={antes.url} alt="Antes" style={{ flex: 1, width: '50%', height: 280, objectFit: 'cover', display: 'block' }} />
            <img src={depois.url} alt="Depois" style={{ flex: 1, width: '50%', height: 280, objectFit: 'cover', display: 'block' }} />

            {/* Linha vertical branca ao centro */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, transform: 'translateX(-50%)', background: C.white }} />

            {/* Círculo central com ícone de troca */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 36, height: 36, borderRadius: '50%', background: C.white,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px -4px rgba(0,0,0,.35)',
            }}>
              <IconSwap size={18} color={C.gold} />
            </div>

            {/* Selo ANTES */}
            <span style={{
              position: 'absolute', top: 12, left: 12, padding: '4px 11px', borderRadius: 999,
              background: 'rgba(0,0,0,.45)', color: C.white, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>ANTES</span>

            {/* Selo DEPOIS */}
            <span style={{
              position: 'absolute', top: 12, right: 12, padding: '4px 11px', borderRadius: 999,
              background: C.gold, color: C.white, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>DEPOIS</span>
          </div>

          {/* Legenda com as datas */}
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: C.soft, fontFamily: serif }}>
            {shortDate(antes.created_at)} <span style={{ color: C.muted2 }}>→</span> {shortDate(depois.created_at)}
          </div>
        </div>
      )}
    </div>
  )
}
