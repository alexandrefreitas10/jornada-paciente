'use client'

import React from 'react'
import { C, serif, longDate, shadowCard, shadowCardSoft } from '../theme'
import { ScreenHeader, IconBox, EmptyState } from '../ui'
import { IconLeaf, IconSun, IconSunFull, IconDrop, IconDownload } from '../Icons'
import type { PortalData } from '../types'

interface Meal { nome: string; itens: string }

// Ícone por tipo de refeição (heurística pelo nome)
function mealIcon(nome: string) {
  const n = nome.toLowerCase()
  if (n.includes('café') || n.includes('manh')) return <IconSun size={17} color={C.goldIcon} />
  if (n.includes('almo') || n.includes('jant')) return <IconSunFull size={17} color={C.sageText} />
  if (n.includes('ceia') || n.includes('noite')) return <IconDrop size={17} color={C.sageText} />
  return <IconLeaf size={17} color={C.goldIcon} />
}
function mealTone(nome: string): 'gold' | 'sage' {
  const n = nome.toLowerCase()
  return (n.includes('almo') || n.includes('jant') || n.includes('ceia')) ? 'sage' : 'gold'
}

export function Dieta({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [meals, setMeals] = React.useState<Meal[] | null>(null)
  const [loading, setLoading] = React.useState(data.diets.length > 0)
  const latest = data.diets[0]

  React.useEffect(() => {
    if (data.diets.length === 0) return
    let alive = true
    fetch(`/api/patients/${data.patientId}/diet-plan`)
      .then(r => r.json())
      .then(j => { if (alive) setMeals(j.plan?.meals ?? null) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [data.patientId, data.diets.length])

  return (
    <div className="pt-view">
      <ScreenHeader title="Minha dieta" subtitle="Seu plano alimentar" onBack={onBack} />

      {data.diets.length === 0 ? (
        <EmptyState>Sua dieta aparecerá aqui quando a clínica enviar.</EmptyState>
      ) : (
        <>
          {loading && <div style={{ padding: '8px 20px 12px', fontSize: 13, color: C.muted }}>Organizando seu plano…</div>}

          {/* Aviso: o documento original pode ter opções de substituição */}
          {meals && meals.length > 0 && latest && (
            <a href={latest.url} target="_blank" rel="noreferrer" style={{
              display: 'block', textDecoration: 'none', margin: '0 20px 14px',
              background: C.sageBox, color: C.sageText, borderRadius: 14, padding: '12px 16px',
              fontSize: 13, fontWeight: 700, lineHeight: 1.4,
            }}>
              💡 Este é um resumo do seu cardápio. Toque aqui para abrir o documento original e ver as <u>opções de substituição</u> de cada refeição.
            </a>
          )}

          {/* Refeições estruturadas */}
          {meals && meals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 20px 16px' }}>
              {meals.map((m, i) => (
                <div key={i} style={{ background: C.white, borderRadius: 18, padding: 16, boxShadow: shadowCardSoft }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <IconBox tone={mealTone(m.nome)} size={36} radius={11}>{mealIcon(m.nome)}</IconBox>
                    <span style={{ fontFamily: serif, fontSize: 17, color: C.graphiteStrong }}>{m.nome}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#7a746b', lineHeight: 1.6 }}>{m.itens}</div>
                </div>
              ))}
            </div>
          )}

          {/* Arquivo original para baixar */}
          {latest && (
            <div style={{ padding: '0 20px 20px' }}>
              <a href={latest.url} target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                background: C.white, borderRadius: 16, padding: '14px 16px', boxShadow: shadowCard,
              }}>
                <IconBox tone="gold" size={40} radius={12}><IconLeaf size={18} color={C.goldIcon} /></IconBox>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.graphiteStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latest.original_name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>PDF · {longDate(latest.created_at)}</div>
                </div>
                <IconDownload size={18} color={C.sage} sw={1.7} />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
