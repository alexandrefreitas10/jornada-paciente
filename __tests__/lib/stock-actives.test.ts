// __tests__/lib/stock-actives.test.ts
import {
  ATIVOS, LIMITE_PADRAO, LIMITE_CONTROLADO,
  normalizarNome, acharAtivo, agruparParaReposicao, precisaRepor,
  type LinhaReposicao,
} from '@/lib/stock-actives'

describe('stock-actives — normalização', () => {
  it('colapsa acento, pontuação, caixa e espaço', () => {
    const esperado = 'pool cognicao 2ml'
    expect(normalizarNome('POOL COGNICAO 2ML')).toBe(esperado)
    expect(normalizarNome('POOL COGNICAO - 2ML')).toBe(esperado)
    expect(normalizarNome('  Pool  Cognição   2ml ')).toBe(esperado)
  })

  it('trata parênteses, barra, vírgula e porcentagem como separador', () => {
    expect(normalizarNome('NAC (N-acetilcisteína)')).toBe('nac n acetilcisteina')
    expect(normalizarNome('HIDROXIMETILBUTIRATO 2,5% 2ML')).toBe('hidroximetilbutirato 2 5 2ml')
    expect(normalizarNome('Vitamina C 20% (1 g/5 mL)')).toBe('vitamina c 20 1 g 5 ml')
  })
})

describe('stock-actives — catálogo', () => {
  it('todo ativo tem nome, limite controlado e pelo menos um padrão', () => {
    expect(ATIVOS.length).toBeGreaterThan(0)
    for (const a of ATIVOS) {
      expect(a.nome.trim()).not.toBe('')
      expect(a.limite).toBe(LIMITE_CONTROLADO)
      expect(a.padroes.length).toBeGreaterThan(0)
    }
  })

  it('os nomes dos ativos são únicos', () => {
    expect(new Set(ATIVOS.map(a => a.nome)).size).toBe(ATIVOS.length)
  })

  it('o limite controlado é 30 e o padrão é 5', () => {
    expect(LIMITE_CONTROLADO).toBe(30)
    expect(LIMITE_PADRAO).toBe(5)
  })
})

describe('stock-actives — reconhecimento de nomes', () => {
  // As entradas acima das três últimas existem hoje no banco de produção.
  // As três últimas são variantes aceitas de propósito, mas que ainda não
  // existem em nenhum registro real.
  const casos: [string, string][] = [
    ['HMB', 'HMB'],
    ['HIDROXIMETILBUTIRATO 2,5% 2ML', 'HMB'],
    ['NAC (N-acetilcisteína)', 'NAC'],
    ['N-Acetilcisteína', 'NAC'],
    ['POOL COGNICAO 2ML', 'Pool Cognição'],
    ['POOL COGNICAO - 2ML', 'Pool Cognição'],
    ['METILCOBALAMINA 2500MCG/1ML', 'Metilcobalamina'],
    ['Metilcobalamina 500 mcg', 'Metilcobalamina'],
    ['Coenzima Q10', 'Coenzima Q10'],
    ['COENZIMA Q10 100MG/1ML', 'Coenzima Q10'],
    ['L-Carnitina', 'L-carnitina'],
    ['L-BAIBA 150MG - 2ML', 'L-baiba'],
    ['L-BAIBA 150MG 2ML', 'L-baiba'],
    ['Pool de Minerais', 'Pool de Minerais'],
    ['POOL MINERAIS 2ML', 'Pool de Minerais'],
    ['Pool de Aminoácidos', 'Pool de Aminoácidos'],
    ['POOL DE AMINOACIDOS 5ML', 'Pool de Aminoácidos'],
    ['Pool de Aminoácidos Essenciais', 'Pool de Aminoácidos'],
    ['Pool Coenzimático', 'Pool Coenzimático'],
    ['COMPLEXO B (COM B1) 1ML', 'Complexo B com B1'],
    ['Complexo B sem B1', 'Complexo B sem B1'],
    ['Curcumina', 'Curcumina'],
    ['Pill food', 'Pill Food'],
    ['Resveratrol 100 mg', 'Resveratrol'],
    ['Pool Cognitivo', 'Pool Cognição'],
    ['LCarnitina', 'L-carnitina'],
    ['CoQ10', 'Coenzima Q10'],
    ['Vitamina D 600 UI + ADEK', 'Vitamina D 600 ADEK'],
    ['Vitamina D 600 UI com K2', 'Vitamina D 600 UI + K2'],
  ]

  it.each(casos)('%s → %s', (nome, ativoEsperado) => {
    expect(acharAtivo(nome)?.nome).toBe(ativoEsperado)
  })
})

