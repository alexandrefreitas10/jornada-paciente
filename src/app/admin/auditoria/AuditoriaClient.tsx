'use client'

import { useState } from 'react'
import { AuditLog } from '@/lib/audit'

const ENTITY_LABELS: Record<string, string> = {
  measurement: 'Medição',
  measurements: 'Tabela de medições',
  file: 'Arquivo',
  term: 'Termo',
  evolution_summary: 'Resumo de consulta',
  patient: 'Paciente',
}

const ENTITY_TAB: Record<string, string> = {
  measurement: 'Evolução',
  measurements: 'Evolução',
  file: 'Arquivos',
  term: 'Termos',
  evolution_summary: 'Consultas',
  patient: 'Paciente',
}

function canRestore(log: AuditLog): boolean {
  if (log.entity_type === 'file') return !!log.entity_id
  if (!log.deleted_data) return false
  if (log.entity_type === 'term') {
    const t = log.deleted_data as { file_s3_key?: string | null }
    return !t.file_s3_key
  }
  return true
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props { logs: AuditLog[] }

export function AuditoriaClient({ logs: initialLogs }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [restoring, setRestoring] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    const matchText = !q ||
      (l.patient_name ?? '').toLowerCase().includes(q) ||
      l.user_name.toLowerCase().includes(q) ||
      (l.details ?? '').toLowerCase().includes(q)
    const matchType = !typeFilter || l.entity_type === typeFilter
    return matchText && matchType
  })

  async function handleRestore(log: AuditLog) {
    if (!confirm(`Restaurar este item?\n\nTipo: ${ENTITY_LABELS[log.entity_type] ?? log.entity_type}\nPaciente: ${log.patient_name ?? '—'}\nDetalhes: ${log.details ?? '—'}`)) return
    setRestoring(log.id)
    try {
      const res = await fetch(`/api/admin/audit/${log.id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao restaurar'); return }
      setLogs(prev => prev.filter(l => l.id !== log.id))
    } finally {
      setRestoring(null)
    }
  }

  const entityTypes = [...new Set(logs.map(l => l.entity_type))]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Auditoria de exclusões</h1>
        <p className="text-sm text-gray-500">Rastreio de todos os itens apagados — quem apagou, quando, e opção de restaurar.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar por paciente, usuário ou detalhes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <option value="">Todos os tipos</option>
          {entityTypes.map(t => (
            <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>
          ))}
        </select>
      </div>

      {/* Contador */}
      <p className="text-xs text-gray-400 mb-3">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗑️</p>
          <p className="text-sm">Nenhum item apagado encontrado.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(log => {
          const restorable = canRestore(log)
          const isExpanded = expandedId === log.id
          return (
            <div key={log.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-3">
                {/* Ícone tipo */}
                <div className="shrink-0 mt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.entity_type === 'patient' ? 'bg-red-100 text-red-700' :
                    log.entity_type.startsWith('measurement') ? 'bg-violet-100 text-violet-700' :
                    log.entity_type === 'term' ? 'bg-blue-100 text-blue-700' :
                    log.entity_type === 'evolution_summary' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                  </span>
                </div>

                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {log.patient_name ?? `Paciente #${log.patient_id}`}
                    </span>
                    <span className="text-xs text-gray-400">Aba: {ENTITY_TAB[log.entity_type] ?? '—'}</span>
                    {log.details && <span className="text-xs text-gray-500 italic">{log.details}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-gray-500">👤 {log.user_name}</span>
                    <span className="text-xs text-gray-400">{fmt(log.created_at)}</span>
                  </div>
                </div>

                {/* Ações */}
                <div className="shrink-0 flex items-center gap-2">
                  {log.deleted_data && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50"
                    >
                      {isExpanded ? 'Fechar' : 'Detalhes'}
                    </button>
                  )}
                  {restorable ? (
                    <button
                      onClick={() => handleRestore(log)}
                      disabled={restoring === log.id}
                      className="text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1 rounded-lg disabled:opacity-50"
                    >
                      {restoring === log.id ? '...' : '↩ Restaurar'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300 px-3 py-1">Sem restauração</span>
                  )}
                </div>
              </div>

              {/* Painel expandido de detalhes */}
              {isExpanded && log.deleted_data && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Dados apagados</p>
                  <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(log.deleted_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
