import { compararCategorias, compararFornecedores, resultadoDoMes, totalizar, type LinhaComparativo } from '@/lib/conciliacao/comparativo'
import type { LancamentoSistema } from '@/lib/conciliacao/tipos'

function l(categoria: string, centavos: number, nome = 'FORNECEDOR EXEMPLO'): LancamentoSistema {
  return { data: '2026-09-01', competencia: null, centavos, banco: 'unicred', nome, descricao: null, categoria }
}

describe('compararCategorias', () => {
  it('soma por categoria e separa receita de despesa', () => {
    const { receitas, despesas } = compararCategorias(
      [l('Receita com serviços', 10000), l('Receita com serviços', 5000), l('Luz', -3000)],
      [l('Receita com serviços', 12000), l('Luz', -2000)],
    )
    expect(receitas).toEqual([
      { chave: 'Receita com serviços', atual: 15000, anterior: 12000, diferenca: 3000, percentual: 25 },
    ])
    expect(despesas).toEqual([
      { chave: 'Luz', atual: -3000, anterior: -2000, diferenca: -1000, percentual: 50 },
    ])
  })

  it('categoria só no mês atual entra com zero no anterior, nunca é omitida', () => {
    const { receitas } = compararCategorias([l('Receita c/ Aluguel', 375000)], [])
    expect(receitas).toEqual([
      { chave: 'Receita c/ Aluguel', atual: 375000, anterior: 0, diferenca: 375000, percentual: null },
    ])
  })

  it('categoria só no mês anterior entra com zero no atual, nunca é omitida', () => {
    // É o caso mais fácil de esconder — e o mais interessante: um gasto que
    // existia e sumiu é informação, não ausência de linha.
    const { despesas } = compararCategorias([], [l('Manutenção e Reforma', -120000)])
    expect(despesas).toEqual([
      { chave: 'Manutenção e Reforma', atual: 0, anterior: -120000, diferenca: 120000, percentual: -100 },
    ])
  })

  it('percentual é null quando o mês anterior era zero — não é infinito nem 100%', () => {
    const { receitas } = compararCategorias([l('Aporte de capital', 50000)], [])
    expect(receitas[0].percentual).toBeNull()
  })

  it('ordena receita pela maior alta em reais, não pela maior alta em percentual', () => {
    // 100 → 400 é +300%, mas são 300 reais. 30.000 → 38.000 é +26%, mas são
    // 8.000 reais. Quem manda num comparativo de custo é o real, não o %.
    const { receitas } = compararCategorias(
      [l('Receita Financeira', 40000), l('Receita com serviços', 3800000)],
      [l('Receita Financeira', 10000), l('Receita com serviços', 3000000)],
    )
    expect(receitas.map(r => r.chave)).toEqual(['Receita com serviços', 'Receita Financeira'])
    expect(receitas[1].percentual).toBe(300)
  })

  it('ordena despesa pelo que mais aumentou o gasto — despesa é negativa', () => {
    // A armadilha: despesa é número negativo, então "subiu mais" é "ficou mais
    // negativo". Ordenar por `diferenca` decrescente, como se faz na receita,
    // devolve esta lista exatamente ao contrário.
    const { despesas } = compararCategorias(
      [l('Salários, encargos e benefícios', -1500000), l('Aluguel e condomínio', -300000), l('Luz', -5000)],
      [l('Salários, encargos e benefícios', -1000000), l('Aluguel e condomínio', -200000), l('Luz', -10000)],
    )
    expect(despesas.map(d => d.chave)).toEqual([
      'Salários, encargos e benefícios', // +5.000 de gasto
      'Aluguel e condomínio',            // +1.000 de gasto
      'Luz',                             // caiu 50
    ])
    expect(despesas.map(d => d.diferenca)).toEqual([-500000, -100000, 5000])
    // Em despesa, percentual positivo = gasto subiu.
    expect(despesas.map(d => d.percentual)).toEqual([50, 50, -50])
  })

  it('mês anterior vazio: tudo entra, tudo com percentual null', () => {
    const { receitas, despesas } = compararCategorias([l('Receita com serviços', 1000), l('Luz', -500)], [])
    expect(receitas).toHaveLength(1)
    expect(despesas).toHaveLength(1)
    expect([...receitas, ...despesas].every(x => x.percentual === null)).toBe(true)
  })

  it('os dois meses vazios devolvem listas vazias', () => {
    expect(compararCategorias([], [])).toEqual({ receitas: [], despesas: [] })
  })

  it('lançamento de valor zero não cria linha nem na receita nem na despesa', () => {
    expect(compararCategorias([l('Nada', 0)], [])).toEqual({ receitas: [], despesas: [] })
  })

  it('categoria com entrada e saída aparece nas duas listas, cada uma com o seu lado', () => {
    // Acontece quando há estorno: a categoria tem crédito e débito. Somar os
    // dois num número só esconderia o estorno dentro do gasto.
    const { receitas, despesas } = compararCategorias([l('Cartão de Crédito', 20000), l('Cartão de Crédito', -50000)], [])
    expect(receitas).toEqual([{ chave: 'Cartão de Crédito', atual: 20000, anterior: 0, diferenca: 20000, percentual: null }])
    expect(despesas).toEqual([{ chave: 'Cartão de Crédito', atual: -50000, anterior: 0, diferenca: -50000, percentual: null }])
  })

  it('percentual quebrado é arredondado em duas casas', () => {
    const { receitas } = compararCategorias([l('X', 3800000)], [l('X', 3000000)])
    expect(receitas[0].percentual).toBe(26.67)
  })
})

