// Tipos da Conciliação + os dois helpers de formato brasileiro que todos os
// leitores usam. Ficam aqui (e não num util.ts) porque são a mesma coisa: a
// forma como dinheiro e data entram no sistema. Nada neste arquivo importa
// biblioteca nem banco — dá para usar em qualquer lugar, inclusive no cliente.

export type Banco = 'unicred' | 'itau'

/** Um lançamento como o BPO registrou no sistema contábil. */
export interface LancamentoSistema {
  data: string // AAAA-MM-DD, vem da "Data de pagamento"
  competencia: string | null
  centavos: number // negativo = saída
  banco: Banco
  nome: string
  descricao: string | null
  categoria: string
}

/** Um movimento como o banco registrou. */
export interface LancamentoExtrato {
  data: string // AAAA-MM-DD
  centavos: number // negativo = saída
  descricao: string
}

export interface PeriodoExtrato {
  inicio: string // AAAA-MM-DD
  fim: string
}

/**
 * A prova de que a leitura do extrato não perdeu nenhum movimento.
 *
 * `naoEntendidas` só pega o registro que abre e nunca fecha. O furo que ele não
 * vê é o registro que fecha CEDO — uma linha intermediária que por acaso
 * termina em número fecha o registro ali, a linha do valor de verdade é
 * descartada e nenhum contador acende. Daí esta conferência, que não depende do
 * leitor: os dois extratos imprimem o saldo de abertura e o de fechamento, e
 *
 *     abertura + soma de TODOS os movimentos lidos = fechamento impresso
 *
 * só fecha se nada se perdeu no caminho. Tudo em centavos inteiros.
 */
export interface ConferenciaSaldo {
  /** Saldo impresso antes do primeiro movimento do arquivo. */
  abertura: number
  /** Saldo impresso depois do último movimento do arquivo. */
  fechamento: number
  /** Soma de TODOS os movimentos que o leitor achou no arquivo — inclusive os
   *  de fora do mês conciliado, porque os saldos impressos cobrem o período
   *  inteiro do arquivo, não o mês. */
  soma: number
  /** `abertura + soma - fechamento`. Zero = fecha. Diferente de zero = a
   *  leitura perdeu (ou inventou) dinheiro, e a tela avisa antes que o dono
   *  cobre do BPO um tropeço nosso. */
  residuo: number
}

export interface ExtratoLido {
  periodo: PeriodoExtrato | null
  lancamentos: LancamentoExtrato[]
  /** Registros que abriram com data mas que o leitor não conseguiu fechar.
   *  Zero nos arquivos reais; se passar de zero, a tela avisa — divergência
   *  por falha de leitura não pode se disfarçar de erro do BPO. */
  naoEntendidas: number
  /** Prova de que nada se perdeu na leitura: abertura + movimentos =
   *  fechamento. `null` quando o extrato não imprime os dois saldos — que é
   *  "não sei", nunca "fecha". */
  conferenciaSaldo: ConferenciaSaldo | null
}

export interface PlanilhaLida {
  lancamentos: LancamentoSistema[]
  /** Linha sem "Data de pagamento" (ou em formato não reconhecido): não foi
   *  paga, logo não pode estar no extrato. Descarte esperado. */
  semDataPagamento: number
  /** Linha cujo "Banco" não é Unicred nem Itaú. Descartada de propósito: a
   *  conciliação é por conta, e adivinhar o banco inventaria divergência. */
  bancoDesconhecido: number
  /** Linha paga, de banco conhecido, cujo valor não deu para ler. Nos arquivos
   *  reais é zero; acima de zero é falha de leitura e a tela avisa. */
  semValor: number
}

/**
 * "13.207,80" → 1320780. Formato brasileiro, sem passar por float: ponto é
 * separador de milhar, vírgula é decimal, e a conta é feita em inteiros para
 * que nenhum centavo se perca no arredondamento binário.
 */
export function brParaCentavos(texto: string): number {
  const limpo = texto.replace(/\s|R\$/g, '')
  const neg = limpo.startsWith('-')
  const [inteiro, decimal = '00'] = limpo.replace('-', '').split(',')
  return (neg ? -1 : 1) * (Number(inteiro.replace(/\./g, '')) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2)))
}

/** "01/09/2026" → "2026-09-01". */
export function dataBrParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
