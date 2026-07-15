'use client'

import React from 'react'
import { C, serif, shadowCard, longDate } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconLeaf, IconDownload } from '../Icons'
import type { PortalData } from '../types'

export function Dieta({ data, onBack }: { data: PortalData; onBack: () => void }) {
  return (
    <div className="pt-view">
      <ScreenHeader title="Minha dieta" subtitle="Seu plano alimentar" onBack={onBack} />

      {data.diets.length === 0 ? (
        <EmptyState>Sua dieta aparecerá aqui quando a clínica enviar.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 8px' }}>
          {data.diets.map((f) => (
            <div key={f.id} style={{
              background: C.white, borderRadius: 18, padding: 16,
              display: 'flex', alignItems: 'center', gap: 14, boxShadow: shadowCard,
            }}>
              <IconBox tone="gold"><IconLeaf color={C.goldIcon} /></IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: serif, fontSize: 15, color: C.graphiteStrong, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>PDF · {longDate(f.created_at)}</div>
              </div>
              <a href={f.url} target="_blank" rel="noreferrer" aria-label="Baixar dieta"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: C.sageBox }}>
                <IconDownload size={18} color={C.sage} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