describe('compararFornecedores', () => {
  const atual = [
    l('Serviços contratados', -250000, 'MKT EXEMPLO'),
    l('Serviços contratados', -100000, 'CONTABILIDADE EXEMPLO'),
    l('Custo serviço prestado', -800000, 'LABORATORIO EXEMPLO'),
  ]
  const anterior = [
    l('Serviços contratados', -150000, 'MKT EXEMPLO'),
    l('Serviços contratados', -100000, 'CONTABILIDADE EXEMPLO'),
    l('Serviços contratados', -70000, 'LIMPEZA EXEMPLO'),
  ]

  it('compara só os fornecedores da categoria pedida', () => {
    const r = compararFornecedores(atual, anterior, 'Serviços contratados')
    expect(r.map(x => x.chave).sort()).toEqual(['CONTABILIDADE EXEMPLO', 'LIMPEZA EXEMPLO', 'MKT EXEMPLO'])
    expect(r.some(x => x.chave === 'LABORATORIO EXEMPLO')).toBe(false)
  })

  it('ordena pelo que mais aumentou o gasto e mantém quem só existia antes', () => {
    const r = compararFornecedores(atual, anterior, 'Serviços contratados')
    expect(r.map(x => [x.chave, x.diferenca])).toEqual([
      ['MKT EXEMPLO', -100000],           // subiu 1.000
      ['CONTABILIDADE EXEMPLO', 0],       // igual
      ['LIMPEZA EXEMPLO', 70000],         // deixou de existir
    ])
  })

  it('categoria inexistente devolve lista vazia', () => {
    expect(compararFornecedores(atual, anterior, 'Categoria Que Não Existe')).toEqual([])
  })

  it('serve também para receita: ordena pela maior alta em reais', () => {
    const r = compararFornecedores(
      [l('Receita c/ Aluguel', 375000, 'DRA EXEMPLO'), l('Receita c/ Aluguel', 260000, 'CLINICA EXEMPLO')],
      [l('Receita c/ Aluguel', 100000, 'DRA EXEMPLO'), l('Receita c/ Aluguel', 250000, 'CLINICA EXEMPLO')],
      'Receita c/ Aluguel',
    )
    expect(r.map(x => x.chave)).toEqual(['DRA EXEMPLO', 'CLINICA EXEMPLO'])
  })
})

describe('totalizar', () => {
  const l = (chave: string, atual: number, anterior: number): LinhaComparativo => ({
    chave, atual, anterior, diferenca: atual - anterior,
    percentual: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 10000) / 100,
  })

  it('soma os dois meses e a diferença', () => {
    const t = totalizar([l('A', 1000, 800), l('B', 500, 700)])
    expect(t).toMatchObject({ chave: 'Total', atual: 1500, anterior: 1500, diferenca: 0 })
  })

  it('despesa continua negativa no total', () => {
    const t = totalizar([l('Aluguel', -100000, -80000), l('Luz', -25000, -30000)])
    expect(t.atual).toBe(-125000)
    expect(t.anterior).toBe(-110000)
    expect(t.diferenca).toBe(-15000)
    // anterior negativo: gasto subiu sai positivo, como nas categorias
    expect(t.percentual).toBeCloseTo(13.64, 1)
  })

  it('sem mês anterior não há percentual', () => {
    expect(totalizar([l('A', 1000, 0)]).percentual).toBeNull()
  })

  it('bloco vazio vira total zerado, não estoura', () => {
    expect(totalizar([])).toMatchObject({ atual: 0, anterior: 0, diferenca: 0, percentual: null })
  })
})

describe('resultadoDoMes', () => {
  const r = (atual: number, anterior = 0): LinhaComparativo =>
    ({ chave: 'R', atual, anterior, diferenca: atual - anterior, percentual: null })
  const d = (atual: number, anterior = 0): LinhaComparativo =>
    ({ chave: 'D', atual, anterior, diferenca: atual - anterior, percentual: null })

  it('receitas menos despesas, com despesa já negativa', () => {
    // setembro real: 121.853,29 de receita, 193.806,04 de despesa
    const res = resultadoDoMes([r(12185329)], [d(-19380604)])
    expect(res.atual).toBe(-7195275)
  })

  it('mês positivo é positivo', () => {
    expect(resultadoDoMes([r(10000000)], [d(-4000000)]).atual).toBe(6000000)
  })

  it('compara com o mês anterior', () => {
    const res = resultadoDoMes([r(10000000, 8000000)], [d(-4000000, -5000000)])
    expect(res.atual).toBe(6000000)
    expect(res.anterior).toBe(3000000)
    expect(res.diferenca).toBe(3000000)
    expect(res.percentual).toBe(100)
  })

  it('quando o sinal vira, não inventa percentual', () => {
    // de +10.000 para -5.000: "-150%" não quer dizer nada
    const res = resultadoDoMes([r(500000, 2000000)], [d(-1000000, -1000000)])
    expect(res.atual).toBe(-500000)
    expect(res.anterior).toBe(1000000)
    expect(res.percentual).toBeNull()
  })

  it('sem mês anterior, sem percentual', () => {
    expect(resultadoDoMes([r(10000000)], [d(-4000000)]).percentual).toBeNull()
  })
})
