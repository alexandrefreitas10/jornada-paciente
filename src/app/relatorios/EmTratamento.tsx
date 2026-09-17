'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  listarSubAba, mensagemPara, DIAS_VERDE, DIAS_AMARELA,
  type Etiqueta, type PacienteEmTratamento, type SubAba,
} from '@/lib/em-tratamento'

const SUB_ABAS: { key: SubAba; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'nao_veio', label: 'Não veio' },
  { key: 'veio', label: 'Veio' },
]

const ETIQUETA: Record<Etiqueta, { icone: string; nome: string; classe: string }> = {
  verde: { icone: '🟢', nome: 'Em dia', classe: 'bg-green-50 text-green-800 border-green-300' },
  amarela: { icone: '🟡', nome: 'Faltou', classe: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  vermelha: { icone: '🔴', nome: 'Crítico', classe: 'bg-red-50 text-red-700 border-red-300' },
}

const FUSO = 'America/Sao_Paulo'
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: FUSO })
const momento = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })

export function EmTratamento() {
  const [lista, setLista] = useState<PacienteEmTratamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [subAba, setSubAba] = useState<SubAba>('todos')
  const [copiado, setCopiado] = useState<number | null>(null)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/reports/em-tratamento')
      if (!res.ok) throw new Error(String(res.status))
      setLista(await res.json())
    } catch {
      setErro('Não foi possível carregar a lista. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function copiar(p: PacienteEmTratamento) {
    setAviso(null)
    try {
      await navigator.clipboard.writeText(mensagemPara(p.etiqueta, p.nome))
    } catch {
      setAviso({ id: p.patientId, texto: 'Não deu para copiar. Selecione o texto acima e copie manualmente.' })
      return
    }
    setCopiado(p.patientId)
    setTimeout(() => setCopiado(atual => (atual === p.patientId ? null : atual)), 2000)
  }

  async function alternarEnviada(p: PacienteEmTratamento) {
    setSalvando(p.patientId)
    setAviso(null)
    try {
      const res = p.enviada
        ? await fetch(`/api/reports/em-tratamento/enviada?patient_id=${p.patientId}`, { method: 'DELETE' })
        : await fetch('/api/reports/em-tratamento/enviada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: p.patientId, template: p.etiqueta }),
          })
      if (!res.ok) throw new Error(String(res.status))
      const enviada = p.enviada ? null : await res.json()
      setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? { ...x, enviada } : x)))
    } catch {
      setAviso({ id: p.patientId, texto: 'Não foi possível salvar a marcação. Tente de novo.' })
    } finally {
      setSalvando(null)
    }
  }

  if (!lista) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
        {erro ?? 'Carregando...'}
      </div>
    )
  }

  const visiveis = listarSubAba(lista, subAba)
  const enviadas = visiveis.filter(p => p.enviada).length
  const contagem: Record<SubAba, number> = {
    todos: lista.length,
    nao_veio: lista.filter(p => p.etiqueta !== 'verde').length,
    veio: lista.filter(p => p.etiqueta === 'verde').length,
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex gap-1 flex-wrap">
          {SUB_ABAS.map(s => (
            <button
              key={s.key}
              onClick={() => setSubAba(s.key)}
              aria-pressed={subAba === s.key}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                subAba === s.key ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {`${s.label} (${contagem[s.key]})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          🟢 veio nos últimos {DIAS_VERDE} dias · 🟡 {DIAS_VERDE + 1} a {DIAS_AMARELA} dias sem vir · 🔴 mais de {DIAS_AMARELA} dias
        </p>
        <p className="text-sm font-medium text-gray-700">
          {enviadas} de {visiveis.length} mensagens enviadas nesta semana
        </p>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      {visiveis.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">Ninguém nesta lista.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map(p => (
            <li key={p.patientId} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/pacientes/${p.patientId}`} className="font-semibold text-gray-800 hover:text-violet-700 break-words">
                    {p.nome}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última aplicação: {dia(p.ultimaAplicacao)}
                    {p.etiqueta !== 'verde' && ` · há ${p.diasSemVir} dias sem vir`}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${ETIQUETA[p.etiqueta].classe}`}>
                  {ETIQUETA[p.etiqueta].icone} {ETIQUETA[p.etiqueta].nome}
                </span>
              </div>

              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 select-text whitespace-pre-line">
                {mensagemPara(p.etiqueta, p.nome)}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copiar(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    copiado === p.patientId ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copiado === p.patientId
                    ? (<><span aria-hidden="true">✅</span> Copiada!</>)
                    : (<><span aria-hidden="true">📋</span> Copiar mensagem</>)}
                </button>
                <button
                  onClick={() => alternarEnviada(p)}
                  disabled={salvando !== null}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                    p.enviada
                      ? 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      : 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                  }`}
                >
                  {p.enviada
                    ? (<><span aria-hidden="true">↩</span> Desfazer</>)
                    : (<><span aria-hidden="true">✓</span> Marcar como enviada</>)}
                </button>
                {p.enviada && (
                  <span className="text-xs text-green-700">
                    ✓ Enviada por {p.enviada.sentBy ?? '—'} · {momento(p.enviada.sentAt)}
                    {p.enviada.template !== p.etiqueta &&
                      ` (modelo ${ETIQUETA[p.enviada.template]?.nome.toLowerCase() ?? p.enviada.template})`}
                  </span>
                )}
              </div>
              {aviso?.id === p.patientId && (
                <p role="alert" className="text-xs text-red-600">{aviso.texto}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
