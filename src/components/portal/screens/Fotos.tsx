'use client'

import React from 'react'
import { C, serif, longDate, shortDate, shadowCard } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import { IconMoon, IconDownload, IconSwap } from '../Icons'
import type { PortalData, PortalFile } from '../types'

function dayKey(iso: string): string {
  try { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` } catch { return iso }
}

export function Fotos({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [lightbox, setLightbox] = React.useState<PortalFile | null>(null)
  const [compare, setCompare] = React.useState(false)

  // Fotos ordenadas por data (crescente para antes/depois)
  const asc = React.useMemo(() =>
    [...data.photos].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  [data.photos])
  const antes = asc[0]
  const depois = asc[asc.length - 1]

  // Grupos por dia, decrescente
  const groups = React.useMemo(() => {
    const desc = [...asc].reverse()
    const map = new Map<string, PortalFile[]>()
    for (const f of desc) {
      const k = dayKey(f.created_at)
      const arr = map.get(k)
      if (arr) arr.push(f); else map.set(k, [f])
    }
    return Array.from(map.values())
  }, [asc])

  return (
    <div className="pt-view">
      <ScreenHeader title="Minhas fotos" subtitle="Registros da sua evolução" onBack={onBack} />

      {data.photos.length === 0 ? (
        <EmptyState>Nenhuma foto ainda. Suas fotos de evolução aparecerão aqui.</EmptyState>
      ) : (
        <>
          {/* Botão de montagem antes x depois (precisa de 2+ fotos) */}
          {data.photos.length >= 2 && (
            <div style={{ padding: '0 20px 14px' }}>
              <button onClick={() => setCompare(true)} className="pt-press" style={{
                width: '100%', cursor: 'pointer', border: 'none', borderRadius: 16, padding: '13px 16px',
                background: C.sageBox, color: C.sageText, fontWeight: 700, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <IconMoon size={18} color={C.sageText} /> Montagem antes × depois
              </button>
            </div>
          )}

          {/* Galeria por data */}
          <div style={{ padding: '0 20px 8px' }}>
            {groups.map((group) => (
              <div key={group[0].id} style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: serif, fontSize: 15, color: C.graphiteStrong, marginBottom: 10 }}>{longDate(group[0].created_at)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {group.map((f) => (
                    <button key={f.id} onClick={() => setLightbox(f)} className="pt-press" style={{
                      cursor: 'pointer', padding: 0, border: 'none', background: C.white,
                      borderRadius: 12, overflow: 'hidden', aspectRatio: '1', boxShadow: shadowCard,
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lightbox com download */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.original_name} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '78%', objectFit: 'contain', borderRadius: 12 }} />
          <a href={lightbox.url} download onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer" style={{
            marginTop: 18, background: C.gold, color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 20px',
            borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
          }}>
            <IconDownload size={17} color="#fff" sw={1.7} /> Baixar foto
          </a>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 12 }}>Toque fora para fechar</span>
        </div>
      )}

      {/* Montagem antes x depois */}
      {compare && antes && depois && (
        <div onClick={() => setCompare(false)} style={{
          position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={antes.url} alt="Antes" style={{ flex: 1, width: '50%', height: 360, objectFit: 'cover', display: 'block' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={depois.url} alt="Depois" style={{ flex: 1, width: '50%', height: 360, objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, transform: 'translateX(-50%)', background: '#fff' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px -4px rgba(0,0,0,.35)' }}>
              <IconSwap size={18} color={C.gold} />
            </div>
            <span style={{ position: 'absolute', top: 12, left: 12, padding: '4px 11px', borderRadius: 999, background: 'rgba(0,0,0,.45)', color: '#fff', fontSize: 11, fontWeight: 700 }}>ANTES</span>
            <span style={{ position: 'absolute', top: 12, right: 12, padding: '4px 11px', borderRadius: 999, background: C.gold, color: '#fff', fontSize: 11, fontWeight: 700 }}>DEPOIS</span>
          </div>
          <div style={{ marginTop: 14, color: '#fff', fontSize: 13, fontFamily: serif }}>
            {shortDate(antes.created_at)} <span style={{ opacity: .7 }}>→</span> {shortDate(depois.created_at)}
          </div>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 12 }}>Toque fora para fechar</span>
        </div>
      )}
    </div>
  )
}
