'use client'

import React from 'react'
import { C, serif, longDate, shadowCard } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import { IconMoon, IconDownload } from '../Icons'
import type { PortalData, PortalFile } from '../types'

interface CropRect { x: number; y: number; w: number; h: number }
const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }

// Rota estável (mesma origem) que gera uma URL assinada FRESCA a cada request.
// f.url é assinada no carregamento da página e expira em 15 min; estas não expiram.
// proxySrc: stream inline (para exibir <img>). downloadHref: força download com nome.
const proxySrc = (patientId: number, fileId: number) =>
  `/api/patients/${patientId}/files/${fileId}/download?proxy=1`
const downloadHref = (patientId: number, fileId: number) =>
  `/api/patients/${patientId}/files/${fileId}/download`

function dayKey(iso: string): string {
  try { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` } catch { return iso }
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Editor de enquadramento com Pointer Events (toque + mouse).
function CropEditor({ url, label, crop, onChange, fallback }: { url: string; label: string; crop: CropRect; onChange: (r: CropRect) => void; fallback?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ type: 'move' | 'tl' | 'tr' | 'bl' | 'br'; sx: number; sy: number; sc: CropRect } | null>(null)

  function rel(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    return { rx: (e.clientX - r.left) / r.width, ry: (e.clientY - r.top) / r.height }
  }
  function down(e: React.PointerEvent, type: NonNullable<typeof drag.current>['type']) {
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const { rx, ry } = rel(e)
    drag.current = { type, sx: rx, sy: ry, sc: { ...crop } }
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return
    const { rx, ry } = rel(e)
    const { type, sx, sy, sc } = drag.current
    const dx = rx - sx, dy = ry - sy, MIN = 0.1
    let { x, y, w, h } = sc
    if (type === 'move') {
      x = Math.max(0, Math.min(1 - w, sc.x + dx)); y = Math.max(0, Math.min(1 - h, sc.y + dy))
    } else if (type === 'tl') {
      x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx)); y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy))
      w = sc.x + sc.w - x; h = sc.y + sc.h - y
    } else if (type === 'tr') {
      y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy)); h = sc.y + sc.h - y
      w = Math.min(1 - sc.x, Math.max(MIN, sc.w + dx))
    } else if (type === 'bl') {
      x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx)); w = sc.x + sc.w - x
      h = Math.min(1 - sc.y, Math.max(MIN, sc.h + dy))
    } else {
      w = Math.min(1 - sc.x, Math.max(MIN, sc.w + dx)); h = Math.min(1 - sc.y, Math.max(MIN, sc.h + dy))
    }
    onChange({ x, y, w, h })
  }
  function up() { drag.current = null }

  const handle = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 22, height: 22, background: '#fff', border: `2px solid ${C.gold}`, borderRadius: 4, touchAction: 'none', ...pos,
  })

  return (
    <div style={{ userSelect: 'none' }}>
      <p style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: C.soft, letterSpacing: 0.5, margin: '0 0 6px' }}>{label}</p>
      <div ref={ref} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, touchAction: 'none' }}
        onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" onError={fallback ? e => { if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback } : undefined} style={{ width: '100%', display: 'block', pointerEvents: 'none' }} draggable={false} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', background: 'rgba(0,0,0,0.45)',
          clipPath: `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${crop.x * 100}% ${crop.y * 100}%,${crop.x * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${crop.y * 100}%,${crop.x * 100}% ${crop.y * 100}%)`,
        }} />
        <div style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, border: '2px solid #fff', boxSizing: 'border-box', touchAction: 'none' }}
          onPointerDown={(e) => down(e, 'move')}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {[33.33, 66.66].map(p => <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, borderTop: '1px solid rgba(255,255,255,0.3)' }} />)}
            {[33.33, 66.66].map(p => <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, borderLeft: '1px solid rgba(255,255,255,0.3)' }} />)}
          </div>
          <div style={handle({ top: -11, left: -11 })} onPointerDown={(e) => down(e, 'tl')} />
          <div style={handle({ top: -11, right: -11 })} onPointerDown={(e) => down(e, 'tr')} />
          <div style={handle({ bottom: -11, left: -11 })} onPointerDown={(e) => down(e, 'bl')} />
          <div style={handle({ bottom: -11, right: -11 })} onPointerDown={(e) => down(e, 'br')} />
        </div>
      </div>
    </div>
  )
}

const goldBtn: React.CSSProperties = { background: C.gold, color: '#fff', fontWeight: 700, fontSize: 14, padding: '13px 18px', borderRadius: 14, border: 'none', cursor: 'pointer', width: '100%' }
const ghostBtn: React.CSSProperties = { background: C.white, color: C.soft, fontWeight: 700, fontSize: 14, padding: '13px 18px', borderRadius: 14, border: `1px solid ${C.border}`, cursor: 'pointer', width: '100%' }

export function Fotos({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [lightbox, setLightbox] = React.useState<PortalFile | null>(null)
  const [step, setStep] = React.useState<'gallery' | 'select' | 'crop'>('gallery')
  const [selected, setSelected] = React.useState<number[]>([])
  const [crops, setCrops] = React.useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const byId = (id: number) => data.photos.find(p => p.id === id)!
  const groups = React.useMemo(() => {
    const desc = [...data.photos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const map = new Map<string, PortalFile[]>()
    for (const f of desc) { const k = dayKey(f.created_at); const a = map.get(k); if (a) a.push(f); else map.set(k, [f]) }
    return Array.from(map.values())
  }, [data.photos])

  function toggleSelect(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }
  function exitMontage() { setStep('gallery'); setSelected([]); setCrops([{ ...FULL_CROP }, { ...FULL_CROP }]); setError(null) }

  async function generate() {
    setGenerating(true); setError(null)
    const [a, b] = selected.map(byId)
    const [cA, cB] = crops
    const loadProxy = (id: number): Promise<HTMLImageElement> =>
      fetch(`/api/patients/${data.patientId}/files/${id}/download?proxy=1`).then(r => r.blob()).then(blob => {
        const bu = URL.createObjectURL(blob)
        return new Promise<HTMLImageElement>((res, rej) => { const img = new Image(); img.onload = () => { res(img); URL.revokeObjectURL(bu) }; img.onerror = rej; img.src = bu })
      })
    const loadUrl = (url: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = url })

    try {
      const [imgA, imgB, logo] = await Promise.all([loadProxy(a.id), loadProxy(b.id), loadUrl('/logo-dra.png')])
      const GAP = 20, LABEL_H = 80, PADDING = 40, LOGO_H = 380, LOGO_GAP = 16
      const effWA = imgA.naturalWidth * cA.w, effHA = imgA.naturalHeight * cA.h
      const effWB = imgB.naturalWidth * cB.w, effHB = imgB.naturalHeight * cB.h
      const maxH = Math.max(effHA, effHB)
      const wA = effWA * (maxH / effHA), wB = effWB * (maxH / effHB)
      const totalW = wA + wB + GAP + PADDING * 2
      const logoW = logo.naturalWidth * (LOGO_H / logo.naturalHeight)
      const totalH = LOGO_H + LOGO_GAP + LABEL_H + maxH + PADDING * 2 + 24

      const canvas = document.createElement('canvas')
      canvas.width = totalW; canvas.height = totalH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, totalW, totalH)
      ctx.drawImage(logo, (totalW - logoW) / 2, PADDING, logoW, LOGO_H)
      const top = PADDING + LOGO_H + LOGO_GAP
      ctx.fillStyle = '#514f4a'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('ANTES', PADDING + wA / 2, top + 56)
      ctx.fillText('DEPOIS', PADDING + wA + GAP + wB / 2, top + 56)
      ctx.drawImage(imgA, cA.x * imgA.naturalWidth, cA.y * imgA.naturalHeight, effWA, effHA, PADDING, top + LABEL_H, wA, maxH)
      ctx.drawImage(imgB, cB.x * imgB.naturalWidth, cB.y * imgB.naturalHeight, effWB, effHB, PADDING + wA + GAP, top + LABEL_H, wB, maxH)
      ctx.fillStyle = '#8a8074'; ctx.font = 'bold 34px sans-serif'
      ctx.fillText(fmtDateTime(a.created_at), PADDING + wA / 2, top + LABEL_H + maxH + 50)
      ctx.fillText(fmtDateTime(b.created_at), PADDING + wA + GAP + wB / 2, top + LABEL_H + maxH + 50)

      canvas.toBlob(blob => {
        if (!blob) { setError('Não foi possível gerar a imagem.'); setGenerating(false); return }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a'); link.href = url; link.download = 'antes-depois.png'; link.click()
        URL.revokeObjectURL(url)
        setGenerating(false); exitMontage()
      }, 'image/png')
    } catch {
      setError('Não foi possível gerar a montagem. Tente novamente.'); setGenerating(false)
    }
  }

  // ── Enquadramento ──
  if (step === 'crop') {
    const [a, b] = selected.map(byId)
    return (
      <div className="pt-view">
        <ScreenHeader title="Enquadrar" subtitle="Ajuste a caixa de recorte de cada foto" onBack={() => setStep('select')} />
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CropEditor url={a.url} fallback={proxySrc(data.patientId, a.id)} label="ANTES" crop={crops[0]} onChange={(r) => setCrops(([, y]) => [r, y])} />
          <CropEditor url={b.url} fallback={proxySrc(data.patientId, b.id)} label="DEPOIS" crop={crops[1]} onChange={(r) => setCrops(([x]) => [x, r])} />
          {error && <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>}
          <button style={{ ...goldBtn, opacity: generating ? 0.7 : 1 }} disabled={generating} onClick={generate}>
            {generating ? 'Gerando…' : '✨ Gerar montagem com logo'}
          </button>
        </div>
      </div>
    )
  }

  // ── Seleção de 2 fotos ──
  if (step === 'select') {
    return (
      <div className="pt-view">
        <ScreenHeader title="Antes × Depois" subtitle="Selecione 2 fotos (antes e depois)" onBack={exitMontage} />
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map((group) => (
            <div key={group[0].id}>
              <div style={{ fontFamily: serif, fontSize: 15, color: C.graphiteStrong, marginBottom: 10 }}>{longDate(group[0].created_at)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {group.map((f) => {
                  const idx = selected.indexOf(f.id)
                  const sel = idx >= 0
                  return (
                    <button key={f.id} onClick={() => toggleSelect(f.id)} style={{
                      position: 'relative', cursor: 'pointer', padding: 0, border: sel ? `3px solid ${C.gold}` : 'none',
                      background: C.white, borderRadius: 12, overflow: 'hidden', aspectRatio: '1', boxShadow: shadowCard,
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="" onError={e => { const u = proxySrc(data.patientId, f.id); if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {sel && <span style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: C.gold, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx === 0 ? 'A' : 'D'}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={{ ...goldBtn, opacity: selected.length === 2 ? 1 : 0.5 }} disabled={selected.length !== 2} onClick={() => setStep('crop')}>
            Continuar ({selected.length}/2)
          </button>
          <button style={ghostBtn} onClick={exitMontage}>Cancelar</button>
        </div>
      </div>
    )
  }

  // ── Galeria ──
  return (
    <div className="pt-view">
      <ScreenHeader title="Minhas fotos" subtitle="Registros da sua evolução" onBack={onBack} />
      {data.photos.length === 0 ? (
        <EmptyState>Nenhuma foto ainda. Suas fotos de evolução aparecerão aqui.</EmptyState>
      ) : (
        <>
          {data.photos.length >= 2 && (
            <div style={{ padding: '0 20px 14px' }}>
              <button onClick={() => setStep('select')} className="pt-press" style={{
                width: '100%', cursor: 'pointer', border: 'none', borderRadius: 16, padding: '13px 16px',
                background: C.sageBox, color: C.sageText, fontWeight: 700, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <IconMoon size={18} color={C.sageText} /> Montagem antes × depois
              </button>
            </div>
          )}
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
                      <img src={f.url} alt={f.original_name} onError={e => { const u = proxySrc(data.patientId, f.id); if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.original_name} onClick={(e) => e.stopPropagation()} onError={e => { const u = proxySrc(data.patientId, lightbox.id); if (!e.currentTarget.src.endsWith(u)) e.currentTarget.src = u }} style={{ maxWidth: '100%', maxHeight: '78%', objectFit: 'contain', borderRadius: 12 }} />
          <a href={downloadHref(data.patientId, lightbox.id)} onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer" style={{ marginTop: 18, background: C.gold, color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 20px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <IconDownload size={17} color="#fff" sw={1.7} /> Baixar foto
          </a>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 12 }}>Toque fora para fechar</span>
        </div>
      )}
    </div>
  )
}
