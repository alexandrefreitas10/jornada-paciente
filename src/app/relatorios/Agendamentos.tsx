'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AgendamentoComNome, StatusAgendamento } from '@/lib/agenda-db'
import { STATUS_AGENDAMENTO } from '@/lib/agenda-db'
import { COR_STATUS, ROTULO_STATUS } from '@/lib/agenda-rotulos'
import { filtrarPorStatus, resumoDoPeriodo, type FiltroStatus } from '@/lib/agenda-relatorio'
import { dataBrasilia, somarDiasAoDia } from '@/lib/datas'

// Relatórios › Agendamentos. É aqui que aparece tudo o que a grade da agenda
// esconde — quem faltou, quem desmarcou, quem remarcou — porque a grade mostra
// o estado de agora e o relatório guarda a história. Palavras do dono:
// "na agenda eu quero ver só o atualizado, no relatório eu preciso saber quem
// foi desmarcado ou faltou, atendido, tudo".

/** Quantos dias à frente o período padrão alcança. */
const DIAS_A_FRENTE = 31

/**
 * O período padrão, em horário da CLÍNICA.
 *
 * `dataBrasilia` resolve o fuso; só depois é seguro recortar o texto para
 * achar o primeiro do mês. O caminho fácil — `new Date().getMonth()` — usa o
 * relógio de quem abriu: acerta no computador da recepção e erra no celular
 * de quem está fora, além de tornar o teste dependente do ambiente.
 *
 * Vai até 31 dias À FRENTE, não até hoje: gerenciar agendamento é mais sobre
 * a semana que vem do que sobre a passada.
 */
