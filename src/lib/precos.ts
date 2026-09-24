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

// "82,00", "1.250,50", "R$ 82,00" valem; "82.00", "12abc", "1,2,3" não.
// reaisToCents sozinho trata ponto como milhar e ignora lixo: bom para o
// campo do admin que digita aos poucos, perigoso aqui, onde o texto vem da
// leitura da nota e o valor errado fica gravado para sempre.
const FORMATO_BR = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$|^\d+(,\d{1,2})?$/

/** R$ 1.000.000,00 por unidade: acima disso é engano de digitação, e o
 *  total estouraria o limite da coluna, derrubando a entrada inteira. */
export const LIMITE_CENTAVOS = 100_000_000

/** Centavos, ou `null` se não for um valor brasileiro válido e positivo. */
export function valorParaCentavos(texto: string): number | null {
  const limpo = (texto ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (!FORMATO_BR.test(limpo)) return null
  const centavos = reaisToCents(limpo)
  return centavos > 0 && centavos <= LIMITE_CENTAVOS ? centavos : null
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
  const centavos = valorParaCentavos(dados.valor ?? '')
  const laboratorio = (dados.laboratorio ?? '').trim()
  const quantidade = Number(dados.quantidade)

  const erros: ('valor' | 'laboratorio' | 'quantidade')[] = []
  if (centavos === null) erros.push('valor')
  if (!laboratorio) erros.push('laboratorio')
  if (!(quantidade > 0)) erros.push('quantidade')

  if (erros.length || centavos === null) return { ok: false, erros }
  return { ok: true, centavos, laboratorio, quantidade }
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
 * Unidade só para COMPARAR. A nota fiscal costuma vir no plural ("caixas",
 * "frascos") e o cadastro do estoque no singular ("caixa", "frasco"): sem
 * tirar o "s" o mesmo produto comprado das duas formas ficava marcado como
 * "unidade mudou" para sempre, e o percentual — a razão da aba existir —
 * nunca mais aparecia. O "s" só cai quando sobram pelo menos duas letras,
 * para não transformar unidades curtas em outra coisa.
 * Não muda o que é gravado nem o que é exibido.
 */
function chaveUnidade(unidade: string | null): string {
  const base = normalizarNome(unidade ?? '')
  return base.length > 2 && base.endsWith('s') ? base.slice(0, -1) : base
}

/**
 * Resume um par produto+laboratório. Se a unidade mudou entre as duas últimas
 * compras (caixa → frasco), o percentual não significa nada e some.
 */
export function resumirGrupo(grupo: GrupoPreco): ResumoPreco {
  // Duas compras na MESMA data mantêm a ordem que o chamador passou:
  // listarPrecos ordena `purchased_at DESC, id DESC` no banco e Array.sort é
  // estável — não tire esse ORDER BY sem revisar aqui.
  const historico = [...grupo.historico].sort((a, b) => b.data.localeCompare(a.data))
  const ultimo = historico[0]
  if (!ultimo) throw new Error('resumirGrupo: grupo sem histórico')
  const anterior = historico[1] ?? null
  const unidadeMudou = !!anterior && chaveUnidade(anterior.unidade) !== chaveUnidade(ultimo.unidade)
  const pct = unidadeMudou ? null : variacao(anterior?.centavos ?? null, ultimo.centavos)
  return { ultimo, anterior, variacao: pct, nivel: nivelVariacao(pct), unidadeMudou }
}

/** Maior aumento primeiro; quem não tem comparação vai para o fim. */
export function ordenarPorAumento(grupos: GrupoPreco[]): GrupoPreco[] {
  return [...grupos].sort((a, b) => {
    const va = resumirGrupo(a).variacao
    const vb = resumirGrupo(b).variacao
    if (va === null && vb === null) {
      return a.produto.localeCompare(b.produto, 'pt-BR') || a.laboratorio.localeCompare(b.laboratorio, 'pt-BR')
    }
    if (va === null) return 1
    if (vb === null) return -1
    return vb - va || a.produto.localeCompare(b.produto, 'pt-BR') || a.laboratorio.localeCompare(b.laboratorio, 'pt-BR')
  })
}
