'use client'

import { useState } from 'react'

interface Patient {
  id: number
  name: string
  start_date: string
  duration: string
  end_date: string
  days_remaining: number
  completed_count: number
  current_week: number | null
  total_weeks: number | null
  reason: 'calendar' | 'evolution' | 'both'
}

export function RelatorioUltimaSemana() {
  const [open, setOpen] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)

  async function handleOpen() {
    setLoading(true)
    const res = await fetch('/api/relatorio/ultima-semana')
    const data = await res.json()
    setPatients(data)
    setLoading(false)
    setOpen(true)
  }

  function handlePrint() {
    window.print()
  }

  function formatDate(iso: string) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 border border-amber-400 text-amber-700 bg-amber-50 text-sm font-medium rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Carregando...' : '📋 Relatório — Última Semana'}
      </button>
    )
  }

  return (
    <>
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #relatorio-print { display: block !important; position: fixed; inset: 0; background: white; z-index: 9999; padding: 40px; }
        }
        #relatorio-print { display: none; }
      `}</style>

      {/* Modal na tela */}
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Pacientes na Última Semana</h2>
              <p className="text-xs text-gray-500 mt-0.5">Tratamentos encerrando nos próximos 7 dias</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
              >
                🖨️ Imprimir / PDF
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors text-lg"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {patients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nenhum paciente na última semana de tratamento no momento.
              </p>
            ) : (
              <div className="space-y-3">
                {patients.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Início: {p.start_date ? formatDate(p.start_date) : '—'} · Duração: {p.duration}
                      </p>
                      {p.end_date && (
                        <p className="text-xs text-gray-500">
                          Término previsto: {formatDate(p.end_date)}
                        </p>
                      )}
                      {p.current_week !== null && p.total_weeks !== null && (
                        <p className="text-xs text-violet-600 font-medium mt-0.5">
                          Evolução: semana {p.current_week} de {p.total_weeks}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {p.reason !== 'evolution' ? (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          p.days_remaining === 0
                            ? 'bg-red-100 text-red-700'
                            : p.days_remaining <= 3
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.days_remaining === 0 ? 'Hoje' : `${p.days_remaining} dia${p.days_remaining !== 1 ? 's' : ''}`}
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                          Última semana
                        </span>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{p.completed_count}/18 tarefas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Versão para impressão */}
      <div id="relatorio-print">
        <div style={{ marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>Relatório — Pacientes na Última Semana</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {patients.length === 0 ? (
          <p>Nenhum paciente na última semana de tratamento.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: '#374151' }}>Paciente</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: '#374151' }}>Início</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: '#374151' }}>Duração</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: '#374151' }}>Término</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#374151' }}>Semana (Evolução)</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#374151' }}>Dias restantes</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: '#374151' }}>Tarefas</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 4px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '10px 4px' }}>{formatDate(p.start_date)}</td>
                  <td style={{ padding: '10px 4px' }}>{p.duration}</td>
                  <td style={{ padding: '10px 4px' }}>{formatDate(p.end_date)}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                    {p.current_week !== null && p.total_weeks !== null
                      ? `${p.current_week}/${p.total_weeks}`
                      : '—'}
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                    {p.reason === 'evolution' ? 'Última semana' : p.days_remaining === 0 ? 'Hoje' : p.days_remaining}
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>{p.completed_count}/18</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
