// __tests__/lib/precos.test.ts
import {
  chaveProduto, chaveLaboratorio, validarCompra, variacao, nivelVariacao,
  resumirGrupo, ordenarPorAumento, valorParaCentavos, juntarRepetidos,
  ALTA_PCT, ATENCAO_PCT,
  type Compra, type GrupoPreco, type Fonte,
} from '@/lib/precos'

const compra = (data: string, centavos: number, unidade: string | null = 'frasco'): Compra => ({
  centavos, quantidade: 10, unidade, data, fonte: 'nf',
})

describe('chaves de agrupamento', () => {
  it('produto: ignora acento, caixa e pontuação', () => {
    expect(chaveProduto('Vitamina C 440mg')).toBe(chaveProduto('VITAMINA C 440MG'))
    expect(chaveProduto('L-Carnitina')).toBe(chaveProduto('l carnitina'))
    expect(chaveProduto('Coenzima Q10')).not.toBe(chaveProduto('Coenzima Q 100'))
  })

  it('laboratório: mesma regra', () => {
    expect(chaveLaboratorio('BioMeds')).toBe(chaveLaboratorio('biomeds'))
    expect(chaveLaboratorio(' Formédica ')).toBe(chaveLaboratorio('formedica'))
  })

  it('vazio vira vazio', () => {
    expect(chaveProduto('')).toBe('')
    expect(chaveLaboratorio('   ')).toBe('')
  })
})

describe('valorParaCentavos', () => {
  it('aceita o formato brasileiro', () => {
    expect(valorParaCentavos('82,00')).toBe(8200)
    expect(valorParaCentavos('R$ 82,00')).toBe(8200)
    expect(valorParaCentavos(' 82,00 ')).toBe(8200)
    expect(valorParaCentavos('1.250,50')).toBe(125050)
    expect(valorParaCentavos('1.250')).toBe(125000)
    expect(valorParaCentavos('1250')).toBe(125000)
  })

  it('recusa o que não é um valor brasileiro válido e positivo', () => {
    for (const texto of ['82.00', '1.2', '12abc', '1,2,3', '1e3', '0,001', '-5,00', '', 'R$']) {
      expect(valorParaCentavos(texto)).toBeNull()
    }
  })

  it('aceita até o teto e recusa acima dele', () => {
    expect(valorParaCentavos('1.000.000,00')).toBe(100_000_000)
    expect(valorParaCentavos('1.000.000,01')).toBeNull()
  })
})

