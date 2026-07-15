'use client'

import React from 'react'
import { C, longDate, shadowCard } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconFlask, IconDownload } from '../Icons'
import type { PortalData } from '../types'

export function Exames({ data, onBack }: { data: PortalData; onBack: () => void }) {
  return (
    <div className="pt-view">
      <ScreenHeader title="Meus exames" subtitle="Documentos da sua avaliação" onBack={onBack} />

      {data.exams.length === 0 ? (
        <EmptyState>Nenhum exame disponível ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 8px' }}>
          {data.exams.map((f) => (
            <div key={f.id} style={{
              background: C.white, borderRadius: 18, padding: 14, boxShadow: shadowCard,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <IconBox tone="gold"><IconFlask color={C.goldIcon} /></IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong, lineHeight: 1.3, wordBreak: 'break-word' }}>{f.original_name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>PDF · {longDate(f.created_at)}</div>
              </div>
              <a href={f.url} target="_blank" rel="noreferrer" aria-label="Baixar exame"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                <IconDownload color={C.sage} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
