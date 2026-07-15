'use client'

import React from 'react'
import { C, serif, shadowCard, longDate } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconSparkle } from '../Icons'
import type { PortalData } from '../types'

export function Estetica({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const sessions = data.sessions || []
  return (
    <div className="pt-view">
      <ScreenHeader title="Estética" subtitle="Seus procedimentos estéticos" onBack={onBack} />

      {sessions.length === 0 ? (
        <EmptyState>Você ainda não tem procedimentos estéticos registrados.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 8px' }}>
          {sessions.map((s) => {
            const done = s.completedCount > 0
            return (
              <div key={s.id} style={{
                background: C.white, borderRadius: 18, padding: 16, boxShadow: shadowCard,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <IconBox tone="gold"><IconSparkle color={C.goldIcon} /></IconBox>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: serif, fontSize: 17, color: C.graphiteStrong }}>{s.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                      background: done ? C.sageBox : C.goldBox,
                      color: done ? C.sageText : C.pending,
                    }}>{done ? 'Feito' : 'Em andamento'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{longDate(s.created_at)}</div>
                  <div style={{ fontSize: 12, color: C.soft, marginTop: 2 }}>
                    {s.completedCount} de {s.total_sessions} sessões
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
