'use client'

import { useRef } from 'react'
import { RECORTE_CHEIO, type Recorte } from '@/lib/montagem'

// O editor de enquadramento, extraído de FilesTab para ser reusado pelo
// montador da aba Fotos. O corpo é o mesmo de antes, linha por linha: é o
// comportamento de arrastar e redimensionar que o dono já conhece, e mudar
// qualquer coisa aqui muda o recorte que ele escolhe todo dia.
//
// Os tipos são REEXPORTADOS de `@/lib/montagem` em vez de redefinidos: duas
// definições de recorte no projeto divergiriam no dia em que uma mudasse, e o
// recorte é o que decide o `drawImage` da montagem.

export type CropRect = Recorte
export const FULL_CROP = RECORTE_CHEIO

export function CropEditor({ url, label, crop, onChange, fallback }: {
  url: string
  label: string
  crop: CropRect
  onChange: (r: CropRect) => void
  fallback?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    type: 'move' | 'tl' | 'tr' | 'bl' | 'br'
    startMx: number; startMy: number
    startCrop: CropRect
  } | null>(null)

  function toRel(e: React.MouseEvent) {
    const r = containerRef.current!.getBoundingClientRect()
    return { rx: (e.clientX - r.left) / r.width, ry: (e.clientY - r.top) / r.height }
  }

  function startDrag(e: React.MouseEvent, type: NonNullable<typeof drag.current>['type']) {
    e.preventDefault()
    const { rx, ry } = toRel(e)
    drag.current = { type, startMx: rx, startMy: ry, startCrop: { ...crop } }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return
    const { rx, ry } = toRel(e)
    const { type, startMx, startMy, startCrop: sc } = drag.current
    const dx = rx - startMx
    const dy = ry - startMy
    const MIN = 0.08
    let { x, y, w, h } = sc

    if (type === 'move') {
      x = Math.max(0, Math.min(1 - w, sc.x + dx))
      y = Math.max(0, Math.min(1 - h, sc.y + dy))
    } else if (type === 'tl') {
      x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx))
      y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy))
      w = sc.x + sc.w - x; h = sc.y + sc.h - y
    } else if (type === 'tr') {
      y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy))
      h = sc.y + sc.h - y
      w = Math.min(1 - sc.x, Math.max(MIN, sc.w + dx))
    } else if (type === 'bl') {
      x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx))
      w = sc.x + sc.w - x
      h = Math.min(1 - sc.y, Math.max(MIN, sc.h + dy))
    } else {
      w = Math.min(1 - sc.x, Math.max(MIN, sc.w + dx))
      h = Math.min(1 - sc.y, Math.max(MIN, sc.h + dy))
    }

    onChange({ x, y, w, h })
  }

  function onMouseUp() { drag.current = null }

  const handle = (cursor: string, pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14,
    background: 'white', border: '2px solid #7c3aed', borderRadius: 2,
    cursor, ...pos,
  })

  return (
    <div className="space-y-1 select-none">
      <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">{label}</p>
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-gray-200"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img src={url} alt="" onError={fallback ? e => { if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback } : undefined} className="w-full block pointer-events-none" draggable={false} />

        {/* Overlay escuro fora da seleção */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45))`,
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%,
            0% 0%,
            ${crop.x * 100}% ${crop.y * 100}%,
            ${crop.x * 100}% ${(crop.y + crop.h) * 100}%,
            ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,
            ${(crop.x + crop.w) * 100}% ${crop.y * 100}%,
            ${crop.x * 100}% ${crop.y * 100}%
          )`,
        }} />

        {/* Caixa de recorte */}
        <div
          style={{
            position: 'absolute',
            left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
            width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
            border: '2px solid white', cursor: 'move', boxSizing: 'border-box',
          }}
          onMouseDown={(e) => startDrag(e, 'move')}
        >
          {/* Linhas de terços */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {[33.33, 66.66].map(p => (
              <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, borderTop: '1px solid rgba(255,255,255,0.3)' }} />
            ))}
            {[33.33, 66.66].map(p => (
              <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, borderLeft: '1px solid rgba(255,255,255,0.3)' }} />
            ))}
          </div>
          {/* Handles */}
          <div style={handle('nw-resize', { top: -7, left: -7 })} onMouseDown={(e) => { e.stopPropagation(); startDrag(e, 'tl') }} />
          <div style={handle('ne-resize', { top: -7, right: -7 })} onMouseDown={(e) => { e.stopPropagation(); startDrag(e, 'tr') }} />
          <div style={handle('sw-resize', { bottom: -7, left: -7 })} onMouseDown={(e) => { e.stopPropagation(); startDrag(e, 'bl') }} />
          <div style={handle('se-resize', { bottom: -7, right: -7 })} onMouseDown={(e) => { e.stopPropagation(); startDrag(e, 'br') }} />
        </div>
      </div>
    </div>
  )
}
