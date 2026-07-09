'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function NpsForm({ patientId }: { patientId: number }) {
  const router = useRouter()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (score === null) { setError('Escolha uma nota de 0 a 10'); return }
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/patients/${patientId}/nps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, comment }),
    })

    if (!res.ok && res.status !== 409) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Erro ao enviar. Tente novamente.')
      setLoading(false)
      return
    }

    // 409 = já respondido — segue para o card do mesmo jeito
    router.push('/portal/paciente')
    router.refresh()
  }

  const scoreColor = (n: number) =>
    n <= 6 ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    : n <= 8 ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'

  const scoreSelected = (n: number) =>
    n <= 6 ? 'bg-red-600 border-red-600 text-white'
    : n <= 8 ? 'bg-amber-500 border-amber-500 text-white'
    : 'bg-emerald-600 border-emerald-600 text-white'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl mx-auto mb-4">💜</div>
          <h1 className="text-xl font-bold text-gray-900">Antes de começar...</h1>
          <p className="text-sm text-gray-500 mt-2">
            Sua opinião é muito importante para nós. Leva menos de um minuto!
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-800 mb-3">
                De 0 a 10, o quanto você recomendaria o Instituto Torres para um amigo ou familiar?
              </p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className={`aspect-square rounded-lg border text-xs font-semibold transition-colors ${
                      score === n ? scoreSelected(n) : scoreColor(n)
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>Não recomendaria</span>
                <span>Com certeza!</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quer nos contar o motivo? <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Escreva aqui..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar e acessar minha área'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
