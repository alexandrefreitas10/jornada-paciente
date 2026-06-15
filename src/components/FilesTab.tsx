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
  fileType: 'photo' | 'bioimpedance'
  initialFiles: FileRecord[]
}

export function FilesTab({ patientId, fileType, initialFiles }: Props) {
  const [files, setFiles] = useState<FileRecord[]>(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isPhoto = fileType === 'photo'
  const accept = isPhoto ? 'image/*' : 'image/*,application/pdf'
  const label = isPhoto ? '📷 Enviar foto' : '📎 Enviar arquivo'

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
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Lista de arquivos */}
      {files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum arquivo ainda. {isPhoto ? 'Envie uma foto.' : 'Envie um arquivo.'}
        </p>
      ) : isPhoto ? (
        /* Grade de fotos */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((f) => (
            <div key={f.id} className="relative group rounded-xl overflow-hidden border border-gray-200">
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={f.url}
                  alt={f.original_name}
                  className="w-full h-40 object-cover hover:opacity-90 transition-opacity"
                />
              </a>
              <div className="p-2 bg-white flex items-center justify-between gap-1">
                <p className="text-xs text-gray-500 truncate">{formatDate(f.created_at)}</p>
                <button
                  onClick={() => handleDownload(f.id)}
                  className="text-xs text-violet-600 hover:text-violet-800 shrink-0"
                  title="Baixar"
                >
                  ⬇️
                </button>
              </div>
              <button
                onClick={() => handleDelete(f.id)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Apagar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* Lista de arquivos (fotos e PDFs) */
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
