// __tests__/lib/training-personas.test.ts
import { PERSONAS, SCENARIOS, LEVELS, pickPersona } from '@/lib/training/personas'
import type { Level, ScenarioKey } from '@/lib/training/types'

describe('training/personas', () => {
  it('tem os 10 cenários e os 5 níveis', () => {
    expect(Object.keys(SCENARIOS)).toHaveLength(10)
    expect(Object.keys(LEVELS)).toHaveLength(5)
  })

  it('todo nível de 1 a 5 tem pelo menos uma persona', () => {
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      expect(PERSONAS.some(p => p.levels.includes(level))).toBe(true)
    }
  })

  it('todo cenário de A a J tem pelo menos uma persona', () => {
    for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
      expect(PERSONAS.some(p => p.scenarios.includes(key))).toBe(true)
    }
  })

  it('os ids das personas são únicos', () => {
    expect(new Set(PERSONAS.map(p => p.id)).size).toBe(PERSONAS.length)
  })

  it('pickPersona devolve uma persona compatível com nível e cenário', () => {
    const p = pickPersona(3, 'A')
    expect(p.levels).toContain(3)
    expect(p.scenarios).toContain('A')
  })

  it('pickPersona nunca devolve null — cai no fallback do nível se o par não existir', () => {
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
        expect(pickPersona(level, key)).toBeTruthy()
      }
    }
  })
})
