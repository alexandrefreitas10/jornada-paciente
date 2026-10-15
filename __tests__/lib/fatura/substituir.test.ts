import type { CompraEnquadrada } from '@/lib/fatura/enquadrar'
import { CATEGORIA_CARTAO, NAO_IDENTIFICADO } from '@/lib/fatura/enquadrar'
import { AJUSTES_CARTAO, comprasParaComparativo, substituirCartao } from '@/lib/fatura/substituir'
import { montarResultado, type LancamentoExtratoBanco } from '@/lib/conciliacao/resultado'
import type { LancamentoSistema } from '@/lib/conciliacao/tipos'

// Valores com a MESMA forma dos reais, nomes inventados: a fatura de set/2026
// tem R$ 25.324,12 de compras e R$ 25.302,62 de SALDO TOTAL — a diferença de
// R$ 21,50 é um estorno de anuidade que só aparece na fatura seguinte. É esse
// par de números que está fixado aqui.
const PAGO = 2530262
const COMPRADO = 2532412
const DIFERENCA = COMPRADO - PAGO // 2150

const lanc = (over: Partial<LancamentoSistema> = {}): LancamentoSistema => ({
  data: '2026-09-10',
  competencia: '2026-09',
  centavos: -100000,
  banco: 'unicred',
  nome: 'FORNECEDOR EXEMPLO',
  descricao: null,
  categoria: 'Material de consumo',
  ...over,
})

/** O lançamento opaco que o BPO faz: a fatura inteira numa linha só. */
const doCartao = (centavos = -PAGO, over: Partial<LancamentoSistema> = {}): LancamentoSistema =>
  lanc({ centavos, nome: 'CARTAO UNICRED', data: '2026-09-15', categoria: CATEGORIA_CARTAO, ...over })

const compra = (
  estabelecimento: string,
  centavos: number,
  categoria: string,
  over: Partial<CompraEnquadrada> = {},
): CompraEnquadrada => ({
  data: '2026-08-28',
  estabelecimento,
  parcela: null,
  centavos,
  internacional: false,
  categoria,
  origem: 'ia',
  ...over,
})

/** Compras que somam R$ 25.324,12, como na fatura real. */
const COMPRAS: CompraEnquadrada[] = [
  compra('PADARIA EXEMPLO', 1000000, 'Alimentação'),
  compra('ANUNCIOS EXEMPLO', 1500000, 'Marketing'),
  compra('LOJA DESCONHECIDA', 32412, NAO_IDENTIFICADO, { origem: 'nao_identificado' }),
]

const soma = (ls: LancamentoSistema[]) => ls.reduce((s, l) => s + l.centavos, 0)
const porCategoria = (ls: LancamentoSistema[], categoria: string) =>
  ls.filter(l => l.categoria === categoria)

