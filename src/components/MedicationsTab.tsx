'use client'

import { useState, useEffect } from 'react'

interface Medication {
  id: number
  item_name: string
  quantity: number
  lot: string | null
  expiry_date: string | null
  observation: string | null
  created_by: string | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function MedicationsTab({ patientId }: { patientId: number }) {
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/medications`)
      .then(r => r.json())
      .then(data => { setMedications(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [patientId])

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (medications.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-4xl mb-2">💊</p>
      <p className="text-sm">Nenhuma medicação registrada para este paciente.</p>
      <p className="text-xs mt-1 text-gray-300">As saídas do estoque vinculadas a este paciente aparecerão aqui.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 mb-4">{medications.length} registro(s) encontrado(s)</p>
      {medications.map(med => (
        <div key={med.id} className="flex gap-3 items-start p-3 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-base">💊</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm">{med.item_name}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              <p className="text-xs text-gray-500">
                Qtd: <span className="font-medium text-gray-700">{med.quantity}</span>
              </p>
              {med.lot && (
                <p className="text-xs text-gray-500">Lote: <span className="font-medium text-gray-700">{med.lot}</span></p>
              )}
              {med.observation && (
                <p className="text-xs text-gray-500 italic">{med.observation}</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {formatDate(med.created_at)}
              {med.created_by && <span> · {med.created_by}</span>}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
