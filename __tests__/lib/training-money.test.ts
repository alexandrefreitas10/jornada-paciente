// __tests__/lib/training-money.test.ts
import { reaisToCents, centsToReais } from '@/lib/training/money'

describe('training/money — reaisToCents (item 2: separador de milhar não pode mangular o preço)', () => {
  it('número sem separador nenhum', () => {
    expect(reaisToCents('1500')).toBe(150000)
    expect(reaisToCents('900')).toBe(90000)
  })

  it('vírgula decimal sem separador de milhar', () => {
    expect(reaisToCents('1500,00')).toBe(150000)
    expect(reaisToCents('900,50')).toBe(90050)
  })

  it('ponto como separador de milhar + vírgula decimal — o caso que quebrava', () => {
    // "1.500,00" era mangulado para 1.5 (150 centavos) por causa do replace()
    // com string, que só troca a PRIMEIRA ocorrência.
    expect(reaisToCents('1.500,00')).toBe(150000)
  })

  it('ponto como separador de milhar, sem parte decimal — ambíguo, convenção BR', () => {
    // "1.500" é R$ 1.500,00 (não R$ 1,5) — ponto é sempre separador de milhar.
    expect(reaisToCents('1.500')).toBe(150000)
  })

  it('com símbolo de moeda e espaços', () => {
    expect(reaisToCents('R$ 1.500,00')).toBe(150000)
  })

  it('múltiplos separadores de milhar', () => {
    expect(reaisToCents('1.500.000,00')).toBe(150000000)
  })

  it('entrada vazia ou não numérica vira 0, nunca NaN', () => {
    expect(reaisToCents('')).toBe(0)
    expect(reaisToCents('abc')).toBe(0)
  })

  it('centsToReais faz o caminho de volta corretamente', () => {
    expect(centsToReais(150000)).toBe('1500,00')
    expect(centsToReais(90050)).toBe('900,50')
    expect(centsToReais(0)).toBe('')
  })
})
