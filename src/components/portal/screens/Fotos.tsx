'use client'

import React from 'react'
import { C, serif, longDate, shadowCard } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import type { PortalData, PortalFile } from '../types'

// Chave de dia (ano-mês-dia) a partir do created_at, para agrupar as fotos.
function dayKey(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  } catch {
    return iso
  }
}

export function Fotos({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [lightbox, setLightbox] = React.useState<PortalFile | null>(null)

  // Agrupa as fotos por dia, em ordem decrescente (mais recentes primeiro).
  const groups = React.useMemo(() => {
    const sorted = [...data.photos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const map = new Map<string, PortalFile[]>()
    for (const f of sorted) {
      const k = dayKey(f.created_at)
      const arr = map.get(k)
      if (arr) arr.push(f)
      else map.set(k, [f])
    }
    return Array.from(map.values())
  }, [data.photos])

  return (
    <div className="pt-view">
      <ScreenHeader title="Minhas fotos" subtitle="Registros da sua evolução" onBack={onBack} />

      {groups.length === 0 ? (
        <EmptyState>Nenhuma foto ainda. Suas fotos de evolução aparecerão aqui.</EmptyState>
      ) : (
        <div style={{ padding: '0 20px 8px' }}>
          {groups.map((group) => (
            <div key={group[0].id} style={{ marginBottom: 22 }}>
              <div style={{ fontFamily: serif, fontSize: 15, color: C.graphiteStrong, marginBottom: 10 }}>
                {longDate(group[0].created_at)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {group.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setLightbox(f)}
                    className="pt-press"
                    style={{
                      cursor: 'pointer', padding: 0, border: 'none', background: C.white,
                      borderRadius: 12, overflow: 'hidden', aspectRatio: '1', boxShadow: shadowCard,
                    }}
                  >
                    <img
                      src={f.url}
                      alt={f.original_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox: overlay preto translúcido, imagem centralizada, clicar fecha */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'pointer',
          }}
        >
          <img
            src={lightbox.url}
            alt={lightbox.original_name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12 }}
          />
        </div>
      )}
    </div>
  )
}
