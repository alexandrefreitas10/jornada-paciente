'use client'

import { useCallback, useEffect, useState } from 'react'
import { centsToReais } from '@/lib/money'
import { normalizarNome } from '@/lib/stock-actives'
import { ordenarPorAumento, resumirGrupo, type Compra, type GrupoPreco, type NivelVariacao } from '@/lib/precos'

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

export function PrecosTab() {
  const [grupos, setGrupos] = useState<GrupoPreco[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/estoque/precos')
      if (!res.ok) throw new Error(String(res.status))
      setGrupos(await res.json())
    } catch {
      setErro('Não foi possível carregar os preços. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  if (!grupos) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
        {erro ?? 'Carregando...'}
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
