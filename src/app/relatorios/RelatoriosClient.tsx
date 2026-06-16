'use client'

import { useState, useRef, useEffect } from 'react'
import { RelatorioUltimaSemana } from '@/components/RelatorioUltimaSemana'

type Tab = 'cards' | 'itens' | 'semana' | 'inativos'

interface PatientOption { id: number; name: string }

// ── Utilitários ──────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const FILE_TYPE_LABEL: Record<string, string> = {
  photo: 'Foto',
  bioimpedance: 'Bioimpedância',
  exam: 'Exame',
  diet: 'Dieta',
  evolution: 'Evolução',
}

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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl">🔐</div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-gray-900">Área restrita</h2>
        <p className="text-sm text-gray-500 mt-1">Digite a senha do administrador para continuar</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Senha do administrador"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// ── Aba: Cards criados ───────────────────────────────────────────────────────

function CardsCreated() {
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ total: number; patients: { id: number; name: string; created_at: string; created_by: string | null }[] } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/relatorio/cards-criados?from=${from}&to=${to}`)
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Filtrar por período</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Resultado</span>
            <span className="text-sm font-bold text-violet-700">{result.total} card{result.total !== 1 ? 's' : ''}</span>
          </div>
          {result.patients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum card criado neste período</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {result.patients.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    {p.created_by && <p className="text-xs text-gray-400">Criado por {p.created_by}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aba: Itens enviados ──────────────────────────────────────────────────────

function ItensSent({ patients }: { patients: PatientOption[] }) {
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [patientId, setPatientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    files: { id: number; patient_id: number; patient_name: string; file_type: string; original_name: string; created_at: string; created_by: string | null }[]
  } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const params = new URLSearchParams({ from, to })
    if (patientId) params.set('patient_id', patientId)
    const res = await fetch(`/api/relatorio/itens-enviados?${params}`)
    setResult(await res.json())
    setLoading(false)
  }

  // Agrupa por tipo para o resumo
  const typeCounts = result?.files.reduce<Record<string, number>>((acc, f) => {
    acc[f.file_type] = (acc[f.file_type] ?? 0) + 1
    return acc
  }, {}) ?? {}

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Filtrar por período e paciente</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Paciente (opcional)</label>
          <select value={patientId} onChange={e => setPatientId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">Todos os pacientes</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {result && (
        <div className="space-y-3">
          {/* Resumo por tipo */}
          {Object.keys(typeCounts).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumo — {result.total} item{result.total !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeCounts).map(([type, count]) => (
                  <span key={type} className="text-xs px-3 py-1 bg-violet-50 text-violet-700 rounded-full font-medium">
                    {FILE_TYPE_LABEL[type] ?? type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lista detalhada */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {result.files.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum item enviado neste período</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {result.files.map(f => (
                  <div key={f.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.patient_name}</p>
                        <p className="text-xs text-gray-500 truncate">{f.original_name}</p>
                        {f.created_by && <p className="text-xs text-gray-400">Enviado por {f.created_by}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {FILE_TYPE_LABEL[f.file_type] ?? f.file_type}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(f.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba: Sem atualização na evolução ────────────────────────────────────────

const PRESET_OPTIONS = [
  { label: '7 dias', days: 7 },
  { label: '14 dias', days: 14 },
  { label: '30 dias', days: 30 },
  { label: '60 dias', days: 60 },
]

const CONTENT_TYPES = [
  { key: 'evolution', label: 'Evolução' },
  { key: 'tasks', label: 'Tarefas' },
  { key: 'photo', label: 'Fotos' },
  { key: 'bioimpedance', label: 'Bioimpedância' },
  { key: 'exam', label: 'Exames' },
  { key: 'diet', label: 'Dietas' },
] as const

type ContentType = typeof CONTENT_TYPES[number]['key']

function SemAtualizacao() {
  const [contentType, setContentType] = useState<ContentType>('evolution')
  const [preset, setPreset] = useState<number>(7)
  const [customDate, setCustomDate] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    patients: { id: number; name: string; duration: string; last_update: string | null }[]
  } | null>(null)

  function getSinceDate() {
    if (useCustom && customDate) return customDate
    const d = new Date()
    d.setDate(d.getDate() - preset)
    return d.toISOString().slice(0, 10)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const since = getSinceDate()
    const res = await fetch(`/api/relatorio/sem-atualizacao?since=${since}&type=${contentType}`)
    setResult(await res.json())
    setLoading(false)
  }

  const typeLabel = CONTENT_TYPES.find(t => t.key === contentType)?.label ?? ''

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Pacientes sem atualização</h2>

        {/* Tipo de conteúdo */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">O que verificar</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setContentType(t.key); setResult(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  contentType === t.key
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prazo */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Prazo sem atualização</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_OPTIONS.map(o => (
              <button
                key={o.days}
                type="button"
                onClick={() => { setPreset(o.days); setUseCustom(false) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  !useCustom && preset === o.days
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                useCustom
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Data específica
            </button>
          </div>
          {useCustom && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              required={useCustom}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          )}
        </div>

        <button type="submit" disabled={loading || (useCustom && !customDate)}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Sem atualização em {typeLabel}</span>
            <span className="text-sm font-bold text-orange-600">{result.total} paciente{result.total !== 1 ? 's' : ''}</span>
          </div>
          {result.patients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Todos os pacientes estão atualizados ✓</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {result.patients.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <a href={`/pacientes/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-violet-700 transition-colors">
                      {p.name}
                    </a>
                    {p.duration && <p className="text-xs text-gray-400">Duração: {p.duration}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {p.last_update ? (
                      <span className="text-xs text-orange-500">
                        Última: {new Date(p.last_update).toLocaleDateString('pt-BR')}
                      </span>
                    ) : (
                      <span className="text-xs text-red-500">Nunca atualizado</span>
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
}

// ── Componente principal ─────────────────────────────────────────────────────

export function RelatoriosClient({ patients }: { patients: PatientOption[] }) {
  const [tab, setTab] = useState<Tab>('cards')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'cards', label: 'Cards criados' },
    { key: 'itens', label: 'Itens enviados' },
    { key: 'inativos', label: 'Sem atualização' },
    { key: 'semana', label: 'Última semana' },
  ]

  return (
    <div className="space-y-5">
      {/* Abas */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cards' && <CardsCreated />}
      {tab === 'itens' && <ItensSent patients={patients} />}
      {tab === 'inativos' && <SemAtualizacao />}
      {tab === 'semana' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <RelatorioUltimaSemana />
        </div>
      )}
    </div>
  )
}