describe('substituirCartao', () => {
  it('INVARIANTE: a soma de centavos do mês é idêntica antes e depois', () => {
    // Este é o teste que importa. A aba substitui dinheiro que já está na tela
    // e já está certo: se o total do mês mudar, o relatório passa a mentir
    // sobre quanto a clínica gastou — e ninguém olha a soma para desconfiar.
    const sistema = [lanc(), lanc({ centavos: 450000, categoria: 'Receita de consultas' }), doCartao()]
    const antes = soma(sistema)

    const depois = substituirCartao(sistema, COMPRAS)

    expect(soma(depois)).toBe(antes)
    // e não é por acaso: as compras somam MAIS do que o que foi pago
    expect(COMPRAS.reduce((s, c) => s + c.centavos, 0)).toBe(COMPRADO)
    expect(COMPRADO).not.toBe(PAGO)
  })

  it('a diferença entre as compras e o valor pago vira uma linha explícita', () => {
    const saida = substituirCartao([lanc(), doCartao()], COMPRAS)

    const ajuste = porCategoria(saida, AJUSTES_CARTAO)
    expect(ajuste).toHaveLength(1)
    // pagou-se MENOS do que se comprou: a diferença é um crédito (+ R$ 21,50)
    expect(ajuste[0].centavos).toBe(DIFERENCA)
    expect(DIFERENCA).toBe(2150)
    expect(ajuste[0].nome).toBe(AJUSTES_CARTAO)
  })

  it('NÃO cria a linha de ajuste quando as compras fecham com o valor pago', () => {
    // uma linha de R$ 0,00 na tela de custo é ruído, e ruído numa tela de
    // dinheiro faz o dono desconfiar dos números que estão certos.
    const compras = [compra('PADARIA EXEMPLO', PAGO, 'Alimentação')]

    const saida = substituirCartao([lanc(), doCartao()], compras)

    expect(porCategoria(saida, AJUSTES_CARTAO)).toHaveLength(0)
    expect(saida.every(l => l.centavos !== 0)).toBe(true)
  })

  it('a categoria do BPO desaparece e as das compras entram no lugar', () => {
    const saida = substituirCartao([lanc(), doCartao()], COMPRAS)

    expect(porCategoria(saida, CATEGORIA_CARTAO)).toHaveLength(0)
    expect(porCategoria(saida, 'Alimentação')).toHaveLength(1)
    expect(porCategoria(saida, 'Marketing')).toHaveLength(1)
    expect(porCategoria(saida, NAO_IDENTIFICADO)).toHaveLength(1)
    // o que não é do cartão continua exatamente como entrou
    expect(porCategoria(saida, 'Material de consumo')).toEqual([lanc()])
  })

  it('cada compra entra UMA vez, mesmo quando duas são idênticas', () => {
    const compras = [
      compra('PADARIA EXEMPLO', 1000000, 'Alimentação'),
      compra('PADARIA EXEMPLO', 1000000, 'Alimentação'),
    ]
    const sistema = [doCartao(-2000000)]

    const saida = substituirCartao(sistema, compras)

    expect(porCategoria(saida, 'Alimentação')).toHaveLength(2)
    expect(soma(saida)).toBe(-2000000)
    expect(porCategoria(saida, AJUSTES_CARTAO)).toHaveLength(0)
  })

  it('sem fatura, a lista volta intacta', () => {
    const sistema = [lanc(), doCartao()]

    expect(substituirCartao(sistema, [])).toEqual(sistema)
  })

  it('sem lançamento de cartão no mês, a lista volta intacta', () => {
    // Pôr as compras sem tirar a linha do BPO somaria a fatura duas vezes.
    const sistema = [lanc(), lanc({ categoria: 'Marketing' })]

    expect(substituirCartao(sistema, COMPRAS)).toEqual(sistema)
  })

  it('mais de um lançamento de cartão: todos somados viram a base', () => {
    // Não acontece hoje (o BPO faz uma linha só), mas o tipo permite — e se
    // acontecesse, substituir só a primeira deixaria a outra duplicando a
    // fatura dentro do mesmo mês.
    const sistema = [lanc(), doCartao(-2000000), doCartao(-530262, { data: '2026-09-20' })]
    const antes = soma(sistema)

    const saida = substituirCartao(sistema, COMPRAS)

    expect(soma(saida)).toBe(antes)
    expect(porCategoria(saida, CATEGORIA_CARTAO)).toHaveLength(0)
    expect(porCategoria(saida, AJUSTES_CARTAO)[0].centavos).toBe(DIFERENCA)
  })

  it('acha a linha do BPO com outra caixa ou sem acento', () => {
    const sistema = [doCartao(-PAGO, { categoria: 'cartao de credito' })]

    const saida = substituirCartao(sistema, COMPRAS)

    expect(saida.some(l => l.categoria === 'cartao de credito')).toBe(false)
    expect(soma(saida)).toBe(-PAGO)
  })

  it('compra sintética leva banco, data e competência do lançamento que substituiu', () => {
    const cartao = doCartao(-PAGO, { banco: 'itau', data: '2026-09-15', competencia: '2026-09' })

    const saida = substituirCartao([cartao], COMPRAS)

    for (const l of saida) {
      expect(l.banco).toBe('itau')
      expect(l.data).toBe('2026-09-15')
      expect(l.competencia).toBe('2026-09')
    }
    // a data da COMPRA (que pode ser de outro mês, até de outro ano, numa
    // parcela) não vira a data do lançamento: ela fica na descrição.
    expect(saida[0].descricao).toContain('28/08/2026')
  })

  it('compra é despesa: entra negativa', () => {
    const saida = substituirCartao([doCartao()], COMPRAS)

    for (const l of porCategoria(saida, 'Alimentação')) expect(l.centavos).toBeLessThan(0)
    expect(porCategoria(saida, 'Marketing')[0].centavos).toBe(-1500000)
  })

  it('o estabelecimento vira o nome do fornecedor, com parcela na descrição', () => {
    const compras = [compra('LOJA EXEMPLO', PAGO, 'Material de consumo', { parcela: '2/5' })]

    const saida = substituirCartao([doCartao()], compras)

    expect(saida[0].nome).toBe('LOJA EXEMPLO')
    expect(saida[0].descricao).toContain('2/5')
  })

  it('compra não volta para a categoria do BPO: seria meio cartão opaco de novo', () => {
    // A tela não oferece essa escolha, mas a memória do dono não é filtrada
    // pela lista do mês — se uma correção antiga tivesse essa categoria, ela
    // chegaria aqui.
    const compras = [compra('LOJA EXEMPLO', PAGO, CATEGORIA_CARTAO, { origem: 'memoria' })]

    const saida = substituirCartao([doCartao()], compras)

    expect(porCategoria(saida, CATEGORIA_CARTAO)).toHaveLength(0)
    expect(porCategoria(saida, NAO_IDENTIFICADO)).toHaveLength(1)
    expect(soma(saida)).toBe(-PAGO)
  })

  it('compra sem nome legível não entra como fornecedor vazio', () => {
    const compras = [compra('   ', PAGO, NAO_IDENTIFICADO, { origem: 'nao_identificado' })]

    const saida = substituirCartao([doCartao()], compras)

    expect(saida[0].nome.trim()).not.toBe('')
  })
})

