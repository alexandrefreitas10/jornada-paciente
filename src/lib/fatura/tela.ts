import { NAO_IDENTIFICADO, type CompraEnquadrada } from './enquadrar'

// O que a tela recebe sobre a fatura do mês, e as somas que ela mostra.
//
// Puro e sem banco de propósito: o componente é 'use client' e importa ESTES
// tipos, não os do `fatura-db.ts` (que carrega o postgres). As somas também
// moram aqui — quem monta a resposta no servidor as calcula e manda prontas,
// para a tela não ter duas versões da mesma conta.

/** Uma compra da fatura como a tela a conhece: o `id` é o que o seletor de
 *  categoria manda no PATCH. */
export interface CompraDaTela extends CompraEnquadrada {
  id: number
}

export interface FaturaDaTela {
  /** AAAA-MM do mês em que a fatura foi PAGA — o mês da conciliação. */
  mes: string
  /** AAAA-MM impresso na fatura (o mês em que ela fechou). */
  referencia: string
  /** SALDO TOTAL da fatura. */
  totalFatura: number
  /** DESPESAS/DÉBITOS declarado pela fatura. */
  despesasDeclaradas: number
  /** `soma(compras) - despesasDeclaradas`. Zero = a leitura fecha. Fatura com
   *  resíduo nunca é gravada, mas a tela diz o que faria se houvesse: não usa
   *  no Custos. */
  residuo: number
  /** Soma das compras lidas. */
  somaCompras: number
  /** Quanto das compras tem categoria de verdade (fora do "não identificado").
   *  É o numerador de "R$ 23.100 de R$ 25.324 — 91% identificado", que é como
   *  o dono decide se vale a pena mexer. */
  identificado: number
  /** O que o BPO lançou na linha "Cartão de Crédito" deste mês, em centavos
   *  POSITIVOS. Zero quando não há essa linha no mês — e aí a fatura não
   *  substitui nada, porque não haveria de onde tirar o valor. */
  lancado: number
  /** As categorias que o seletor oferece: as que o BPO usa no mês, mais o "não
   *  identificado". Vêm do servidor porque são calculadas sobre os lançamentos
   *  ORIGINAIS — depois da substituição a linha do cartão já não está lá. */
  categorias: string[]
  criadoEm: string
  criadoPor: string | null
  compras: CompraDaTela[]
}

export function somaDasCompras(compras: { centavos: number }[]): number {
  return compras.reduce((s, c) => s + Math.abs(c.centavos), 0)
}

/** A soma do que NÃO está em "não identificado". */
export function somaIdentificada(compras: CompraEnquadrada[]): number {
  return somaDasCompras(compras.filter(c => c.categoria !== NAO_IDENTIFICADO))
}
