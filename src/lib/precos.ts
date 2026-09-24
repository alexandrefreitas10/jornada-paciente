// Preços pagos por ativo: regras puras (sem banco, sem React), usadas pela
// tela e pela API para recusarem exatamente a mesma coisa.
import { reaisToCents } from './money'
import { normalizarNome } from './stock-actives'

/** Aumento a partir daqui é 🔴. */
export const ALTA_PCT = 10
/** Aumento a partir daqui é 🟡. */
export const ATENCAO_PCT = 5

export type Fonte = 'nf' | 'manual' | 'retroativo'
export type NivelVariacao = 'alta' | 'atencao' | 'estavel' | 'queda' | 'primeira'

export interface Compra {
  centavos: number
  quantidade: number
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte
}

export interface GrupoPreco {
  produto: string
  laboratorio: string
  chave: string
  historico: Compra[]
}

export interface ResumoPreco {
  ultimo: Compra
  anterior: Compra | null
  variacao: number | null
  nivel: NivelVariacao
  unidadeMudou: boolean
}

/** Produto e laboratório são agrupados por nome normalizado, não por id. */
export function chaveProduto(nome: string): string {
  return normalizarNome(nome ?? '')
}

export function chaveLaboratorio(nome: string): string {
  return normalizarNome(nome ?? '')
}

export type ResultadoValidacao =
  | { ok: true; centavos: number; laboratorio: string; quantidade: number }
  | { ok: false; erros: ('valor' | 'laboratorio' | 'quantidade')[] }

/** Valida o que a entrada exige: valor > 0, laboratório e quantidade > 0. */
export function validarCompra(dados: {
  valor: string
  laboratorio: string
  quantidade: number
}): ResultadoValidacao {
  const centavos = reaisToCents(dados.valor ?? '')
  const laboratorio = (dados.laboratorio ?? '').trim()
  const quantidade = Number(dados.quantidade)

  const erros: ('valor' | 'laboratorio' | 'quantidade')[] = []
  if (!(centavos > 0)) erros.push('valor')
  if (!laboratorio) erros.push('laboratorio')
  if (!(quantidade > 0)) erros.push('quantidade')

  return erros.length ? { ok: false, erros } : { ok: true, centavos, laboratorio, quantidade }
}

/** Percentual sobre a compra anterior; `null` quando não há anterior. */
export function variacao(anteriorCentavos: number | null, atualCentavos: number): number | null {
  if (!anteriorCentavos) return null
  return ((atualCentavos - anteriorCentavos) / anteriorCentavos) * 100
}

export function nivelVariacao(pct: number | null): NivelVariacao {
  if (pct === null) return 'primeira'
  if (pct >= ALTA_PCT) return 'alta'
  if (pct >= ATENCAO_PCT) return 'atencao'
  if (pct <= -ATENCAO_PCT) return 'queda'
  return 'estavel'
}

/**
 * Resume um par produto+laboratório. Se a unidade mudou entre as duas últimas
 * compras (caixa → frasco), o percentual não significa nada e some.
 */
export function resumirGrupo(grupo: GrupoPreco): ResumoPreco {
  const historico = [...grupo.historico].sort((a, b) => b.data.localeCompare(a.data))
  const ultimo = historico[0]
  const anterior = historico[1] ?? null
  const unidadeMudou = !!anterior && (anterior.unidade ?? '') !== (ultimo.unidade ?? '')
  const pct = unidadeMudou ? null : variacao(anterior?.centavos ?? null, ultimo.centavos)
  return { ultimo, anterior, variacao: pct, nivel: nivelVariacao(pct), unidadeMudou }
}

/** Maior aumento primeiro; quem não tem comparação vai para o fim. */
export function ordenarPorAumento(grupos: GrupoPreco[]): GrupoPreco[] {
  return [...grupos].sort((a, b) => {
    const va = resumirGrupo(a).variacao
    const vb = resumirGrupo(b).variacao
    if (va === null && vb === null) return a.produto.localeCompare(b.produto, 'pt-BR')
    if (va === null) return 1
    if (vb === null) return -1
    return vb - va || a.produto.localeCompare(b.produto, 'pt-BR')
  })
}