describe('validarCompra', () => {
  it('recusa ponto-decimal (que reaisToCents leria como 100x o valor)', () => {
    expect(validarCompra({ valor: '82.00', laboratorio: 'X', quantidade: 1 }).ok).toBe(false)
  })


  it('aceita o caso normal e devolve os valores limpos', () => {
    expect(validarCompra({ valor: 'R$ 82,00', laboratorio: '  BioMeds ', quantidade: 10 }))
      .toEqual({ ok: true, centavos: 8200, laboratorio: 'BioMeds', quantidade: 10 })
  })

  it('entende o formato brasileiro com milhar', () => {
    expect(validarCompra({ valor: '1.250,50', laboratorio: 'X', quantidade: 1 }))
      .toEqual({ ok: true, centavos: 125050, laboratorio: 'X', quantidade: 1 })
  })

  it('recusa valor zerado, vazio ou sem número', () => {
    for (const valor of ['', '0', '0,00', 'abc', 'R$']) {
      expect(validarCompra({ valor, laboratorio: 'X', quantidade: 1 }).ok).toBe(false)
    }
  })

  it('recusa valor acima do teto (fat-finger de digitação)', () => {
    expect(validarCompra({ valor: '99999999999', laboratorio: 'X', quantidade: 1 }).ok).toBe(false)
  })

  it('recusa laboratório vazio e quantidade não positiva', () => {
    expect(validarCompra({ valor: '10,00', laboratorio: '   ', quantidade: 1 }).ok).toBe(false)
    expect(validarCompra({ valor: '10,00', laboratorio: 'X', quantidade: 0 }).ok).toBe(false)
    expect(validarCompra({ valor: '10,00', laboratorio: 'X', quantidade: -2 }).ok).toBe(false)
  })

  it('diz o que está errado', () => {
    const r = validarCompra({ valor: '', laboratorio: '', quantidade: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros).toEqual(['valor', 'laboratorio'])
  })
})

describe('variacao e nivelVariacao', () => {
  it('percentual sobre a compra anterior', () => {
    expect(variacao(10000, 11000)).toBe(10)
    expect(variacao(10000, 9000)).toBe(-10)
    expect(variacao(8200, 8200)).toBe(0)
  })

  it('sem anterior não há variação', () => {
    expect(variacao(null, 10000)).toBeNull()
  })

  it('as fronteiras dos destaques', () => {
    expect(ALTA_PCT).toBe(10)
    expect(ATENCAO_PCT).toBe(5)
    expect(nivelVariacao(null)).toBe('primeira')
    expect(nivelVariacao(10)).toBe('alta')
    expect(nivelVariacao(9.99)).toBe('atencao')
    expect(nivelVariacao(5)).toBe('atencao')
    expect(nivelVariacao(4.99)).toBe('estavel')
    expect(nivelVariacao(-4.99)).toBe('estavel')
    expect(nivelVariacao(-5)).toBe('queda')
  })
})

describe('resumirGrupo', () => {
  const grupo = (historico: Compra[]): GrupoPreco => ({
    produto: 'Vitamina C 440mg', laboratorio: 'BioMeds', chave: 'v|b', historico,
  })

  it('usa a compra mais recente e a anterior', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000), compra('2026-08-10', 10000)]))
    expect(r.ultimo.centavos).toBe(11000)
    expect(r.anterior?.centavos).toBe(10000)
    expect(r.variacao).toBe(10)
    expect(r.nivel).toBe('alta')
    expect(r.unidadeMudou).toBe(false)
  })

  it('primeira compra não tem variação', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000)]))
    expect(r.anterior).toBeNull()
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
  })

  it('unidade diferente entre as duas últimas: sem percentual', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 90000, 'caixa'), compra('2026-08-10', 10000, 'frasco')]))
    expect(r.unidadeMudou).toBe(true)
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
  })

  it('não depende da ordem que veio do banco', () => {
    const r = resumirGrupo(grupo([compra('2026-08-10', 10000), compra('2026-09-20', 11000)]))
    expect(r.ultimo.centavos).toBe(11000)
    expect(r.variacao).toBe(10)
  })

  it('unidade só difere em caixa/espaço: não conta como mudança', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000, 'Frasco'), compra('2026-08-10', 10000, 'frasco')]))
    expect(r.unidadeMudou).toBe(false)
    expect(r.variacao).toBe(10)
  })

  // A nota fiscal manda o plural e o lançamento manual manda o singular do
  // cadastro: se isso contasse como mudança, o produto perdia o percentual
  // para sempre.
  it('plural não é mudança de unidade: frascos = frasco', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000, 'frascos'), compra('2026-08-10', 10000, 'frasco')]))
    expect(r.unidadeMudou).toBe(false)
    expect(r.variacao).toBe(10)
  })

  it('plural com acento e caixa também casa: Caixas = caixa', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000, 'Caixas'), compra('2026-08-10', 10000, 'caixa')]))
    expect(r.unidadeMudou).toBe(false)
    expect(r.variacao).toBe(10)
  })

  it('unidade curta não é mutilada: ml continua diferente de mg', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000, 'ml'), compra('2026-08-10', 10000, 'mg')]))
    expect(r.unidadeMudou).toBe(true)
    expect(r.variacao).toBeNull()
  })

  it('histórico vazio é erro, não undefined silencioso', () => {
    expect(() => resumirGrupo(grupo([]))).toThrow(/sem histórico/)
  })
})

