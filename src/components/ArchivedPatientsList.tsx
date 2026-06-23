'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PatientListItem } from '@/lib/patients'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

interface Props {
  patients: PatientListItem[]
}

export function ArchivedPatientsList({ patients: initial }: Props) {
  const [patients, setPatients] = useState(initial)
  const [unarchiving, setUnarchiving] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const router = useRouter()

  async function handleUnarchive(p: PatientListItem) {
    if (!confirm(`Reativar "${p.name}"?\n\nEle voltará para a página principal com todos os dados.`)) return
    setUnarchiving(p.id)
    await fetch(`/api/patients/${p.id}/unarchive`, { method: 'POST' })
    setPatients(prev => prev.filter(x => x.id !== p.id))
    setUnarchiving(null)
    router.refresh()
  }

  const filtered = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      {patients.length > 4 && (
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      )}

      <div className="space-y-2">
        {filtered.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
            <Link href={`/pacientes/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${avatarColor(p.name)}`}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.start_date && `Início: ${new Date(p.start_date).toLocaleDateString('pt-BR')}`}
                  {p.duration && ` · ${p.duration} sem.`}
                  {p.created_by && ` · ${p.created_by}`}
                </p>
              </div>
            </Link>
            <button
              onClick={() => handleUnarchive(p)}
              disabled={unarchiving === p.id}
              className="shrink-0 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {unarchiving === p.id ? '...' : '↩ Reativar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
