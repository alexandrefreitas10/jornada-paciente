// __tests__/lib/precos.test.ts
import {
  chaveProduto, chaveLaboratorio, validarCompra, variacao, nivelVariacao,
  resumirGrupo, ordenarPorAumento, valorParaCentavos,
  ALTA_PCT, ATENCAO_PCT,
  type Compra, type GrupoPreco,
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