describe('stock-actives — separações que o dono pediu explicitamente', () => {
  it('as duas Vitaminas C são ativos DIFERENTES', () => {
    const a = acharAtivo('Vitamina C 440 mg')?.nome
    const b = acharAtivo('Vitamina C 20% (1 g/5 mL)')?.nome
    expect(a).toBe('Vitamina C 440 mg')
    expect(b).toBe('Vitamina C 20%')
    expect(a).not.toBe(b)
  })

  it('Magnésio 400 mg não se mistura com Sulfato de Magnésio', () => {
    expect(acharAtivo('Magnésio 400 mg')?.nome).toBe('Magnésio 400 mg')
    expect(acharAtivo('Sulfato de Magnésio')?.nome).toBe('Sulfato de Magnésio')
    expect(acharAtivo('Sulfato de Magnésio 10% (5 mL)')?.nome).toBe('Sulfato de Magnésio')
  })

  it('outro sal de magnesio nao cai em Magnésio 400 mg', () => {
    expect(acharAtivo('Cloreto de Magnésio 400 mg')).toBeNull()
    expect(acharAtivo('Magnésio 400mg')?.nome).toBe('Magnésio 400 mg')
  })

  it('PRECEDÊNCIA: as três Vitaminas D 600 não se capturam entre si', () => {
    // O padrão da D600 pura casaria com "+ K2" e com "ADEK" se fosse testado antes.
    expect(acharAtivo('Vitamina D 600 UI')?.nome).toBe('Vitamina D 600 UI')
    expect(acharAtivo('Vitamina D 600 UI + K2')?.nome).toBe('Vitamina D 600 UI + K2')
    expect(acharAtivo('Vitamina D 600 ADEK')?.nome).toBe('Vitamina D 600 ADEK')
  })
})

describe('stock-actives — o que fica de fora', () => {
  it.each([
    ['Vitamina D 300 UI'],   // não está na lista do dono
    ['Selênio'],
    ['Lidocaína'],
    ['Tirzepartida BioMeds'],
    ['Implante Testosterona 200 mg'],
    ['Polivitamínico ADEK'],
  ])('%s não pertence a nenhum ativo controlado', nome => {
    expect(acharAtivo(nome)).toBeNull()
  })

  it('nome vazio ou so espaco nao casa com nada', () => {
    expect(acharAtivo('')).toBeNull()
    expect(acharAtivo('   ')).toBeNull()
  })
})

