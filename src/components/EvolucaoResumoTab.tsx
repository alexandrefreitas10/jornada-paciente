'use client'

import { useState, useRef, useEffect } from 'react'
import { DeletedItemsButton } from './DeletedItemsButton'

interface SummaryTopics {
  objetivos_principais: string
  tratamentos_anteriores: string
  queixas_principais: string
  qualidade_sono: string
  intestino: string
  libido: string
  padrao_alimentar: string
  atividade_fisica: string
  doencas_previas_cirurgias: string
  medicacao_suplementos: string
}

interface EvolutionSummary {
  id: number
  patient_id: number
  audio_s3_key: string | null
  audio_name: string | null
  transcription: string
  summary: SummaryTopics
  created_at: string
}

const TOPICS: { key: keyof SummaryTopics; label: string; icon: string }[] = [
  { key: 'objetivos_principais', label: 'Objetivos principais', icon: '🎯' },
  { key: 'tratamentos_anteriores', label: 'Tratamentos anteriores', icon: '📋' },
  { key: 'queixas_principais', label: 'Queixas principais', icon: '🩺' },
  { key: 'qualidade_sono', label: 'Qualidade do sono', icon: '😴' },
  { key: 'intestino', label: 'Intestino', icon: '🫀' },
  { key: 'libido', label: 'Libido', icon: '💜' },
  { key: 'padrao_alimentar', label: 'Padrão alimentar', icon: '🥗' },
  { key: 'atividade_fisica', label: 'Atividade física', icon: '🏃' },
  { key: 'doencas_previas_cirurgias', label: 'Doenças prévias e cirurgias', icon: '🏥' },
  { key: 'medicacao_suplementos', label: 'Medicação e suplementos', icon: '💊' },
]

// ── Gate de senha ────────────────────────────────────────────────────────────

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) { onUnlock() } else {
      const data = await res.json()
      setError(data.error || 'Senha incorreta')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl">🔐</div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">Área restrita</p>
        <p className="text-xs text-gray-500 mt-0.5">Digite a senha do administrador</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input ref={inputRef} type="password" value={password}
          onChange={e => setPassword(e.target.value)} placeholder="Senha do administrador"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={loading || !password}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// ── Formulário de nova consulta ───────────────────────────────────────────────

function NovaConsultaForm({ patientId, onCreated }: { patientId: number; onCreated: (s: EvolutionSummary) => void }) {
  const [transcription, setTranscription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!transcription.trim()) { setError('Cole a transcrição para continuar'); return }
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('transcription', transcription.trim())
      const res = await fetch(`/api/patients/${patientId}/evolution-summaries`, { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao processar') }
      const created: EvolutionSummary = await res.json()
      onCreated(created)
      setTranscription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border border-violet-200 rounded-xl p-4 bg-violet-50">
      <p className="text-sm font-semibold text-violet-800">Nova consulta</p>

      <div>
        <label className="text-xs text-gray-600 mb-1.5 block">Transcrição da consulta</label>
        <textarea
          value={transcription}
          onChange={e => setTranscription(e.target.value)}
          rows={8}
          placeholder="Cole aqui a transcrição gerada pelo Plaud..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">{transcription.length} caracteres</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button type="submit" disabled={loading || !transcription.trim()}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {loading ? (
          <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg> Processando com IA...</>
        ) : '✨ Gerar resumo com IA'}
      </button>
    </form>
  )
}

// ── Card de um resumo ─────────────────────────────────────────────────────────

function SummaryCard({
  summary, patientId, activeFilter, onDelete,
}: {
  summary: EvolutionSummary
  patientId: number
  activeFilter: keyof SummaryTopics | null
  onDelete: (id: number) => void
}) {
  const [showTranscription, setShowTranscription] = useState(false)
  const visibleTopics = activeFilter ? TOPICS.filter(t => t.key === activeFilter) : TOPICS
  const hasContent = (v: string) => v && v !== 'Não mencionado' && v.trim().length > 0

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-800">
          {new Date(summary.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTranscription(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            {showTranscription ? 'Ocultar transcrição' : 'Ver transcrição'}
          </button>
          <button onClick={() => onDelete(summary.id)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors" title="Excluir">
            🗑️
          </button>
        </div>
      </div>

      {showTranscription && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-semibold text-amber-700 mb-1">Transcrição original</p>
          <p className="text-xs text-amber-900 whitespace-pre-wrap leading-relaxed">{summary.transcription}</p>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {visibleTopics.map(topic => {
          const value = summary.summary[topic.key]
          if (!hasContent(value) && activeFilter) return null
          return (
            <div key={topic.key} className={`px-4 py-3 ${!hasContent(value) ? 'opacity-40' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 mb-1">{topic.icon} {topic.label}</p>
              <p className="text-sm text-gray-800 leading-relaxed">
                {hasContent(value) ? value : 'Não mencionado'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  patientId: number
  initialSummaries: EvolutionSummary[]
}

export function EvolucaoResumoTab({ patientId, initialSummaries }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [summaries, setSummaries] = useState<EvolutionSummary[]>(initialSummaries)
  const [activeFilter, setActiveFilter] = useState<keyof SummaryTopics | null>(null)
  const [showForm, setShowForm] = useState(false)

  if (!unlocked) return <AdminGate onUnlock={() => setUnlocked(true)} />

  function handleCreated(s: EvolutionSummary) {
    setSummaries(prev => [s, ...prev])
    setShowForm(false)
  }

  async function handleDelete(id: number) {
    await fetch(`/api/patients/${patientId}/evolution-summaries/${id}`, { method: 'DELETE' })
    setSummaries(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="space-y-5">
      <DeletedItemsButton patientId={patientId} entityTypes={['evolution_summary']} />
      {!showForm && (
        <button onClick={() => setShowForm(true)}
          className="w-full py-2.5 border-2 border-dashed border-violet-300 text-violet-600 text-sm font-medium rounded-xl hover:bg-violet-50 transition-colors">
          + Nova consulta
        </button>
      )}

      {showForm && (
        <div>
          <NovaConsultaForm patientId={patientId} onCreated={handleCreated} />
          <button onClick={() => setShowForm(false)} className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center">
            Cancelar
          </button>
        </div>
      )}

      {summaries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtrar por tópico</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setActiveFilter(null)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeFilter === null ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              Todos
            </button>
            {TOPICS.map(t => (
              <button key={t.key} onClick={() => setActiveFilter(activeFilter === t.key ? null : t.key)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  activeFilter === t.key ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {summaries.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhuma consulta registrada ainda. Clique em &quot;+ Nova consulta&quot; para começar.
        </p>
      )}

      <div className="space-y-4">
        {summaries.map(s => (
          <SummaryCard
            key={s.id}
            summary={s}
            patientId={patientId}
            activeFilter={activeFilter}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
