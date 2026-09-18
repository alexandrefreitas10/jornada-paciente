'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  listarSubAba, mensagemPara, mensagemLonga, classificar, INTERVALOS,
  type Etiqueta, type PacienteEmTratamento, type SubAba,
} from '@/lib/em-tratamento'
import { validarMotivo, MOTIVO_MAX } from '@/lib/arquivo-paciente'

const SUB_ABAS: { key: SubAba; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'nao_veio', label: 'Não veio' },
  { key: 'veio', label: 'Veio' },
  { key: 'aguardando', label: 'Aguardando nova prescrição' },
]

const ETIQUETA: Record<Etiqueta, { icone: string; nome: string; classe: string }> = {
  verde: { icone: '🟢', nome: 'Em dia', classe: 'bg-green-50 text-green-800 border-green-300' },
  amarela: { icone: '🟡', nome: 'Faltou', classe: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  vermelha: { icone: '🔴', nome: 'Crítico', classe: 'bg-red-50 text-red-700 border-red-300' },
  aguardando: { icone: '🔵', nome: 'Aguardando', classe: 'bg-blue-50 text-blue-800 border-blue-300' },
}

const FUSO = 'America/Sao_Paulo'
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: FUSO })
const momento = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })

/**
 * `mensagemLonga` (regra de linhas/caracteres) é só uma estimativa: numa tela
 * larga, ~190-206 caracteres cabem em 2 linhas, então a seta apareceria sem
 * ter nada escondido. Por isso medimos o `<p>` de verdade e só recolhemos
 * (e mostramos a seta) quando o texto realmente não cabe nas 3 linhas.
 */
function MensagemRecolhivel({ id, texto }: { id: string; texto: string }) {
  const longa = mensagemLonga(texto)
  const [aberta, setAberta] = useState(false)
  const [cabe, setCabe] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !longa || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      // Sem layout (ex.: jsdom nos testes) clientHeight é 0: fica a estimativa.
      // Aberta não mede: sem o recorte, o texto sempre "cabe".
      if (aberta || el.clientHeight === 0) return
      setCabe(el.scrollHeight <= el.clientHeight + 1)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [longa, aberta, texto])

  const recolhivel = longa && !cabe

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
      <p
        ref={ref}
        id={id}
        className={`text-sm text-gray-700 select-text whitespace-pre-line ${
          recolhivel && !aberta ? 'line-clamp-3' : ''
        }`}
      >
        {texto}
      </p>
      {recolhivel && (
        <button
          type="button"
          onClick={() => setAberta(atual => !atual)}
          aria-expanded={aberta}
          aria-controls={id}
          className="mt-1 text-xs font-medium text-violet-700 hover:text-violet-900"
        >
          {aberta ? '▲ Recolher' : '▼ Ver mensagem completa'}
        </button>
      )}
    </div>
  )
}

