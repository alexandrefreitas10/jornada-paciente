'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AuditLog } from '@/lib/audit'

const ENTITY_LABELS: Record<string, string> = {
  measurement: 'Medição',
  measurements: 'Tabela completa de medições',
  file: 'Arquivo',
  term: 'Termo',
  evolution_summary: 'Resumo de consulta',
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

interface Props {
  patientId: number
  entityTypes: string[]
  fileType?: string
}

export function DeletedItemsButton({ patientId, entityTypes, fileType }: Props) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const router = useRouter()

  const load = useCallback(() => {
    fetch(`/api/patients/${patientId}/audit`)
      .then(r => r.json())
      .then((all: AuditLog[]) => {
        const filtered = all.filter(l => {
          if (!entityTypes.includes(l.entity_type)) return false
          if (fileType && l.entity_type === 'file') {
            const data = l.deleted_data as { file_type?: string } | null
            return data?.file_type === fileType
          }
          return true
        })
        setLogs(filtered)
      })
      .catch(() => setLogs([]))
  }, [patientId, entityTypes, fileType])

  useEffect(() => {
    if (open && logs === null) load()
  }, [open, logs, load])

  const count = logs?.length ?? null

  async function handleRestore(log: AuditLog) {
    const label = ENTITY_LABELS[log.entity_type] ?? log.entity_type
    if (!confirm(`Restaurar ${label}${log.details ? ` — ${log.details}` : ''}?`)) return
    setRestoring(log.id)
    try {
      const res = await fetch(`/api/admin/audit/${log.id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao restaurar'); return }
      setLogs(prev => prev ? prev.filter(l => l.id !== log.id) : prev)
      router.refresh()
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        title="Itens apagados"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          open
            ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'border-gray-200 text-gray-400 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50'
        }`}
      >
        🕐 Itens apagados
        {count !== null && count > 0 && (
          <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 border border-orange-100 rounded-xl bg-orange-50/40 overflow-hidden">
          {logs === null && (
            <p className="text-xs text-gray-400 text-center py-6">Carregando...</p>
          )}
          {logs !== null && logs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Nenhum item apagado nesta aba.</p>
          )}
          {logs !== null && logs.length > 0 && (
            <div className="divide-y divide-orange-100">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                      {log.details ? <span className="font-normal text-gray-600"> — {log.details}</span> : null}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      👤 {log.user_name} · {fmt(log.created_at)}
                    </p>
                  </div>
                  {canRestore(log) ? (
                    <button
                      onClick={() => handleRestore(log)}
                      disabled={restoring === log.id}
                      className="shrink-0 text-xs font-medium text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {restoring === log.id ? '...' : '↩ Restaurar'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-300 italic">Sem restauração</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
