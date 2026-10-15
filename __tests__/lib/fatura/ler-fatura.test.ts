import { lerFatura } from '@/lib/fatura/ler-fatura'

// Mesma estrutura e mesmas quebras das faturas reais; nomes e valores
// INVENTADOS. A fatura real nunca entra no repositório.
const LINHAS = [
  'EMPRESA EXEMPLO LTDA',
  'R E F. : set/2026',
  'TOTAL FATURA ANTERIOR R$ 1.000,00',
  'PAGAMENTOS RECEBIDOS - R$ 1.010,00',
  'DESPESAS/DÉBITOS + R$ 2.500,00',
  'ENCARGOS R$ 0',
  'SALDO TOTAL = R$ 2.490,00',
  'L A N ÇA M E N T O S – VI S A',
  'D ATA DESCRIÇÃO VA L O R',
  // compra simples
  '03/set LOJA EXEMPLO R$ 500,00',
  // parcelada (24 das 67 na fatura real)
  '27/ago FORNECEDOR EXEMPLO Parc.2/5 R$ 1.000,00',
  // compra de ano anterior: mês > referência ⇒ 2025
  '16/dez SERVICO ANTIGO Parc.10/12 R$ 400,00',
  // internacional: três linhas, a do meio tem data e valor
  'SOFTWARE EXEMPLO - USD 100.00',
  '09/set R$ 500,00',
  'Conversão: USD 1 = R$ 5,00',
  // IOF vem como compra normal
  '09/set IOF comprainternacional- SOFTWARE EXEMPLO R$ 100,00',
  // negativos: NÃO são compra
  '02/set Anuidade- bonificação -R$ 10,00',
  '11/set Pagamento Recebido -R$ 1.000,00',
  'Página1de9',
]

// MEDIDO nas duas faturas reais: em algumas descrições o "Parc." vem COLADO no
// fim do nome, sem espaço nenhum ("...LOJEXParc.3/12"). Nomes inventados.
const LINHAS_PARCELA_COLADA = [
  'R E F. : set/2026',
  'DESPESAS/DÉBITOS + R$ 200,00',
  '05/set PG *LOJA EXEMPLO LOJEXParc.3/12 R$ 200,00',
]

describe('lerFatura', () => {
  it('lê a referência e os totais do resumo', () => {
    const f = lerFatura(LINHAS)
    expect(f.referencia).toBe('2026-09')
    expect(f.totalFatura).toBe(249000)
    expect(f.despesasDeclaradas).toBe(250000)
    expect(f.faturaAnterior).toBe(100000)
  })

  it('lê compra simples e parcelada', () => {
    const { compras } = lerFatura(LINHAS)
    expect(compras.find(c => c.estabelecimento.includes('LOJA EXEMPLO')))
      .toMatchObject({ data: '2026-09-03', centavos: 50000, parcela: null, internacional: false })
    expect(compras.find(c => c.estabelecimento.includes('FORNECEDOR EXEMPLO')))
      .toMatchObject({ data: '2026-08-27', centavos: 100000, parcela: '2/5' })
  })

  it('mês maior que o da referência é do ano anterior', () => {
    // 16/dez numa fatura de set/2026 é dezembro de 2025
    expect(lerFatura(LINHAS).compras.find(c => c.parcela === '10/12')?.data).toBe('2025-12-16')
  })

  it('compra internacional: nome de uma linha, data e valor da seguinte', () => {
    const c = lerFatura(LINHAS).compras.find(x => x.centavos === 50000 && x.internacional)
    expect(c).toMatchObject({ data: '2026-09-09', internacional: true })
    expect(c?.estabelecimento).toContain('SOFTWARE EXEMPLO')
  })

  it('o IOF é uma compra, não um encargo escondido', () => {
    expect(lerFatura(LINHAS).compras.find(c => /IOF/i.test(c.estabelecimento))?.centavos).toBe(10000)
  })

  it('pagamento recebido e estorno de anuidade NÃO são compra', () => {
    const { compras } = lerFatura(LINHAS)
    expect(compras.some(c => /Pagamento Recebido/i.test(c.estabelecimento))).toBe(false)
    expect(compras.some(c => /bonifica/i.test(c.estabelecimento))).toBe(false)
    expect(compras.every(c => c.centavos > 0)).toBe(true)
  })

  it('a soma das compras prova a leitura', () => {
    const f = lerFatura(LINHAS)
    // 500 + 1.000 + 400 + 500 + 100 = 2.500 = DESPESAS/DÉBITOS
    expect(f.compras.reduce((s, c) => s + c.centavos, 0)).toBe(250000)
    expect(f.residuo).toBe(0)
  })

  it('quando falta uma compra, o resíduo denuncia', () => {
    const semUma = LINHAS.filter(l => !l.startsWith('03/set LOJA'))
    expect(lerFatura(semUma).residuo).toBe(-50000)
  })

  it('texto que não é fatura não vira fatura', () => {
    expect(() => lerFatura(['qualquer coisa', 'outra linha'])).toThrow(/fatura/i)
  })

  it('o resumo não é lido como compra', () => {
    // nenhuma linha do resumo (que não começa com data) pode virar lançamento
    const { compras } = lerFatura(LINHAS)
    expect(compras.some(c => /SALDO TOTAL|FATURA ANTERIOR|DESPESAS/i.test(c.estabelecimento))).toBe(false)
    expect(compras).toHaveLength(5)
  })

  it('parcela colada no fim do nome é separada do estabelecimento', () => {
    const f = lerFatura(LINHAS_PARCELA_COLADA)
    expect(f.compras).toHaveLength(1)
    expect(f.compras[0]).toMatchObject({ parcela: '3/12', centavos: 20000 })
    expect(f.compras[0].estabelecimento).toBe('PG *LOJA EXEMPLO LOJEX')
    expect(f.residuo).toBe(0)
  })

  it('a linha internacional não é contada duas vezes', () => {
    // SO_VALOR casa antes de COMPRA: uma única compra de R$ 500,00 internacional
    const internacionais = lerFatura(LINHAS).compras.filter(c => c.internacional)
    expect(internacionais).toHaveLength(1)
  })
})
