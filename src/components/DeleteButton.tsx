'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminPasswordModal } from './AdminPasswordModal'

interface Props {
  patientId: number
  patientName: string
}

export function DeleteButton({ patientId, patientName }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    setShowModal(false)
    await fetch(`/api/patients/${patientId}`, { method: 'DELETE' })
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {showModal && (
        <AdminPasswordModal
          onConfirm={handleDelete}
          onCancel={() => setShowModal(false)}
        />
      )}
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="text-sm px-3 py-1 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? 'Excluindo...' : 'Excluir'}
      </button>
    </>
  )
}
