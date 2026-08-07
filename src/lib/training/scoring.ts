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

// redFlags e risco são duas afirmações independentes do modelo (o prompt pede
// risco binário — 10 ou 0 — mas nada impede uma nota intermediária de vir por
// engano). Limiar em <= 5, não < 10: um 9 "quase perfeito" não pode vetar a
// sessão sozinho (era o gatilho do bug original), mas qualquer nota que já
// pende para "cruzou uma linha" (0 até o meio da escala) continua vetando.
export function hasRedFlag(redFlagsCount: number, risco: number): boolean {
  return redFlagsCount > 0 || risco <= 5
}
