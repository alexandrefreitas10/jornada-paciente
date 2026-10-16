import { brParaCentavos } from '@/lib/conciliacao/tipos'
import type { CompraCartao, FaturaLida } from './tipos'

// Leitor determinístico da fatura do cartão. Nada de IA aqui: a fatura é um
// documento de formato fixo e a prova de que a leitura está certa é o resíduo
// (soma das compras menos o DESPESAS/DÉBITOS impresso). Qualquer coisa diferente
// de zero significa que alguma compra ficou de fora — e é melhor o relatório
// acusar isso do que somar errado em silêncio.
//
// Os padrões abaixo foram MEDIDOS nas duas faturas reais.

const REF = /R\s?E\s?F\.?\s*:\s*([a-z]{3})\/(\d{4})/i
const RESUMO_ANTERIOR = /TOTAL FATURA ANTERIOR\s+R\$\s*([\d.]+,\d{2})/i
const RESUMO_DESPESAS = /DESPESAS\/D[ÉE]BITOS\s*\+?\s*R\$\s*([\d.]+,\d{2})/i
const RESUMO_TOTAL = /SALDO TOTAL\s*=?\s*R\$\s*([\d.]+,\d{2})/i
/** Compra que fecha na própria linha. O `-` antes do R$ marca crédito. */
const COMPRA = /^(\d{2})\/([a-z]{3})\s+(.+?)\s+(-?)R\$\s*([\d.]+,\d{2})$/i
/** Internacional: a linha só tem data e valor; o nome está na linha ANTERIOR. */
const SO_VALOR = /^(\d{2})\/([a-z]{3})\s+(-?)R\$\s*([\d.]+,\d{2})$/i
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * "Parc.2/5" dentro da descrição. SEM `\b` antes do "Parc": nas faturas reais
 * ele às vezes vem colado no fim do nome ("...LOJEXParc.3/12"), e com o `\b` a
 * parcela ficava `null` e o "Parc.3/12" sujava o nome do estabelecimento — que
 * é justamente o que depois vai ser usado para descobrir a categoria.
 */
const PARCELA = /Parc\.?\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/i
/**
 * Sufixo de moeda estrangeira na linha do nome da compra internacional:
 * "SOFTWARE EXEMPLO - USD 100.00" → "SOFTWARE EXEMPLO".
 */
const SUFIXO_MOEDA = /\s*-\s*[A-Z]{3}\s*[\d.,]+\s*$/i

/**
 * O ano não está impresso na linha da compra ("16/dez"), só na referência da
 * fatura. Mês da compra MAIOR que o da referência só pode ser do ano anterior
 * (dez numa fatura de set/2026 é dezembro de 2025).
 */
function anoDaCompra(mesCompra: number, referencia: string): number {
  const [anoRef, mesRef] = referencia.split('-').map(Number)
  return mesCompra > mesRef ? anoRef - 1 : anoRef
}

function dataIso(dia: string, mesTexto: string, referencia: string): string | null {
  const mes = MESES.indexOf(mesTexto.toLowerCase()) + 1
  if (mes === 0) return null
  const ano = anoDaCompra(mes, referencia)
  return `${ano}-${String(mes).padStart(2, '0')}-${dia}`
}

/** Separa "FORNECEDOR Parc.2/5" em nome e "2/5". */
function separarParcela(descricao: string): { estabelecimento: string; parcela: string | null } {
  const m = PARCELA.exec(descricao)
  if (!m) return { estabelecimento: descricao.trim(), parcela: null }
  return {
    estabelecimento: descricao.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
    parcela: `${Number(m[1])}/${Number(m[2])}`,
  }
}

export function lerFatura(linhas: string[]): FaturaLida {
  const texto = linhas.join('\n')

  const ref = REF.exec(texto)
  const mesRef = ref ? MESES.indexOf(ref[1].toLowerCase()) + 1 : 0
  if (!ref || mesRef === 0) {
    throw new Error('Não parece uma fatura de cartão: não achei a referência (R E F. : mês/ano).')
  }
  const referencia = `${ref[2]}-${String(mesRef).padStart(2, '0')}`

  const despesas = RESUMO_DESPESAS.exec(texto)
  if (!despesas) {
    throw new Error('Não parece uma fatura de cartão: não achei o total de DESPESAS/DÉBITOS.')
  }
  const despesasDeclaradas = brParaCentavos(despesas[1])

  const total = RESUMO_TOTAL.exec(texto)
  const anterior = RESUMO_ANTERIOR.exec(texto)

  const compras: CompraCartao[] = []
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    // SO_VALOR vem ANTES de COMPRA: senão "09/set R$ 500,00" seria lida como
    // uma compra de descrição vazia e o nome (que está na linha de cima) se
    // perderia. As duas são exclusivas por construção, mas a ordem é a regra.
    const so = SO_VALOR.exec(linha)
    if (so) {
      // `-R$` é crédito (pagamento recebido, estorno). Nunca é compra.
      if (so[3] === '-') continue
      const data = dataIso(so[1], so[2], referencia)
      if (!data) continue
      const linhaDoNome = i > 0 ? linhas[i - 1] : ''
      const { estabelecimento, parcela } = separarParcela(linhaDoNome.replace(SUFIXO_MOEDA, ''))
      compras.push({
        data,
        estabelecimento,
        parcela,
        centavos: brParaCentavos(so[4]),
        internacional: true,
      })
      continue
    }

    const c = COMPRA.exec(linha)
    if (!c) continue
    if (c[4] === '-') continue
    const data = dataIso(c[1], c[2], referencia)
    if (!data) continue
    const { estabelecimento, parcela } = separarParcela(c[3])
    compras.push({ data, estabelecimento, parcela, centavos: brParaCentavos(c[5]), internacional: false })
  }

  const soma = compras.reduce((s, c) => s + c.centavos, 0)
  return {
    referencia,
    totalFatura: total ? brParaCentavos(total[1]) : 0,
    despesasDeclaradas,
    faturaAnterior: anterior ? brParaCentavos(anterior[1]) : 0,
    compras,
    residuo: soma - despesasDeclaradas,
  }
}