describe('ordenarPorAumento', () => {
  const g = (produto: string, historico: Compra[], laboratorio = 'Lab'): GrupoPreco =>
    ({ produto, laboratorio, chave: produto, historico })

  it('maior aumento primeiro; primeira compra por último; empate por nome', () => {
    const grupos = [
      g('Curcumina', [compra('2026-09-20', 10500), compra('2026-08-10', 10000)]), // +5
      g('HMB', [compra('2026-09-20', 13000), compra('2026-08-10', 10000)]),       // +30
      g('Ana', [compra('2026-09-20', 10000)]),                                     // primeira
      g('Baiba', [compra('2026-09-20', 9000), compra('2026-08-10', 10000)]),      // -10
    ]
    expect(ordenarPorAumento(grupos).map(x => x.produto)).toEqual(['HMB', 'Curcumina', 'Baiba', 'Ana'])
  })

  it('não altera a lista recebida', () => {
    const grupos = [g('B', [compra('2026-09-20', 10000)]), g('A', [compra('2026-09-20', 10000)])]
    const antes = grupos.map(x => x.produto)
    ordenarPorAumento(grupos)
    expect(grupos.map(x => x.produto)).toEqual(antes)
  })

  it('mesmo produto e mesmo aumento em dois laboratórios: desempata por laboratório', () => {
    const grupos = [
      g('HMB', [compra('2026-09-20', 11000), compra('2026-08-10', 10000)], 'Zeta'),
      g('HMB', [compra('2026-09-20', 11000), compra('2026-08-10', 10000)], 'Alfa'),
    ]
    expect(ordenarPorAumento(grupos).map(x => x.laboratorio)).toEqual(['Alfa', 'Zeta'])
  })

  it('mesmo produto, ambos sem comparação: desempata por laboratório', () => {
    const grupos = [
      g('Ana', [compra('2026-09-20', 10000)], 'Zeta'),
      g('Ana', [compra('2026-09-20', 10000)], 'Alfa'),
    ]
    expect(ordenarPorAumento(grupos).map(x => x.laboratorio)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('chaveProduto: mesmo ativo escrito diferente', () => {
  const mesmo = (a: string, b: string) => expect(chaveProduto(a)).toBe(chaveProduto(b))
  const diferente = (a: string, b: string) => expect(chaveProduto(a)).not.toBe(chaveProduto(b))

  it('ignora a forma farmacêutica', () => {
    mesmo('Testosterona 300 MG - Pellet', 'Testosterona 300mg')
    mesmo('NADH 300 MG - Pellet', 'NADH 300MG')
    mesmo('Estradiol 25 mg implante', 'Estradiol 25mg')
  })

  it('ignora o espaço entre número e unidade', () => {
    mesmo('Testosterona 300 mg', 'TESTOSTERONA 300MG')
    mesmo('L-CARNITINA 600MG - 2ML', 'L-Carnitina 600 mg 2 ml')
    mesmo('UNDECANOATO 1G/4ML', 'Undecanoato 1 g 4 ml')
  })

  it('ignora palavra de ligação', () => {
    mesmo('POOL DE AMINOACIDOS 5ML', 'Pool Aminoácidos 5ml')
    mesmo('SULFATO DE ZINCO 20MG - 2ML', 'Sulfato Zinco 20mg 2ml')
  })

  it('dose continua separando', () => {
    diferente('Testosterona 200 mg', 'Testosterona 300 mg')
    diferente('Oxandrolona 100 mg', 'Oxandrolona 200 mg')
  })

  it('volume continua separando', () => {
    diferente('D-RIBOSE 500MG 2ML', 'D-RIBOSE 500MG/3ML')
    diferente('POOL AMINOACIDOS 3,8% - 10ML', 'POOL DE AMINOACIDOS 5ML')
  })

  it('produtos parecidos continuam separados', () => {
    diferente('COMPLEXO B (COM B1) 1ML', 'COMPLEXO B (SEM B1) 1ML')
    diferente('BCAA + HMB - 5ML', 'BCAA + HMB + LIDOCAINA 5ML')
  })

  it('nome sem palavra de verdade não vira chave vazia nem junta produtos', () => {
    expect(chaveProduto('Frasco')).not.toBe('')
    diferente('Frasco', 'Pellet')
    // "Frasco 3ml" e "Ampola 3ml" sobrariam ambos como "3ml".
    diferente('FRASCO 3ML', 'AMPOLA 3ML')
    diferente('SERINGA 3ML', 'POTE 3ML')
  })

  it('não sabe abreviação — e isso é esperado', () => {
    diferente('HIDROXIMETILBUTIRATO 150MG-2ML', 'HMB 150mg 2ml')
  })
})

describe('juntarRepetidos', () => {
  const c = (data: string, centavos: number, quantidade: number, unidade: string | null = 'un', fonte: Fonte = 'retroativo'): Compra =>
    ({ data, centavos, quantidade, unidade, fonte })

  it('mesma data e mesmo preço viram uma linha com a quantidade somada', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-04-23', 583, 30), c('2026-04-23', 583, 40)])
    expect(r).toHaveLength(1)
    expect(r[0].quantidade).toBe(90)
    expect(r[0].centavos).toBe(583)
    expect(r[0].lancamentos).toBe(3)
    expect(r[0].fonte).toBe('retroativo')
  })

  it('preço diferente na mesma data continua separado', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-04-23', 600, 30)])
    expect(r).toHaveLength(2)
  })

  it('unidade diferente na mesma data continua separada', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'frasco'), c('2026-04-23', 583, 30, 'caixa')])
    expect(r).toHaveLength(2)
  })

  it('plural e singular da unidade são a mesma unidade', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'frascos'), c('2026-04-23', 583, 30, 'frasco')])
    expect(r).toHaveLength(1)
    expect(r[0].quantidade).toBe(50)
  })

  it('fontes diferentes viram fonte nula', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'un', 'nf'), c('2026-04-23', 583, 30, 'un', 'manual')])
    expect(r).toHaveLength(1)
    expect(r[0].fonte).toBeNull()
  })

  it('datas diferentes nunca se juntam, e vêm da mais nova para a mais velha', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-08-10', 583, 5), c('2026-04-23', 583, 30)])
    expect(r.map(x => x.data)).toEqual(['2026-08-10', '2026-04-23'])
    expect(r[1].quantidade).toBe(50)
  })

  it('não altera a lista recebida', () => {
    const lista = [c('2026-04-23', 583, 20), c('2026-04-23', 583, 30)]
    juntarRepetidos(lista)
    expect(lista).toHaveLength(2)
    expect(lista.map(x => x.quantidade)).toEqual([20, 30])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(juntarRepetidos([])).toEqual([])
  })
})

