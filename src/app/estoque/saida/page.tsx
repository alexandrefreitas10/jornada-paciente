'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

interface StockItem { id: number; name: string; unit: string; quantity: number; lot: string | null; expiry_date: string | null }

type Step = 'confirm' | 'form' | 'done'

function SaidaForm() {
  const searchParams = useSearchParams()
  const itemId = searchParams.get('item')

  const [item, setItem] = useState<StockItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('confirm')

  const [quantity, setQuantity] = useState(1)
  const [patientName, setPatientName] = useState('')
  const [observation, setObservation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!itemId) { setLoading(false); return }
    fetch(`/api/estoque/items/${itemId}`)
      .then(r => r.json())
      .then(data => { setItem(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [itemId])

  async function handleSubmit() {
    if (!item) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/estoque/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: item.id, type: 'saida', quantity,
        patient_name: patientName || null, observation: observation || null,
      }),
    })
    if (res.ok) { setStep('done') } else { setError('Erro ao registrar saída.') }
    setSaving(false)
  }

  function reset() {
    setStep('confirm'); setQuantity(1); setPatientName(''); setObservation(''); setError('')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    </div>
  )

  if (!itemId || !item) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <div>
        <p className="text-5xl mb-3">❌</p>
        <p className="text-gray-600 font-medium">Medicação não encontrada.</p>
        <p className="text-sm text-gray-400 mt-1">QR Code inválido ou medicação removida.</p>
      </div>
    </div>
  )

  /* ── STEP 1: Confirmação ── */
  if (step === 'confirm') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-violet-600 px-6 py-5 text-white text-center">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">Saída de Estoque</p>
          <h1 className="text-xl font-bold leading-tight">{item.name}</h1>
          {item.lot && <p className="text-sm opacity-75 mt-0.5">Lote: {item.lot}{item.expiry_date ? ` · Val: ${item.expiry_date}` : ''}</p>}
        </div>

        {/* Estoque atual */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-800">{item.quantity}</p>
            <p className="text-xs text-gray-400">{item.unit} em estoque</p>
          </div>
        </div>

        {/* Pergunta */}
        <div className="px-6 py-6 text-center">
          <p className="text-base font-semibold text-gray-700 mb-6">Deseja registrar a saída desta medicação?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('form')}
              className="flex-1 py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 active:bg-violet-800 transition-colors text-sm"
            >
              ✅ Sim, dar saída
            </button>
            <button
              onClick={() => window.close()}
              className="flex-1 py-3.5 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm"
            >
              ❌ Não
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  /* ── STEP 2: Formulário de quantidade ── */
  if (step === 'form') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-violet-600 px-6 py-4 text-white">
          <button onClick={() => setStep('confirm')} className="text-xs opacity-75 hover:opacity-100 mb-2 flex items-center gap-1">
            ← Voltar
          </button>
          <h1 className="text-lg font-bold">{item.name}</h1>
          {item.lot && <p className="text-xs opacity-75">Lote: {item.lot}</p>}
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Quantidade com botões +/- */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 text-center">Quantidade</label>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-full border-2 border-gray-200 text-2xl font-bold text-gray-500 hover:border-violet-400 hover:text-violet-600 active:bg-violet-50 transition-colors flex items-center justify-center"
              >
                −
              </button>
              <input
                type="number" min="1" value={quantity}
                onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-24 text-center text-3xl font-bold text-gray-800 border-2 border-gray-200 rounded-xl py-2 focus:outline-none focus:border-violet-400"
              />
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-12 h-12 rounded-full border-2 border-gray-200 text-2xl font-bold text-gray-500 hover:border-violet-400 hover:text-violet-600 active:bg-violet-50 transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">{item.unit} · estoque atual: {item.quantity}</p>
          </div>

          {/* Paciente */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Paciente <span className="text-gray-400">(opcional)</span></label>
            <input
              type="text" value={patientName} onChange={e => setPatientName(e.target.value)}
              placeholder="Nome do paciente"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
            <textarea
              value={observation} onChange={e => setObservation(e.target.value)}
              rows={2} placeholder="Ex: uso na consulta"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button
            onClick={handleSubmit} disabled={saving}
            className="w-full py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Registrando...' : `Confirmar saída de ${quantity} ${item.unit}`}
          </button>
        </div>
      </div>
    </div>
  )

  /* ── STEP 3: Sucesso ── */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Saída registrada!</h2>
        <p className="text-gray-500 font-medium">{item.name}</p>
        <p className="text-gray-400 text-sm mt-1">{quantity} {item.unit}{patientName ? ` · ${patientName}` : ''}</p>
        <button
          onClick={reset}
          className="mt-6 w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors"
        >
          Registrar outra saída
        </button>
      </div>
    </div>
  )
}

export default function SaidaPage() {
  return <Suspense><SaidaForm /></Suspense>
}
