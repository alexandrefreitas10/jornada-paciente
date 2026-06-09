// src/components/DeleteButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  patientId: number
  patientName: string
}

export function DeleteButton({ patientId, patientName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/patients/${patientId}`, { method: 'DELETE' })
    router.push('/')
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Excluir {patientName}?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-sm px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? 'Excluindo...' : 'Confirmar'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm px-3 py-1 text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
    >
      Excluir
    </button>
  )
}
