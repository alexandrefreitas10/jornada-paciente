'use client'
import React from 'react'
import { C, serif, shadowCard, shadowCardSoft } from '../theme'
import { shortDate } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconDocSimple, IconDownload } from '../Icons'
import type { PortalData, PortalFile } from '../types'

export function Bio({ data, onBack }: { data: PortalData; onBack: () => void }) {
  // Peso mais recente: último item de measurements com weight não-nulo.
  const withWeight = data.measurements.filter((m) => m.weight != null)
  const latest = withWeight.length > 0 ? withWeight[withWeight.length - 1] : null
  const files = data.bioimpedances

  return (
    <div className="pt-view">
      <ScreenHeader title="Bioimpedância" subtitle="Sua composição corporal" onBack={onBack} />

      {/* Cartão de métrica: peso atual */}
      {latest && (
        <div style={{
          margin: '2px 20px 16px', background: 'linear-gradient(135deg,#fff,#fbf3e6)', borderRadius: 20,
          padding: '18px 20px', boxShadow: shadowCardSoft, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.muted2 }}>PESO ATUAL</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: serif, fontSize: 26, color: C.graphiteStrong, lineHeight: 1 }}>
              {latest.weight}
            </span>
            <span style={{ fontSize: 14, color: C.soft }}>kg</span>
          </div>
          {latest.date && (
            <span style={{ fontSize: 12, color: C.muted }}>Medido em {shortDate(latest.date)}</span>
          )}
        </div>
      )}

      {/* Lista de arquivos de bioimpedância */}
      {files.length === 0 ? (
        <EmptyState>Nenhum arquivo de bioimpedância ainda.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 20px 8px' }}>
          {files.map((f: PortalFile) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="pt-press" style={{
              display: 'flex', alignItems: 'center', gap: 13, background: C.white, borderRadius: 16,
              padding: '13px 15px', boxShadow: shadowCard, textDecoration: 'none',
            }}>
              <IconBox tone="gold"><IconDocSimple color={C.goldIcon} /></IconBox>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.graphite, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.original_name}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>PDF · {shortDate(f.created_at)}</div>
              </div>
              <IconDownload color={C.sage} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
