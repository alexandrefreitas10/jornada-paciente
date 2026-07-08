'use client'

import { useState, useRef, useEffect } from 'react'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Measurement { label: string; value: string; unit: string }

interface SessionCompletion {
  session_number: number
  observation: string | null
  measurements: Measurement[]
  completed_at: string
}

interface AestheticSession {
  id: number
  patient_id: number
  procedure_name: string
  total_sessions: number
  sessions_per_week: number
  start_date: string
  end_date: string
  region: string | null
  initial_measurements: Measurement[]
  created_by: string | null
  created_at: string
  completed_sessions: number[]
  completions: SessionCompletion[]
}

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
}

interface CropRect { x: number; y: number; w: number; h: number }
const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function calcEndDate(startDate: string, totalSessions: number, sessionsPerWeek: number): string {
  const spw = Math.max(1, sessionsPerWeek)
  const weeks = Math.ceil(totalSessions / spw)
  const start = new Date(startDate + 'T12:00:00')
  start.setDate(start.getDate() + weeks * 7 - 1)
  return start.toISOString().slice(0, 10)
}

function today() { return new Date().toISOString().slice(0, 10) }

// ── Crop Editor ───────────────────────────────────────────────────────────────

function CropEditor({ url, label, crop, onChange }: {
  url: string; label: string; crop: CropRect; onChange: (r: CropRect) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ type: 'move'|'tl'|'tr'|'bl'|'br'; startMx:number; startMy:number; startCrop:CropRect }|null>(null)

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
    const dx = rx - startMx; const dy = ry - startMy; const MIN = 0.08
    let { x, y, w, h } = sc
    if (type === 'move') { x = Math.max(0, Math.min(1-w, sc.x+dx)); y = Math.max(0, Math.min(1-h, sc.y+dy)) }
    else if (type === 'tl') { x = Math.max(0, Math.min(sc.x+sc.w-MIN, sc.x+dx)); y = Math.max(0, Math.min(sc.y+sc.h-MIN, sc.y+dy)); w = sc.x+sc.w-x; h = sc.y+sc.h-y }
    else if (type === 'tr') { y = Math.max(0, Math.min(sc.y+sc.h-MIN, sc.y+dy)); h = sc.y+sc.h-y; w = Math.min(1-sc.x, Math.max(MIN, sc.w+dx)) }
    else if (type === 'bl') { x = Math.max(0, Math.min(sc.x+sc.w-MIN, sc.x+dx)); w = sc.x+sc.w-x; h = Math.min(1-sc.y, Math.max(MIN, sc.h+dy)) }
    else { w = Math.min(1-sc.x, Math.max(MIN, sc.w+dx)); h = Math.min(1-sc.y, Math.max(MIN, sc.h+dy)) }
    onChange({ x, y, w, h })
  }
  function onMouseUp() { drag.current = null }
  const handle = (cursor: string, pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14, background: 'white', border: '2px solid #7c3aed', borderRadius: 2, cursor, ...pos,
  })
  return (
    <div className="space-y-1 select-none">
      <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">{label}</p>
      <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-gray-200"
        onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <img src={url} alt="" className="w-full block pointer-events-none" draggable={false} />
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:`linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45))`,
          clipPath:`polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${crop.x*100}% ${crop.y*100}%, ${crop.x*100}% ${(crop.y+crop.h)*100}%, ${(crop.x+crop.w)*100}% ${(crop.y+crop.h)*100}%, ${(crop.x+crop.w)*100}% ${crop.y*100}%, ${crop.x*100}% ${crop.y*100}%)` }} />
        <div style={{ position:'absolute', left:`${crop.x*100}%`, top:`${crop.y*100}%`, width:`${crop.w*100}%`, height:`${crop.h*100}%`, border:'2px solid #7c3aed', cursor:'move', boxSizing:'border-box' }}
          onMouseDown={e => startDrag(e,'move')}>
          <div style={{ position:'absolute',inset:0,pointerEvents:'none',
            backgroundImage:`linear-gradient(rgba(255,255,255,0.25) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.25) 1px,transparent 1px)`,
            backgroundSize:`${100/3}% ${100/3}%` }} />
          <div style={handle('nw-resize',{top:-7,left:-7})} onMouseDown={e=>startDrag(e,'tl')} />
          <div style={handle('ne-resize',{top:-7,right:-7})} onMouseDown={e=>startDrag(e,'tr')} />
          <div style={handle('sw-resize',{bottom:-7,left:-7})} onMouseDown={e=>startDrag(e,'bl')} />
          <div style={handle('se-resize',{bottom:-7,right:-7})} onMouseDown={e=>startDrag(e,'br')} />
        </div>
      </div>
    </div>
  )
}

