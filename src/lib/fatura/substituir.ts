import type { LancamentoSistema } from '@/lib/conciliacao/tipos'
import { ehCategoriaCartao, NAO_IDENTIFICADO, type CompraEnquadrada } from './enquadrar'

// A ponte entre a fatura aberta e o dinheiro que JÁ está na tela.
//
// A ideia que faz tudo funcionar sem mexer no comparativo: transformar a LISTA
// DE LANÇAMENTOS antes de compará-la. Tirando o lançamento "Cartão de Crédito"
// e pondo as compras no lugar, `compararCategorias` e `compararFornecedores`
// continuam valendo sem uma linha de mudança — inclusive a ordem pela maior
// alta em reais e o detalhe por fornecedor, que passa a mostrar os
// estabelecimentos do cartão ao lado dos fornecedores do BPO.
//
// Nada aqui toca banco nem IA: é uma função pura sobre duas listas.

/** A linha que carrega a diferença entre o que foi comprado e o que foi pago.
 *  Explícita de propósito — ver `substituirCartao`. */
export const AJUSTES_CARTAO = 'Cartão — créditos e ajustes'

/** "2026-08-28" → "28/08/2026", só para a descrição que vai à tela. */
function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso
}

/** O que a compra era na fatura, para a linha não ficar anônima na tela: a
 *  data real da compra (que pode ser de outro mês), a parcela e se foi
 *  internacional. */
function descricaoDaCompra(c: CompraEnquadrada): string {
  const partes = [`Fatura do cartão · compra de ${dataBr(c.data)}`]
  if (c.parcela) partes.push(`parcela ${c.parcela}`)
  if (c.internacional) partes.push('internacional')
  return partes.join(' · ')
}

/**
 * As compras que podem entrar no comparativo.
 *
 * Fatura cujo resíduo não é zero perdeu (ou inventou) compra na leitura.
 * Substituir com ela faria cada categoria do cartão aparecer MENOR do que é —
 * e uma categoria menor do que a verdade é pior que a linha opaca de R$ 25
 * mil, porque parece informação. Enquanto a leitura não fechar, o mês continua
 * mostrando a linha do BPO.
 */
export function comprasParaComparativo(
  fatura: { residuo: number } | null | undefined,
  enquadradas: CompraEnquadrada[],
): CompraEnquadrada[] {
  if (!fatura || fatura.residuo !== 0) return []
  return enquadradas
}

/**
 * O que o BPO lançou na linha "Cartão de Crédito" do mês, em centavos
 * POSITIVOS (o lançamento chega negativo: é saída).
 *
 * É o número com que o total da fatura é comparado — diferente não bloqueia,
 * avisa, porque um estorno de anuidade faz o pago diferir do comprado sem que
 * nada esteja errado. Soma TODAS as linhas de cartão pelo mesmo motivo que
 * `substituirCartao`: se houvesse duas, comparar com uma só acusaria uma
 * diferença que não existe.
 *
 * Zero quando o mês não tem essa linha — e aí a fatura não substitui nada.
 */
export function totalLancadoNoCartao(sistema: LancamentoSistema[]): number {
  return Math.abs(
    sistema.filter(l => ehCategoriaCartao(l.categoria)).reduce((s, l) => s + l.centavos, 0)
  )
}

/**
 * Troca o lançamento "Cartão de Crédito" pelas compras da fatura.
 *
 * O TOTAL DO MÊS NÃO PODE MUDAR. É a invariante desta função, e ela é mantida
 * por construção: a base é a soma do que o BPO lançou, as compras entram, e o
 * que falta para fechar vira UMA linha de ajuste.
 *
 * A base é o que o BPO lançou, não a soma das compras, porque as duas não são
 * iguais: a fatura de set/2026 tem R$ 25.324,12 de compras e R$ 25.302,62 de
 * SALDO TOTAL — um estorno de anuidade de R$ 21,50 só aparece como crédito na
 * fatura seguinte. Essa diferença vira `AJUSTES_CARTAO`, visível, em vez de
 * ser diluída proporcionalmente nas categorias (que é o jeito de fazer a conta
 * fechar mentindo um pouco em cada linha). Quando a diferença é zero, a linha
 * não existe: R$ 0,00 numa tela de custo é ruído.
 *
 * Devolve a lista intacta quando não há o que fazer — sem compras, ou sem
 * lançamento de cartão no mês. Esse segundo caso é o que impede o pior erro
 * possível: pôr as compras sem ter de onde tirar o valor contaria a fatura
 * duas vezes no mês.
 *
 * Só para o COMPARATIVO. A conciliação com o extrato continua vendo o
 * lançamento original: no banco saiu um débito único, e trocá-lo por 60
 * compras mostraria 60 lançamentos sem par e um débito sobrando.
 */
export function substituirCartao(
  sistema: LancamentoSistema[],
  compras: CompraEnquadrada[],
): LancamentoSistema[] {
  if (compras.length === 0) return sistema

  const linhasDoCartao = sistema.filter(l => ehCategoriaCartao(l.categoria))
  if (linhasDoCartao.length === 0) return sistema

  // Mais de uma linha não acontece hoje (o BPO faz uma só), mas o tipo
  // permite: todas somadas viram a base, e todas saem. Substituir só a
  // primeira deixaria a outra duplicando a fatura dentro do mesmo mês.
  const base = linhasDoCartao.reduce((s, l) => s + l.centavos, 0)
  // A data/banco/competência vêm do pagamento, não da compra: a compra pode
  // ser de outro mês (ou de outro ano, numa parcela), e uma data fora do mês
  // é uma armadilha para qualquer coisa que filtre por período. A data real
  // da compra fica na descrição.
  const ancora = linhasDoCartao[0]
  const comoLancamento = (centavos: number, nome: string, categoria: string, descricao: string) => ({
    data: ancora.data,
    competencia: ancora.competencia,
    centavos,
    banco: ancora.banco,
    nome,
    descricao,
    categoria,
  })

  const sinteticos = compras.map(c =>
    comoLancamento(
      // Compra é despesa, e o sinal vem daqui: o leitor da fatura descarta os
      // créditos (`-R$`) e emite valor positivo. Uma compra positiva virando
      // lançamento positivo cairia na lista de RECEITAS do comparativo.
      -Math.abs(c.centavos),
      // Nome é o que o detalhe por fornecedor mostra. Compra sem nome legível
      // existe (descritor ilegível) e não pode virar um fornecedor "".
      c.estabelecimento.trim() || NAO_IDENTIFICADO,
      // Compra de volta na categoria do BPO não informa nada (é a linha que
      // esta aba existe para abrir) e deixaria um "Cartão de Crédito" meio
      // opaco no comparativo. A tela nunca oferece essa escolha, mas a memória
      // do dono não é filtrada pela lista do mês — e é dela que viria.
      ehCategoriaCartao(c.categoria) ? NAO_IDENTIFICADO : c.categoria,
      descricaoDaCompra(c)
    )
  )

  const semCartao = sistema.filter(l => !ehCategoriaCartao(l.categoria))
  const ajuste = base - sinteticos.reduce((s, l) => s + l.centavos, 0)
  return ajuste === 0
    ? [...semCartao, ...sinteticos]
    : [
        ...semCartao,
        ...sinteticos,
        comoLancamento(
          ajuste,
          AJUSTES_CARTAO,
          AJUSTES_CARTAO,
          'Diferença entre as compras da fatura e o valor pago (estorno ou crédito que aparece na fatura seguinte)'
        ),
      ]
}
