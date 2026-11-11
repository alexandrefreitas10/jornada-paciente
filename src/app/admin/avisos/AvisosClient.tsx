'use client'

import { useEffect, useState } from 'react'

// Tela de teste do aviso (push) do portal. Existe para ver o formato na tela
// de um celular de verdade antes de decidir quais eventos do sistema vão
// gerar aviso. Não é a tela final de nada — é o banco de provas.

interface PacienteComAviso {
  patient_id: number
  name: string
  aparelhos: number
}

interface Resultado {
  enviados?: number
  removidos?: number
  falhas?: number
  motivo?: string
  error?: string
}

export function AvisosClient() {
  const [pacientes, setPacientes] = useState<PacienteComAviso[] | null>(null)
  const [escolhido, setEscolhido] = useState<number | ''>('')
  const [titulo, setTitulo] = useState('Instituto Torres')
  const [texto, setTexto] = useState('Você tem uma novidade no portal')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  useEffect(() => {
    fetch('/api/admin/push/teste')
      .then(r => r.json())
      .then(d => setPacientes(d.pacientes ?? []))
      .catch(() => setPacientes([]))
  }, [])

  async function enviar() {
    if (escolhido === '') return
    setEnviando(true); setResultado(null)
    try {
      const r = await fetch('/api/admin/push/teste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: escolhido, titulo, texto }),
      })
      setResultado(await r.json())
    } catch {
      setResultado({ error: 'Não consegui falar com o servidor' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-bold text-gray-900">Teste de notificação</h1>
      <p className="text-sm text-gray-500 mt-1">
        Só aparecem aqui os pacientes que ativaram o aviso no Perfil do portal.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Paciente</label>
          {pacientes === null ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : pacientes.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Ninguém ativou ainda. Abra o portal no celular, vá em Perfil e toque em Notificações.
            </p>
          ) : (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              value={escolhido}
              onChange={e => setEscolhido(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Escolha...</option>
              {pacientes.map(p => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name} ({p.aparelhos} {p.aparelhos === 1 ? 'aparelho' : 'aparelhos'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Texto</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            value={texto}
            onChange={e => setTexto(e.target.value)}
          />
          {/* O lembrete fica na tela, e não só no código, porque quem escreve
              o texto aqui pode não ser quem leu a regra. */}
          <p className="text-xs text-amber-700 mt-1">
            Isto aparece na tela bloqueada do celular. Nada de exame, medicação ou procedimento.
          </p>
        </div>

        <button
          onClick={enviar}
          disabled={enviando || escolhido === ''}
          className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          {enviando ? 'Enviando...' : 'Enviar agora'}
        </button>

        {resultado && (
          <div className="text-sm border rounded-lg px-3 py-2 bg-gray-50 border-gray-200">
            {resultado.error && <p className="text-red-600">{resultado.error}</p>}
            {resultado.motivo && <p className="text-amber-700">{resultado.motivo}</p>}
            {resultado.enviados !== undefined && (
              <p className="text-gray-700">
                Enviados: <strong>{resultado.enviados}</strong>
                {resultado.removidos ? ` · aparelhos mortos removidos: ${resultado.removidos}` : ''}
                {resultado.falhas ? ` · falhas: ${resultado.falhas}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
