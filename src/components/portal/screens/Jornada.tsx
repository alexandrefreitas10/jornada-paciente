'use client'

import React from 'react'
import { C, serif, shadowCard, longDate } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import type { PortalData } from '../types'

export function Jornada({ data, onBack }: { data: PortalData; onBack: () => void }) {
  return (
    <div className="pt-view">
      <ScreenHeader title="Minha jornada" subtitle="Seu tratamento passo a passo" onBack={onBack} />

      {data.sessions.length === 0 ? (
        <EmptyState>
          Sua jornada de tratamento aparecerá aqui conforme suas sessões acontecerem. Você já concluiu {data.tasksDone} de {data.tasksTotal} etapas.
        </EmptyState>
      ) : (
        <div style={{ padding: '4px 22px 24px' }}>
          {data.sessions.map((s, i) => {
            const done = s.completedCount > 0
            const isLast = i === data.sessions.length - 1
            return (
              <div key={s.id} style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                {/* Coluna do marcador + linha vertical */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 6,
                    background: done ? '#8A9A7B' : C.gold,
                    border: done ? 'none' : '3px solid #f6ecd7',
                    boxShadow: done ? '0 4px 10px -6px rgba(138,154,123,.8)' : 'none',
                  }} />
                  {!isLast && <span style={{ flex: 1, width: 2, background: C.border, marginTop: 4, minHeight: 24 }} />}
                </div>

                {/* Cartão da sessão */}
                <div style={{
                  flex: 1, marginBottom: 16, background: C.white, borderRadius: 18, padding: '14px 16px',
                  boxShadow: shadowCard,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, fontFamily: serif, fontSize: 16, color: C.graphiteStrong, lineHeight: 1.2 }}>{s.name}</div>
                    <span style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                      background: done ? C.sageBox : '#FAF1E2',
                      color: done ? C.sageText : C.pending,
                    }}>{done ? 'Feito' : 'Em andamento'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{longDate(s.created_at)}</div>
                  <div style={{ fontSize: 12, color: C.soft, marginTop: 3 }}>{s.completedCount} de {s.total_sessions} sessões concluídas</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
