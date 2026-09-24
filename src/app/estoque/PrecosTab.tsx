'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { centsToReais } from '@/lib/money'
import { normalizarNome } from '@/lib/stock-actives'
import { ordenarPorAumento, resumirGrupo, validarCompra, type Compra, type GrupoPreco, type NivelVariacao } from '@/lib/precos'

const NIVEL: Record<NivelVariacao, { icone: string; classe: string }> = {
  alta: { icone: '🔴', classe: 'text-red-700 bg-red-50 border-red-200' },
  atencao: { icone: '🟡', classe: 'text-yellow-800 bg-yellow-50 border-yellow-200' },
  estavel: { icone: '', classe: 'text-gray-600 bg-gray-50 border-gray-200' },
  queda: { icone: '🟢', classe: 'text-green-700 bg-green-50 border-green-200' },
  primeira: { icone: '', classe: 'text-gray-500 bg-gray-50 border-gray-200' },
}

const FONTE: Record<Compra['fonte'], string> = {
  nf: 'nota fiscal',
  manual: 'lançamento manual',
  retroativo: 'nota antiga',
}

// centsToReais devolve '' para zero — aqui o preço é sempre exibido.
const reais = (centavos: number) => `R$ ${centsToReais(centavos) || '0,00'}`
// A data vem como AAAA-MM-DD (DATE). O meio-dia evita que o fuso puxe o dia pra trás.
const dia = (data: string) => new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
// A leitura da nota devolve JSON de modelo: qualquer campo pode chegar com outro
// tipo. Um unit_price numérico derrubaria o .replace de valorParaCentavos no
// render, então tudo vira string antes de entrar no estado.
const texto = (v: unknown) => (v == null ? '' : String(v))

/** Uma linha da nota antiga em edição. Tudo texto: é formulário, não modelo. */
interface LinhaNota {
  produto: string
  quantidade: string
  unidade: string
  valor: string
  laboratorio: string
}

type ItemLido = Partial<Record<'name' | 'quantity' | 'unit' | 'unit_price' | 'laboratory' | 'purchase_date', unknown>>

