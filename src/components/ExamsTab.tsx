'use client'

import { useState, useRef } from 'react'
import { NotesSection } from './NotesSection'
import { DeletedItemsButton } from './DeletedItemsButton'

interface ExamFile {
  id: number
  original_name: string
  url: string
  summary: string | null
  created_at: string
  created_by?: string | null
}

interface Props {
  patientId: number
  initialFiles: ExamFile[]
  readOnly?: boolean
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim()
}

function formatSummaryCompact(summary: string): string {
  const lines = summary.split('\n')
  const items: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    // skip separator rows
    if (/^\|[-\s|]+\|$/.test(trimmed)) continue
    // only table rows
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue
    const cols = trimmed.split('|').map(c => stripMd(c)).filter(Boolean)
    if (cols.length >= 2 && cols[0].toLowerCase() !== 'exame') {
      items.push(`${cols[0]} | ${cols[1]}`)
    }
  }
  // Resumos antigos vinham em tabela markdown; os novos vêm em lista/texto.
  // Se não houver tabela, exibe o texto completo (limpando marcações leves).
  if (items.length === 0) {
    return summary
      .split('\n')
      .map(l => stripMd(l.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return items.join('\n')
}

export function ExamsTab({ patientId, initialFiles, readOnly = false }: Props) {
  const [files, setFiles] = useState<ExamFile[]>(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<number | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'files' | 'summary'>('files')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'exam')
      const res = await fetch(`/api/patients/${patientId}/files`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erro ao enviar arquivo')
      }
      const created: ExamFile = await res.json()
      setFiles((prev) => [created, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este arquivo?')) return
    await fetch(`/api/patients/${patientId}/files/${id}`, { method: 'DELETE' })
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  async function handleRegenerate(id: number) {
    setRegenerating(id)
    setError(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/files/${id}`, { method: 'PATCH' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ? `Erro ao regenerar: ${data.error}` : `Erro ao regenerar (HTTP ${res.status})`)

      // Geração roda em segundo plano no servidor — consulta o status até terminar (máx. ~8 min)
      for (let i = 0; i < 96; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const sr = await fetch(`/api/patients/${patientId}/files/${id}`)
        if (!sr.ok) continue
        const status = await sr.json()
        if (status.status === 'error') throw new Error(`Erro ao gerar resumo: ${status.error}`)
        if (status.status === 'done') {
          if (status.summary) {
            setFiles(prev => prev.map(f => f.id === id ? { ...f, summary: status.summary } : f))
          } else {
            throw new Error('O resumo terminou vazio. Tente novamente.')
          }
          return
        }
      }
      throw new Error('A geração demorou demais. Recarregue a página em alguns minutos.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao regenerar resumo')
    } finally {
      setRegenerating(null)
    }
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

  const filesWithSummary = files.filter((f) => f.summary)

  return (
    <div className="space-y-4">
      {/* Sub-abas */}
      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setActiveSubTab('files')}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
            activeSubTab === 'files'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Arquivos
        </button>
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
            activeSubTab === 'summary'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Resumo dos Exames
          {filesWithSummary.length > 0 && (
            <span className="ml-1.5 bg-violet-100 text-violet-700 text-xs px-1.5 py-0.5 rounded-full">
              {filesWithSummary.length}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'files' ? (
        <div className="space-y-4">
          {/* Upload */}
          <div className="flex items-center gap-3 flex-wrap">
            {!readOnly && <DeletedItemsButton patientId={patientId} entityTypes={['file']} fileType="exam" />}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            {!readOnly && (
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
                    Enviando e analisando...
                  </>
                ) : '🔬 Enviar exame'}
              </button>
            )}
            {files.length > 0 && (
              <button
                onClick={() => { window.location.href = `/api/patients/${patientId}/files/download-all?type=exam` }}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                ⬇️ Baixar todos
              </button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Lista de arquivos */}
          {files.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum exame ainda. Envie um arquivo para começar.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.original_name)
                return (
                  <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-2xl">{isImage ? '🖼️' : '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.original_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-gray-500">{formatDate(f.created_at)}</p>
                        {f.created_by && (
                          <p className="text-xs text-gray-400">por <span className="font-medium text-gray-600">{f.created_by}</span></p>
                        )}
                        {f.summary && (
                          readOnly ? (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                              ✓ Resumo gerado
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRegenerate(f.id)}
                              disabled={regenerating === f.id}
                              className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full hover:bg-green-200 disabled:opacity-50 transition-colors"
                              title="Regenerar resumo"
                            >
                              {regenerating === f.id ? '⏳ Gerando...' : '✓ Resumo gerado · 🔄'}
                            </button>
                          )
                        )}
                        {!f.summary && !readOnly && (
                          <button
                            onClick={() => handleRegenerate(f.id)}
                            disabled={regenerating === f.id}
                            className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors"
                          >
                            {regenerating === f.id ? '⏳ Gerando...' : '🔄 Gerar resumo'}
                          </button>
                        )}
                      </div>
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
                    {!readOnly && (
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                        title="Apagar"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Sub-aba: Resumo dos Exames */
        <div className="space-y-4">
          {filesWithSummary.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum resumo disponível. Envie um exame para gerar o resumo automaticamente.
            </p>
          ) : (
            filesWithSummary.map((f) => (
              <div key={f.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{f.original_name}</p>
                    <p className="text-xs text-gray-500">{formatDate(f.created_at)}</p>
                  </div>
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full font-medium">
                    🤖 Resumo IA
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {f.summary ? formatSummaryCompact(f.summary) : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <NotesSection patientId={patientId} tab="exam" readOnly={readOnly} />
    </div>
  )
}
