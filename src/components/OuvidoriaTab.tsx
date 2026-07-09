'use client'

import { useState, useEffect } from 'react'

interface Feedback {
  id: number
  message: string
  created_at: string
}

export function OuvidoriaTab({ patientId }: { patientId: number }) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/feedback`)
      .then(r => r.json())
      .then(data => setFeedbacks(data.feedbacks ?? []))
      .catch(() => {})
  }, [patientId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError(null)

    const res = await fetch(`/api/patients/${patientId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Erro ao enviar. Tente novamente.')
      setSending(false)
      return
    }

    setMessage('')
    setSending(false)
    setSent(true)
    setTimeout(() => setSent(false), 4000)
    // Recarrega a lista
    fetch(`/api/patients/${patientId}/feedback`)
      .then(r => r.json())
      .then(data => setFeedbacks(data.feedbacks ?? []))
      .catch(() => {})
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">📣 Ouvidoria</h3>
        <p className="text-xs text-gray-500 mb-4">
          Teve algum problema ou algo que gostaria de nos contar? Escreva aqui — sua mensagem vai
          direto para a direção do Instituto, com total confidencialidade.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            maxLength={5000}
            required
            placeholder="Conte o que aconteceu..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {sent && <p className="text-xs text-emerald-600 font-medium">✓ Mensagem enviada. Obrigado por nos contar!</p>}
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="w-full sm:w-auto px-6 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Enviando...' : 'Enviar mensagem'}
          </button>
        </form>
      </div>

      {feedbacks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Suas mensagens anteriores</h4>
          <div className="space-y-3">
            {feedbacks.map(f => (
              <div key={f.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.message}</p>
                <p className="text-[10px] text-gray-400 mt-2">
                  {new Date(f.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