export function PrecosTab() {
  const [grupos, setGrupos] = useState<GrupoPreco[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  // Nota antiga (retroativo): só preço, sem entrada de estoque.
  // `erroNota` é separado de `erro` de propósito: o erro da lista aparece no
  // lugar da lista, o da nota dentro do cartão da nota — um não pode apagar o outro.
  const [linhas, setLinhas] = useState<LinhaNota[] | null>(null)
  const [erroNota, setErroNota] = useState<string | null>(null)
  const [dataNota, setDataNota] = useState('')
  const [s3Key, setS3Key] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/estoque/precos')
      if (!res.ok) throw new Error(String(res.status))
      const dados: unknown = await res.json()
      if (!Array.isArray(dados)) throw new Error('resposta fora do formato')
      // resumirGrupo estoura em grupo sem compra e não há error boundary nesta
      // árvore: histórico vazio nunca entra no estado.
      setGrupos((dados as GrupoPreco[]).filter(g => Array.isArray(g?.historico) && g.historico.length > 0))
    } catch {
      setErro('Não foi possível carregar os preços. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  async function lerNota(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setLendo(true)
    setErroNota(null)
    try {
      const form = new FormData()
      form.append('file', arquivo)
      const res = await fetch('/api/estoque/scan-nf', { method: 'POST', body: form })
      if (!res.ok) throw new Error(String(res.status))
      const dados = await res.json()
      const brutos: ItemLido[] = Array.isArray(dados?.items)
        ? (dados.items as unknown[]).filter((i): i is ItemLido => !!i && typeof i === 'object')
        : []
      if (dados?.parseError || brutos.length === 0) {
        setErroNota(typeof dados?.parseError === 'string' ? dados.parseError : 'Não foi possível ler os itens da nota.')
        return
      }
      setLinhas(brutos.map(i => ({
        produto: texto(i.name),
        quantidade: i.quantity == null ? '1' : texto(i.quantity),
        unidade: texto(i.unit),
        valor: texto(i.unit_price),
        laboratorio: texto(i.laboratory),
      })))
      const lida = brutos.map(i => texto(i.purchase_date)).find(d => DATA_ISO.test(d))
      setDataNota(lida ?? hoje())
      setS3Key(typeof dados?.s3Key === 'string' ? dados.s3Key : null)
    } catch {
      setErroNota('Não foi possível ler a nota. Tente de novo.')
    } finally {
      setLendo(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  async function salvarNota() {
    // O botão já está desabilitado nesses casos; a guarda existe para que um
    // clique em corrida não mande nota pela metade.
    if (!linhas || linhas.length === 0 || notaFaltando.length > 0 || !dataValida) return
    setSalvando(true)
    setErroNota(null)
    try {
      const res = await fetch('/api/estoque/precos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: linhas.map(l => ({
            produto: l.produto,
            valor: l.valor,
            laboratorio: l.laboratorio,
            quantidade: Number(l.quantidade),
            unidade: l.unidade || null,
            data: dataNota,
            nfS3Key: s3Key,
          })),
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setLinhas(null)
      setS3Key(null)
      setDataNota('')
      await carregar()
    } catch {
      // As linhas ficam na tela: nada do que foi digitado se perde numa falha.
      setErroNota('Não foi possível salvar os preços. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  const dataValida = DATA_ISO.test(dataNota)
  const notaFaltando = (linhas ?? [])
    .filter(l => !l.produto.trim() || !validarCompra({ valor: l.valor, laboratorio: l.laboratorio, quantidade: Number(l.quantidade) }).ok)
    .map(l => l.produto.trim() || '(sem nome)')
  const podeSalvar = !!linhas && linhas.length > 0 && notaFaltando.length === 0 && dataValida

  // Fica FORA do `if (!grupos)`: quando a lista falha, a única ação da aba não
  // pode sumir junto com ela.
  const cartaoNota = (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={lendo}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {lendo ? 'Lendo a nota...' : '📄 Registrar preços de nota antiga'}
        </button>
        <p className="text-xs text-gray-500">Isto não dá entrada no estoque — só registra o preço.</p>
      </div>
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*,application/pdf"
        aria-label="Foto ou PDF da nota antiga"
        onChange={lerNota}
        className="hidden"
      />
      {erroNota && <p role="alert" className="text-sm text-red-600">{erroNota}</p>}

      {linhas && (
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Data da compra
            <input
              type="date"
              value={dataNota}
              onChange={e => setDataNota(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </label>
          {linhas.map((l, idx) => (
            <div key={idx} className="flex gap-2 flex-wrap items-center bg-gray-50 border border-gray-100 rounded-lg p-2">
              <input value={l.produto} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, produto: e.target.value } : x))}
                aria-label={`Produto ${idx + 1}`} placeholder="Produto *" className="flex-1 min-w-[140px] border border-gray-200 rounded px-2 py-1 text-sm" />
              <input value={l.quantidade} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))}
                aria-label={`Quantidade ${idx + 1}`} placeholder="Qtd" className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
              <input value={l.unidade} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, unidade: e.target.value } : x))}
                aria-label={`Unidade ${idx + 1}`} placeholder="Un" className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
              <input value={l.valor} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                aria-label={`Valor unitário ${idx + 1}`} placeholder="Valor unit. R$ *" className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" />
              <input value={l.laboratorio} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, laboratorio: e.target.value } : x))}
                aria-label={`Laboratório ${idx + 1}`} placeholder="Laboratório *" className="w-32 border border-gray-200 rounded px-2 py-1 text-sm" />
              <button type="button" onClick={() => setLinhas(p => p!.filter((_, i) => i !== idx))}
                aria-label={`Remover ${l.produto || 'item'}`} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
            </div>
          ))}
          {notaFaltando.length > 0 && (
            <p className="text-sm text-amber-800">Falta valor, laboratório ou quantidade em: {notaFaltando.join(', ')}.</p>
          )}
          {!dataValida && <p className="text-sm text-amber-800">Informe a data da compra.</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvarNota}
              disabled={salvando || !podeSalvar}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar preços'}
            </button>
            <button type="button" onClick={() => { setLinhas(null); setS3Key(null); setDataNota(''); setErroNota(null) }}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (!grupos) {
    return (
      <div className="space-y-4">
        {cartaoNota}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
          {erro ?? 'Carregando...'}
        </div>
      </div>
    )
  }

  // Lista derivada: ordenar e filtrar nunca mexem no que veio do servidor.
  const termo = normalizarNome(busca)
  const visiveis = ordenarPorAumento(grupos).filter(g =>
    !termo || normalizarNome(`${g.produto} ${g.laboratorio}`).includes(termo)
  )

  return (
    <div className="space-y-4">
      {cartaoNota}

      {/* A lista já carregou uma vez: um erro aqui é de recarga (depois de salvar
          uma nota, por exemplo) e a lista na tela está velha — precisa aparecer. */}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          type="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto ou laboratório"
          aria-label="Buscar produto ou laboratório"
          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      <p className="text-xs text-gray-500">
        Mostra as compras lançadas com valor. Ajuste de quantidade não entra, e um preço
        lançado errado só se corrige lançando a compra certa.
      </p>

      {grupos.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          Nenhum preço registrado ainda. Eles aparecem aqui conforme as entradas forem lançadas.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">Nada encontrado para &quot;{busca.trim()}&quot;.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map(g => {
            const r = resumirGrupo(g)
            const nivel = NIVEL[r.nivel]
            const abertoAqui = aberto === g.chave
            return (
              <li key={g.chave} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 break-words">{g.produto} · {g.laboratorio}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {reais(r.ultimo.centavos)}{r.ultimo.unidade ? ` / ${r.ultimo.unidade}` : ''} · {dia(r.ultimo.data)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${nivel.classe}`}>
                    {r.variacao === null
                      ? (r.unidadeMudou ? 'unidade mudou' : 'primeira compra')
                      : `${nivel.icone} ${pct(r.variacao)}`}
                  </span>
                </div>

                {r.unidadeMudou && r.anterior && (
                  <p className="text-xs text-gray-500">
                    unidade mudou: {r.anterior.unidade ?? '—'} → {r.ultimo.unidade ?? '—'}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setAberto(a => (a === g.chave ? null : g.chave))}
                  aria-expanded={abertoAqui}
                  className="text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  {abertoAqui ? '▲ Fechar histórico' : `▼ Ver histórico (${g.historico.length})`}
                </button>

                {abertoAqui && (
                  <ul className="border-t border-gray-100 pt-2 space-y-1">
                    {[...g.historico].sort((a, b) => b.data.localeCompare(a.data)).map((c, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3 text-xs text-gray-600">
                        <span className="font-medium text-gray-800">{reais(c.centavos)}</span>
                        <span>{c.quantidade}{c.unidade ? ` ${c.unidade}` : ''}</span>
                        <span>{dia(c.data)}</span>
                        <span className="text-gray-400">{FONTE[c.fonte] ?? c.fonte}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
