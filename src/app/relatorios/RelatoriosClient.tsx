'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { RelatorioUltimaSemana } from '@/components/RelatorioUltimaSemana'

type Tab = 'cards' | 'itens' | 'semana' | 'inativos' | 'concluidos' | 'fotos' | 'resumo_paciente' | 'termos'

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

// ── Aba: Concluídos (100%) ───────────────────────────────────────────────────

function Concluidos() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    patients: { id: number; name: string; start_date: string; duration: string; completed_count: number; treatment_done: boolean }[]
  } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/relatorio/concluidos')
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Tratamentos concluídos</h2>
          <p className="text-xs text-gray-400 mt-1">Pacientes com prazo encerrado ou todas as tarefas marcadas</p>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : '🎯 Buscar concluídos'}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Concluídos</span>
            <span className="text-sm font-bold text-emerald-600">{result.total} paciente{result.total !== 1 ? 's' : ''}</span>
          </div>
          {result.patients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum paciente concluído</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {result.patients.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <a href={`/pacientes/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-violet-700 transition-colors">
                      {p.name}
                    </a>
                    <p className="text-xs text-gray-400">
                      {p.start_date && `Início: ${new Date(p.start_date).toLocaleDateString('pt-BR')}`}
                      {p.duration && ` · ${p.duration} sem.`}
                      {' · '}{p.completed_count} tarefas
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {p.treatment_done && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">✓ Prazo encerrado</span>
                    )}
                    {p.completed_count >= 19 && (
                      <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-medium">✓ 100% tarefas</span>
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

// ── Aba: Sem atualização na evolução ────────────────────────────────────────

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
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    patients: { id: number; name: string; duration: string; last_update: string | null }[]
  } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/relatorio/sem-atualizacao?since=${from}&to=${to}&type=${contentType}`)
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

        {/* Período */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Período de início e fim</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">De</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setResult(null) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Até</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setResult(null) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading || !from || !to}
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

// ── Aba: Pacientes com fotos ─────────────────────────────────────────────────

function ComFotos() {
  const [tipo, setTipo] = useState<'photo' | 'evolution'>('photo')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    patients: { id: number; name: string; photo_count: number; last_photo: string }[]
  } | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/relatorio/com-fotos?type=${tipo}`)
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Pacientes com fotos enviadas</h2>

        <div>
          <label className="text-xs text-gray-500 mb-2 block">Origem das fotos</label>
          <div className="flex gap-2">
            {([
              { key: 'photo', label: '🖼 Aba Fotos' },
              { key: 'evolution', label: '📈 Aba Evolução' },
            ] as const).map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTipo(t.key); setResult(null) }}
                className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  tipo === t.key
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : '📷 Buscar'}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              {tipo === 'photo' ? 'Com fotos (aba Fotos)' : 'Com fotos (aba Evolução)'}
            </span>
            <span className="text-sm font-bold text-violet-700">{result.total} paciente{result.total !== 1 ? 's' : ''}</span>
          </div>
          {result.patients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum paciente com fotos nesta aba</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {result.patients.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <a href={`/pacientes/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-violet-700 transition-colors">
                      {p.name}
                    </a>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.photo_count} foto{p.photo_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    Última: {new Date(p.last_photo).toLocaleDateString('pt-BR')}
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

// ── Aba: Resumo do Paciente ──────────────────────────────────────────────────

interface PatientActivity {
  patient_id: number
  patient_name: string
  activities: {
    type: string
    description: string
    detail: string | null
    created_at: string
    created_by: string | null
  }[]
}

const ACTIVITY_ICONS: Record<string, string> = {
  saida: '💊', foto: '📸', exame: '🔬', dieta: '🥗', prescricao: '📄',
  medicao: '📏', tarefa: '✅', resumo: '📝', evolution: '📸', exam: '🔬',
  diet: '🥗', prescription: '📄', bioimpedance: '📊',
}

function ResumoPaciente() {
  const [useSpecific, setUseSpecific] = useState(false)
  const [specificDate, setSpecificDate] = useState(today)
  const [dateStart, setDateStart] = useState(firstOfMonth)
  const [dateEnd, setDateEnd] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PatientActivity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const start = useSpecific ? specificDate : dateStart
  const end = useSpecific ? specificDate : dateEnd

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/reports/patient-activity?start=${start}&end=${end}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar')
    } finally {
      setLoading(false)
    }
  }, [start, end])

  function copyPatient(p: PatientActivity) {
    const lines = [
      `Resumo — ${p.patient_name}`,
      `Período: ${start === end ? start : `${start} a ${end}`}`,
      '',
      ...p.activities.map(a =>
        `• ${a.description}${a.detail ? ` — ${a.detail}` : ''}${a.created_by ? ` (${a.created_by})` : ''} — ${new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
      )
    ]
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(p.patient_id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Resumo de atividades por paciente</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={useSpecific} onChange={e => setUseSpecific(e.target.checked)} className="accent-violet-600" />
          Data específica
        </label>
        {useSpecific ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 w-10">Data</label>
            <input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 w-10">Início</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 w-10">Fim</label>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
        )}
        <button onClick={search} disabled={loading}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {loading ? 'Buscando...' : '🔍 Buscar'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Resultados */}
      {data !== null && (
        data.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Nenhuma atividade encontrada no período.</div>
        ) : (
          <div className="space-y-3">
            {data.map(p => {
              const isOpen = expanded === p.patient_id
              return (
                <div key={p.patient_id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.patient_id)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                      {p.patient_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-900">{p.patient_name}</p>
                      <p className="text-xs text-gray-400">{p.activities.length} atividade{p.activities.length !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 pb-4 pt-3 space-y-3">
                      {p.activities.map((a, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-lg mt-0.5 shrink-0">{ACTIVITY_ICONS[a.type] ?? '•'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800">{a.description}</p>
                            {a.detail && <p className="text-xs text-gray-400 truncate">{a.detail}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">
                              {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {a.created_by && <p className="text-xs text-gray-400">{a.created_by}</p>}
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-gray-100">
                        <button onClick={() => copyPatient(p)}
                          className={`w-full py-2 rounded-xl text-xs font-medium transition-colors ${copied === p.patient_id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {copied === p.patient_id ? '✅ Copiado!' : '📋 Copiar resumo deste paciente'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

// ── Aba: Termos ──────────────────────────────────────────────────────────────

type TermoStatus = 'todos' | 'signed' | 'sent' | 'draft'

interface TermoRow {
  id: number
  patient_id: number
  patient_name: string
  title: string
  status: string
  created_by: string
  created_at: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  signed: { label: 'Assinado', color: 'bg-emerald-100 text-emerald-700' },
  sent:   { label: 'Aguardando', color: 'bg-amber-100 text-amber-700' },
  draft:  { label: 'Não enviado', color: 'bg-gray-100 text-gray-600' },
}

function PhysicalSignModal({
  termo,
  onClose,
  onSigned,
}: {
  termo: TermoRow
  onClose: () => void
  onSigned: (id: number) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [signerName, setSignerName] = useState(termo.patient_name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('signer_name', signerName)
      const res = await fetch(`/api/patients/${termo.patient_id}/terms/${termo.id}/sign-physical`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      onSigned(termo.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Registrar assinatura física</h3>
          <p className="text-xs text-gray-500 mt-1 truncate">{termo.title} — {termo.patient_name}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nome de quem assinou</label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Arquivo ou foto do termo assinado</label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors"
            >
              {file ? (
                <span className="text-violet-700 font-medium">{file.name}</span>
              ) : (
                '📎 Selecionar arquivo ou tirar foto'
              )}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando...' : '✅ Confirmar assinatura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TermosRelatorio() {
  const [filter, setFilter] = useState<TermoStatus>('todos')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ total: number; signed: number; sent: number; draft: number; terms: TermoRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signModal, setSignModal] = useState<TermoRow | null>(null)

  async function buscar(f: TermoStatus) {
    setLoading(true)
    setError(null)
    try {
      const params = f !== 'todos' ? `?status=${f}` : ''
      const res = await fetch(`/api/relatorio/termos${params}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar')
    } finally {
      setLoading(false)
    }
  }

  function handleFilter(f: TermoStatus) {
    setFilter(f)
    buscar(f)
  }

  function handleSigned(id: number) {
    setSignModal(null)
    setResult(prev => {
      if (!prev) return prev
      const terms = prev.terms.map(t =>
        t.id === id ? { ...t, status: 'signed', signed_at: new Date().toISOString(), signer_name: signModal?.patient_name ?? t.patient_name } : t
      )
      const signed = terms.filter(t => t.status === 'signed').length
      const sent   = terms.filter(t => t.status === 'sent').length
      const draft  = terms.filter(t => t.status === 'draft').length
      return { ...prev, terms, signed, sent, draft }
    })
  }

  const filterOptions: { key: TermoStatus; label: string }[] = [
    { key: 'todos',  label: 'Todos' },
    { key: 'signed', label: '✅ Assinados' },
    { key: 'sent',   label: '⏳ Aguardando' },
    { key: 'draft',  label: '📋 Não enviados' },
  ]

  return (
    <div className="space-y-5">
      {signModal && (
        <PhysicalSignModal
          termo={signModal}
          onClose={() => setSignModal(null)}
          onSigned={handleSigned}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Relatório de termos</h2>

        <div className="flex flex-wrap gap-2">
          {filterOptions.map(f => (
            <button
              key={f.key}
              onClick={() => handleFilter(f.key)}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                filter === f.key
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <div className="space-y-3">
          {/* Totalizadores */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">{result.signed}</p>
              <p className="text-xs text-gray-500 mt-1">Assinados</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-amber-500">{result.sent}</p>
              <p className="text-xs text-gray-500 mt-1">Aguardando</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-gray-500">{result.draft}</p>
              <p className="text-xs text-gray-500 mt-1">Não enviados</p>
            </div>
          </div>

          {/* Lista */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Termos</span>
              <span className="text-sm font-bold text-violet-700">{result.total}</span>
            </div>
            {result.terms.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum termo encontrado</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {result.terms.map(t => {
                  const s = STATUS_LABEL[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={t.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a href={`/pacientes/${t.patient_id}`} className="text-sm font-medium text-gray-900 hover:text-violet-700 transition-colors">
                            {t.patient_name}
                          </a>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{t.title}</p>
                        {t.signed_at && t.signer_name && (
                          <p className="text-xs text-emerald-600 mt-0.5">Assinado por {t.signer_name} em {new Date(t.signed_at).toLocaleDateString('pt-BR')}</p>
                        )}
                        {t.sent_at && t.status === 'sent' && (
                          <p className="text-xs text-amber-600 mt-0.5">Enviado em {new Date(t.sent_at).toLocaleDateString('pt-BR')}</p>
                        )}
                        {t.status !== 'signed' && (
                          <button
                            onClick={() => setSignModal(t)}
                            className="mt-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2"
                          >
                            + Registrar assinatura física
                          </button>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export function RelatoriosClient({ patients }: { patients: PatientOption[] }) {
  const [tab, setTab] = useState<Tab>('resumo_paciente')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'resumo_paciente', label: '🗒️ Resumo do Paciente' },
    { key: 'termos', label: '📝 Termos' },
    { key: 'cards', label: 'Cards criados' },
    { key: 'itens', label: 'Itens enviados' },
    { key: 'fotos', label: '📷 Com fotos' },
    { key: 'inativos', label: 'Sem atualização' },
    { key: 'concluidos', label: 'Concluídos' },
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

      {tab === 'resumo_paciente' && <ResumoPaciente />}
      {tab === 'termos' && <TermosRelatorio />}
      {tab === 'cards' && <CardsCreated />}
      {tab === 'itens' && <ItensSent patients={patients} />}
      {tab === 'fotos' && <ComFotos />}
      {tab === 'inativos' && <SemAtualizacao />}
      {tab === 'concluidos' && <Concluidos />}
      {tab === 'semana' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <RelatorioUltimaSemana />
        </div>
      )}
    </div>
  )
}
