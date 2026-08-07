// __tests__/lib/training-summary.test.ts
import { summarizeSessions } from '@/lib/training/summary'

describe('training/summary — summarizeSessions', () => {
  it('lista vazia não vira NaN — conta 0, média nula, sem red flag', () => {
    const result = summarizeSessions([])
    expect(result).toEqual({ count: 0, averageScore: null, redFlagCount: 0 })
  })

  it('conta todas as sessões, mesmo as ainda não avaliadas (average null)', () => {
    const result = summarizeSessions([
      { average: 7, has_red_flag: false },
      { average: null, has_red_flag: false }, // em andamento, sem nota ainda
    ])
    expect(result.count).toBe(2)
  })

  it('a média só considera sessões já avaliadas (average não nulo)', () => {
    const result = summarizeSessions([
      { average: 8, has_red_flag: false },
      { average: 6, has_red_flag: false },
      { average: null, has_red_flag: false },
    ])
    expect(result.averageScore).toBeCloseTo(7, 6)
  })

  it('conta quantas sessões tiveram red flag', () => {
    const result = summarizeSessions([
      { average: 5, has_red_flag: true },
      { average: 9, has_red_flag: false },
      { average: 2, has_red_flag: true },
    ])
    expect(result.redFlagCount).toBe(2)
  })

  it('nenhuma sessão avaliada ainda: média fica nula, não NaN', () => {
    const result = summarizeSessions([
      { average: null, has_red_flag: false },
      { average: null, has_red_flag: false },
    ])
    expect(result.averageScore).toBeNull()
    expect(Number.isNaN(result.averageScore)).toBe(false)
  })
})
