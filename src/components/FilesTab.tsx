'use client'

import { useState, useRef } from 'react'

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
  created_by?: string | null
}

interface CropRect { x: number; y: number; w: number; h: number }
const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }

// ── Crop editor ──────────────────────────────────────────────────────────────

function CropEditor({ url, label, crop, onChange }: {
  url: string
  label: string
  crop: CropRect
  onChange: (r: CropRect) => void
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
        <img src={url} alt="" className="w-full block pointer-events-none" draggable={false} />

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

// ── Imagem cortada (preview) ─────────────────────────────────────────────────

function CroppedPreview({ url, crop, alt }: { url: string; crop: CropRect; alt: string }) {
  return (
    <div style={{ position: 'relative', paddingBottom: `${(crop.h / crop.w) * 100}%`, overflow: 'hidden' }}
      className="rounded-xl border border-gray-200">
      <img src={url} alt={alt} draggable={false} style={{
        position: 'absolute',
        left: `${-crop.x / crop.w * 100}%`,
        top: `${-crop.y / crop.h * 100}%`,
        width: `${100 / crop.w}%`,
      }} />
    </div>
  )
}

// ── FilesTab ─────────────────────────────────────────────────────────────────

interface Props {
  patientId: number
  fileType: 'photo' | 'bioimpedance' | 'diet'
  initialFiles: FileRecord[]
}

export function FilesTab({ patientId, fileType, initialFiles }: Props) {
  const [files, setFiles] = useState<FileRecord[]>(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Seleção
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<number[]>([])

  // Enquadramento
  const [cropPhase, setCropPhase] = useState(false)
  const [cropPics, setCropPics] = useState<FileRecord[]>([])
  const [cropRects, setCropRects] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])

  // Comparação final
  const [comparing, setComparing] = useState<FileRecord[]>([])
  const [finalCrops, setFinalCrops] = useState<[CropRect, CropRect]>([{ ...FULL_CROP }, { ...FULL_CROP }])

  const isPhoto = fileType === 'photo'
  const accept = isPhoto ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.xls,.xlsx'
  const label = isPhoto ? '📷 Enviar foto' : fileType === 'diet' ? '🥗 Enviar dieta' : '📎 Enviar arquivo'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', fileType)
      const res = await fetch(`/api/patients/${patientId}/files`, { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erro ao enviar arquivo')
      }
      const created: FileRecord = await res.json()
      setFiles((prev) => [created, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja apagar este arquivo?')) return
    await fetch(`/api/patients/${patientId}/files/${id}`, { method: 'DELETE' })
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function handleDownload(id: number) {
    window.location.href = `/api/patients/${patientId}/files/${id}/download`
  }

  function handleDownloadAll() {
    window.location.href = `/api/patients/${patientId}/files/download-all?type=${fileType}`
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function toggleSelect(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }

  function startCrop() {
    const pics = selected.map(id => files.find(f => f.id === id)!).filter(Boolean)
    setCropPics(pics)
    setCropRects([{ ...FULL_CROP }, { ...FULL_CROP }])
    setCropPhase(true)
  }

  function confirmCrops() {
    setComparing(cropPics)
    setFinalCrops(cropRects)
    setCropPhase(false)
  }

  function exitAll() {
    setComparing([]); setSelected([]); setCompareMode(false)
    setCropPhase(false); setCropPics([])
    setCropRects([{ ...FULL_CROP }, { ...FULL_CROP }])
    setFinalCrops([{ ...FULL_CROP }, { ...FULL_CROP }])
  }

  async function handleDownloadComparison() {
    const [a, b] = comparing
    const [cA, cB] = finalCrops

    const loadImageFromApi = async (id: number): Promise<HTMLImageElement> => {
      const res = await fetch(`/api/patients/${patientId}/files/${id}/download?proxy=1`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => { resolve(img); URL.revokeObjectURL(blobUrl) }
        img.onerror = reject
        img.src = blobUrl
      })
    }

    const loadImageFromUrl = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = url
      })

    try {
      const [imgA, imgB, logoImg] = await Promise.all([
        loadImageFromApi(a.id),
        loadImageFromApi(b.id),
        loadImageFromUrl('/logo-dra.png'),
      ])

      const GAP = 20
      const LABEL_H = 80
      const PADDING = 40
      const LOGO_H = 400
      const LOGO_GAP = 16

      // Dimensões efetivas após crop
      const effWA = imgA.naturalWidth * cA.w
      const effHA = imgA.naturalHeight * cA.h
      const effWB = imgB.naturalWidth * cB.w
      const effHB = imgB.naturalHeight * cB.h

      const maxH = Math.max(effHA, effHB)
      const wA = effWA * (maxH / effHA)
      const wB = effWB * (maxH / effHB)

      const totalW = wA + wB + GAP + PADDING * 2
      const logoW = logoImg.naturalWidth * (LOGO_H / logoImg.naturalHeight)
      const totalH = LOGO_H + LOGO_GAP + LABEL_H + maxH + PADDING * 2 + 24

      const canvas = document.createElement('canvas')
      canvas.width = totalW
      canvas.height = totalH
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, totalW, totalH)

      ctx.drawImage(logoImg, (totalW - logoW) / 2, PADDING, logoW, LOGO_H)

      const contentTop = PADDING + LOGO_H + LOGO_GAP

      ctx.fillStyle = '#374151'
      ctx.font = 'bold 48px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('ANTES', PADDING + wA / 2, contentTop + 56)
      ctx.fillText('DEPOIS', PADDING + wA + GAP + wB / 2, contentTop + 56)

      // Fotos com recorte aplicado
      ctx.drawImage(
        imgA,
        cA.x * imgA.naturalWidth, cA.y * imgA.naturalHeight, effWA, effHA,
        PADDING, contentTop + LABEL_H, wA, maxH
      )
      ctx.drawImage(
        imgB,
        cB.x * imgB.naturalWidth, cB.y * imgB.naturalHeight, effWB, effHB,
        PADDING + wA + GAP, contentTop + LABEL_H, wB, maxH
      )

      ctx.fillStyle = '#374151'
      ctx.font = 'bold 36px sans-serif'
      ctx.fillText(formatDate(a.created_at), PADDING + wA / 2, contentTop + LABEL_H + maxH + 50)
      ctx.fillText(formatDate(b.created_at), PADDING + wA + GAP + wB / 2, contentTop + LABEL_H + maxH + 50)

      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'comparacao-antes-depois.png'
        link.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch {
      alert('Não foi possível gerar a imagem. Tente novamente.')
    }
  }

  // ── Tela de enquadramento ────────────────────────────────────────────────────
  if (cropPhase && cropPics.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Enquadrar fotos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Arraste e redimensione a caixa para definir o recorte de cada foto</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmCrops}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              ✓ Confirmar enquadramento
            </button>
            <button
              onClick={() => { setCropPhase(false); setCropPics([]) }}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {cropPics.map((f, i) => (
            <CropEditor
              key={f.id}
              url={f.url}
              label={i === 0 ? 'Antes' : 'Depois'}
              crop={cropRects[i]}
              onChange={(r) => setCropRects(prev => {
                const next: [CropRect, CropRect] = [...prev] as [CropRect, CropRect]
                next[i] = r
                return next
              })}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Tela de comparação final ─────────────────────────────────────────────────
  if (comparing.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Comparação — Antes e Depois</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCropPhase(true); setCropPics(comparing); setCropRects(finalCrops); setComparing([]) }}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ✂️ Ajustar recorte
            </button>
            <button
              onClick={handleDownloadComparison}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              ⬇️ Baixar montagem
            </button>
            <button
              onClick={exitAll}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              ✕ Fechar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {comparing.map((f, i) => (
            <div key={f.id} className="space-y-1">
              <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">
                {i === 0 ? 'Antes' : 'Depois'}
              </p>
              <CroppedPreview url={f.url} crop={finalCrops[i]} alt={f.original_name} />
              <p className="text-xs text-center text-gray-400">{formatDate(f.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Lista/grade normal ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
        {!compareMode && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Enviando...
              </>
            ) : label}
          </button>
        )}

        {isPhoto && files.length >= 2 && (
          <>
            {!compareMode ? (
              <button
                onClick={() => setCompareMode(true)}
                className="px-4 py-2 border border-violet-300 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-50 transition-colors"
              >
                🔍 Comparar fotos
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-600">
                  {selected.length === 0 && 'Selecione 2 fotos para comparar'}
                  {selected.length === 1 && 'Selecione mais 1 foto'}
                  {selected.length === 2 && '2 fotos selecionadas'}
                </p>
                <button
                  onClick={startCrop}
                  disabled={selected.length !== 2}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Enquadrar e comparar
                </button>
                <button
                  onClick={() => { setCompareMode(false); setSelected([]) }}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}

        {files.length > 0 && !compareMode && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            ⬇️ Baixar todos
          </button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum arquivo ainda. {isPhoto ? 'Envie uma foto.' : 'Envie um arquivo.'}
        </p>
      ) : isPhoto ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((f) => {
            const isSelected = selected.includes(f.id)
            const selIndex = selected.indexOf(f.id)
            return (
              <div
                key={f.id}
                className={`relative group rounded-xl overflow-hidden border-2 transition-colors ${
                  compareMode
                    ? isSelected ? 'border-violet-500 cursor-pointer' : 'border-gray-200 cursor-pointer hover:border-violet-300'
                    : 'border-gray-200'
                }`}
                onClick={compareMode ? () => toggleSelect(f.id) : undefined}
              >
                {compareMode && (
                  <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-400 border border-gray-300'
                  }`}>
                    {isSelected ? selIndex + 1 : ''}
                  </div>
                )}

                {!compareMode ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.original_name} className="w-full h-40 object-cover hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={f.url} alt={f.original_name}
                    className={`w-full h-40 object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-70'}`} />
                )}

                <div className="p-2 bg-white flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate">{formatDate(f.created_at)}</p>
                    {f.created_by && <p className="text-xs text-gray-400 truncate">por {f.created_by}</p>}
                  </div>
                  {!compareMode && (
                    <button onClick={() => handleDownload(f.id)} className="text-xs text-violet-600 hover:text-violet-800 shrink-0" title="Baixar">
                      ⬇️
                    </button>
                  )}
                </div>

                {!compareMode && (
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Apagar"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.original_name)
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-2xl">{isImage ? '🖼️' : '📄'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.original_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(f.created_at)}
                    {f.created_by && ` · por ${f.created_by}`}
                  </p>
                </div>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-violet-600 hover:underline font-medium shrink-0">
                  Abrir
                </a>
                <button onClick={() => handleDownload(f.id)} className="text-xs text-violet-600 hover:text-violet-800 shrink-0" title="Baixar">
                  ⬇️
                </button>
                <button onClick={() => handleDelete(f.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0" title="Apagar">
                  🗑️
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
