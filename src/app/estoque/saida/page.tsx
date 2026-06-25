'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

interface StockItem { id: number; name: string; unit: string; quantity: number }

function SaidaForm() {
  const searchParams = useSearchParams()
  const itemId = searchParams.get('item')

  const [item, setItem] = useState<StockItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState('1')
  const [patientName, setPatientName] = useState('')
  const [observation, setObservation] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!itemId) { setLoading(false); return }
    fetch(`/api/estoque/items/${itemId}`)
      .then(r => r.json())
      .then(data => { setItem(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [itemId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/estoque/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: item.id, type: 'saida', quantity: Number(quantity),
        patient_name: patientName || null, observation: observation || null,
      }),
    })
    if (res.ok) { setDone(true) } else { setError('Erro ao registrar saída.') }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Carregando...</p></div>
  if (!itemId || !item) return (
    <div className="flex items-center justify-center min-h-screen p-6 text-center">
      <div>
        <p className="text-4xl mb-3">❌</p>
        <p className="text-gray-600">Medicação não encontrada.</p>
      </div>
    </div>
  )
  if (done) return (
    <div className="flex items-center justify-center min-h-screen p-6 text-center">
      <div>
        <p className="text-5xl mb-4">✅</p>
        <p className="text-xl font-bold text-gray-800 mb-1">Saída registrada!</p>
        <p className="text-gray-500">{item.name}</p>
        <p className="text-gray-500">{quantity} {item.unit}</p>
        {patientName && <p className="text-gray-500 mt-1">Paciente: {patientName}</p>}
        <button onClick={() => { setDone(false); setQuantity('1'); setPatientName(''); setObservation('') }}
          className="mt-6 px-6 py-2 bg-violet-600 text-white rounded-lg font-medium">
          Nova saída
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-1">Registrar Saída</p>
        <h1 className="text-xl font-bold text-gray-800 mb-1">{item.name}</h1>
        <p className="text-sm text-gray-500 mb-6">Estoque atual: <span className="font-semibold text-gray-700">{item.quantity} {item.unit}</span></p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paciente (opcional)</label>
            <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Nome do paciente"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
            <textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2} placeholder="Ex: uso na consulta"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {saving ? 'Registrando...' : 'Confirmar Saída'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SaidaPage() {
  return <Suspense><SaidaForm /></Suspense>
}
