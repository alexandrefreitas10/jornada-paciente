'use client'

import React from 'react'
import { C, serif, longDate, shadowCardSoft } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconDocSimple, IconDownload } from '../Icons'
import type { PortalData } from '../types'

interface BioMetrics { data: string | null; peso: string | null; gordura: string | null; massa_muscular: string | null; massa_magra: string | null }

function Metric({ label, value, feature }: { label: string; value: string; feature?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: feature ? 'linear-gradient(135deg,#fff,#fbf3e6)' : C.white, borderRadius: 18, padding: 16, textAlign: 'center', boxShadow: shadowCardSoft }}>
      <div style={{ fontSize: 11, color: C.muted2, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 24, color: C.graphiteStrong, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
    </div>
  )
}

export function Bio({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [metrics, setMetrics] = React.useState<BioMetrics | null>(null)
  const [loading, setLoading] = React.useState(data.bioimpedances.length > 0)

  React.useEffect(() => {
    if (data.bioimpedances.length === 0) return
    let alive = true
    fetch(`/api/patients/${data.patientId}/bio-metrics`)
      .then(r => r.json())
      .then(j => { if (alive) setMetrics(j.metrics ?? null) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [data.patientId, data.bioimpedances.length])

  const hasMetric = metrics && (metrics.peso || metrics.gordura || metrics.massa_magra || metrics.massa_muscular)

  return (
    <div className="pt-view">
      <ScreenHeader title="Bioimpedância" subtitle="Sua composição corporal" onBack={onBack} />

      {loading && (
        <div style={{ padding: '8px 20px 16px', fontSize: 13, color: C.muted }}>Analisando seu último exame…</div>
      )}

      {hasMetric && (
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {metrics!.data && <div style={{ fontSize: 12, color: C.soft }}>Exame de {metrics!.data}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            {metrics!.peso && <Metric label="PESO" value={metrics!.peso} feature />}
            {metrics!.gordura && <Metric label="% GORDURA" value={metrics!.gordura} />}
          </div>
          {(metrics!.massa_muscular || metrics!.massa_magra) && (
            <div style={{ display: 'flex', gap: 10 }}>
              {metrics!.massa_muscular && <Metric label="MASSA MUSCULAR" value={metrics!.massa_muscular} />}
              {metrics!.massa_magra && <Metric label="MASSA MAGRA" value={metrics!.massa_magra} />}
            </div>
          )}
        </div>
      )}

      {/* Arquivos */}
      {data.bioimpedances.length === 0 ? (
        <EmptyState>Nenhum arquivo de bioimpedância ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 20px 20px' }}>
          {data.bioimpedances.map((f) => (
            <div key={f.id} style={{ background: C.white, borderRadius: 16, boxShadow: shadowCardSoft, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconBox tone="sage" size={42} radius={12}><IconDocSimple size={18} color={C.sageText} /></IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{longDate(f.created_at)}</div>
              </div>
              <a href={`/api/patients/${data.patientId}/files/${f.id}/download`} target="_blank" rel="noreferrer" aria-label="Baixar" style={{ display: 'flex', flexShrink: 0 }}>
                <IconDownload size={18} color={C.sage} sw={1.7} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