describe('comprasParaComparativo', () => {
  it('fatura que fecha (resíduo zero) entra', () => {
    expect(comprasParaComparativo({ residuo: 0 }, COMPRAS)).toEqual(COMPRAS)
  })

  it('fatura com resíduo NÃO entra: abertura incompleta faria a categoria parecer menor', () => {
    expect(comprasParaComparativo({ residuo: -1000 }, COMPRAS)).toEqual([])
    expect(comprasParaComparativo({ residuo: 1 }, COMPRAS)).toEqual([])
  })

  it('sem fatura, nada entra', () => {
    expect(comprasParaComparativo(null, COMPRAS)).toEqual([])
    expect(comprasParaComparativo(undefined, COMPRAS)).toEqual([])
  })
})

describe('montarResultado com a fatura aberta', () => {
  const extrato: LancamentoExtratoBanco[] = [
    { banco: 'unicred', data: '2026-09-15', centavos: -PAGO, descricao: 'PAGTO CARTAO' },
  ]
  const setembro = [lanc(), doCartao()]
  const agosto = [
    lanc({ data: '2026-08-10', competencia: '2026-08' }),
    doCartao(-2000000, { data: '2026-08-15', competencia: '2026-08' }),
  ]
  const comprasAgosto = [compra('PADARIA EXEMPLO', 2000000, 'Alimentação', { data: '2026-07-20' })]

  const montar = (over: Partial<Parameters<typeof montarResultado>[0]> = {}) =>
    montarResultado({
      mes: '2026-09',
      sistema: setembro,
      extrato,
      anterior: { mes: '2026-08', sistema: agosto, compras: comprasAgosto },
      compras: COMPRAS,
      ...over,
    })

  const despesa = (r: ReturnType<typeof montarResultado>, chave: string) =>
    r.comparativo.despesas.find(d => d.chave === chave)

  it('o comparativo mostra as categorias da fatura, não a linha do cartão', () => {
    const r = montar()

    expect(despesa(r, CATEGORIA_CARTAO)).toBeUndefined()
    expect(despesa(r, 'Alimentação')?.atual).toBe(-1000000)
    expect(despesa(r, 'Marketing')?.atual).toBe(-1500000)
  })

  it('abre o mês anterior também: a categoria não nasce no mês atual', () => {
    const r = montar()

    // agosto tinha R$ 20.000 de padaria; sem abrir agosto, "Alimentação"
    // apareceria como alta de 100% e o relatório mentiria no pior sentido.
    expect(despesa(r, 'Alimentação')?.anterior).toBe(-2000000)
    expect(despesa(r, 'Alimentação')?.diferenca).toBe(1000000)
  })

  it('mês anterior sem fatura: nenhum dos dois é aberto (aberto contra fechado mentiria)', () => {
    const r = montar({ anterior: { mes: '2026-08', sistema: agosto } })

    expect(despesa(r, CATEGORIA_CARTAO)?.atual).toBe(-PAGO)
    expect(despesa(r, CATEGORIA_CARTAO)?.anterior).toBe(-2000000)
    expect(despesa(r, 'Alimentação')).toBeUndefined()
  })

  it('sem mês anterior gravado, o mês atual é aberto: não há comparação para distorcer', () => {
    const r = montar({ anterior: null })

    expect(r.comparativo.mesAnterior).toBeNull()
    expect(despesa(r, 'Marketing')?.atual).toBe(-1500000)
    expect(despesa(r, CATEGORIA_CARTAO)).toBeUndefined()
  })

  it('sem compras, o resultado é o mesmo de antes da fatura existir', () => {
    const r = montar({ compras: undefined, anterior: { mes: '2026-08', sistema: agosto } })

    expect(r).toEqual(
      montarResultado({
        mes: '2026-09',
        sistema: setembro,
        extrato,
        anterior: { mes: '2026-08', sistema: agosto },
      })
    )
  })

  it('o detalhe da categoria do cartão lista os estabelecimentos', () => {
    const r = montar()

    const fornecedores = despesa(r, 'Alimentação')?.fornecedores ?? []
    expect(fornecedores.map(f => f.chave)).toContain('PADARIA EXEMPLO')
    expect(fornecedores.find(f => f.chave === 'PADARIA EXEMPLO')?.atual).toBe(-1000000)
  })

  it('a conciliação com o banco NÃO vê as compras: o cartão saiu numa parcela só', () => {
    // O banco tem UM débito de R$ 25.302,62. Se a substituição valesse também
    // para a conciliação, a tela mostraria 3 lançamentos sem par e um débito
    // sobrando no extrato — e o dono cobraria do BPO um erro que é nosso.
    const r = montar()

    const unicred = r.bancos.find(b => b.banco === 'unicred')!
    expect(unicred.conciliados).toBe(1)
    expect(unicred.soNoExtrato).toHaveLength(0)
    expect(unicred.soNoSistema).toEqual([lanc()])
  })

  it('o total de despesa do mês não muda por abrir a fatura', () => {
    const aberto = montar()
    const fechado = montar({ compras: undefined, anterior: { mes: '2026-08', sistema: agosto } })

    const total = (r: ReturnType<typeof montarResultado>) =>
      r.comparativo.despesas.reduce((s, d) => s + d.atual, 0) +
      r.comparativo.receitas.reduce((s, d) => s + d.atual, 0)

    expect(total(aberto)).toBe(total(fechado))
  })
})
