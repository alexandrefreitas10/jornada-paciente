'use client'

import React from 'react'
import { C, serif, longDate, shadowCardSoft } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconCapsule, IconDoc, IconDownload } from '../Icons'
import type { PortalData, PortalFile } from '../types'

function PrescricaoCard({ f }: { f: PortalFile }) {
  return (
    <a href={f.url} target="_blank" rel="noreferrer" style={{
      display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
      background: C.white, borderRadius: 16, padding: '14px 16px', boxShadow: shadowCardSoft,
    }}>
      <IconBox tone="gold" size={42} radius={12}><IconDoc size={18} color={C.goldIcon} /></IconBox>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</div>
        <div style={{ fontSize: 12, color: C.muted }}>PDF · {longDate(f.created_at)}</div>
      </div>
      <IconDownload size={18} color={C.sage} sw={1.7} />
    </a>
  )
}

export function Prescricoes({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const hasIndicacao = !!(data.prescricaoIndicacao && data.prescricaoIndicacao.trim())
  const hasFiles = data.prescricoes.length > 0

  return (
    <div className="pt-view">
      <ScreenHeader title="Minhas prescrições" subtitle="Receitas e indicações da médica" onBack={onBack} />

      {!hasIndicacao && !hasFiles ? (
        <EmptyState>Suas prescrições aparecerão aqui quando a médica enviar.</EmptyState>
      ) : (
        <>
          {/* Indicação / posologia — texto orientando como tomar */}
          {hasIndicacao && (
            <div style={{ padding: '0 20px 16px' }}>
              <div style={{ background: C.sageBox, borderRadius: 18, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <IconBox tone="sage" size={36} radius={11}><IconCapsule size={17} color={C.sageText} /></IconBox>
                  <span style={{ fontFamily: serif, fontSize: 17, color: C.graphiteStrong }}>Como usar</span>
                </div>
                <div style={{ fontSize: 13.5, color: C.sageText, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                  {data.prescricaoIndicacao}
                </div>
              </div>
            </div>
          )}

          {/* Arquivos para baixar (ex.: levar à farmácia de manipulação) */}
          {hasFiles && (
            <>
              <div style={{ padding: '0 20px 8px', fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Documentos
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 20px 20px' }}>
                {data.prescricoes.map((f) => <PrescricaoCard key={f.id} f={f} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
