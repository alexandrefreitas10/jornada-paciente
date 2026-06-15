'use client'

import { useState, useRef } from 'react'

interface FileRecord {
  id: number
  original_name: string
  url: string
  created_at: string
  file_type: string
}

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

  // Comparação
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [comparing, setComparing] = useState<FileRecord[]>([])

  const isPhoto = fileType === 'photo'
  const accept = isPhoto ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.xls,.xlsx'
  const label = isPhoto ? '📷 Enviar foto' : fileType === 'diet' ? '🥗 Enviar dieta' : '📎 Enviar arquivo'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', fileType)
      const res = await fetch(`/api/patients/${patientId}/files`, {
        method: 'POST',
        body: formData,
      })
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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  }

  function toggleSelect(id: number) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev
    )
  }

  function startCompare() {
    const pics = selected.map(id => files.find(f => f.id === id)!).filter(Boolean)
    setComparing(pics)
  }

  function exitCompare() {
    setComparing([])
    setSelected([])
    setCompareMode(false)
  }

  async function handleDownloadComparison() {
    const [a, b] = comparing

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
      const LABEL_H = 40
      const PADDING = 20
      const LOGO_H = 200
      const LOGO_GAP = 16
      const maxH = Math.max(imgA.naturalHeight, imgB.naturalHeight)
      const scaleA = maxH / imgA.naturalHeight
      const scaleB = maxH / imgB.naturalHeight
      const wA = imgA.naturalWidth * scaleA
      const wB = imgB.naturalWidth * scaleB
      const totalW = wA + wB + GAP + PADDING * 2
      const logoW = logoImg.naturalWidth * (LOGO_H / logoImg.naturalHeight)
      const totalH = LOGO_H + LOGO_GAP + LABEL_H + maxH + PADDING * 2 + 24

      const canvas = document.createElement('canvas')
      canvas.width = totalW
      canvas.height = totalH
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, totalW, totalH)

      // Logo da médica centralizada no topo
      ctx.drawImage(logoImg, (totalW - logoW) / 2, PADDING, logoW, LOGO_H)

      const contentTop = PADDING + LOGO_H + LOGO_GAP

      // Labels
      ctx.fillStyle = '#6b7280'
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('ANTES', PADDING + wA / 2, contentTop + 28)
      ctx.fillText('DEPOIS', PADDING + wA + GAP + wB / 2, contentTop + 28)

      // Fotos
      ctx.drawImage(imgA, PADDING, contentTop + LABEL_H, wA, maxH)
      ctx.drawImage(imgB, PADDING + wA + GAP, contentTop + LABEL_H, wB, maxH)

      // Datas
      ctx.fillStyle = '#9ca3af'
      ctx.font = '18px sans-serif'
      ctx.fillText(formatDate(a.created_at), PADDING + wA / 2, contentTop + LABEL_H + maxH + 22)
      ctx.fillText(formatDate(b.created_at), PADDING + wA + GAP + wB / 2, contentTop + LABEL_H + maxH + 22)

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

  // Modal de comparação
  if (comparing.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Comparação — Antes e Depois</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadComparison}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              ⬇️ Baixar montagem
            </button>
            <button
              onClick={exitCompare}
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
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <img
                  src={f.url}
                  alt={f.original_name}
                  className="w-full object-cover"
                />
              </div>
              <p className="text-xs text-center text-gray-400">{formatDate(f.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Barra de ações */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
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
                  onClick={startCompare}
                  disabled={selected.length !== 2}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Ver comparação
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

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Grade de fotos / lista de arquivos */}
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
                    ? isSelected
                      ? 'border-violet-500 cursor-pointer'
                      : 'border-gray-200 cursor-pointer hover:border-violet-300'
                    : 'border-gray-200'
                }`}
                onClick={compareMode ? () => toggleSelect(f.id) : undefined}
              >
                {/* Badge de seleção no modo comparar */}
                {compareMode && (
                  <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-400 border border-gray-300'
                  }`}>
                    {isSelected ? selIndex + 1 : ''}
                  </div>
                )}

                {!compareMode ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={f.url}
                      alt={f.original_name}
                      className="w-full h-40 object-cover hover:opacity-90 transition-opacity"
                    />
                  </a>
                ) : (
                  <img
                    src={f.url}
                    alt={f.original_name}
                    className={`w-full h-40 object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-70'}`}
                  />
                )}

                <div className="p-2 bg-white flex items-center justify-between gap-1">
                  <p className="text-xs text-gray-500 truncate">{formatDate(f.created_at)}</p>
                  {!compareMode && (
                    <button
                      onClick={() => handleDownload(f.id)}
                      className="text-xs text-violet-600 hover:text-violet-800 shrink-0"
                      title="Baixar"
                    >
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
                  <p className="text-xs text-gray-500">{formatDate(f.created_at)}</p>
                </div>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-600 hover:underline font-medium shrink-0"
                >
                  Abrir
                </a>
                <button
                  onClick={() => handleDownload(f.id)}
                  className="text-xs text-violet-600 hover:text-violet-800 shrink-0"
                  title="Baixar"
                >
                  ⬇️
                </button>
                <button
                  onClick={() => handleDelete(f.id)}
                  className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                  title="Apagar"
                >
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
