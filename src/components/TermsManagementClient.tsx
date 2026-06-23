'use client'

import { useState, useRef } from 'react'
import { Term } from '@/lib/terms'
import { useRouter } from 'next/navigation'

interface Props {
  initialTerms: Term[]
}

type Mode = 'file' | 'text'

export function TermsManagementClient({ initialTerms }: Props) {
  const [terms, setTerms] = useState(initialTerms)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<Mode>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const [fieldInput, setFieldInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function resetForm() {
    setTitle('')
    setContent('')
    setFile(null)
    setFields([])
    setFieldInput('')
    setMode('text')
    setCreating(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function addField() {
    const v = fieldInput.trim()
    if (!v || fields.includes(v)) {
      setFieldInput('')
      return
    }
    setFields(prev => [...prev, v])
    setFieldInput('')
  }

  async function handleCreate() {
    setError(null)
    if (!title.trim()) {
      setError('Título é obrigatório')
      return
    }
    if (mode === 'text' && !content.trim()) {
      setError('Conteúdo é obrigatório')
      return
    }
    if (mode === 'file' && !file) {
      setError('Arquivo é obrigatório')
      return
    }

    setSaving(true)
    const fd = new FormData()
    fd.append('title', title)
    if (mode === 'text') {
      fd.append('content', content)
    } else {
      fd.append('file', file!)
    }
    if (fields.length > 0) fd.append('fields', JSON.stringify(fields))

    try {
      const res = await fetch('/api/terms', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao criar termo')
        return
      }
      const newTerm: Term = data
      setTerms(prev => [newTerm, ...prev])
      alert(`✓ Termo "${title}" salvo com sucesso!`)
      resetForm()
    } catch (err) {
      setError('Erro ao salvar termo: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Deletar este termo?')) return
    setDeleting(id)
    try {
      await fetch(`/api/terms/${id}`, { method: 'DELETE' })
      setTerms(prev => prev.filter(t => t.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          + Novo termo
        </button>
      )}

      {creating && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Novo template de termo</h3>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {(['text', 'file'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'text' ? 'Texto' : 'PDF/Word'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Nome do termo (ex: Termo de Consentimento)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />

          {mode === 'text' && (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Digite o conteúdo do termo..."
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
            />
          )}

          {mode === 'file' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Arquivo (PDF ou Word)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
              />
              {file && <p className="text-xs text-gray-400 mt-1">{file.name}</p>}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs text-gray-500">
              Campos que o paciente vai preencher <span className="text-gray-400">(recomendado)</span>
            </label>
            <div className="flex gap-1 flex-wrap mb-1">
              {['Nome completo', 'RG', 'CPF', 'Data'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (!fields.includes(s)) setFields(prev => [...prev, s])
                  }}
                  disabled={fields.includes(s)}
                  className="text-xs px-2 py-1 rounded-full border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-30 transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={fieldInput}
                onChange={e => setFieldInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addField()
                  }
                }}
                placeholder="Outro campo... (Enter para adicionar)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <button type="button" onClick={addField} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-sm rounded-lg transition-colors">
                +
              </button>
            </div>
            {fields.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <span key={f} className="flex items-center gap-1 text-xs bg-violet-50 border border-violet-200 text-violet-700 px-2 py-1 rounded-full">
                    {f}
                    <button onClick={() => setFields(prev => prev.filter(x => x !== f))} className="text-violet-400 hover:text-violet-700">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim() || (mode === 'text' ? !content.trim() : !file)}
              className="flex-1 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar termo'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {terms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">Nenhum termo criado ainda</p>
          <p className="text-sm">Crie um para começar a usar com seus pacientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {terms.map(term => (
            <div key={term.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{term.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {term.content && !term.file_s3_key ? '📄 Texto' : '📎 Arquivo'} · Criado por {term.created_by}
                </p>
                {term.fields && term.fields.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {term.fields.map(f => (
                      <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(term.id)}
                disabled={deleting === term.id}
                className="text-xs text-gray-400 hover:text-red-500 px-3 py-1 rounded transition-colors"
              >
                {deleting === term.id ? '...' : '🗑'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
