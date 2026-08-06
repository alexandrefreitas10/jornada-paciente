import type { CriterionKey, Scores, Verdict } from './types'

// Os 6 critérios que entram na média. RISCO fica de fora de propósito:
// ele não puxa a nota para baixo, ele VETA a aprovação.
export const AVERAGED_CRITERIA: readonly CriterionKey[] = [
  'acolhimento', 'qualificacao', 'argumentos', 'objecoes', 'fechamento', 'precisao',
]

export function averageOf(scores: Scores): number {
  const sum = AVERAGED_CRITERIA.reduce((acc, key) => acc + scores[key], 0)
  return Math.round((sum / AVERAGED_CRITERIA.length) * 10) / 10
}

export function verdictFor(average: number, hasRedFlag: boolean): Verdict {
  if (hasRedFlag) return 'REPROVADA'
  if (average >= 7) return 'APROVADA'
  if (average >= 5) return 'APROVADA_COM_RESSALVA'
  return 'REPROVADA'
}
