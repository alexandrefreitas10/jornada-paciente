'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  agruparPorProcedimento, type GrupoProcedimento, type SessaoEstetica,
} from '@/lib/estetica-relatorio'
import {
  filtrarAtrasos, montarAtrasos,
  type EtiquetaAtraso, type FiltroAtraso, type LinhaAtraso,
} from '@/lib/estetica-atraso'
import { descreverCadencia } from '@/lib/estetica-intervalo'

// Relatórios › Estética: uma sub-aba por procedimento, com quem ainda tem
// sessão a fazer e quem já terminou.
//
// A lista de procedimentos NÃO existe no código: ela é derivada dos dados a
// cada carregamento. É isso que faz um procedimento novo, digitado no card,
// aparecer aqui sozinho — que era o pedido. Escrever a lista aqui quebraria
// exatamente isso.

function fmtData(valor: string | Date | null): string {
  if (!valor) return '—'
  // `new Date`, nunca método de string: o postgres.js devolve `Date` em coluna
  // de data, e o mesmo campo chega como string quando vem por `fetch`.
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}

function Linha({ s }: { s: SessaoEstetica }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <Link
        href={`/pacientes/${s.patientId}`}
        className="text-sm font-medium text-violet-700 hover:underline truncate"
      >
        {s.patientName}
      </Link>
      <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
        <span className="font-medium text-gray-700">{s.feitas} de {s.totalSessoes || '—'}</span>
        <span>início {fmtData(s.inicio)}</span>
        <span>última {fmtData(s.ultimaFeita)}</span>
      </div>
    </div>
  )
}

function Bloco({ titulo, sessoes }: { titulo: string; sessoes: SessaoEstetica[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        {titulo} ({sessoes.length})
      </h3>
      {/* Bloco vazio mostra uma linha em vez de sumir: sumir dá a impressão de
          tela quebrada, e "ninguém finalizou ainda" é informação. */}
      {sessoes.length === 0
        ? <p className="text-sm text-gray-400">Ninguém por aqui.</p>
        : sessoes.map(s => <Linha key={s.id} s={s} />)}
    </div>
  )
}

const CORES: Record<EtiquetaAtraso, string> = {
  verde: 'bg-green-100 text-green-800',
  amarela: 'bg-amber-100 text-amber-800',
  vermelha: 'bg-red-100 text-red-800',
  nunca_veio: 'bg-gray-200 text-gray-700',
}

const ROTULOS: Record<EtiquetaAtraso, string> = {
  verde: 'em dia',
  amarela: 'atrasada',
  vermelha: 'muito atrasada',
  nunca_veio: 'nunca veio',
}

const FILTROS: { key: FiltroAtraso; label: string }[] = [
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'nunca_veio', label: 'Nunca veio' },
  { key: 'em_dia', label: 'Em dia' },
  { key: 'todos', label: 'Todos' },
]

function LinhaDeAtraso({ l }: { l: LinhaAtraso }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <Link href={`/pacientes/${l.patientId}`} className="text-sm font-medium text-violet-700 hover:underline">
          {l.patientName}
        </Link>
        <div className="text-xs text-gray-500 truncate">
          {l.procedimento} · {descreverCadencia(l)} · {l.feitas} de {l.totalSessoes || '—'}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-600">
          {l.etiqueta === 'nunca_veio'
            ? (l.diasSemVir > 0 ? `há ${l.diasSemVir} dias sem iniciar` : 'ainda não iniciou')
            : `há ${l.diasSemVir} dias`}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CORES[l.etiqueta]}`}>
          {ROTULOS[l.etiqueta]}
        </span>
      </div>
    </div>
  )
}

export function Estetica() {
  const [sessoes, setSessoes] = useState<SessaoEstetica[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [visao, setVisao] = useState<'procedimento' | 'atraso'>('procedimento')
  const [filtro, setFiltro] = useState<FiltroAtraso>('atrasados')

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/reports/estetica')
      if (!res.ok) throw new Error(String(res.status))
      setSessoes(await res.json())
    } catch {
      setErro('Não foi possível carregar os procedimentos. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const grupos: GrupoProcedimento[] = useMemo(
    () => agruparPorProcedimento(sessoes ?? []),
    [sessoes],
  )

  // Só os procedimentos em aberto entram, já ordenados do mais abandonado para
  // o menos. `montarAtrasos` deixa os finalizados de fora.
  const atrasos = useMemo(() => montarAtrasos(sessoes ?? []), [sessoes])
  const atrasosFiltrados = useMemo(() => filtrarAtrasos(atrasos, filtro), [atrasos, filtro])
  const contagem = useMemo(() => ({
    atrasados: filtrarAtrasos(atrasos, 'atrasados').length,
    nunca_veio: filtrarAtrasos(atrasos, 'nunca_veio').length,
    em_dia: filtrarAtrasos(atrasos, 'em_dia').length,
    todos: atrasos.length,
  }), [atrasos])

  // A sub-aba escolhida é guardada pela CHAVE, não pela posição: entrar um
  // procedimento novo não pode trocar o que está aberto na tela.
  const atual = grupos.find(g => g.chave === escolhido) ?? grupos[0]

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (sessoes === null) return <p className="text-sm text-gray-500">Carregando…</p>

  if (grupos.length === 0) {
    return <p className="text-sm text-gray-500">Nenhum procedimento de estética cadastrado ainda.</p>
  }

  return (
    <div>
      {/* Duas visões da mesma coisa: a lista por procedimento (quem está em
          cada um) e a lista por atraso (quem sumiu). */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'procedimento', label: 'Por procedimento' },
          { key: 'atraso', label: 'Quem está atrasado' },
        ] as const).map(v => (
          <button
            key={v.key}
            onClick={() => setVisao(v.key)}
            aria-pressed={visao === v.key}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              visao === v.key ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {visao === 'atraso' ? (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            {FILTROS.map(f => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                aria-pressed={filtro === f.key}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filtro === f.key ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {`${f.label} (${contagem[f.key]})`}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            O tempo é contado da última sessão realizada. Cada procedimento tem a sua cadência:
            o que é atraso num protocolo de 2× por semana é normal numa depilação mensal.
          </p>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            {atrasosFiltrados.length === 0
              ? <p className="text-sm text-gray-400">Ninguém por aqui.</p>
              : atrasosFiltrados.map(l => <LinhaDeAtraso key={l.id} l={l} />)}
          </div>
        </>
      ) : (
      <>
      <div className="flex gap-2 flex-wrap mb-4">
        {grupos.map(g => (
          <button
            key={g.chave}
            onClick={() => setEscolhido(g.chave)}
            aria-pressed={atual?.chave === g.chave}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              atual?.chave === g.chave
                ? 'bg-violet-600 text-white'
                : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {`${g.nome} (${g.pacientes})`}
          </button>
        ))}
      </div>

      {atual && (
        <>
          <Bloco titulo="Em aberto" sessoes={atual.emAberto} />
          <Bloco titulo="Finalizados" sessoes={atual.finalizados} />
        </>
      )}
      </>
      )}
    </div>
  )
}
