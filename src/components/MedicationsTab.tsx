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

export function MedicationsTab({ patientId, patientName }: { patientId: number; patientName?: string }) {
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/patients/${patientId}/medications`)
      .then(r => r.json())
      .then(data => { setMedications(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [patientId])

  const reportText = (() => {
    const dateLabel = new Date(reportDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const dayMeds = medications.filter(m => m.created_at.slice(0, 10) === reportDate)
    if (dayMeds.length === 0) return `Nenhuma medicação registrada em ${dateLabel}.`
    const lines = dayMeds.map(m => {
      const meta = [m.lot ? `Lote: ${m.lot}` : null, m.expiry_date ? `Val: ${m.expiry_date}` : null].filter(Boolean).join(' | ')
      const parts = [`- ${m.item_name}: ${m.quantity}${meta ? ` (${meta})` : ''}`]
      if (m.observation) parts.push(`  Obs: ${m.observation}`)
      return parts.join('\n')
    })
    const author = dayMeds[0].created_by ?? ''
    return `Medicações aplicadas — ${dateLabel}${patientName ? `\nPaciente: ${patientName}` : ''}\n\n${lines.join('\n')}${author ? `\n\nRegistrado por: ${author}` : ''}`
  })()

  function copyReport() {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400">{medications.length} registro(s) encontrado(s)</p>
        {medications.length > 0 && (
          <button onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            📋 Relatório do Dia
          </button>
        )}
      </div>

      {medications.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">💊</p>
          <p className="text-sm">Nenhuma medicação registrada para este paciente.</p>
          <p className="text-xs mt-1 text-gray-300">As saídas do estoque vinculadas a este paciente aparecerão aqui.</p>
        </div>
      ) : (
        medications.map(med => {
          const isImplant = med.observation === 'Implante hormonal'
          return (
          <div key={med.id} className={`flex gap-3 items-start p-3 rounded-xl border ${isImplant ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-gray-100'}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isImplant ? 'bg-violet-200' : 'bg-violet-100'}`}>
              <span className="text-base">{isImplant ? '🧬' : '💊'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm">{med.item_name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                <p className="text-xs text-gray-500">Qtd: <span className="font-medium text-gray-700">{med.quantity}</span></p>
                {med.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium text-gray-700">{med.lot}</span></p>}
                {med.observation && <p className="text-xs text-gray-500 italic">{med.observation}</p>}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(med.created_at)}
                {med.created_by && <span> · {med.created_by}</span>}
              </p>
            </div>
          </div>
        )})
      )}

      {/* Modal relatório */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">📋 Relatório de Medicações</h2>
            {patientName && <p className="text-sm text-gray-600">Paciente: <span className="font-semibold">{patientName}</span></p>}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Data</label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {reportText}
            </pre>
            <button onClick={copyReport}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {copied ? '✅ Copiado!' : '📋 Copiar para área de transferência'}
            </button>
            <button onClick={() => { setShowReport(false); setCopied(false) }}
              className="w-full py-2 border border-gray-300 text-gray-600 rounded-xl text-sm hover:bg-gray-50">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