export function EmTratamento() {
  const [lista, setLista] = useState<PacienteEmTratamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [subAba, setSubAba] = useState<SubAba>('todos')
  const [copiado, setCopiado] = useState<number | null>(null)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null)
  const [arquivando, setArquivando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvandoArquivo, setSalvandoArquivo] = useState(false)
  const [salvandoIntervalo, setSalvandoIntervalo] = useState<number | null>(null)

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

  async function alterarIntervalo(p: PacienteEmTratamento, novo: number) {
    if (novo === p.intervalo) return
    const anterior = p
    // Otimista: a etiqueta muda na hora; volta se o servidor recusar.
    const situacao = classificar(
      new Date(p.ultimaAplicacao),
      p.ultimaFolha ? new Date(p.ultimaFolha) : null,
      new Date(),
      novo,
    )
    const atualizado: PacienteEmTratamento = situacao
      ? { ...p, intervalo: novo, etiqueta: situacao.etiqueta, diasSemVir: situacao.diasSemVir, diasAguardando: situacao.diasAguardando ?? null }
      : { ...p, intervalo: novo }
    setAviso(null)
    setSalvandoIntervalo(p.patientId)
    setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? atualizado : x)))
    try {
      const res = await fetch('/api/reports/em-tratamento/intervalo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: p.patientId, intervalo: novo }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? anterior : x)))
      setAviso({ id: p.patientId, texto: 'Não foi possível salvar o intervalo. Tente de novo.' })
    } finally {
      setSalvandoIntervalo(null)
    }
  }

  function abrirArquivamento(id: number) {
    setAviso(null)
    setMotivo('')
    setArquivando(id)
  }

  function cancelarArquivamento() {
    setArquivando(null)
    setMotivo('')
  }

  async function arquivar(p: PacienteEmTratamento) {
    const texto = validarMotivo(motivo)
    if (!texto) return
    setSalvandoArquivo(true)
    setAviso(null)
    try {
      const res = await fetch(`/api/patients/${p.patientId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: texto, origem: 'em_tratamento' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setLista(atual => atual && atual.filter(x => x.patientId !== p.patientId))
      setArquivando(null)
      setMotivo('')
    } catch {
      setAviso({ id: p.patientId, texto: 'Não foi possível mover para Pacientes Antigos. Tente de novo.' })
    } finally {
      setSalvandoArquivo(false)
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
    todos: lista.filter(p => p.etiqueta !== 'aguardando').length,
    nao_veio: lista.filter(p => p.etiqueta === 'amarela' || p.etiqueta === 'vermelha').length,
    veio: lista.filter(p => p.etiqueta === 'verde').length,
    aguardando: lista.filter(p => p.etiqueta === 'aguardando').length,
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
          🟢 dentro do intervalo · 🟡 passou do intervalo · 🔴 mais de 28 dias (ou 2 intervalos, para quem aplica a cada 15+ dias) · 🔵 prescrição finalizada
        </p>
        <p className="text-sm font-medium text-gray-700">
          {enviadas} de {visiveis.length} mensagens enviadas nesta semana
        </p>
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
                    {p.etiqueta === 'aguardando' && p.ultimaFolha
                      ? `Prescrição finalizada em ${dia(p.ultimaFolha)} · há ${p.diasAguardando ?? 0} dias · última aplicação: ${dia(p.ultimaAplicacao)}`
                      : `Última aplicação: ${dia(p.ultimaAplicacao)}${
                          p.etiqueta === 'amarela' || p.etiqueta === 'vermelha' ? ` · há ${p.diasSemVir} dias sem vir` : ''
                        }`}
                  </p>
                  <label className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                    Aplicação a cada
                    <select
                      aria-label="Intervalo de aplicação"
                      value={p.intervalo}
                      onChange={e => alterarIntervalo(p, Number(e.target.value))}
                      disabled={salvandoIntervalo === p.patientId}
                      className="border border-gray-300 rounded-md px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
                    >
                      {!(INTERVALOS as readonly number[]).includes(p.intervalo) && (
                        <option value={p.intervalo}>{p.intervalo} dias</option>
                      )}
                      {INTERVALOS.map(n => (
                        <option key={n} value={n}>{n} dias</option>
                      ))}
                    </select>
                  </label>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${ETIQUETA[p.etiqueta].classe}`}>
                  {ETIQUETA[p.etiqueta].icone} {ETIQUETA[p.etiqueta].nome}
                </span>
              </div>

              <MensagemRecolhivel id={`mensagem-${p.patientId}`} texto={mensagemPara(p.etiqueta, p.nome)} />

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
                {p.etiqueta !== 'verde' && arquivando !== p.patientId && (
                  <button
                    type="button"
                    onClick={() => abrirArquivamento(p.patientId)}
                    disabled={salvandoArquivo}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <span aria-hidden="true">📦</span> Mover para Pacientes Antigos
                  </button>
                )}
                {p.enviada && (
                  <span className="text-xs text-green-700">
                    ✓ Enviada por {p.enviada.sentBy ?? '—'} · {momento(p.enviada.sentAt)}
                    {p.enviada.template !== p.etiqueta &&
                      ` (modelo ${ETIQUETA[p.enviada.template]?.nome.toLowerCase() ?? p.enviada.template})`}
                  </span>
                )}
              </div>
              {arquivando === p.patientId && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                  <label htmlFor={`motivo-${p.patientId}`} className="block text-xs font-medium text-amber-900">
                    Observações — por que o paciente parou?
                  </label>
                  <textarea
                    id={`motivo-${p.patientId}`}
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    rows={3}
                    maxLength={MOTIVO_MAX}
                    autoFocus
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={cancelarArquivamento}
                      disabled={salvandoArquivo}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-white disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => arquivar(p)}
                      disabled={salvandoArquivo || !validarMotivo(motivo)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {salvandoArquivo ? 'Movendo...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
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
