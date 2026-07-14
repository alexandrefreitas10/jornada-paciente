'use client'

import { useState, useEffect } from 'react'
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
  if (!log.deleted_data) return false
  if (log.entity_type === 'file') return false
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

export function DeletedItemsTab({ patientId }: { patientId: number }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/audit`)
      .then(r => r.json())
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [patientId])

  async function handleRestore(log: AuditLog) {
    if (!confirm(`Restaurar "${ENTITY_LABELS[log.entity_type] ?? log.entity_type}"${log.details ? ` — ${log.details}` : ''}?`)) return
    setRestoring(log.id)
    try {
      const res = await fetch(`/api/admin/audit/${log.id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao restaurar'); return }
      if (data.warning) alert(data.warning)
      setLogs(prev => prev.filter(l => l.id !== log.id))
    } finally {
      setRestoring(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm">Nenhum item apagado neste paciente.</p>
      </div>
    )
  }

  // Agrupar por aba
  const grouped: Record<string, AuditLog[]> = {}
  for (const log of logs) {
    const tab = ENTITY_TAB[log.entity_type] ?? 'Outros'
    if (!grouped[tab]) grouped[tab] = []
    grouped[tab].push(log)
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([tab, items]) => (
        <div key={tab}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{tab}</h3>
          <div className="space-y-2">
            {items.map(log => {
              const restorable = canRestore(log)
              const isExpanded = expandedId === log.id
              return (
                <div key={log.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.entity_type.startsWith('measurement') ? 'bg-violet-100 text-violet-700' :
                          log.entity_type === 'term' ? 'bg-blue-100 text-blue-700' :
                          log.entity_type === 'evolution_summary' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        </span>
                        {log.details && (
                          <span className="text-sm text-gray-700 font-medium">{log.details}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 mt-1">
                        <span className="text-xs text-gray-500">👤 {log.user_name}</span>
                        <span className="text-xs text-gray-400">{fmt(log.created_at)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {log.deleted_data && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
                        >
                          {isExpanded ? 'Fechar' : 'Ver dados'}
                        </button>
                      )}
                      {restorable ? (
                        <button
                          onClick={() => handleRestore(log)}
                          disabled={restoring === log.id}
                          className="text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {restoring === log.id ? '...' : '↩ Restaurar'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Sem restauração</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && log.deleted_data && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
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
      ))}
    </div>
  )
}
