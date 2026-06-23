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
  const [permanentlyDeleting, setPermanentlyDeleting] = useState<number | null>(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
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
      window.location.reload()
    } finally {
      setRestoring(null)
    }
  }

  async function handlePermanentlyDelete(log: AuditLog) {
    if (!adminPassword) {
      alert('Senha do admin obrigatória')
      return
    }
    setPermanentlyDeleting(log.id)
    try {
      console.log('Deletando permanentemente:', log.id)
      const res = await fetch(`/api/admin/audit/${log.id}/permanently-delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      })
      console.log('Response status:', res.status)
      const data = await res.json()
      console.log('Response data:', data)
      if (!res.ok) {
        alert(data.error || 'Erro ao deletar');
        return
      }
      setLogs(prev => prev ? prev.filter(l => l.id !== log.id) : prev)
      setAdminPassword('')
      setDeletingId(null)
      alert('Item deletado permanentemente')
    } catch (err) {
      console.error('Erro ao deletar:', err)
      alert('Erro: ' + String(err))
    } finally {
      setPermanentlyDeleting(null)
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

      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Deletar permanentemente?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Esta ação é irreversível. Digite a senha do admin para confirmar.
            </p>
            <input
              type="password"
              placeholder="Senha do admin"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const log = logs?.find(l => l.id === deletingId)
                  if (log) handlePermanentlyDelete(log)
                }
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeletingId(null)
                  setAdminPassword('')
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const log = logs?.find(l => l.id === deletingId)
                  if (log) handlePermanentlyDelete(log)
                }}
                disabled={permanentlyDeleting === deletingId || !adminPassword}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {permanentlyDeleting === deletingId ? '...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div className="flex items-center gap-2 shrink-0">
                    {canRestore(log) ? (
                      <button
                        onClick={() => handleRestore(log)}
                        disabled={restoring === log.id}
                        className="text-xs font-medium text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {restoring === log.id ? '...' : '↩ Restaurar'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 italic">Sem restauração</span>
                    )}

                    <button
                      onClick={() => setDeletingId(deletingId === log.id ? null : log.id)}
                      className="text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      🗑 Deletar
                    </button>
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