describe('resumirGrupo sobre o histórico juntado', () => {
  const g = (historico: Compra[]): GrupoPreco =>
    ({ produto: 'N-Acetil Cisteína 300mg 2ml', laboratorio: 'Health Tech', chave: 'x', historico })
  const c = (data: string, centavos: number, quantidade: number): Compra =>
    ({ data, centavos, quantidade, unidade: 'un', fonte: 'retroativo' })

  it('nota inteira repetida é PRIMEIRA COMPRA, não 0%', () => {
    const r = resumirGrupo(g([c('2026-04-23', 583, 20), c('2026-04-23', 583, 30), c('2026-04-23', 583, 40)]))
    expect(r.anterior).toBeNull()
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
    expect(r.ultimo.quantidade).toBe(90)
  })

  it('com uma nota mais antiga, compara com ela', () => {
    const r = resumirGrupo(g([
      c('2026-08-10', 700, 10), c('2026-08-10', 700, 10),
      c('2026-04-23', 583, 20), c('2026-04-23', 583, 30),
    ]))
    expect(r.ultimo.centavos).toBe(700)
    expect(r.ultimo.quantidade).toBe(20)
    expect(r.anterior?.centavos).toBe(583)
    expect(r.anterior?.quantidade).toBe(50)
    expect(r.variacao).toBeCloseTo(20.06, 1)
    expect(r.nivel).toBe('alta')
  })
})
