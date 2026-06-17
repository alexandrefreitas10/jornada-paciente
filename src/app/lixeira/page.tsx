'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Patient {
  id: number
  name: string
  deleted_at: string
}

export default function LixeiraPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const router = useRouter()

  async function load() {
    const res = await fetch('/api/patients/deleted')
    setPatients(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleRestore(id: number) {
    setRestoring(id)
    await fetch(`/api/patients/${id}/restore`, { method: 'POST' })
    await load()
    setRestoring(null)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Voltar
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lixeira</h1>
          <p className="text-xs text-gray-400 mt-0.5">Pacientes excluídos — dados preservados, pode restaurar a qualquer momento</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Carregando...</p>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗑️</p>
          <p className="text-sm">Nenhum paciente excluído</p>
        </div>
      ) : (
        <div className="space-y-3">
          {patients.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div>
                <p className="font-semibold text-gray-700">{p.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">Excluído em {formatDate(p.deleted_at)}</p>
              </div>
              <button
                onClick={() => handleRestore(p.id)}
                disabled={restoring === p.id}
                className="px-4 py-1.5 text-sm font-semibold text-green-600 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
              >
                {restoring === p.id ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