describe('stock-actives — agrupamento', () => {
  const item = (id: number, name: string, quantity: number) =>
    ({ id, name, quantity, unit: 'un', lot: null, expiry_date: null })

  it('soma os lotes do mesmo ativo numa linha só', () => {
    // Caso real: o relatório pedia HMB duas vezes alegando saldo zero,
    // com 21 unidades num cadastro escrito por extenso.
    const linhas = agruparParaReposicao([
      item(1, 'HMB', 0),
      item(2, 'HMB', 0),
      item(3, 'HIDROXIMETILBUTIRATO 2,5% 2ML', 21),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('HMB')
    expect(linhas[0].quantidade).toBe(21)
    expect(linhas[0].limite).toBe(30)
    // Os dois cadastros vazios não contam: quem tem saldo é um só.
    expect(linhas[0].registros).toBe(1)
  })

  it('lote vazio nao apaga o lote e a validade de quem tem saldo', () => {
    const linhas = agruparParaReposicao([
      { id: 1, name: 'POOL COGNICAO - 2ML', quantity: 0, unit: 'un', lot: 'VELHO', expiry_date: '01/2025' },
      { id: 2, name: 'POOL COGNICAO 2ML', quantity: 16, unit: 'un', lot: 'ATUAL', expiry_date: '09/2027' },
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].quantidade).toBe(16)
    expect(linhas[0].registros).toBe(1)
    expect(linhas[0].lot).toBe('ATUAL')
    expect(linhas[0].expiry_date).toBe('09/2027')
    expect(linhas[0].unit).toBe('un')
  })

  it('ativo com todos os lotes zerados vira uma linha de saldo zero', () => {
    const linhas = agruparParaReposicao([
      item(1, 'L-Carnitina', 0),
      item(2, 'L-Carnitina', 0),
      item(3, 'L-Carnitina', 0),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('L-carnitina')
    expect(linhas[0].quantidade).toBe(0)
    expect(linhas[0].registros).toBe(0)
    expect(linhas[0].unit).toBe('un')
  })

  it('marca quais linhas sao de ativo controlado', () => {
    const linhas = agruparParaReposicao([
      item(1, 'Curcumina', 0),
      item(2, 'Selênio', 0),
    ])
    expect(linhas.find(l => l.nome === 'Curcumina')?.controlado).toBe(true)
    expect(linhas.find(l => l.nome === 'Selênio')?.controlado).toBe(false)
  })

  it('lote e validade só aparecem quando a linha é de um registro só', () => {
    const um = agruparParaReposicao([
      { id: 1, name: 'Resveratrol 100 mg', quantity: 7, unit: 'un', lot: 'L1', expiry_date: '01/2027' },
    ])
    expect(um[0].lot).toBe('L1')
    expect(um[0].expiry_date).toBe('01/2027')

    const varios = agruparParaReposicao([
      { id: 1, name: 'Curcumina', quantity: 8, unit: 'un', lot: 'L1', expiry_date: '01/2027' },
      { id: 2, name: 'Curcumina', quantity: 13, unit: 'un', lot: 'L2', expiry_date: '02/2027' },
    ])
    expect(varios[0].lot).toBeNull()
    expect(varios[0].expiry_date).toBeNull()
  })

  it('item fora do catálogo vira uma linha sozinha, com limite 5', () => {
    const linhas = agruparParaReposicao([item(9, 'Selênio', 24)])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('Selênio')
    expect(linhas[0].limite).toBe(5)
    expect(linhas[0].registros).toBe(1)
  })

  it('nenhum registro é contado em dois ativos', () => {
    const entrada = [
      item(1, 'Vitamina D 600 UI', 29),
      item(2, 'Vitamina D 600 UI + K2', 30),
      item(3, 'Vitamina D 600 ADEK', 13),
    ]
    const linhas = agruparParaReposicao(entrada)
    const somaRegistros = linhas.reduce((s, l) => s + l.registros, 0)
    expect(somaRegistros).toBe(entrada.length)
    expect(linhas).toHaveLength(3)
  })

  it('lista vazia devolve lista vazia, não estoura', () => {
    expect(agruparParaReposicao([])).toEqual([])
  })

  it('unidade some quando os lotes discordam, e sobrevive quando so muda a caixa', () => {
    const discorda = agruparParaReposicao([
      { id: 1, name: 'Curcumina', quantity: 3, unit: 'un', lot: null, expiry_date: null },
      { id: 2, name: 'Curcumina', quantity: 4, unit: 'unidades', lot: null, expiry_date: null },
    ])
    expect(discorda[0].unit).toBe('')

    const soCaixa = agruparParaReposicao([
      { id: 1, name: 'Curcumina', quantity: 3, unit: 'un', lot: null, expiry_date: null },
      { id: 2, name: 'Curcumina', quantity: 4, unit: 'UN', lot: null, expiry_date: null },
    ])
    expect(soCaixa[0].unit).toBe('un')
  })

  it('soma saldo negativo em vez de ignorar', () => {
    // Saldo negativo e erro de lancamento, e o relatorio marca "🚨 Saldo
    // negativo". Somar honestamente e o que mostra o problema.
    const linhas = agruparParaReposicao([
      item(1, 'Curcumina', -4),
      item(2, 'Curcumina', 2),
    ])
    expect(linhas[0].quantidade).toBe(-2)
  })
})

describe('stock-actives — precisaRepor', () => {
  const linha = (quantidade: number, limite: number, controlado: boolean): LinhaReposicao =>
    ({ chave: 'x', nome: 'x', quantidade, unit: 'un', limite, registros: 1, controlado, lot: null, expiry_date: null })

  it('entra abaixo do limite e fica de fora no limite exato', () => {
    expect(precisaRepor(linha(29, 30, true))).toBe(true)
    expect(precisaRepor(linha(30, 30, true))).toBe(false)
    expect(precisaRepor(linha(4, 5, false))).toBe(true)
    expect(precisaRepor(linha(5, 5, false))).toBe(false)
  })

  it('zerado so entra se for ativo do catalogo', () => {
    expect(precisaRepor(linha(0, 30, true))).toBe(true)
    expect(precisaRepor(linha(0, 5, false))).toBe(false)
  })

  it('saldo negativo entra mesmo fora do catalogo', () => {
    expect(precisaRepor(linha(-2, 5, false))).toBe(true)
  })
})
