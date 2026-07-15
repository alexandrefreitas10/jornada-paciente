'use client'

import React from 'react'
import { C, longDate, shadowCardSoft } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconFlask, IconDownload } from '../Icons'
import type { PortalData, PortalFile } from '../types'

function ExamCard({ f }: { f: PortalFile }) {
  const [open, setOpen] = React.useState(false)
  const hasSummary = !!(f.summary && f.summary.trim())
  return (
    <div style={{ background: C.white, borderRadius: 16, boxShadow: shadowCardSoft, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconBox tone="gold" size={42} radius={12}><IconFlask size={18} color={C.goldIcon} /></IconBox>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>PDF · {longDate(f.created_at)}</div>
        </div>
        <a href={f.url} target="_blank" rel="noreferrer" aria-label="Baixar" style={{ display: 'flex', flexShrink: 0 }}>
          <IconDownload size={18} color={C.sage} sw={1.7} />
        </a>
      </div>
      {hasSummary && (
        <>
          <button onClick={() => setOpen(o => !o)} style={{
            width: '100%', border: 'none', borderTop: `1px solid ${C.border}`, background: C.goldBox,
            color: C.pending, fontWeight: 700, fontSize: 12, padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
          }}>
            {open ? '▾ Ocultar resultados' : '▸ Ver resultados do exame'}
          </button>
          {open && (
            <div style={{ padding: '12px 16px', fontSize: 13, color: C.graphite, lineHeight: 1.6, whiteSpace: 'pre-wrap', borderTop: `1px solid ${C.border}` }}>
              {f.summary}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function Exames({ data, onBack }: { data: PortalData; onBack: () => void }) {
  return (
    <div className="pt-view">
      <ScreenHeader title="Meus exames" subtitle="Documentos e resultados" onBack={onBack} />
      {data.exams.length === 0 ? (
        <EmptyState>Nenhum exame disponível ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 20px 20px' }}>
          {data.exams.map((f) => <ExamCard key={f.id} f={f} />)}
        </div>
      )}
    </div>
  )
}
