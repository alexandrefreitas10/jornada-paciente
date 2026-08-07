import sql, { initSchema } from '@/lib/db'
import type {
  Level, MessageRole, Outcome, Persona, ScenarioKey, TrainingKb,
  TrainingMessage, TrainingReport, TrainingSession,
} from './types'
import { averageOf, hasRedFlag, verdictFor } from './scoring'

// average é NUMERIC(3,1) — o driver postgres.js devolve string, não number.
// TrainingSession.average é tipado number; sem normalizar, average.toFixed(1)
// na tela quebra (mesmo problema já resolvido em measurements.ts e stock.ts).
function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
function normalizeSession(row: TrainingSession): TrainingSession {
  return { ...row, average: toNum(row.average) }
}

export async function createSession(params: {
  userId: number
  level: Level
  scenario: ScenarioKey
  persona: Persona
  kb: TrainingKb
}): Promise<TrainingSession> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`
    INSERT INTO training_sessions (user_id, level, scenario, persona, kb_snapshot)
    VALUES (
      ${params.userId}, ${params.level}, ${params.scenario},
      ${sql.json(params.persona as never)}, ${sql.json(params.kb as never)}
    )
    RETURNING *
  `
  return row
}

export async function getSession(id: number): Promise<TrainingSession | null> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`SELECT * FROM training_sessions WHERE id = ${id}`
  return row ? normalizeSession(row) : null
}

export async function listSessions(opts: { userId?: number; limit?: number } = {}): Promise<TrainingSession[]> {
  await initSchema()
  const limit = opts.limit ?? 50
  const rows = opts.userId != null
    ? await sql<TrainingSession[]>`
        SELECT * FROM training_sessions WHERE user_id = ${opts.userId}
        ORDER BY started_at DESC LIMIT ${limit}
      `
    : await sql<TrainingSession[]>`
        SELECT * FROM training_sessions ORDER BY started_at DESC LIMIT ${limit}
      `
  return rows.map(normalizeSession)
}

export async function listMessages(sessionId: number): Promise<TrainingMessage[]> {
  await initSchema()
  // position ASC sozinho não desempata: duas mensagens gravadas com a mesma
  // posição (ver addMessages) voltavam em ordem arbitrária. id ASC é estável.
  return sql<TrainingMessage[]>`
    SELECT * FROM training_messages WHERE session_id = ${sessionId} ORDER BY position ASC, id ASC
  `
}

export async function addMessages(
  sessionId: number,
  entries: { role: MessageRole; content: string }[]
): Promise<TrainingMessage[]> {
  await initSchema()
  if (entries.length === 0) return []
  const [{ next }] = await sql<{ next: number }[]>`
    SELECT COALESCE(MAX(position), 0) + 1 AS next FROM training_messages WHERE session_id = ${sessionId}
  `
  const rows = entries.map((e, i) => ({
    session_id: sessionId,
    role: e.role,
    content: e.content,
    position: next + i,
  }))
  // Um único INSERT multi-linha em vez de N inserts em loop: reduz a janela em
  // que duas chamadas concorrentes leem o mesmo "next" e colidem posições.
  return sql<TrainingMessage[]>`
    INSERT INTO training_messages ${sql(rows, 'session_id', 'role', 'content', 'position') as never}
    RETURNING *
  `
}

// Quantas mensagens a SECRETÁRIA já mandou — é o teto de 30 da spec.
export async function countSecretariaMessages(sessionId: number): Promise<number> {
  await initSchema()
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM training_messages
    WHERE session_id = ${sessionId} AND role = 'secretaria'
  `
  return total
}

// declaredOutcome: o desfecho que o PACIENTE sinalizou no marcador [[FIM:...]],
// quando houve um. Não é o veredito — quem decide continua sendo a avaliadora,
// em saveReport. COALESCE porque markEnded também é chamado sem desfecho (a
// secretária clicando em "Encerrar e avaliar"): nesse caminho um sinal já
// gravado não pode ser apagado por um NULL.
export async function markEnded(sessionId: number, declaredOutcome?: Outcome | null): Promise<void> {
  await initSchema()
  await sql`
    UPDATE training_sessions SET
      status = 'encerrada',
      ended_at = NOW(),
      declared_outcome = COALESCE(${declaredOutcome ?? null}::text, declared_outcome)
    WHERE id = ${sessionId} AND status = 'em_andamento'
  `
}

// Acumula os tokens do turno do paciente (haiku) recém-gerado. UPDATE
// incremental (SET x = x + $n) em vez de ler o valor atual e regravar em
// TypeScript: dois turnos concorrentes (duas abas, por exemplo) não podem se
// pisar e perder o incremento um do outro — um read-modify-write no cliente
// teria exatamente essa corrida.
export async function addPatientUsage(
  sessionId: number,
  usage: { inputTokens: number; outputTokens: number }
): Promise<void> {
  await initSchema()
  await sql`
    UPDATE training_sessions SET
      patient_input_tokens = patient_input_tokens + ${usage.inputTokens},
      patient_output_tokens = patient_output_tokens + ${usage.outputTokens}
    WHERE id = ${sessionId}
  `
}

export async function saveReport(
  sessionId: number,
  report: TrainingReport,
  usage: { inputTokens: number; outputTokens: number }
): Promise<TrainingSession | null> {
  await initSchema()
  const average = averageOf(report.scores)
  // redFlags e risco são duas afirmações independentes do modelo: o prompt define
  // risco 0 como "cruzou uma linha vermelha" mesmo que a lista redFlags venha vazia
  // (o modelo pode esquecer de listar o alerta). Qualquer um dos dois veta a aprovação.
  // Limiar em <=5, não <10 — ver comentário em scoring.ts: risco é binário no
  // prompt, mas uma nota intermediária (ex.: 9) não pode vetar sozinha.
  const flagged = hasRedFlag(report.redFlags.length, report.scores.risco)
  const verdict = verdictFor(average, flagged)
  // eval_* é escrito de uma vez só (uma única chamada ao avaliador por sessão)
  // — ao contrário de patient_*, não precisa de UPDATE incremental.
  const [row] = await sql<TrainingSession[]>`
    UPDATE training_sessions SET
      status = 'avaliada',
      outcome = ${report.outcome},
      scores = ${sql.json(report.scores as never)},
      average = ${average},
      has_red_flag = ${flagged},
      verdict = ${verdict},
      report = ${sql.json(report as never)},
      eval_input_tokens = ${usage.inputTokens},
      eval_output_tokens = ${usage.outputTokens},
      ended_at = COALESCE(ended_at, NOW())
    WHERE id = ${sessionId}
    RETURNING *
  `
  // Zero linhas casadas (id inexistente) não pode virar "undefined" escondido
  // atrás de um Promise<TrainingSession> não-nulo — mesma convenção de getSession.
  return row ? normalizeSession(row) : null
}
