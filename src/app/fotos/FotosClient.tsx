'use client'

import { useCallback, useRef, useState } from 'react'
import { chaveNome } from '@/lib/implantes'
import { ACCEPT_IMAGENS } from '@/lib/tipos-de-imagem'
import type { FotoAvulsa, Montagem, PastaComContagem } from '@/lib/fotos-db'
import { fmtData, fmtDataHora, type MontadorProps, type Paciente } from './compartilhado'
import Montador from './Montador'

interface Props {
  montagensIniciais: Montagem[]
  pessoasIniciais: PastaComContagem[]
  /** Repassada ao montador, que a usa no passo "de quem é?". */
  pacientes: Paciente[]
}

export default function FotosClient({ montagensIniciais, pessoasIniciais, pacientes }: Props) {
  const [montagens, setMontagens] = useState<Montagem[]>(montagensIniciais)
  const [pessoas, setPessoas] = useState<PastaComContagem[]>(pessoasIniciais)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<number | null>(null)

  // `null` = montador fechado. Aberto guarda a pasta já escolhida (ou null para
  // o montador perguntar de quem é).
  const [montador, setMontador] = useState<{ pessoaId: number | null } | null>(null)

  // Pasta aberta de quem não tem card
  const [pastaAberta, setPastaAberta] = useState<PastaComContagem | null>(null)
  const [fotosDaPasta, setFotosDaPasta] = useState<FotoAvulsa[]>([])
  const [carregandoFotos, setCarregandoFotos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  /**
   * O que a Task 10 chama ao salvar: a montagem nova entra no topo da galeria
   * sem recarregar a página. O `filter` evita linha dobrada se o montador
   * chamar duas vezes com o mesmo registro.
   */
  const aoMontar = useCallback((nova: Montagem) => {
    setMontagens(anteriores => [nova, ...anteriores.filter(m => m.id !== nova.id)])
    setMontador(null)
  }, [])

  // A busca compara pela chave normalizada (sem acento, sem caixa, espaço
  // colapsado) nos DOIS lados — é a mesma função que o resto do sistema usa para
  // decidir se dois nomes são a mesma pessoa.
  const chaveBusca = chaveNome(busca)
  const montagensFiltradas = chaveBusca
    ? montagens.filter(m => chaveNome(m.nome).includes(chaveBusca))
    : montagens
  const pessoasFiltradas = chaveBusca
    ? pessoas.filter(p => chaveNome(p.nome).includes(chaveBusca))
    : pessoas

  function baixar(m: Montagem) {
    // Sem `?thumb=1`: aqui é o PNG inteiro, que é o que o dono manda no WhatsApp.
    window.location.href = `/api/fotos/montagens/${m.id}/imagem`
  }

  async function excluirMontagem(m: Montagem) {
    if (!confirm('Excluir este antes e depois?')) return
    setExcluindoId(m.id)
    setErro(null)
    try {
      const r = await fetch(`/api/fotos/montagens/${m.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Não foi possível excluir')
      setMontagens(anteriores => anteriores.filter(x => x.id !== m.id))
    } catch {
      setErro('Não foi possível excluir a montagem. Tente de novo.')
    } finally {
      setExcluindoId(null)
    }
  }

  async function abrirPasta(p: PastaComContagem) {
    setPastaAberta(p)
    setFotosDaPasta([])
    setCarregandoFotos(true)
    setErro(null)
    try {
      const r = await fetch(`/api/fotos/pessoas/${p.id}/fotos`)
      const dados = await r.json()
      setFotosDaPasta(Array.isArray(dados) ? dados : [])
    } catch {
      setErro('Não foi possível carregar as fotos desta pasta.')
    } finally {
      setCarregandoFotos(false)
    }
  }

  /** Mantém a contagem do cartão da pasta igual ao que está na tela. */
  function ajustarContagem(pessoaId: number, delta: number) {
    setPessoas(anteriores => anteriores.map(p =>
      p.id === pessoaId ? { ...p, fotos: Math.max(0, p.fotos + delta) } : p,
    ))
    setPastaAberta(atual => (
      atual && atual.id === pessoaId ? { ...atual, fotos: Math.max(0, atual.fotos + delta) } : atual
    ))
  }

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois de um erro
    if (!arquivo || !pastaAberta) return

    setEnviando(true)
    setErro(null)
    try {
      const corpo = new FormData()
      corpo.append('file', arquivo)
      const r = await fetch(`/api/fotos/pessoas/${pastaAberta.id}/fotos`, { method: 'POST', body: corpo })
      const dados = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof dados?.error === 'string' ? dados.error : 'Não foi possível enviar a foto')
      setFotosDaPasta(anteriores => [dados as FotoAvulsa, ...anteriores])
      ajustarContagem(pastaAberta.id, 1)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar a foto')
    } finally {
      setEnviando(false)
    }
  }

  async function excluirFoto(f: FotoAvulsa) {
    if (!pastaAberta) return
    if (!confirm('Excluir esta foto?')) return
    setErro(null)
    try {
      const r = await fetch(`/api/fotos/pessoas/${pastaAberta.id}/fotos/${f.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Não foi possível excluir')
      setFotosDaPasta(anteriores => anteriores.filter(x => x.id !== f.id))
      ajustarContagem(pastaAberta.id, -1)
    } catch {
      setErro('Não foi possível excluir a foto. Tente de novo.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fotos</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Antes e depois guardados, de pacientes e de quem não tem card
            </p>
          </div>
          <button
            onClick={() => setMontador({ pessoaId: null })}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm shrink-0"
          >
            + Novo antes e depois
          </button>
        </div>

        {/* Busca — filtra a galeria e as pastas ao mesmo tempo */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar pelo nome..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 shadow-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {erro}
          </div>
        )}

        {/* O montador de 4 passos. A `key` força um montador NOVO quando o dono
            abre a partir de outra pasta: sem ela o componente só receberia uma
            prop diferente e continuaria no passo onde estava, com a pessoa
            errada escolhida. */}
        {montador && (
          <Montador
            key={montador.pessoaId ?? 'sem-pasta'}
            pacientes={pacientes}
            pessoas={pessoas}
            pessoaInicial={montador.pessoaId}
            onPronto={aoMontar}
            onFechar={() => setMontador(null)}
          />
        )}

        {/* Galeria de montagens */}
        {montagens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <p className="text-sm text-gray-600">Nenhum antes e depois guardado ainda.</p>
            <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
              Até agora as montagens só eram baixadas e não ficavam no sistema — as que
              você fizer de agora em diante aparecem aqui.
            </p>
          </div>
        ) : montagensFiltradas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Nenhum antes e depois com esse nome.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {montagensFiltradas.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                {/* Sempre a MINIATURA (`?thumb=1`). O PNG inteiro tem dezenas de
                    MB e uma grade cheia deles travaria o navegador do dono — ele
                    só sai no clique de Baixar. */}
                <img
                  src={`/api/fotos/montagens/${m.id}/imagem?thumb=1`}
                  alt={`Antes e depois de ${m.nome}`}
                  loading="lazy"
                  className="w-full h-44 object-contain bg-gray-50 border-b border-gray-100"
                />

                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 min-w-0 break-words">{m.nome}</p>
                    {/* Selo da identidade do Instituto: o dono precisa saber qual
                        marca saiu naquela imagem. */}
                    {m.identidade === 'estetica' && (
                      <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                        Estética
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-600">
                    {fmtData(m.data_antes)} <span className="text-gray-400">→</span> {fmtData(m.data_depois)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {m.created_by ? `por ${m.created_by} em ` : 'em '}{fmtDataHora(m.created_at)}
                  </p>

                  <div className="flex items-center gap-2 pt-1 mt-auto">
                    <button
                      onClick={() => baixar(m)}
                      className="flex-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
                    >
                      Baixar
                    </button>
                    <button
                      onClick={() => excluirMontagem(m)}
                      disabled={excluindoId === m.id}
                      className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {excluindoId === m.id ? '...' : 'Excluir'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pessoas sem card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Pessoas sem card</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Fotos de quem não é paciente do sistema, guardadas por nome
            </p>
          </div>

          {pessoas.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">
              Nenhuma pasta ainda. Ela nasce quando você monta um antes e depois de
              alguém sem card.
            </p>
          ) : pessoasFiltradas.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Nenhuma pasta com esse nome.</p>
          ) : (
            <div className="space-y-2">
              {pessoasFiltradas.map(p => (
                <button
                  key={p.id}
                  onClick={() => (pastaAberta?.id === p.id ? setPastaAberta(null) : abrirPasta(p))}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    pastaAberta?.id === p.id
                      ? 'border-violet-300 bg-violet-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-800 min-w-0 break-words">{p.nome}</span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {p.fotos} {p.fotos === 1 ? 'foto' : 'fotos'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Pasta aberta */}
          {pastaAberta && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-700">{pastaAberta.nome}</h3>
                <div className="flex items-center gap-2">
                  <input
                    ref={inputArquivo}
                    type="file"
                    accept={ACCEPT_IMAGENS}
                    className="hidden"
                    onChange={enviarFoto}
                  />
                  <button
                    onClick={() => inputArquivo.current?.click()}
                    disabled={enviando}
                    className="px-3 py-1.5 border border-violet-300 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-colors"
                  >
                    {enviando ? 'Enviando...' : 'Enviar foto'}
                  </button>
                  {/* Abre o montador já com esta pasta escolhida. O montador
                      aparece no topo da tela, e a pasta fica no fim dela: sem o
                      scroll o clique pareceria não ter feito nada. */}
                  <button
                    onClick={() => {
                      setMontador({ pessoaId: pastaAberta.id })
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    Montar antes e depois
                  </button>
                  <button
                    onClick={() => setPastaAberta(null)}
                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {carregandoFotos ? (
                <p className="text-sm text-gray-400 py-6 text-center animate-pulse">Carregando...</p>
              ) : fotosDaPasta.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  Nenhuma foto nesta pasta. Envie a primeira.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fotosDaPasta.map(f => (
                    <div key={f.id} className="relative group rounded-xl overflow-hidden border border-gray-200">
                      {/* Rota de imagem da própria origem, nunca URL assinada do
                          S3: a tela fica aberta mais que os 15 min da assinatura. */}
                      <img
                        src={`/api/fotos/pessoas/${pastaAberta.id}/fotos/${f.id}/imagem`}
                        alt={f.original_name}
                        loading="lazy"
                        className="w-full h-32 object-cover bg-gray-50"
                      />
                      <div className="p-2 bg-white">
                        <p className="text-[11px] text-gray-500 truncate">{fmtDataHora(f.created_at)}</p>
                      </div>
                      <button
                        onClick={() => excluirFoto(f)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Excluir foto"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
