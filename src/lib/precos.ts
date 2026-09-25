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
  ultimo: CompraAgrupada
  anterior: CompraAgrupada | null
  variacao: number | null
  nivel: NivelVariacao
  unidadeMudou: boolean
}

/**
 * Forma farmacêutica não distingue o ativo: o mesmo produto vem "Pellet" numa
 * nota e sem nada na outra. Dose e volume, sim — decisão do dono.
 */
export const PALAVRAS_FORMA = [
  'pellet', 'pellets', 'implante', 'implantes', 'frasco', 'frascos',
  'ampola', 'ampolas', 'comprimido', 'comprimidos', 'capsula', 'capsulas',
  'seringa', 'seringas', 'sache', 'saches', 'pote', 'potes',
]

/** "Pool de Aminoácidos" e "Pool Aminoácidos" são o mesmo produto. */
export const PALAVRAS_LIGACAO = ['de', 'da', 'do', 'das', 'dos']

const PALAVRAS_IGNORADAS = new Set([...PALAVRAS_FORMA, ...PALAVRAS_LIGACAO])

// "300 mg" e "300mg" são a mesma dose escrita de dois jeitos. Só cola quando a
// palavra seguinte ao número é uma unidade conhecida, para não grudar
// "b 12" (Complexo B 12) em "b12". Colar demais nunca separa dois nomes que já
// estavam juntos — só pode juntar —, então o risco aqui é baixo de propósito.
const NUMERO_E_UNIDADE = /(\d)\s+(mg|mcg|g|kg|ml|l|ui|ug|mm|cm)\b/g

/** Produto e laboratório são agrupados por nome normalizado, não por id. */
export function chaveProduto(nome: string): string {
  const base = normalizarNome(nome ?? '').replace(NUMERO_E_UNIDADE, '$1$2')
  const restante = base.split(' ').filter(p => p && !PALAVRAS_IGNORADAS.has(p)).join(' ')
  // Se o que sobrou não tem nenhuma palavra de verdade ("Frasco 3ml" → "3ml",
  // "Ampola 3ml" → "3ml"), a chave juntaria dois produtos diferentes — e preço
  // lançado não se corrige. Nesses casos vale o nome inteiro.
  return restante.split(' ').some(p => /^[a-z]+$/.test(p)) ? restante : base
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
export function chaveUnidade(unidade: string | null): string {
  const base = normalizarNome(unidade ?? '')
  return base.length > 2 && base.endsWith('s') ? base.slice(0, -1) : base
}

/** Uma linha do histórico depois de juntar os lançamentos repetidos da nota. */
export interface CompraAgrupada {
  centavos: number
  quantidade: number // somada
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte | null // null = os lançamentos juntados vieram de fontes diferentes
  lancamentos: number // quantas linhas do banco entraram nesta
}

/**
 * A nota fiscal quebra o mesmo ativo em várias linhas (20 + 30 + 40 frascos),
 * todas com o mesmo preço unitário. Para o histórico isso é uma compra só —
 * e, pior, deixava a variação comparar a nota com ela mesma e marcar 0%.
 * Preço diferente ou unidade diferente na mesma data NÃO se juntam: aí é
 * informação de verdade.
 */
export function juntarRepetidos(historico: Compra[]): CompraAgrupada[] {
  const juntadas = new Map<string, CompraAgrupada>()
  // Mais recente primeiro; Map preserva a ordem de inserção, então a saída
  // já sai ordenada sem precisar de um segundo sort.
  for (const c of [...historico].sort((a, b) => b.data.localeCompare(a.data))) {
    const chave = `${c.data}|${c.centavos}|${chaveUnidade(c.unidade)}`
    const atual = juntadas.get(chave)
    if (!atual) {
      juntadas.set(chave, {
        centavos: c.centavos, quantidade: c.quantidade, unidade: c.unidade,
        data: c.data, fonte: c.fonte, lancamentos: 1,
      })
      continue
    }
    atual.quantidade += c.quantidade
    atual.lancamentos += 1
    if (atual.fonte !== c.fonte) atual.fonte = null
  }
  return [...juntadas.values()]
}

/**
 * Resume um par produto+laboratório. Se a unidade mudou entre as duas últimas
 * compras (caixa → frasco), o percentual não significa nada e some.
 */
export function resumirGrupo(grupo: GrupoPreco): ResumoPreco {
  // O histórico é juntado antes de comparar: a "compra anterior" tem que ser a
  // nota anterior, não outra linha da mesma nota.
  const historico = juntarRepetidos(grupo.historico)
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
