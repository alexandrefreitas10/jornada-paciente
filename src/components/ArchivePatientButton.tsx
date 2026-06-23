'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  patientId: number
  patientName: string
}

export function ArchivePatientButton({ patientId, patientName }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Mover "${patientName}" para Pacientes Antigos?\n\nTodos os dados serão preservados e você poderá reativar quando quiser.`)) return
    setLoading(true)
    await fetch(`/api/patients/${patientId}/archive`, { method: 'POST' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleArchive}
      disabled={loading}
      title="Mover para Pacientes Antigos"
      className="shrink-0 text-xs text-gray-300 hover:text-amber-500 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? '...' : '📦'}
    </button>
  )
}