function periodoPadrao(): { de: string; ate: string } {
  const hoje = dataBrasilia(new Date())
  return { de: hoje.slice(0, 8) + '01', ate: somarDiasAoDia(hoje, DIAS_A_FRENTE) ?? hoje }
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Dia lido em UTC: `AAAA-MM-DD` é dia de calendário, não instante. */
function rotuloDoDia(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dia
  return `${DIAS_SEMANA[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function Agendamentos({ patients }: { patients: { id: number; name: string }[] }) {
  const padrao = periodoPadrao()
  const [de, setDe] = useState(padrao.de)
  const [ate, setAte] = useState(padrao.ate)
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  /** Id do paciente escolhido, ou '' para a visão de período. */
  const [paciente, setPaciente] = useState('')
  const [lista, setLista] = useState<AgendamentoComNome[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  /** Id da linha cuja correção está em trânsito, para não aceitar dois cliques. */
  const [salvando, setSalvando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      // Duas perguntas diferentes, duas rotas. "O que aconteceu no período"
      // varre a clínica e tem teto de 62 dias no servidor; "o histórico desta
      // pessoa" não tem teto, porque é naturalmente pequeno e cortá-lo
      // esconderia justamente o que o dono abriu a aba para ver.
      const r = await fetch(
        paciente ? `/api/reports/agendamentos/${paciente}` : `/api/agenda?de=${de}&ate=${ate}`,
      )
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) {
        // A mensagem é do SERVIDOR: ele recusa período acima de 62 dias com um
        // texto que explica o limite. Trocar por um genérico faria o dono ler
        // "nenhum agendamento" num trimestre cheio deles.
        setErro(corpo.error ?? 'Não consegui carregar os agendamentos.')
        setLista([])
        return
      }
      setLista(corpo.agendamentos ?? [])
      setErro(null)
    } catch {
      setErro('Não consegui carregar os agendamentos.')
      setLista([])
    } finally {
      setCarregando(false)
    }
  }, [de, ate, paciente])

  useEffect(() => { carregar() }, [carregar])

  /**
   * Corrige o status de um agendamento antigo sem sair do relatório.
   *
   * Usa a MESMA rota que a grade da agenda usa, que já valida o status e já
   * grava auditoria em nome de quem mexeu — então corrigir aqui deixa o mesmo
   * rastro que corrigir lá.
   *
   * A linha só muda DEPOIS que o servidor confirma. Trocar antes (otimista)
   * mostraria o valor novo mesmo quando a gravação falha, e esta é justamente
   * a tela que o dono abre para conferir se está certo.
   */
  async function corrigirStatus(id: number, status: StatusAgendamento) {
    setSalvando(id)
    setErro(null)
    try {
      const r = await fetch(`/api/agenda/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(corpo.error ?? 'Não consegui mudar o status.')
        return
      }
      setLista((atual) => atual.map((a) => (a.id === id ? { ...a, status } : a)))
    } catch {
      setErro('A conexão caiu. O status não foi mudado.')
    } finally {
      setSalvando(null)
    }
  }

  // O resumo é do PERÍODO, não do que está à vista: filtrar por "Faltou" não
  // pode mudar quantos atendidos houve. Por isso conta `lista`, não `visiveis`.
  const resumo = resumoDoPeriodo(lista)
  const visiveis = filtrarPorStatus(lista, filtro)

  const botoes: { valor: FiltroStatus; rotulo: string; quantos: number }[] = [
    { valor: 'todos', rotulo: 'Todos', quantos: resumo.total },
    ...STATUS_AGENDAMENTO.map((s: StatusAgendamento) => ({
      valor: s as FiltroStatus, rotulo: ROTULO_STATUS[s], quantos: resumo[s],
    })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rel-ag-paciente" className="block text-xs font-medium text-gray-600 mb-1">Paciente</label>
          <select
            id="rel-ag-paciente" value={paciente}
            onChange={(e) => { setPaciente(e.target.value); setFiltro('todos') }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">Todos os pacientes</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Os campos de período só existem na visão de período. Filtrar o
            histórico de uma pessoa por data responderia a pergunta errada:
            quem abre o histórico quer ver tudo o que ela já teve. */}
        {!paciente && (
          <>
            <div>
              <label htmlFor="rel-ag-de" className="block text-xs font-medium text-gray-600 mb-1">De</label>
              <input
                id="rel-ag-de" type="date" value={de} onChange={(e) => setDe(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label htmlFor="rel-ag-ate" className="block text-xs font-medium text-gray-600 mb-1">Até</label>
              <input
                id="rel-ag-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </>
        )}
      </div>

      {/* Os mesmos botões contam e filtram. Dois controles separados mostrariam
          o número duas vezes e deixariam a dúvida de qual manda na lista. */}
      <div className="flex gap-2 flex-wrap">
        {botoes.map((b) => (
          <button
            key={b.valor}
            onClick={() => setFiltro(b.valor)}
            aria-pressed={filtro === b.valor}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filtro === b.valor ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {b.rotulo} ({b.quantos})
          </button>
        ))}
      </div>

      {erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {carregando && <p className="text-sm text-gray-400">Carregando...</p>}

      {!carregando && !erro && lista.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          {paciente ? 'Esta pessoa nunca teve agendamento.' : 'Nenhum agendamento neste período.'}
        </p>
      )}

      {/* A tabela NÃO depende de `erro`. Um erro ao corrigir o status de uma
          linha não pode fazer a lista inteira desaparecer — o dono perderia de
          vista o que estava conferindo por causa de uma linha. O `!erro` só
          vale para a mensagem de "nenhum agendamento", acima: período que
          falhou ao carregar não é período vazio. */}
      {lista.length > 0 && (
        <div className="overflow-x-auto">
          <table role="table" className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3 font-medium">Quando</th>
                <th className="py-2 pr-3 font-medium">Paciente</th>
                <th className="py-2 pr-3 font-medium">Tempo</th>
                <th className="py-2 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                    {rotuloDoDia(a.dia)} <span className="font-semibold">{a.hora}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <a href={`/pacientes/${a.patient_id}`} className="font-medium text-gray-900 hover:text-violet-700">
                      {a.nome}
                    </a>
                    {a.desmarcado_por && (
                      <div className="text-xs text-gray-400">desmarcado por {a.desmarcado_por}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{a.duracao} min</td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Status de ${a.nome}, ${rotuloDoDia(a.dia)} ${a.hora}`}
                      value={a.status}
                      disabled={salvando === a.id}
                      onChange={(e) => corrigirStatus(a.id, e.target.value as StatusAgendamento)}
                      className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${COR_STATUS[a.status]} disabled:opacity-50`}
                    >
                      {STATUS_AGENDAMENTO.map((s) => (
                        <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visiveis.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">Nenhum agendamento com esse status no período.</p>
          )}
        </div>
      )}
    </div>
  )
}