function CroppedPreview({ url, crop, label }: { url: string; crop: CropRect; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black" style={{ paddingTop:`${(crop.h/crop.w)*100}%` }}>
        <img src={url} alt="" style={{ position:'absolute', top:`${-crop.y/crop.h*100}%`, left:`${-crop.x/crop.w*100}%`, width:`${1/crop.w*100}%`, maxWidth:'none' }} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function EsteticaTab({ patientId }: { patientId: number }) {
  const [sessions, setSessions] = useState<AestheticSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTotal, setFormTotal] = useState('10')
  const [formSpw, setFormSpw] = useState('1')
  const [formStart, setFormStart] = useState(today())
  const [formRegion, setFormRegion] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMeasurements, setFormMeasurements] = useState<Measurement[]>([])

  function addFormMeasurement() {
    setFormMeasurements(prev => [...prev, { label: '', value: '', unit: 'cm' }])
  }
  function updateFormMeasurement(idx: number, field: keyof Measurement, val: string) {
    setFormMeasurements(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m))
  }
  function removeFormMeasurement(idx: number) {
    setFormMeasurements(prev => prev.filter((_, i) => i !== idx))
  }

  // Photos state
  const [photos, setPhotos] = useState<FileRecord[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compare state
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<FileRecord[]>([])
  const [cropPhase, setCropPhase] = useState(false)
  const [cropPics, setCropPics] = useState<FileRecord[]>([])
  const [cropRects, setCropRects] = useState<[CropRect,CropRect]>([{...FULL_CROP},{...FULL_CROP}])
  const [finalCrops, setFinalCrops] = useState<[CropRect,CropRect]>([{...FULL_CROP},{...FULL_CROP}])
  const [comparing, setComparing] = useState<FileRecord[]>([])

  // Modal de sessão
  const [sessionModal, setSessionModal] = useState<{ session: AestheticSession; num: number } | null>(null)
  const [sessionObs, setSessionObs] = useState('')
  const [sessionMeasurements, setSessionMeasurements] = useState<Measurement[]>([])
  const [sessionSaving, setSessionSaving] = useState(false)
  const [diagOpen, setDiagOpen] = useState<Set<number>>(new Set())

  // Histórico expandido
  const [historyOpen, setHistoryOpen] = useState<Set<number>>(new Set())

  const endDate = formStart && formTotal && formSpw
    ? calcEndDate(formStart, Number(formTotal), Number(formSpw))
    : ''

  useEffect(() => {
    fetch(`/api/patients/${patientId}/aesthetic-sessions`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSessions(data.map(s => ({
          ...s,
          initial_measurements: Array.isArray(s.initial_measurements) ? s.initial_measurements : [],
          completed_sessions: Array.isArray(s.completed_sessions) ? s.completed_sessions : [],
          completions: Array.isArray(s.completions) ? s.completions.map((c: SessionCompletion) => ({
            ...c,
            measurements: Array.isArray(c.measurements) ? c.measurements : [],
          })) : [],
        })))
      })
      .finally(() => setLoading(false))
    loadPhotos()
  }, [patientId])

  async function loadPhotos() {
    setPhotosLoading(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/files?type=estetica`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setPhotos(data)
      }
    } finally {
      setPhotosLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormSaving(true); setFormError(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/aesthetic-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedure_name: formName,
          total_sessions: Number(formTotal),
          sessions_per_week: Number(formSpw),
          start_date: formStart,
          end_date: endDate,
          region: formRegion || null,
          initial_measurements: formMeasurements.filter(m => m.label.trim()),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      const newSession: AestheticSession = await res.json()
      setSessions(prev => [newSession, ...prev])
      setShowForm(false)
      setFormName(''); setFormTotal('10'); setFormSpw('1'); setFormStart(today()); setFormRegion(''); setFormMeasurements([])
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este procedimento?')) return
    await fetch(`/api/patients/${patientId}/aesthetic-sessions/${id}`, { method: 'DELETE' })
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  function openSessionModal(session: AestheticSession, num: number) {
    const existing = session.completions.find(c => c.session_number === num)
    setSessionObs(existing?.observation ?? '')
    // Pré-preenche com medidas existentes ou copia estrutura das medidas iniciais
    if (existing?.measurements && existing.measurements.length > 0) {
      setSessionMeasurements(existing.measurements.map(m => ({ ...m })))
    } else {
      setSessionMeasurements((session.initial_measurements ?? []).map(m => ({ ...m, value: '' })))
    }
    setSessionModal({ session, num })
  }

  async function handleSessionConfirm() {
    if (!sessionModal) return
    const { session, num } = sessionModal
    const isDone = session.completed_sessions.includes(num)
    setSessionSaving(true)
    try {
      if (isDone) {
        // Desmarcar
        await fetch(`/api/patients/${patientId}/aesthetic-sessions/${session.id}/complete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_number: num }),
        })
        setSessions(prev => prev.map(s => s.id !== session.id ? s : {
          ...s,
          completed_sessions: s.completed_sessions.filter(n => n !== num),
          completions: s.completions.filter(c => c.session_number !== num),
        }))
      } else {
        // Marcar com observação
        const filledMeasurements = sessionMeasurements.filter(m => m.label && m.value !== '')
        const res = await fetch(`/api/patients/${patientId}/aesthetic-sessions/${session.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_number: num, observation: sessionObs || null, measurements: filledMeasurements }),
        })
        const newCompletion: SessionCompletion = await res.json()
        setSessions(prev => prev.map(s => s.id !== session.id ? s : {
          ...s,
          completed_sessions: [...s.completed_sessions, num].sort((a,b)=>a-b),
          completions: [...s.completions, { ...newCompletion, measurements: newCompletion.measurements ?? [] }],
        }))
      }
      setSessionModal(null)
    } finally {
      setSessionSaving(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('type', 'estetica')
        const res = await fetch(`/api/patients/${patientId}/files`, { method: 'POST', body: fd })
        if (res.ok) {
          const data = await res.json()
          if (data.id) setPhotos(prev => [data, ...prev])
        }
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeletePhoto(id: number) {
    if (!confirm('Excluir esta foto?')) return
    await fetch(`/api/patients/${patientId}/files/${id}`, { method: 'DELETE' })
    setPhotos(prev => prev.filter(f => f.id !== id))
    setSelected(prev => prev.filter(f => f.id !== id))
  }

  function toggleSelect(f: FileRecord) {
    setSelected(prev => {
      const exists = prev.find(p => p.id === f.id)
      if (exists) return prev.filter(p => p.id !== f.id)
      if (prev.length >= 2) return [prev[1], f]
      return [...prev, f]
    })
  }

  function startCrop() {
    if (selected.length < 2) return
    setCropPics(selected)
    setCropRects([{...FULL_CROP},{...FULL_CROP}])
    setFinalCrops([{...FULL_CROP},{...FULL_CROP}])
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
    setCropRects([{...FULL_CROP},{...FULL_CROP}])
    setFinalCrops([{...FULL_CROP},{...FULL_CROP}])
  }

  async function handleDownloadComparison() {
    const [a, b] = comparing
    const [cA, cB] = finalCrops

    const loadFromApi = async (id: number): Promise<HTMLImageElement> => {
      const res = await fetch(`/api/patients/${patientId}/files/${id}/download?proxy=1`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => { resolve(img); URL.revokeObjectURL(blobUrl) }
        img.onerror = reject; img.src = blobUrl
      })
    }
    const loadFromUrl = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url
      })

    try {
      const [imgA, imgB, logoImg] = await Promise.all([
        loadFromApi(a.id), loadFromApi(b.id), loadFromUrl('/logo-it.png'),
      ])
      const GAP = 16; const LABEL_H = 60; const PADDING = 24; const LOGO_H = 80; const LOGO_GAP = 12
      const effWA = imgA.naturalWidth * cA.w; const effHA = imgA.naturalHeight * cA.h
      const effWB = imgB.naturalWidth * cB.w; const effHB = imgB.naturalHeight * cB.h
      const maxH = Math.max(effHA, effHB)
      const wA = effWA * (maxH / effHA); const wB = effWB * (maxH / effHB)
      const totalW = wA + wB + GAP + PADDING * 2
      const logoW = logoImg.naturalWidth * (LOGO_H / logoImg.naturalHeight)
      const totalH = PADDING + LOGO_H + LOGO_GAP + LABEL_H + maxH + 50 + PADDING
      const canvas = document.createElement('canvas')
      canvas.width = totalW; canvas.height = totalH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, totalW, totalH)
      ctx.drawImage(logoImg, (totalW - logoW) / 2, PADDING, logoW, LOGO_H)
      const contentTop = PADDING + LOGO_H + LOGO_GAP
      ctx.fillStyle = '#374151'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('ANTES', PADDING + wA / 2, contentTop + 44)
      ctx.fillText('DEPOIS', PADDING + wA + GAP + wB / 2, contentTop + 44)
      ctx.drawImage(imgA, cA.x*imgA.naturalWidth, cA.y*imgA.naturalHeight, effWA, effHA, PADDING, contentTop+LABEL_H, wA, maxH)
      ctx.drawImage(imgB, cB.x*imgB.naturalWidth, cB.y*imgB.naturalHeight, effWB, effHB, PADDING+wA+GAP, contentTop+LABEL_H, wB, maxH)
      ctx.fillStyle = '#6b7280'; ctx.font = '28px sans-serif'
      ctx.fillText(fmtDate(a.created_at), PADDING+wA/2, contentTop+LABEL_H+maxH+40)
      ctx.fillText(fmtDate(b.created_at), PADDING+wA+GAP+wB/2, contentTop+LABEL_H+maxH+40)
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a'); link.href = url; link.download = 'comparacao-estetica.png'; link.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch {
      alert('Não foi possível gerar a imagem. Tente novamente.')
    }
  }

  // ── Crop phase ────────────────────────────────────────────────────────────────
  if (cropPhase && cropPics.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Enquadrar fotos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Arraste e redimensione para definir o recorte</p>
          </div>
          <div className="flex gap-2">
            <button onClick={confirmCrops} className="px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">✓ Confirmar</button>
            <button onClick={() => { setCropPhase(false); setCropPics([]) }} className="text-sm text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg">← Voltar</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {cropPics.map((f, i) => (
            <CropEditor key={f.id} url={f.url} label={i === 0 ? 'Antes' : 'Depois'} crop={cropRects[i]}
              onChange={r => setCropRects(prev => { const next: [CropRect,CropRect] = [...prev] as [CropRect,CropRect]; next[i]=r; return next })} />
          ))}
        </div>
      </div>
    )
  }

  // ── Comparison phase ──────────────────────────────────────────────────────────
  if (comparing.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Comparação — Antes e Depois</h3>
          <div className="flex gap-2">
            <button onClick={() => { setCropPhase(true); setCropPics(comparing); setCropRects(finalCrops); setComparing([]) }}
              className="text-sm text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg">✂️ Ajustar recorte</button>
            <button onClick={handleDownloadComparison} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">⬇️ Baixar montagem</button>
            <button onClick={exitAll} className="text-sm text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg">✕ Fechar</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <CroppedPreview url={comparing[0].url} crop={finalCrops[0]} label="Antes" />
          <CroppedPreview url={comparing[1].url} crop={finalCrops[1]} label="Depois" />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 text-center">
          <p>{fmtDate(comparing[0].created_at)}</p>
          <p>{fmtDate(comparing[1].created_at)}</p>
        </div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Procedimentos Estéticos</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors">
          CRIAR
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Novo procedimento</h3>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nome do procedimento *</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} required
              placeholder="Ex: Drenagem linfática, Radiofrequência..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Quantidade de sessões *</label>
              <input type="number" min="1" value={formTotal} onChange={e => setFormTotal(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Sessões por semana</label>
              <input type="number" min="1" max="7" value={formSpw} onChange={e => setFormSpw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data inicial *</label>
              <input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data final (automático)</label>
              <input readOnly value={endDate ? fmtDate(endDate) : '—'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Região a ser tratada</label>
            <input value={formRegion} onChange={e => setFormRegion(e.target.value)}
              placeholder="Ex: Abdômen, flancos, coxa..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>

          {/* Medidas iniciais */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Medidas iniciais (opcional)</label>
              <button type="button" onClick={addFormMeasurement}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium">+ Adicionar medida</button>
            </div>
            {formMeasurements.length === 0 && (
              <p className="text-xs text-gray-400 italic">Ex: Abdômen, Coxa D, Braço... clique em "+ Adicionar medida"</p>
            )}
            <div className="space-y-2">
              {formMeasurements.map((m, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={m.label}
                    onChange={e => updateFormMeasurement(idx, 'label', e.target.value)}
                    placeholder="Ex: Abdômen"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <input
                    type="number"
                    value={m.value}
                    onChange={e => updateFormMeasurement(idx, 'value', e.target.value)}
                    placeholder="0"
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <select value={m.unit} onChange={e => updateFormMeasurement(idx, 'unit', e.target.value)}
                    className="w-16 px-1 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="cm">cm</option>
                    <option value="kg">kg</option>
                    <option value="mm">mm</option>
                    <option value="%">%</option>
                  </select>
                  <button type="button" onClick={() => removeFormMeasurement(idx)}
                    className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0">×</button>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={formSaving || !formName}
              className="flex-1 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50">
              {formSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de procedimentos */}
      {loading ? (
        <p className="text-sm text-gray-400 animate-pulse text-center py-6">Carregando...</p>
      ) : sessions.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 text-center py-6">Nenhum procedimento cadastrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const done = s.completed_sessions.length
            const pct = Math.round((done / s.total_sessions) * 100)
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">{s.procedure_name}</h3>
                    {s.region && <p className="text-xs text-gray-400 mt-0.5">📍 {s.region}</p>}
                  </div>
                  <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-600 text-sm shrink-0">🗑</button>
                </div>

                {/* Datas */}
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Início: <strong className="text-gray-700">{fmtDate(s.start_date)}</strong></span>
                  <span>Término: <strong className="text-gray-700">{fmtDate(s.end_date)}</strong></span>
                  <span>{s.sessions_per_week}×/semana</span>
                </div>

                {/* Progresso */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Progresso</span>
                    <span className="text-xs font-semibold text-violet-700">{done}/{s.total_sessions} sessões ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                    <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width:`${pct}%` }} />
                  </div>
                  {/* Bolinhas de sessões */}
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: s.total_sessions }, (_, i) => i + 1).map(num => {
                      const isDone = s.completed_sessions.includes(num)
                      const comp = s.completions.find(c => c.session_number === num)
                      return (
                        <button key={num} onClick={() => openSessionModal(s, num)}
                          title={isDone && comp?.observation ? comp.observation : `Sessão ${num}`}
                          className={`w-7 h-7 rounded-full border-2 text-xs font-bold transition-all relative ${isDone ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300 text-gray-400 hover:border-violet-400 hover:text-violet-500'}`}>
                          {num}
                          {isDone && comp?.observation && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border border-white" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Diagnóstico comparativo de medidas */}
                {(s.initial_measurements ?? []).length > 0 && (() => {
                  const lastComp = s.completions.slice().sort((a,b) => b.session_number - a.session_number)
                    .find(c => c.measurements && c.measurements.length > 0)
                  const isDiagOpen = diagOpen.has(s.id)
                  return (
                    <div className="border-t border-gray-100 pt-2">
                      <button onClick={() => setDiagOpen(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                        className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                        📊 {isDiagOpen ? '▲ Ocultar diagnóstico' : '▼ Ver diagnóstico de evolução'}
                      </button>
                      {isDiagOpen && (
                        <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <p className="text-xs font-semibold text-emerald-800 mb-2">
                            Evolução das medidas {lastComp ? `(sessão ${lastComp.session_number} de ${s.total_sessions})` : '— sem medidas registradas ainda'}
                          </p>
                          <div className="space-y-1.5">
                            {(s.initial_measurements ?? []).map((im, i) => {
                              const lastVal = lastComp?.measurements?.find(m => m.label === im.label)?.value
                              const ini = parseFloat(im.value)
                              const last = lastVal !== undefined ? parseFloat(lastVal) : null
                              const diff = last !== null && !isNaN(ini) && !isNaN(last) ? last - ini : null
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="text-gray-600 font-medium w-28 shrink-0 truncate">{im.label}</span>
                                  <span className="text-gray-500">{im.value} {im.unit}</span>
                                  <span className="text-gray-400">→</span>
                                  <span className={`font-semibold ${last !== null ? 'text-gray-800' : 'text-gray-300 italic'}`}>
                                    {last !== null ? `${lastVal} ${im.unit}` : 'não registrada'}
                                  </span>
                                  {diff !== null && (
                                    <span className={`ml-auto font-bold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                      {diff < 0 ? `▼ ${Math.abs(diff).toFixed(1)}` : diff > 0 ? `▲ ${diff.toFixed(1)}` : '='} {im.unit}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Histórico de sessões concluídas */}
                {s.completions.length > 0 && (
                  <div className="border-t border-gray-100 pt-2">
                    <button
                      onClick={() => setHistoryOpen(prev => {
                        const next = new Set(prev)
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                        return next
                      })}
                      className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                      {historyOpen.has(s.id) ? '▲ Ocultar histórico' : `▼ Ver histórico (${s.completions.length} sessão${s.completions.length > 1 ? 'ões' : ''})`}
                    </button>
                    {historyOpen.has(s.id) && (
                      <div className="mt-2 space-y-1.5">
                        {s.completions.slice().sort((a,b) => a.session_number - b.session_number).map(c => (
                          <div key={c.session_number} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                            <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{c.session_number}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-400">{fmtDate(c.completed_at)}</p>
                              {c.observation && <p className="text-gray-700 mt-0.5">{c.observation}</p>}
                              {c.measurements && c.measurements.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                  {c.measurements.map((m, mi) => (
                                    <span key={mi} className="text-violet-600">{m.label}: {m.value} {m.unit}</span>
                                  ))}
                                </div>
                              )}
                              {!c.observation && (!c.measurements || c.measurements.length === 0) && (
                                <p className="text-gray-300 italic">Sem observações</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de sessão */}
      {sessionModal && (() => {
        const { session, num } = sessionModal
        const isDone = session.completed_sessions.includes(num)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  {isDone ? 'Desmarcar sessão' : 'Registrar sessão'} #{num}
                </h3>
                <button onClick={() => setSessionModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <p className="text-xs text-gray-500">{session.procedure_name}</p>
              {!isDone && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Observações (opcional)</label>
                    <textarea
                      value={sessionObs}
                      onChange={e => setSessionObs(e.target.value)}
                      rows={2}
                      placeholder="Ex: paciente relatou melhora, área tratada, equipamento usado..."
                      autoFocus
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                    />
                  </div>
                  {sessionMeasurements.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-2">Medidas desta sessão</label>
                      <div className="space-y-2">
                        {sessionMeasurements.map((m, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{m.label}</span>
                            <input
                              type="number"
                              value={m.value}
                              onChange={e => setSessionMeasurements(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                              placeholder="0"
                              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                            <span className="text-xs text-gray-400 shrink-0">{m.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isDone && (
                <p className="text-sm text-gray-500">Deseja desmarcar esta sessão como concluída?</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setSessionModal(null)}
                  className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={handleSessionConfirm} disabled={sessionSaving}
                  className={`flex-1 py-2 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors ${isDone ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-600 hover:bg-violet-700'}`}>
                  {sessionSaving ? '...' : isDone ? 'Desmarcar' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Seção de fotos ────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">📸 Fotos — Estética</h2>
          <div className="flex gap-2">
            {photos.length >= 2 && (
              <button onClick={() => { setCompareMode(v => !v); setSelected([]) }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${compareMode ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-600 hover:border-violet-400'}`}>
                🔍 {compareMode ? 'Cancelar' : 'Comparar fotos'}
              </button>
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {uploading ? 'Enviando...' : '+ Adicionar foto'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
          </div>
        </div>

        {compareMode && (
          <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700">
            Selecione 2 fotos para comparar (1ª = ANTES, 2ª = DEPOIS)
            {selected.length === 2 && (
              <button onClick={startCrop} className="ml-3 px-3 py-1 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700">✓ Comparar</button>
            )}
          </div>
        )}

        {photosLoading ? (
          <p className="text-xs text-gray-400 animate-pulse text-center py-4">Carregando fotos...</p>
        ) : photos.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma foto adicionada ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((f, idx) => {
              const selIdx = selected.findIndex(p => p.id === f.id)
              const isSel = selIdx !== -1
              return (
                <div key={f.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
                  <img src={f.url} alt="" className="w-full h-full object-cover" />
                  {compareMode ? (
                    <button onClick={() => toggleSelect(f)}
                      className={`absolute inset-0 flex items-center justify-center text-xl font-bold transition-all ${isSel ? 'bg-violet-600/70 text-white' : 'bg-black/20 text-transparent hover:bg-violet-400/50 hover:text-white'}`}>
                      {isSel ? selIdx + 1 : ''}
                    </button>
                  ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-1.5 opacity-0 group-hover:opacity-100">
                      <span className="text-white text-xs">{fmtDate(f.created_at)}</span>
                      <button onClick={() => handleDeletePhoto(f.id)} className="text-white text-sm hover:text-red-300">🗑</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
