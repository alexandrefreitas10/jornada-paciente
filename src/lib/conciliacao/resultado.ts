import type { CompraEnquadrada } from '@/lib/fatura/enquadrar'
import { substituirCartao } from '@/lib/fatura/substituir'
import { compararCategorias, compararFornecedores, type LinhaComparativo } from './comparativo'
import { conciliar, type ResultadoConciliacao } from './conciliar'
import type { Banco, ConferenciaSaldo, LancamentoExtrato, LancamentoSistema, PeriodoExtrato } from './tipos'

// A montagem do que a aba mostra: a conciliação de cada banco e o comparativo
// contra o mês anterior. Puro — as duas rotas (o envio e a releitura de um mês
// já gravado) chamam a MESMA função, para a tela nunca mostrar um número no
// envio e outro quando o mês for reaberto.

/** Os dois bancos, sempre nesta ordem, para a tela não trocar de lugar. */
export const BANCOS: Banco[] = ['unicred', 'itau']

/** Um movimento de extrato já sabendo de que conta ele é. */
export type LancamentoExtratoBanco = LancamentoExtrato & { banco: Banco }

/** O que o leitor de cada arquivo descartou ou não entendeu. Vai para a tela:
 *  "83 linhas, 2 sem data de pagamento" é informação; reconciliar menos do que
 *  foi enviado sem dizer nada é armadilha.
 *
 *  Os campos OPCIONAIS são os que existem só no envio, com os arquivos na mão.
 *  O banco guarda apenas os descartes que acendem o aviso (`semValor` e
 *  `naoEntendidas`), e por isso eles são obrigatórios: ao reabrir um mês o
 *  aviso tem de voltar igual. Os opcionais vêm `undefined` nessa releitura — e
 *  `undefined` de propósito, não zero, porque zero afirmaria que nada foi
 *  descartado. */
export interface LeituraPlanilha {
  /** Quantas linhas entraram na conciliação (já sem as descartadas abaixo).
   *  Só no envio. */
  lancamentos?: number
  /** Só no envio. */
  semDataPagamento?: number
  /** Só no envio. */
  bancoDesconhecido?: number
  /** Linha paga, de banco conhecido, cujo valor não deu para ler. Guardada com
   *  o mês: é um dos quatro números que acendem o aviso de falha de leitura. */
  semValor: number
  /** Só no envio. */
  foraDoMes?: number
}

export interface LeituraExtrato {
  /** Período declarado no cabeçalho do extrato, ou `null` quando o arquivo não
   *  declara. Só no envio — ausente (`undefined`) na releitura. */
  periodo?: PeriodoExtrato | null
  /** Quantos movimentos entraram na conciliação (já sem os de fora do mês).
   *  Só no envio. */
  movimentos?: number
  /** Registros que abriram com data e que o leitor não conseguiu fechar.
   *  Guardado com o mês, pelo mesmo motivo que `semValor`. */
  naoEntendidas: number
  /** A prova de leitura do extrato: abertura + movimentos = fechamento
   *  impresso. Guardada com o mês, pelo mesmo motivo que `naoEntendidas` — e
   *  obrigatória aqui por isso. `null` é "o extrato não imprime os dois
   *  saldos", nunca "fecha": quem desenha tem de distinguir os dois. */
  conferenciaSaldo: ConferenciaSaldo | null
  /** Movimentos do extrato que caem fora do mês escolhido (extrato que cobre
   *  mais que o mês). Separados para não virar divergência falsa. Só no envio. */
  foraDoMes?: number
}

export interface Leitura {
  recebidas: LeituraPlanilha
  pagas: LeituraPlanilha
  unicred: LeituraExtrato
  itau: LeituraExtrato
}

/** Uma categoria do comparativo, já com os fornecedores que a compõem nos dois
 *  meses. O detalhe vem junto de propósito: a tela abre a categoria com um
 *  clique, e uma ida ao servidor por categoria clicada só adiaria o mesmo
 *  cálculo sobre os mesmos ~320 lançamentos que já estão na mão. */
export interface CategoriaComparativo extends LinhaComparativo {
  fornecedores: LinhaComparativo[]
}

export interface ResultadoMes {
  /** AAAA-MM. */
  mes: string
  /** Um bloco por banco, na ordem de `BANCOS`. */
  bancos: ResultadoConciliacao[]
  comparativo: {
    /** AAAA-MM do mês comparado, ou `null` quando não há mês anterior gravado
     *  — a tela diz isso em vez de mostrar tudo como alta de 100%. */
    mesAnterior: string | null
    receitas: CategoriaComparativo[]
    despesas: CategoriaComparativo[]
  }
  /** O que cada leitor viu e descartou. No envio vem completo; ao reabrir um
   *  mês gravado vêm só os descartes que o banco guarda (ver `Leitura`), o
   *  bastante para o aviso de falha de leitura voltar igual. `null` só quando
   *  nem isso existe — mês gravado antes de haver onde guardar. */
  leitura: Leitura | null
}

export function montarResultado(entrada: {
  mes: string
  sistema: LancamentoSistema[]
  extrato: LancamentoExtratoBanco[]
  anterior: { mes: string; sistema: LancamentoSistema[]; compras?: CompraEnquadrada[] | null } | null
  /** Compras da fatura do cartão do mês, já enquadradas em categoria. Quando
   *  vêm, a linha opaca "Cartão de Crédito" do comparativo é substituída por
   *  elas (ver `substituirCartao`). Vazio ou ausente = o mês continua como
   *  antes de a fatura existir. */
  compras?: CompraEnquadrada[] | null
  leitura?: Leitura | null
}): ResultadoMes {
  // ABRE OS DOIS MESES OU NENHUM. Comparar um mês aberto contra um mês fechado
  // faria TODA categoria do cartão aparecer como se tivesse nascido no mês
  // atual — alta de 100% em tudo, e a mentira cai justamente para o lado que
  // mais convida a uma decisão errada. Sem mês anterior gravado não existe essa
  // comparação (a tela diz isso, em vez de mostrar alta de 100%), e aí abrir o
  // mês atual é só ganho.
  const comprasAtual = entrada.compras ?? []
  const comprasAnterior = entrada.anterior?.compras ?? []
  const abrirCartao = entrada.anterior
    ? comprasAtual.length > 0 && comprasAnterior.length > 0
    : comprasAtual.length > 0

  // Só o comparativo troca a linha do cartão pelas compras. A conciliação
  // continua com os lançamentos como o BPO os fez: no extrato o cartão saiu
  // num débito único, e 60 compras contra um débito seriam 60 divergências.
  const sistema = abrirCartao ? substituirCartao(entrada.sistema, comprasAtual) : entrada.sistema
  const anterior = abrirCartao
    ? substituirCartao(entrada.anterior?.sistema ?? [], comprasAnterior)
    : entrada.anterior?.sistema ?? []

  const categorias = compararCategorias(sistema, anterior)
  const comFornecedores = (linhas: LinhaComparativo[]): CategoriaComparativo[] =>
    linhas.map(l => ({ ...l, fornecedores: compararFornecedores(sistema, anterior, l.chave) }))

  return {
    mes: entrada.mes,
    bancos: BANCOS.map(banco =>
      conciliar(entrada.sistema, entrada.extrato.filter(l => l.banco === banco), banco)
    ),
    comparativo: {
      mesAnterior: entrada.anterior?.mes ?? null,
      receitas: comFornecedores(categorias.receitas),
      despesas: comFornecedores(categorias.despesas),
    },
    leitura: entrada.leitura ?? null,
  }
}
