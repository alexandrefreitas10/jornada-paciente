'use client'

import React from 'react'
import { C, serif, shadowCard } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconCapsule } from '../Icons'
import type { PortalData, PortalMedication } from '../types'

function groupHeader(iso: string): string {
  try {
    const d = new Date(iso)
    const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
    return `${day} · ${time}`
  } catch { return '' }
}

export function Med({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const meds = data.medications || []

  // Agrupa por dia+hora do created_at (chave = created_at), preservando ordem.
  const groups: { key: string; items: PortalMedication[] }[] = []
  const index = new Map<string, number>()
  for (const m of meds) {
    const key = m.created_at
    let i = index.get(key)
    if (i === undefined) {
      i = groups.length
      index.set(key, i)
      groups.push({ key, items: [] })
    }
    groups[i].items.push(m)
  }

  return (
    <div className="pt-view">
      <ScreenHeader title="Medicações" subtitle="Aplicadas a cada sessão" onBack={onBack} />

      {groups.length === 0 && <EmptyState>Nenhuma medicação registrada ainda.</EmptyState>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 20px 20px' }}>
        {groups.map((g) => (
          <div key={g.key} style={{ background: C.white, borderRadius: 18, padding: 16, boxShadow: shadowCard }}>
            {/* Cabeçalho do grupo: data/hora + badge Aplicada */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: serif, fontSize: 17, color: C.graphiteStrong }}>{groupHeader(g.key)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.sageText, background: C.sageBox, padding: '4px 10px', borderRadius: 999 }}>Aplicada</span>
            </div>

            {/* Linhas de medicação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {g.items.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <IconBox tone="gold" size={34} radius={11}><IconCapsule size={18} color={C.goldIcon} /></IconBox>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong }}>{m.item_name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {`Qtd ${m.quantity}`}{m.lot ? ` · Lote ${m.lot}` : ''}{m.expiry_date ? ` · Val ${m.expiry_date}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
