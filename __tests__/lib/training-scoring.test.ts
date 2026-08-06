// __tests__/lib/training-scoring.test.ts
import { averageOf, verdictFor, AVERAGED_CRITERIA } from '@/lib/training/scoring'
import type { Scores } from '@/lib/training/types'

function scores(partial: Partial<Scores> = {}): Scores {
  return {
    acolhimento: 7, qualificacao: 7, argumentos: 7,
    objecoes: 7, fechamento: 7, precisao: 7, risco: 10,
    ...partial,
  }
}

describe('training/scoring', () => {
  it('a média usa exatamente 6 critérios — Risco fica de fora', () => {
    expect(AVERAGED_CRITERIA).toHaveLength(6)
    expect(AVERAGED_CRITERIA).not.toContain('risco')
  })

  it('Risco não altera a média', () => {
    expect(averageOf(scores({ risco: 10 }))).toBe(7)
    expect(averageOf(scores({ risco: 0 }))).toBe(7)
  })

  it('arredonda para uma casa decimal', () => {
    // 9,7,9,8.5,9,7 => soma 49.5 / 6 = 8.25 -> arredonda para 8.3
    const s = scores({ acolhimento: 9, qualificacao: 7, argumentos: 9, objecoes: 8.5, fechamento: 9, precisao: 7 })
    expect(averageOf(s)).toBe(8.3)
  })

  it('faixas de status nos limites', () => {
    expect(verdictFor(4.9, false)).toBe('REPROVADA')
    expect(verdictFor(5.0, false)).toBe('APROVADA_COM_RESSALVA')
    expect(verdictFor(6.9, false)).toBe('APROVADA_COM_RESSALVA')
    expect(verdictFor(7.0, false)).toBe('APROVADA')
  })

  it('alerta vermelho reprova mesmo com média alta', () => {
    expect(verdictFor(9.8, true)).toBe('REPROVADA')
  })
})
