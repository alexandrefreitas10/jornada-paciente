'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { validarMotivo, MOTIVO_MAX } from '@/lib/arquivo-paciente'

interface Props {
  patientId: number
  patientName: string
}

export function ArchivePatientButton({ patientId, patientName }: Props) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pressionouFora = useRef(false)
  const router = useRouter()

  function abrir(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMotivo('')
    setErro(null)
    setAberto(true)
  }

  function fechar() {
    if (!loading) setAberto(false)
  }

  async function confirmar() {
    const texto = validarMotivo(motivo)
    if (!texto) return
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: texto, origem: 'card_paciente' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setAberto(false)
      router.refresh()
    } catch {
      setErro('Não foi possível mover para Pacientes Antigos. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={loading}
        title="Mover para Pacientes Antigos"
        aria-label={`Mover ${patientName} para Pacientes Antigos`}
        className="shrink-0 text-xs text-gray-300 hover:text-amber-500 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? '...' : '📦'}
      </button>

      {aberto && (
        // O botão fica fora do <Link> do card, mas o card inteiro é clicável
        // em volta: nenhum clique aqui pode propagar.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={e => { pressionouFora.current = e.target === e.currentTarget }}
          onClick={e => { e.stopPropagation(); if (pressionouFora.current && e.target === e.currentTarget) fechar(); pressionouFora.current = false }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`arquivar-titulo-${patientId}`}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); fechar() } }}
          >
            <h2 id={`arquivar-titulo-${patientId}`} className="text-base font-semibold text-gray-900">
              Mover {patientName} para Pacientes Antigos?
            </h2>
            <p className="text-sm text-gray-500">
              Todos os dados serão preservados e você poderá reativar quando quiser.
            </p>
            <label htmlFor={`motivo-card-${patientId}`} className="block text-xs font-medium text-gray-700">
              Observações — por que o paciente parou?
            </label>
            <textarea
              id={`motivo-card-${patientId}`}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              maxLength={MOTIVO_MAX}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={loading || !validarMotivo(motivo)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? 'Movendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
