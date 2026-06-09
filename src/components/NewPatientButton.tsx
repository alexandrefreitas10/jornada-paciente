// src/components/NewPatientButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientModal } from './PatientModal'

export function NewPatientButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  async function handleSave(data: { name: string; start_date: string; duration: string; notes: string }) {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Erro ao criar')
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
      >
        + Novo Paciente
      </button>
      {open && (
        <PatientModal
          title="Novo Paciente"
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
